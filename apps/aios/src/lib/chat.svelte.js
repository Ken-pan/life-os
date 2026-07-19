import { browser } from '$app/environment'
import { S } from '$lib/state.svelte.js'
import {
  streamChat,
  generateTitle,
  tinyComplete,
  pingGateway,
  VISION_MODELS,
} from '$lib/localai.js'
import { toolDefinitions, executeTool, consumePendingImages } from '$lib/tools.js'
import { recallRelevant, autoExtractMemories, M as MEM } from '$lib/memory.svelte.js'
import { isNative } from '$lib/native.js'
import { dataChanged } from '$lib/syncBus.js'
import { isCloudAuthorized } from '$lib/cloud.svelte.js'
import { shouldSeedDemo } from '$lib/demoMode.js'
import { buildDemoConversations } from '$lib/demoData.js'
import {
  MAX_TOOL_ROUNDS,
  PARALLEL_SAFE_TOOLS,
  buildWireMessages,
  isBuildCodeAsk,
} from '$lib/chat-tool-loop.core.js'
import {
  CONVERSATION_STORAGE_KEY,
  isConversationPersistenceBlocked,
} from '$lib/kenos/conversationPersist.core.js'

const STORAGE_KEY = CONVERSATION_STORAGE_KEY
const MAX_CONVERSATIONS = 200

/**
 * 记忆召回缓存:regenerate / continueGenerating 用同一条用户消息重建 system prompt 时命中,
 * 省掉一次重复 embed 往返——以及它对网关的一次抖动(embedding 与主 LLM 是不同模型,
 * llama-swap 会为此换出主模型再换回,秒级代价)。key 带记忆库条数,save_memory 等增删
 * 会改变条数从而自动失效,不引入跨模块信号。
 */
let recallCache = { key: '', memories: /** @type {string[]} */ ([]) }

/**
 * @typedef {{ id: string, name: string, arguments: string, result?: string, running?: boolean, images?: string[], imagePaths?: (string|null)[] }} ToolCallRecord
 * @typedef {{
 *   role: 'user'|'assistant',
 *   content: string,
 *   reasoning?: string,
 *   images?: string[],
 *   files?: Array<{ name: string, size: number, text: string }>,
 *   toolCalls?: ToolCallRecord[],
 *   error?: string,
 *   durationMs?: number,
 *   thinkingMs?: number,
 *   suggestions?: string[],
 *   finishReason?: string,
 *   branches?: ChatMessage[][],
 *   branch?: number,
 * }} ChatMessage
 * @typedef {{
 *   id: string,
 *   title: string,
 *   titled: boolean,
 *   model: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   messages: ChatMessage[],
 *   summary?: string,
 *   summarizedUpTo?: number,
 * }} Conversation
 */

// 本地演示对话:仅 localhost 且库为空时按需构造。纯内存,绝不写回 localStorage、
// 绝不触发 persist()/dataChanged(),因此永不同步到云端、不污染真实历史。
let seededDemo = false
function seedOrEmpty() {
  if (shouldSeedDemo()) {
    const demo = buildDemoConversations()
    seededDemo = demo.length > 0
    return demo
  }
  return []
}

function loadConversations() {
  if (!browser) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedOrEmpty()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return seedOrEmpty()
    if (parsed.length === 0) return seedOrEmpty()
    // 页面刷新可能打断生成:清掉悬挂的 running 状态,并在被打断的尾消息上
    // 标记错误,让现有的「重试」按钮成为恢复入口
    for (const c of parsed) {
      for (const [i, m] of (c.messages ?? []).entries()) {
        if (m.role !== 'assistant') continue
        for (const tc of m.toolCalls ?? []) {
          if (tc.running || tc.result === undefined) {
            tc.running = false
            tc.result ??= '(执行被页面刷新打断)'
          }
        }
        // 尾部助手消息没有正文也没有错误 = 生成中被打断(无论工具是否完成)
        if (i === c.messages.length - 1 && !m.content && !m.error) {
          m.error = '生成被打断(页面已刷新),可点重试继续'
        }
      }
    }
    return parsed
  } catch {
    return []
  }
}

/** 当前打开的对话跨刷新保留(sessionStorage:每个标签页独立) */
const ACTIVE_KEY = 'aios_active_chat_v1'

function rememberActive(id) {
  if (!browser) return
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, id)
    else sessionStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* sessionStorage 不可用时静默降级 */
  }
}

function restoreActive(conversations) {
  if (!browser) return null
  try {
    const saved = sessionStorage.getItem(ACTIVE_KEY)
    return conversations.some((c) => c.id === saved) ? saved : null
  } catch {
    return null
  }
}

/**
 * 仅在 demo 灌库时,允许用 ?chat=<id> 直开指定演示对话(截图工具用来逐一展示各能力面)。
 * 纯客户端读取、纯内存效果:不落 sessionStorage、不落 localStorage、不同步。
 * 命中不到(id 非法或非演示库)返回 null,交由 restoreActive / conversations[0] 兜底。
 */
function demoChatFromQuery(conversations) {
  if (!browser || !seededDemo) return null
  try {
    const wanted = new URLSearchParams(window.location.search).get('chat')
    return wanted && conversations.some((c) => c.id === wanted) ? wanted : null
  } catch {
    return null
  }
}

const initialConversations = loadConversations()

