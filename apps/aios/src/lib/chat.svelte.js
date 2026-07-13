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
import { recallRelevant } from '$lib/memory.svelte.js'
import { dataChanged } from '$lib/syncBus.js'

const STORAGE_KEY = 'aios_chats_v1'
const MAX_CONVERSATIONS = 200
const MAX_TOOL_ROUNDS = 10
const HISTORY_CHAR_BUDGET = 28000

/**
 * @typedef {{ id: string, name: string, arguments: string, result?: string, running?: boolean, images?: string[] }} ToolCallRecord
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

function loadConversations() {
  if (!browser) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
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

const initialConversations = loadConversations()

export const C = $state({
  /** @type {Conversation[]} 按 updatedAt 倒序 */
  conversations: initialConversations,
  /** @type {string | null} */
  activeId: restoreActive(initialConversations),
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
    '回答使用 Markdown。代码放在带语言标注的代码块里。保持直接、具体,不要空洞客套。',
    '当用户要网页、数据可视化、动画、小游戏,或明确要 SVG/矢量图时,输出单文件自包含的 ```html 或 ```svg 代码块(内联 CSS/JS,不引外部资源)——界面会自动在旁边的预览面板实时渲染它。',
    '硬性规则:用户要"画(一张)图/画画/生成图片/照片/插画/海报/头像/壁纸"时,必须调用 generate_image 工具(本地 AI 生图),严禁用 HTML/SVG/CSS 代码模拟图片;只有用户明确要求"SVG/矢量图/代码画"时才写代码。',
    '用户消息里的【附件文件:xxx】块就是该文件的完整内容(PDF/Word/Excel/PPT/音频转写等已在本地解析为文本)。直接依据它回答,不要说"无法读取附件"。',
  ]
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
        '- browser 工具报错:browser_status 诊断,把提示转告用户\n' +
        '- 算数 calculate;跑代码 run_javascript;日期时间 get_time' +
        (S.settings.webAccess
          ? '\n- 浏览器工具不可用时才退回 web_search / fetch_url(公共代理,较不稳定)'
          : '') +
        '\n不要:在同一页面反复滚动重读(用 offset 续读);编造网页内容或链接。',
    )
    if (S.settings.memory) {
      // 刻意精简:小模型(尤其思考模式)会逐句反刍长指令,曾因此陷入复读循环;细节纪律在工具描述里
      lines.push(
        '记忆:用户说出值得长期记住的新事实(偏好、背景变化、纠正)时,直接调一次 save_memory;状态/时间纠正要保存为“截至当前日期,用户确认…”的新事实,没给完成日期就不要猜。问到用户历史而上下文里没有答案时,先 search_memory。记忆操作不要反复斟酌,一次调用、顺带确认即可。',
      )
    }
    lines.push(
      '用户有 Obsidian 笔记库(已全文索引):涉及他过往写下的判断、框架、决策、评审、项目细节或日常记录时,先 search_notes 检索,需要展开再 read_note;回答时给出笔记路径。',
    )
    lines.push(
      '生图:用户要画图/生成图片时用 generate_image,prompt 写具体(主体+细节+场景+光线+风格)。人物、写实、图中含文字用 quality="quality"。创建可复用角色加 save_character="名字";之后 character="名字" 让同一角色进入新场景;已有角色用 list_characters 查。生成结果自动展示,不要编造图片链接。',
    )
  }
  const custom = S.settings.customPrompt?.trim()
  if (custom) lines.push(`用户的自定义指令:\n${custom}`)

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
      const memories = await recallRelevant(lastUser.content.slice(0, 300))
      if (memories.length) {
        lines.push(
          `与本轮相关的长期记忆(按相关度;记忆可能过时,与用户当前所说冲突时以对话为准):\n${memories.map((m) => `- ${m}`).join('\n')}`,
        )
      }
    }
  }
  return lines.join('\n\n')
}

