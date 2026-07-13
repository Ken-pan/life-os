import { browser } from '$app/environment'
import { S } from '$lib/state.svelte.js'
import {
  streamChat,
  generateTitle,
  pingGateway,
  VISION_MODELS,
} from '$lib/localai.js'
import { toolDefinitions, executeTool } from '$lib/tools.js'
import { recallRelevant } from '$lib/memory.svelte.js'

const STORAGE_KEY = 'aios_chats_v1'
const MAX_CONVERSATIONS = 200
const MAX_TOOL_ROUNDS = 6
const HISTORY_CHAR_BUDGET = 28000

/**
 * @typedef {{ id: string, name: string, arguments: string, result?: string, running?: boolean }} ToolCallRecord
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
 * }} ChatMessage
 * @typedef {{
 *   id: string,
 *   title: string,
 *   titled: boolean,
 *   model: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   messages: ChatMessage[],
 * }} Conversation
 */

function loadConversations() {
  if (!browser) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const C = $state({
  /** @type {Conversation[]} 按 updatedAt 倒序 */
  conversations: loadConversations(),
  /** @type {string | null} */
  activeId: null,
  streaming: false,
  /** @type {boolean | null} null = 未检查 */
  gatewayOk: null,
  /** @type {{ id: string, index: number } | null} 刚完成的回复(供 artifact 自动预览,消费后置空) */
  freshAssistant: null,
})

let saveTimer = null
export function persist() {
  if (!browser) return
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
}

export function selectConversation(id) {
  stopStreaming()
  C.activeId = id
}

export function deleteConversation(id) {
  if (C.activeId === id) stopStreaming()
  C.conversations = C.conversations.filter((c) => c.id !== id)
  if (C.activeId === id) C.activeId = null
  persist()
}

export function clearAllConversations() {
  stopStreaming()
  C.conversations = []
  C.activeId = null
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

/* —— prompt 组装 —— */

async function buildSystemPrompt(conversation) {
  const now = new Date()
  const lines = [
    '你是 AI.OS,运行在用户本机上的私人 AI 助手。推理、记忆和数据全部在这台设备本地完成。',
    `当前时间:${now.toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'short' })}。`,
    '回答使用 Markdown。代码放在带语言标注的代码块里。保持直接、具体,不要空洞客套。',
    '当用户要网页、可视化、动画、小游戏或 SVG 图形时,输出单文件自包含的 ```html 或 ```svg 代码块(内联 CSS/JS,不引外部资源)——界面会自动在旁边的预览面板实时渲染它。',
  ]
  if (S.settings.tools) {
    lines.push(
      '你可以调用工具:数学用 calculate,代码/数据处理用 run_javascript,时间用 get_time,需要记住或回忆用户信息用 save_memory / search_memory;要读取用户 Chrome 里打开的页面(如"当前页面/这个网页")用 read_browser_page,要让 Chrome 打开本地开发页面并读取用 open_browser_page,browser 工具出错先用 browser_status 诊断' +
        (S.settings.webAccess
          ? ';涉及最新信息或你不确定的事实,先 web_search 搜索,再用 fetch_url 打开值得深入的链接'
          : '') +
        '。需要事实精度时优先用工具,不要凭感觉编造。',
    )
  }
  const custom = S.settings.customPrompt?.trim()
  if (custom) lines.push(`用户的自定义指令:\n${custom}`)

  if (S.settings.memory) {
    const lastUser = [...conversation.messages].reverse().find((m) => m.role === 'user')
    if (lastUser?.content) {
      const memories = await recallRelevant(lastUser.content.slice(0, 300))
      if (memories.length) {
        lines.push(`关于用户的已知信息(长期记忆,按相关度):\n${memories.map((m) => `- ${m}`).join('\n')}`)
      }
    }
  }
  return lines.join('\n\n')
}

/** 存储消息 → OpenAI wire 消息(含 tool_calls 回放与图片),带字符预算截断 */
function buildWireMessages(conversation, systemPrompt) {
  const wire = []
  for (const m of conversation.messages) {
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

/** 重新生成最后一条助手回复 */
export async function regenerate() {
  const conversation = activeConversation()
  if (!conversation || C.streaming) return
  const messages = conversation.messages
  while (messages.length && messages.at(-1)?.role === 'assistant') messages.pop()
  if (messages.at(-1)?.role !== 'user') return
  await streamAssistantReply(conversation)
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

  let systemPrompt
  try {
    systemPrompt = await buildSystemPrompt(conversation)
  } catch {
    systemPrompt = '你是 AI.OS,本地私人 AI 助手。'
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const assistant = $state({ role: 'assistant', content: '', reasoning: '' })
      conversation.messages.push(assistant)
      const startedAt = Date.now()

      const res = await streamChat({
        model,
        messages: buildWireMessages(conversation, systemPrompt),
        signal,
        temperature: S.settings.temperature,
        tools,
        thinking: S.settings.thinking,
        onDelta: (chunk) => {
          if (chunk.reasoning) assistant.reasoning += chunk.reasoning
          if (chunk.content) assistant.content += chunk.content
          // 正文开始的瞬间定格思考用时(reasoning_content 通道或 <think> 标签均适用)
          if (!assistant.thinkingMs && assistant.content) {
            const inThink =
              assistant.content.startsWith('<think>') &&
              !assistant.content.includes('</think>')
            const hadThinking =
              assistant.reasoning || assistant.content.startsWith('<think>')
            if (hadThinking && !inThink) {
              assistant.thinkingMs = Date.now() - startedAt
            }
          }
        },
      })

      assistant.durationMs = Date.now() - startedAt
      // 只思考没正文就结束(被打断/纯思考轮):整段都算思考时间
      if (assistant.reasoning && !assistant.thinkingMs) {
        assistant.thinkingMs = assistant.durationMs
      }
      if (!res.toolCalls.length) break

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
        tc.running = false
      }
      persist()
      if (signal.aborted) break
      if (round === MAX_TOOL_ROUNDS - 1) {
        // 最后一轮不再给工具,强制模型收尾
        tools?.splice(0, tools.length)
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
      conversation.messages.pop()
    } else if (last?.role === 'assistant' && last.content && !last.error) {
      C.freshAssistant = { id: conversation.id, index: conversation.messages.length - 1 }
    }
    touch(conversation)
    persist()
  }

  maybeTitle(conversation)
}

/** 首轮回复完成后,用 llm-fast 起短标题(失败保留截断标题) */
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