// demo 灌库时,默认打开第一条演示对话(而非新对话欢迎页),让聊天页一进来就有内容;
// 真实用户 restoreActive 为 null 时仍保持「新对话」欢迎态不变。
// 优先级:显式 ?chat=(仅 demo,合法才生效)> restoreActive(sessionStorage)> demo 兜底首条。
const initialActive =
  demoChatFromQuery(initialConversations) ??
  restoreActive(initialConversations) ??
  (seededDemo ? (initialConversations[0]?.id ?? null) : null)

export const C = $state({
  /** @type {Conversation[]} 按 updatedAt 倒序 */
  conversations: initialConversations,
  /** @type {string | null} */
  activeId: initialActive,
  streaming: false,
  /** @type {boolean | null} null = 未检查 */
  gatewayOk: null,
  /** @type {{ id: string, index: number } | null} 刚完成的回复(供 artifact 自动预览,消费后置空) */
  freshAssistant: null,
  /** 递增计数:从输入框请求"编辑上一条用户消息"(↑ 键)的信号 */
  editSignal: 0,
})

/* —— 每会话输入草稿:切换对话不丢正在打的字(ChatGPT 式)——
   存 sessionStorage(每标签页独立),key 用会话 id,新对话用 'new'。 */
const DRAFTS_KEY = 'aios_drafts_v1'

function loadDrafts() {
  if (!browser) return {}
  try {
    return JSON.parse(sessionStorage.getItem(DRAFTS_KEY) || '{}')
  } catch {
    return {}
  }
}

const drafts = loadDrafts()
let draftTimer = null

export function getDraft(id) {
  return drafts[id ?? 'new'] ?? ''
}

export function setDraft(id, text) {
  const key = id ?? 'new'
  if (text) drafts[key] = text
  else delete drafts[key]
  if (!browser) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
    } catch {
      /* sessionStorage 不可用时静默降级 */
    }
  }, 300)
}

/** ↑ 键:请求编辑最后一条用户消息(由该消息组件响应进入编辑态) */
export function requestEditLastUser() {
  const conversation = activeConversation()
  if (!conversation || C.streaming) return false
  if (!conversation.messages.some((m) => m.role === 'user')) return false
  C.editSignal++
  return true
}

let saveTimer = null
export function persist() {
  if (!browser) return
  // Read-only / canary: keep the turn in memory only — no LS, no cloud push bus.
  if (isConversationPersistenceBlocked()) return
  dataChanged() // 云同步(若已登录)防抖跟进
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(C.conversations.slice(0, MAX_CONVERSATIONS)),
      )
    } catch {
      /* 存储满(多为图片 dataURL / 文件文本):丢掉最旧会话的附件再试 */
      try {
        const slim = C.conversations.slice(0, 50).map((c, i) =>
          i > 10
            ? {
                ...c,
                messages: c.messages.map((m) => ({
                  ...m,
                  images: undefined,
                  files: undefined,
                  branches: undefined, // 重生成历史在配额压力下优先丢弃
                  toolCalls: m.toolCalls?.map((tc) => ({ ...tc, images: undefined })),
                })),
              }
            : c,
        )
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
      } catch {
        /* 放弃,不打断对话 */
      }
    }
  }, 300)
}

/** Clear in-memory (+ local when allowed) conversation state — used on logout. */
export function clearConversationClientState() {
  C.conversations = []
  C.activeId = null
  if (!browser) return
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem('aios_active_chat_v1')
    sessionStorage.removeItem('aios_drafts_v1')
  } catch {
    /* ignore */
  }
}

export function activeConversation() {
  return C.conversations.find((c) => c.id === C.activeId) ?? null
}

export function startNewChat() {
  stopStreaming()
  C.activeId = null
  rememberActive(null)
}

export function selectConversation(id) {
  stopStreaming()
  C.activeId = id
  rememberActive(id)
}

export function deleteConversation(id) {
  if (C.activeId === id) stopStreaming()
  C.conversations = C.conversations.filter((c) => c.id !== id)
  if (C.activeId === id) {
    C.activeId = null
    rememberActive(null)
  }
  persist()
}

export function clearAllConversations() {
  stopStreaming()
  C.conversations = []
  C.activeId = null
  rememberActive(null)
  persist()
}

export async function refreshGateway() {
  C.gatewayOk = await pingGateway()
  return C.gatewayOk
}

function touch(conversation) {
  conversation.updatedAt = Date.now()
  C.conversations = [
    conversation,
    ...C.conversations.filter((c) => c.id !== conversation.id),
  ]
}

let controller = null

export function stopStreaming() {
  controller?.abort()
  controller = null
  C.streaming = false
}

/* —— 流式平滑释放 ——
   网络 token 是"一坨一坨"到的,直接拼进正文会一顿一顿。这里做个缓冲:
   每帧按 backlog 比例匀速揭示(GPT/Claude 式打字机感),长回答也不会因整段
   重渲而掉帧(把 per-token 重解析收敛为 per-frame)。流结束时 finish() 立即补齐。
   thinkingMs 的定格也搬到揭示步骤,让"思考用时"与用户看到正文的时刻一致。 */