/** 存储消息 → OpenAI wire 消息(含 tool_calls 回放与图片),带字符预算截断 */
function buildWireMessages(conversation, systemPrompt) {
  const wire = []
  // 已摘要的旧消息不再回放原文(摘要在 system prompt 里)
  const startIdx = Math.min(
    conversation.summarizedUpTo ?? 0,
    conversation.messages.length,
  )
  for (const m of conversation.messages.slice(startIdx)) {
    if (m.role === 'user') {
      // 附件文件内容以围栏块内联(单文件截 12k 字符)
      const fileBlocks = (m.files ?? [])
        .map(
          (f) =>
            `【附件文件:${f.name}】\n\`\`\`\n${f.text.slice(0, 12000)}${f.text.length > 12000 ? '\n…(已截断)' : ''}\n\`\`\``,
        )
        .join('\n\n')
      const userText = fileBlocks ? `${fileBlocks}\n\n${m.content}`.trim() : m.content
      if (m.images?.length) {
        wire.push({
          role: 'user',
          content: [
            ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
            { type: 'text', text: userText || '描述这张图片。' },
          ],
        })
      } else {
        wire.push({ role: 'user', content: userText })
      }
      continue
    }
    // assistant
    if (m.error && !m.content && !m.toolCalls?.length) continue
    if (m.toolCalls?.length) {
      wire.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      })
      for (const tc of m.toolCalls) {
        wire.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: tc.result ?? '(无结果)',
        })
      }
    } else {
      wire.push({ role: 'assistant', content: m.content })
    }
  }

  // 从尾部往前保留,直到超出预算(system 永远保留)
  const kept = []
  let budget = HISTORY_CHAR_BUDGET
  for (let i = wire.length - 1; i >= 0; i--) {
    const msg = wire[i]
    const size =
      typeof msg.content === 'string'
        ? msg.content.length
        : (msg.content ?? []).reduce((n, p) => n + (p.text?.length ?? 200), 0)
    budget -= size + 50
    if (budget < 0 && kept.length) break
    kept.unshift(msg)
  }
  // 不能以 tool 消息开头(会缺 assistant tool_calls 上文)
  while (kept.length && kept[0].role === 'tool') kept.shift()
  // 多轮工具的长结果会把用户问题挤出预算:没有问题模型会输出空。
  // 最近一条 user 消息永远在场(它在时间上先于所有保留的尾部消息)。
  const lastUser = [...wire].reverse().find((m) => m.role === 'user')
  if (lastUser && !kept.includes(lastUser)) kept.unshift(lastUser)
  return [{ role: 'system', content: systemPrompt }, ...kept]
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
          temperature: S.settings.temperature,
          maxTokens: useThinking ? 8192 : 4096, // 思考通道占大头,给足预算避免正文被截断
          tools: lastRound ? undefined : tools,
          thinking: useThinking,
          onDelta: (chunk) => reveal.push(chunk),
        }).finally(() => reveal.finish()) // 结束/中断都补齐,保证 assistant.content 完整
      }

      let res = await doStream()
      if (
        res.finishReason === 'loop' &&
        useThinking &&
        !signal.aborted &&
        !res.toolCalls.length
      ) {
        // 思考通道复读熔断:丢弃循环产物,关思考重试本轮
        useThinking = false
        assistant.reasoning = ''
        assistant.content = ''
        assistant.thinkingMs = undefined
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

      // 执行工具(串行,保持网关/嵌入模型不打架),结果回填后进入下一轮
      assistant.toolCalls = res.toolCalls.map((tc) => ({
        id: tc.id || crypto.randomUUID(),
        name: tc.name,
        arguments: tc.arguments,
        running: true,
      }))
      persist()
      for (const tc of assistant.toolCalls) {
        if (signal.aborted) break
        tc.result = await executeTool(tc.name, tc.arguments)
        // 生图类工具的产出图片挂到调用记录上,由 Message 直接渲染(不进模型上下文)
        const images = consumePendingImages()
        if (images.length) tc.images = images
        tc.running = false
      }
      persist()
      if (signal.aborted) break
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
      conversation.messages.pop()
      // 工具轮结束后模型静默返回空:别无声无息,给用户重试入口
      const prev = conversation.messages.at(-1)
      if (!signal.aborted && prev?.role === 'assistant' && prev.toolCalls?.length && !prev.error) {
        prev.error = '模型没有基于工具结果生成回答,可点重试'
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