function createStreamReveal(target, startedAt) {
  let raf = null
  let pendingReason = ''
  let pendingContent = ''
  const hasRaf = typeof requestAnimationFrame !== 'undefined'

  const markThinking = () => {
    if (target.thinkingMs || !target.content) return
    const inThink =
      target.content.startsWith('<think>') && !target.content.includes('</think>')
    const hadThinking = target.reasoning || target.content.startsWith('<think>')
    if (hadThinking && !inThink) target.thinkingMs = Date.now() - startedAt
  }

  const drainAll = () => {
    if (pendingReason) {
      target.reasoning += pendingReason
      pendingReason = ''
    }
    if (pendingContent) {
      target.content += pendingContent
      pendingContent = ''
      markThinking()
    }
  }

  const tick = () => {
    raf = null
    if (pendingReason) {
      const n = Math.max(2, Math.ceil(pendingReason.length / 5))
      target.reasoning += pendingReason.slice(0, n)
      pendingReason = pendingReason.slice(n)
    }
    if (pendingContent) {
      const n = Math.max(2, Math.ceil(pendingContent.length / 5))
      target.content += pendingContent.slice(0, n)
      pendingContent = pendingContent.slice(n)
      markThinking()
    }
    if (pendingReason || pendingContent) schedule()
  }

  const schedule = () => {
    if (raf == null && hasRaf) raf = requestAnimationFrame(tick)
  }

  return {
    push(chunk) {
      if (chunk.reasoning) pendingReason += chunk.reasoning
      if (chunk.content) pendingContent += chunk.content
      if (hasRaf) schedule()
      else drainAll()
    },
    finish() {
      if (raf != null) {
        cancelAnimationFrame(raf)
        raf = null
      }
      drainAll()
    },
  }
}

/* —— prompt 组装 —— */

async function buildSystemPrompt(conversation) {
  const now = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区'
  const lines = [
    '你是 AI.OS,运行在用户本机上的私人 AI 助手。推理、记忆和数据全部在这台设备本地完成。',
    `当前时间:${now.toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'short' })}(${timeZone};日期 ${now.toLocaleDateString('sv-SE')})。`,
    '你的知识有截止日期,不掌握此刻的近况。涉及“今天/最新/现在/近期/新闻/价格/版本/天气/赛况”等随时间变化的事,别凭记忆当作现状——能联网就先 browser_search 查证、注明信息时间,不能联网就如实说明这是截止前的旧信息。',
    '回答使用 Markdown。代码放在带语言标注的代码块里。保持直接、具体,不要空洞客套。',
    '当用户要网页、数据可视化、动画、小游戏,或明确要 SVG/矢量图时,输出单文件自包含的 ```html 或 ```svg 代码块(内联 CSS/JS,不引外部资源)——界面会自动在旁边的预览面板实时渲染它。',
    '硬性规则:仅当用户想要一张全新的位图图像(画图/画画/生成图片/照片/插画/海报/头像/壁纸)时,才调用 generate_image 工具(本地 AI 生图),严禁用 HTML/SVG/CSS 代码模拟图片。以下情况不要生图:①用户在讨论、分析或询问某张已有图片(含刚发的附件图);②要的是图表/流程图/示意图/数据可视化(改用 ```html 或 ```svg 代码块,会自动预览);③只需要文字(文案、描述、创意、清单);④用户明确要 SVG/矢量图/用代码画。拿不准要不要真出图时,先用一句话问清("要我直接生成一张吗?"),不要贸然生成——生图较慢,误触发很打扰。',
    '用户消息里的【附件文件:xxx】块就是该文件的完整内容(PDF/Word/Excel/PPT/音频转写等已在本地解析为文本)。直接依据它回答,不要说"无法读取附件"。',
  ]
  const loc = S.settings.location?.trim()
  if (loc) {
    lines.push(
      `用户当前所在地:${loc}。涉及天气、本地信息、时区、就近推荐时以此为准(可能过时,与用户当下所说冲突时以对话为准)。`,
    )
  }
  if (S.settings.memory) {
    lines.push(
      '画像和长期记忆是历史记录,不自动代表现状。没有明确日期的“近期/正在/计划”不得当作当前事实,也不要拿旧项目主动寒暄;涉及当前进展时先开放地问。',
    )
  }
  if (S.settings.tools) {
    lines.push(
      '工具选择速查(需要事实时先用工具,不要凭记忆编造):\n' +
        '- 联网查资料:browser_search(结果自带摘要,先筛选)→ 挑 1-3 篇 open_browser_page(直接返回正文)→ 长文按结果尾部提示用 read_browser_page(part=text, offset=N) 续读 → 汇总并附来源链接\n' +
        '- 用户说"当前页面/我打开的这个网页":read_browser_page(不要 open)\n' +
        '- 页面上点击/填表/触发"加载更多":browser_interact;看页面里的图片/图表/布局:look_at_browser_page\n' +
        '- browser 工具偶发报错:先直接重试一次(工具会自动后台唤起 Chrome 让扩展重连);仍失败再 browser_status 诊断并把提示转告用户\n' +
        '- 算数 calculate;跑代码 run_javascript;日期时间 get_time' +
        (S.settings.webAccess
          ? '\n- 浏览器工具不可用时才退回 web_search / fetch_url(公共代理,较不稳定)'
          : '') +
        '\n不要:在同一页面反复滚动重读(用 offset 续读);编造网页内容或链接。',
    )
    if (isNative) {
      lines.push(
        '本机原生能力(只有这台 Mac 上可用,按需伸手,别为简单问答滥用):\n' +
          '- 改代码/修 bug/写脚本/跑测试/多文件工程:delegate_task 派给本机 Claude Code(默认)或 cursor,异步执行——派发后回复用户并用 check_task 跟进,别原地干等\n' +
          '- 看桌面上有什么、某个原生 Mac 应用界面长什么样:look_at_screen(网页内容/网页里的图仍走 look_at_browser_page,别混用)\n' +
          '- 打开/前置某个 Mac 应用 open_mac_app;往它输入文字 type_into_app\n' +
          '- 把任务转交本机其它 AI 桌面应用(Claude/ChatGPT/Cursor/Codex)并取回复:ai_app_send 发出、隔十几秒到一分钟再 ai_app_read 读\n' +
          '- GitHub 操作(PR/issue/仓库)github_cli;更底层的 macOS 自动化 run_applescript',
      )
    }
    if (isCloudAuthorized()) {
      lines.push(
        'Life OS 数据(用户自己的真实数据,涉及时必须用工具读、不要猜也不要说"看不到"):\n' +
          '- 花销/收入/结余/某分类或商家花多少 → finance_summary(可传 period 或 from/to、category、merchant)\n' +
          '- 待办/今天要做什么/有没有逾期/今天完成了什么 → planner_tasks(scope: today/overdue/open/completed_today)\n' +
          '- "今天怎么样/我的近况" 这类综合近况 → life_os_today(一次拿到待办·财务·健身·音乐今日概览)\n' +
          '- 用户明确要记一件事/加待办/提醒自己 → planner_add_task(投递到 Planner 收件箱);仅意图明确时调,调用后复述加了什么',
      )
    }
    if (S.settings.memory) {
      // 刻意精简:小模型(尤其思考模式)会逐句反刍长指令,曾因此陷入复读循环;细节纪律在工具描述里
      lines.push(
        '记忆:用户说出值得长期记住的新事实(偏好、背景变化、纠正)时,直接调一次 save_memory;状态/时间纠正、以及今天联网确认到的重要时效事实,都保存为“截至当前日期,…”的带日期事实,没给完成日期就不要猜。问到用户历史而上下文里没有答案时,先 search_memory。记忆操作不要反复斟酌,一次调用、顺带确认即可。',
      )
    }
    lines.push(
      '用户有 Obsidian 笔记库(已全文索引):涉及他过往写下的判断、框架、决策、评审、项目细节或日常记录时,先 search_notes 检索,需要展开再 read_note;回答时给出笔记路径。若用户就某个事实/决策/进展直接发问(如"我上次定的X是什么""关于Y我的结论"),用 ask_notes 一步拿到基于笔记、带 [n] 引用的综合答案。',
    )
    lines.push(
      '策展笔记(每晚/每周自动生成,信号高,优先参考):Work/Digests/daily-summary-日期.md 每日工作摘要;Work/Topics/<主题>.md 跨天演进的主题线(含时间线与状态),_未决看板.md 汇总未决与停滞项;Work/People/<人名>.md 每个人涉及的主题;Work/Rollups/weekly-*.md、monthly-*.md 周报月报。问工作进展/某件事的来龙去脉/某人相关时,这些比原始 Work Log 更好用。',
    )
    lines.push(
      '今日动态:插件每天把用户的 Teams 消息、Outlook 邮件、Jira、RSS 聚合成日报,写进 memory 库根目录的“YYYY-MM-DD.md”。用户问及今天/某天的会议、邮件、工作进展或“今天怎么样/有什么事”时,用 read_note(vault="memory", path="当天日期.md") 读那天的日报(结合上面注入的当前日期填日期);要更细的原始记录再看主库 Work/Work Log/ 下的 teams-chat-digest-日期.md、outlook-mail-digest-日期.md。',
    )
    lines.push(
      '近期项目:memory 库的 project-git-pulse.md 是脚本汇总的用户近几天各代码仓库的 git 提交(按活跃度排序)。用户问及最近在忙什么、在做哪些项目、开发/代码进展时,read_note(vault="memory", path="project-git-pulse.md") 读它再答。',
    )
    lines.push(
      '生图:用户要画图/生成图片时用 generate_image,prompt 写具体(主体+细节+场景+光线+风格)。人物、写实、图中含文字用 quality="quality"。创建可复用角色加 save_character="名字";之后 character="名字" 让同一角色进入新场景;已有角色用 list_characters 查。生成结果自动展示,不要编造图片链接。',
    )
  }
  const custom = S.settings.customPrompt?.trim()
  if (custom) lines.push(`用户的自定义指令:\n${custom}`)

  try {
    const { FOCUS } = await import('./kenos/focusStore.svelte.js')
    const focus = FOCUS.focus
    if (focus && ['active', 'paused', 'temporarily_left', 'ending'].includes(focus.status)) {
      const domains = focus.assistantScope?.allowedDomains?.join('、') || focus.activeSpace
      lines.push(
        `当前 Focus Session：「${focus.title}」(mode=${focus.mode}, status=${focus.status})。` +
          `默认只处理这些域：${domains}。禁止主动提起被隐藏域的待办/角标/审批数量。` +
          `若用户明确问跨域问题：可以回答，并清楚标明“暂时跨出当前 Focus”，不要自动结束或切换 Focus，回答后提醒可返回当前 Session。` +
          `不要把 raw FocusContext JSON 或凭证写进回复。主动建议必须可解释（为什么现在、信号、影响、是否写入、可否忽略）。`,
      )
    }
  } catch {
    /* Focus store optional during early boot */
  }

  // 长对话压缩:更早的消息已由小模型摘要,注入摘要保住"长期剧情"
  if (conversation.summary) {
    lines.push(`本对话较早部分的摘要(原文已省略):\n${conversation.summary}`)
  }

  if (S.settings.memory) {
    // 画像 = 常驻核心记忆:最稳定的身份/偏好,不走检索,保证不漏
    const profile = S.settings.userProfile?.trim()
    if (profile) {
      lines.push(`用户画像(长期资料):\n${profile}`)
    }
    // 情景记忆 = 语义召回:只注入与本轮相关的,控制小模型的上下文负担
    const lastUser = [...conversation.messages].reverse().find((m) => m.role === 'user')
    if (lastUser?.content) {
      const query = lastUser.content.slice(0, 300)
      const key = `${MEM.items.length}:${query}`
      let memories
      if (recallCache.key === key) {
        memories = recallCache.memories
      } else {
        memories = await recallRelevant(query)
        recallCache = { key, memories }
      }
      if (memories.length) {
        lines.push(
          `与本轮相关的长期记忆(按相关度;记忆可能过时,与用户当前所说冲突时以对话为准):\n${memories.map((m) => `- ${m}`).join('\n')}`,
        )
      }
    }
  }
  return lines.join('\n\n')
}

function conversationHasImages(conversation) {
  return conversation.messages.some((m) => m.images?.length)
}

function resolveModel(conversation) {
  if (conversationHasImages(conversation)) {
    return S.settings.model === 'llm-quality' ? VISION_MODELS.quality : VISION_MODELS.fast
  }
  return conversation.model
}

/* —— 发送 / 重生成 —— */

/** 发送一条用户消息并流式接收回复 */
export async function sendMessage(text, images = [], files = []) {
  const trimmed = text.trim()
  if ((!trimmed && !images.length && !files.length) || C.streaming) return

  let conversation = activeConversation()
  if (!conversation) {
    conversation = {
      id: crypto.randomUUID(),
      title: (trimmed || files[0]?.name || '图片对话').slice(0, 24),
      titled: false,
      model: S.settings.model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    }
    C.conversations = [conversation, ...C.conversations]
    C.activeId = conversation.id
    rememberActive(conversation.id)
  }
  conversation.model = S.settings.model
  conversation.messages.push({
    role: 'user',
    content: trimmed,
    images: images.length ? images : undefined,
    files: files.length ? files : undefined,
  })
  touch(conversation)
  persist()

  await streamAssistantReply(conversation)
}

/** 编辑某条用户消息并从该处重发(丢弃其后所有消息,ChatGPT 语义) */
export async function editUserMessage(index, newText) {
  const conversation = activeConversation()
  if (!conversation || C.streaming) return
  const message = conversation.messages[index]
  if (message?.role !== 'user') return
  const trimmed = newText.trim()
  if (!trimmed && !message.images?.length) return
  conversation.messages.splice(index + 1)
  message.content = trimmed
  // 编辑=新的意图方向:此前重生成累积的回答分支作废
  message.branches = undefined
  message.branch = undefined
  // 编辑点落在已摘要区内:摘要失效,重新从头累积
  if ((conversation.summarizedUpTo ?? 0) > index) {
    conversation.summary = undefined
    conversation.summarizedUpTo = undefined
  }
  touch(conversation)
  persist()
  await streamAssistantReply(conversation)
}

/** 会话导出为 Markdown 文本 */
export function conversationToMarkdown(conversation) {
  const lines = [`# ${conversation.title}`, '']
  for (const m of conversation.messages) {
    if (m.role === 'user') {
      lines.push(`**Ken:**`, '', m.content, '')
    } else if (m.content) {
      lines.push(`**AI.OS:**`, '', m.content, '')
    }
  }
  return lines.join('\n')
}

/** 一轮回答的助手尾巴(可能含多条工具轮消息)脱离响应式的纯快照 */
function snapshotTail(tail) {
  return $state.snapshot(tail)
}

/**
 * 重新生成最后一轮回复。不再丢弃旧回答:把当前尾巴存成一个"版本",
 * 生成的新回答作为新版本追加,由消息上的 ‹2/3› 翻页器切换(对齐 GPT/Claude)。
 */
export async function regenerate() {
  const conversation = activeConversation()
  if (!conversation || C.streaming) return
  const messages = conversation.messages
  // 定位本轮触发点:最后一条用户消息
  let u = messages.length - 1
  while (u >= 0 && messages[u].role !== 'user') u--
  if (u < 0) return
  const user = messages[u]

  const tail = messages.slice(u + 1)
  const tailHasContent = tail.some((m) => m.role === 'assistant' && m.content && !m.error)
  if (tailHasContent) {
    if (!user.branches) {
      user.branches = [snapshotTail(tail)]
      user.branch = 0
    } else {
      // 当前分支可能被"继续生成"就地续写过,切换前同步回存储
      user.branches[user.branch ?? 0] = snapshotTail(tail)
    }
  }

  messages.splice(u + 1)
  await streamAssistantReply(conversation)

  if (user.branches) {
    user.branches.push(snapshotTail(conversation.messages.slice(u + 1)))
    user.branch = user.branches.length - 1
    persist()
  }
}

/** 在某轮回答的多个版本间切换(dir=-1 上一个 / +1 下一个) */
export function switchBranch(userIndex, dir) {
  const conversation = activeConversation()
  if (!conversation || C.streaming) return
  const user = conversation.messages[userIndex]
  if (!user?.branches || user.branches.length < 2) return
  const next = (user.branch ?? 0) + dir
  if (next < 0 || next >= user.branches.length) return
  // 先把当前尾巴回存(可能被续写改过),再换上目标版本
  user.branches[user.branch ?? 0] = snapshotTail(conversation.messages.slice(userIndex + 1))
  conversation.messages.splice(userIndex + 1)
  conversation.messages.push(...snapshotTail(user.branches[next]))
  user.branch = next
  touch(conversation)
  persist()
}

/** 续写被 token 上限(finishReason='length')截断的最后一条回复。
    衔接进同一条消息,不写入"继续"这类可见消息,读起来像一段连续输出。 */
export async function continueGenerating() {
  const conversation = activeConversation()
  if (!conversation || C.streaming) return
  const last = conversation.messages.at(-1)
  if (last?.role !== 'assistant' || !last.content) return

  C.streaming = true
  controller = new AbortController()
  const signal = controller.signal
  const model = resolveModel(conversation)
  last.finishReason = undefined

  let systemPrompt
  try {
    systemPrompt = await buildSystemPrompt(conversation)
  } catch {
    systemPrompt = '你是 AI.OS,本地私人 AI 助手。'
  }

  const startedAt = Date.now()
  try {
    // 被截断的助手消息已是 wire 尾部;补一条 wire-only 的续写指令(不入库)
    const wire = buildWireMessages(conversation, systemPrompt)
    wire.push({
      role: 'user',
      content:
        '接着你上一条被截断的回复继续写,直接衔接到断点处,不要重复已经写过的内容,也不要重述开头或加过渡语。',
    })
    const reveal = createStreamReveal(last, startedAt)
    const res = await streamChat({
      model,
      messages: wire,
      signal,
      temperature: S.settings.temperature,
      maxTokens: 4096,
      thinking: false,
      onDelta: (chunk) => {
        if (chunk.content) reveal.push({ content: chunk.content }) // 续写只接正文
      },
    }).finally(() => reveal.finish())
    last.finishReason = res.finishReason
    last.durationMs = (last.durationMs ?? 0) + (Date.now() - startedAt)
  } catch (err) {
    if (err?.name !== 'AbortError') {
      last.error = String(err?.message ?? err)
      C.gatewayOk = await pingGateway()
    }
  } finally {
    if (controller?.signal === signal) {
      controller = null
      C.streaming = false
    }
    touch(conversation)
    persist()
  }
}

/** agent loop:流式回复,遇到 tool_calls 就执行并继续,最多 MAX_TOOL_ROUNDS 轮 */
async function streamAssistantReply(conversation) {
  C.streaming = true
  controller = new AbortController()
  const signal = controller.signal

  const useVision = conversationHasImages(conversation)
  const lastUserText =
    [...conversation.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const model = resolveModel(conversation)
  const useTools = S.settings.tools && !useVision
  const tools = useTools ? toolDefinitions({ webAccess: S.settings.webAccess }) : undefined

  // 先挂占位消息再组装 prompt:记忆召回(嵌入模型冷启动)可能耗时几十秒,
  // 这段时间界面必须有等待反馈,不能空白
  const firstAssistant = $state({ role: 'assistant', content: '', reasoning: '' })
  conversation.messages.push(firstAssistant)

  let systemPrompt
  try {
    systemPrompt = await buildSystemPrompt(conversation)
  } catch {
    systemPrompt = '你是 AI.OS,本地私人 AI 助手。'
  }

  // 思考模式遇到复读循环熔断后,本次回复的后续轮次全部关思考重试(稳定优先)
  let useThinking = S.settings.thinking
  // 复读重试时抬高采样温度打散退化循环(非思考模式没有"关思考"这条退路)
  let sampleTemp = S.settings.temperature

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let assistant = firstAssistant
      if (round > 0) {
        const next = $state({ role: 'assistant', content: '', reasoning: '' })
        conversation.messages.push(next)
        assistant = next
      }
      const startedAt = Date.now()

      // 最后一轮不再提供工具,强制模型基于已有结果收尾作答
      const lastRound = round === MAX_TOOL_ROUNDS - 1
      const doStream = () => {
        const reveal = createStreamReveal(assistant, startedAt)
        return streamChat({
          model,
          messages: buildWireMessages(conversation, systemPrompt),
          signal,
          temperature: sampleTemp,
          maxTokens: useThinking ? 8192 : 4096, // 思考通道占大头,给足预算避免正文被截断
          tools: lastRound ? undefined : tools,
          thinking: useThinking,
          onDelta: (chunk) => reveal.push(chunk),
        }).finally(() => reveal.finish()) // 结束/中断都补齐,保证 assistant.content 完整
      }

      let res = await doStream()
      // 模型抽风兜底:两类退化各重试一次(都很保守,误报代价仅一次重生成)——
      //   ① 退化复读 finishReason='loop'(isLooping 判定极严);
      //   ② "半截停":正常 stop 但正文短到只有一句引子、且以冒号/顿号收尾
      //     (如"推导过程如下:"后戛然而止),几乎必然是抽风;无思考产物时才算,避免误伤。
      const stub = (assistant.content || '').trim()
      const isStubbedStop =
        res.finishReason === 'stop' &&
        !assistant.reasoning &&
        stub.length > 0 &&
        stub.length < 40 &&
        /[:：,，、]$/.test(stub)
      if ((res.finishReason === 'loop' || isStubbedStop) && !signal.aborted && !res.toolCalls.length) {
        const looped = res.finishReason === 'loop'
        assistant.reasoning = ''
        assistant.content = ''
        assistant.thinkingMs = undefined
        // 复读+思考:关思考重试(换条件);其余(复读快速模式 / 半截停):抬温打散
        if (looped && useThinking) useThinking = false
        else sampleTemp = Math.min((sampleTemp ?? 0.7) + 0.3, 1.2)
        res = await doStream()
      }

      assistant.durationMs = Date.now() - startedAt
      // 只思考没正文就结束(被打断/纯思考轮):整段都算思考时间
      if (assistant.reasoning && !assistant.thinkingMs) {
        assistant.thinkingMs = assistant.durationMs
      }
      if (!res.toolCalls.length) {
        // 记下收尾原因:length = 被 token 上限截断,由 UI 提供"继续生成"
        assistant.finishReason = res.finishReason
        break
      }

      // 执行工具,结果回填后进入下一轮
      assistant.toolCalls = res.toolCalls.map((tc) => ({
        id: tc.id || crypto.randomUUID(),
        name: tc.name,
        arguments: tc.arguments,
        running: true,
      }))
      persist()
      // 生图误触发兜底:文字/代码类需求拦下生图,提示模型直接用文字回答(格式自选)
      for (const tc of assistant.toolCalls) {
        if (tc.name === 'generate_image' && isBuildCodeAsk(lastUserText)) {
          tc.result =
            '[已跳过生图] 用户要的是文字/代码回答,不是一张图片,不要调用 generate_image。' +
            '请直接用 Markdown 正文回答(表格就用表格,列表就用列表);仅当用户明确要可运行的' +
            '网页/小游戏/应用时,才输出自包含的 ```html 代码块(内联 CSS/JS,不引外部资源)。'
          tc.running = false
        }
      }
      // 无副作用、不经网关模型也不碰浏览器共享标签页的工具并发执行;其余保持串行——
      // 网关(llama-swap)按 model 换出换入,并发不同档会抖动;浏览器工具共享 agentTab、
      // GUI 工具抢焦点,并发会互相踩踏。多数轮只有一个工具,此分区对常见情况零影响。
      const pending = assistant.toolCalls.filter((tc) => tc.result === undefined)
      const runOne = async (tc) => {
        tc.result = await executeTool(tc.name, tc.arguments)
        // 生图类工具的产出图片挂到调用记录上,由 Message 直接渲染(不进模型上下文)
        const images = consumePendingImages()
        if (images.length) tc.images = images
        tc.running = false
      }
      const concurrent = pending.filter((tc) => PARALLEL_SAFE_TOOLS.has(tc.name))
      if (concurrent.length && !signal.aborted) await Promise.all(concurrent.map(runOne))
      for (const tc of pending) {
        if (PARALLEL_SAFE_TOOLS.has(tc.name)) continue
        if (signal.aborted) break
        await runOne(tc)
      }
      persist()
      if (signal.aborted) break
    }

    // 轮次耗尽仍停在工具调用、没产出正文(模型一路检索没收尾,常见于笔记 RAG 打满 10 轮):
    // 撤掉工具强制再作答一次,基于已积累的工具结果综合出答案,避免"检索一大堆却零回答"。
    const stuck = conversation.messages.at(-1)
    if (!signal.aborted && stuck?.role === 'assistant' && !stuck.content && stuck.toolCalls?.length) {
      const wrap = $state({ role: 'assistant', content: '', reasoning: '' })
      conversation.messages.push(wrap)
      const startedAt = Date.now()
      const reveal = createStreamReveal(wrap, startedAt)
      const fin = await streamChat({
        model,
        messages: buildWireMessages(conversation, systemPrompt),
        signal,
        temperature: sampleTemp,
        maxTokens: 4096,
        tools: undefined, // 强制收尾:不再给工具,逼模型基于已有结果作答
        thinking: false,
        onDelta: (chunk) => reveal.push(chunk),
      }).finally(() => reveal.finish())
      wrap.durationMs = Date.now() - startedAt
      wrap.finishReason = fin.finishReason
      if (!wrap.content && !wrap.reasoning) {
        // 收尾仍失败:清掉空壳,给上一条工具消息挂重试入口
        conversation.messages.pop()
        if (!stuck.error) stuck.error = '模型检索后没能综合出回答,可点重试'
      }
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      const last = conversation.messages.at(-1)
      if (last?.role === 'assistant') last.error = String(err?.message ?? err)
      C.gatewayOk = await pingGateway()
    }
  } finally {
    if (controller?.signal === signal) {
      controller = null
      C.streaming = false
    }
    // 清理空壳消息(中断/出错时)
    const last = conversation.messages.at(-1)
    if (
      last?.role === 'assistant' &&
      !last.content &&
      !last.reasoning &&
      !last.toolCalls?.length &&
      !last.error
    ) {
      if (signal.aborted) {
        // 用户主动中断:静默清掉空壳
        conversation.messages.pop()
      } else {
        // 模型静默返回空(如 VLM 壳在长对话/复杂上下文下会返回空 content):
        // 别无声无息,就地把这条空壳变成带「重试」的错误气泡,给用户反馈与入口
        const prev = conversation.messages.at(-2)
        last.error =
          prev?.role === 'assistant' && prev.toolCalls?.length
            ? '模型没有基于工具结果生成回答,可点重试'
            : '模型没有返回内容(图片或上下文可能过大;可试试开新对话再发),可点重试'
      }
    } else if (last?.role === 'assistant' && last.content && !last.error) {
      C.freshAssistant = { id: conversation.id, index: conversation.messages.length - 1 }
    }
    touch(conversation)
    persist()
  }

  // 回复落定后的小模型辅助任务,全部 fire-and-forget,不阻塞交互
  maybeTitle(conversation)
  maybeSuggest(conversation)
  maybeCompact(conversation)
  maybeExtractMemories(conversation)
}

/** 回复完成后被动萃取用户稳定事实(补模型忘了 save_memory 的情况) */
function maybeExtractMemories(conversation) {
  const lastUser = [...conversation.messages].reverse().find((m) => m.role === 'user')
  const lastAssistant = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content && !m.error)
  if (!lastUser?.content) return
  const answer = (lastAssistant?.content ?? '').replace(/^<think>[\s\S]*?<\/think>/, '').trim()
  autoExtractMemories(lastUser.content, answer)
}

/** 首轮回复完成后,用常驻小模型起短标题(失败保留截断标题) */
async function maybeTitle(conversation) {
  if (conversation.titled) return
  const user = conversation.messages.find((m) => m.role === 'user')
  const assistant = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content && !m.error)
  if (!user || !assistant) return
  conversation.titled = true
  const title = await generateTitle(user.content, assistant.content, S.settings.locale)
  if (title) {
    conversation.title = title
    persist()
  }
}

/* —— 小模型辅助:追问建议 / 历史压缩(常驻 llm-tiny,亚秒级) —— */

/** 回复完成后生成 2-3 个追问建议,挂在最后一条助手消息上 */
async function maybeSuggest(conversation) {
  const last = conversation.messages.at(-1)
  if (!last || last.role !== 'assistant' || !last.content || last.error) return
  const lastUser = [...conversation.messages].reverse().find((m) => m.role === 'user')
  if (!lastUser?.content) return
  const answer = last.content.replace(/^<think>[\s\S]*?<\/think>/, '').trim()
  if (!answer) return

  const instruction =
    S.settings.locale === 'en'
      ? 'Based on this exchange, suggest 3 natural follow-up questions the user might send next. One per line, max 8 words each. Output only the 3 lines, no numbering.'
      : '基于这轮对话,替用户想 3 个自然的追问(用户视角、可直接发送),每行一个,每个不超过 16 个字。只输出 3 行问题本身,不要编号和其他内容。'
  const raw = await tinyComplete(
    `${instruction}\n\n用户: ${lastUser.content.slice(0, 400)}\n助手: ${answer.slice(0, 800)}`,
    { maxTokens: 96, temperature: 0.7 },
  )
  if (!raw) return
  const suggestions = raw
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').trim())
    .filter((l) => l.length >= 2 && l.length <= 40)
    .slice(0, 3)
  if (!suggestions.length) return
  last.suggestions = suggestions
  persist()
}

const COMPACT_TRIGGER = 20000 // 未摘要区超过此字符量时触发后台压缩
const COMPACT_KEEP = 12000 // 压缩后保留原文的近期窗口
let compacting = false

function messageSize(m) {
  let n = (m.content ?? '').length
  for (const f of m.files ?? []) n += Math.min(f.text?.length ?? 0, 12000)
  for (const tc of m.toolCalls ?? []) {
    n += (tc.arguments?.length ?? 0) + (tc.result?.length ?? 0)
  }
  return n + 50
}

/**
 * 长对话历史压缩:旧消息不再被静默丢弃,而是由小模型并入滚动摘要
 * (摘要进 system prompt,原文只保留近期窗口)。
 */
async function maybeCompact(conversation) {
  if (compacting || C.streaming) return
  const messages = conversation.messages
  const start = Math.min(conversation.summarizedUpTo ?? 0, messages.length)
  const sizes = messages.map(messageSize)
  const total = sizes.slice(start).reduce((a, b) => a + b, 0)
  if (total < COMPACT_TRIGGER) return

  // 压缩边界必须落在用户消息开头(避免拆散 assistant+tool 回放),
  // 从尾部保留约 COMPACT_KEEP 的原文
  const n = messages.length
  const suffix = new Array(n + 1).fill(0)
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + sizes[i]
  let cut = start
  for (let i = start + 1; i < n; i++) {
    if (messages[i].role === 'user' && suffix[i] <= COMPACT_KEEP) {
      cut = i
      break
    }
  }
  if (cut <= start) {
    // 近期窗口装不下任何完整轮次(单轮巨大):至少保留最后一轮
    for (let i = n - 1; i > start; i--) {
      if (messages[i].role === 'user') {
        cut = i
        break
      }
    }
  }
  if (cut <= start) return

  const chunk = messages
    .slice(start, cut)
    .map((m) => {
      const who = m.role === 'user' ? '用户' : '助手'
      const text = (m.content ?? '')
        .replace(/^<think>[\s\S]*?<\/think>/, '')
        .trim()
        .slice(0, 1500)
      const toolNote = m.toolCalls?.length
        ? `(调用了工具:${m.toolCalls.map((t) => t.name).join('、')})`
        : ''
      return `${who}: ${text}${toolNote}`
    })
    .filter((l) => l.length > 4)
    .join('\n')
  if (!chunk) return

  compacting = true
  try {
    const merged = await tinyComplete(
      `把以下对话内容压缩成不超过 400 字的要点摘要,保留:关键事实与数据、做出的决定、用户偏好、未解决的问题。只输出摘要本身。\n\n${conversation.summary ? `【已有摘要】\n${conversation.summary}\n\n` : ''}【新增对话】\n${chunk.slice(0, 8000)}`,
      { maxTokens: 800, temperature: 0.3, timeoutMs: 60000 },
    )
    if (merged) {
      conversation.summary = merged.slice(0, 1200)
      conversation.summarizedUpTo = cut
      persist()
    }
  } finally {
    compacting = false
  }
}
