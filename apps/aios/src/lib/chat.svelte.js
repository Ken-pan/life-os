import { browser } from '$app/environment'
import { S } from '$lib/state.svelte.js'
import { streamChat, generateTitle, pingGateway } from '$lib/localai.js'

const STORAGE_KEY = 'aios_chats_v1'
const MAX_CONVERSATIONS = 200

/**
 * @typedef {{ role: 'user'|'assistant', content: string, reasoning?: string, error?: string }} ChatMessage
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
      /* 存储满时静默放弃,不打断对话 */
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
  // 保持列表按最近更新排序
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

/** 发送一条用户消息并流式接收回复 */
export async function sendMessage(text) {
  const trimmed = text.trim()
  if (!trimmed || C.streaming) return

  let conversation = activeConversation()
  if (!conversation) {
    conversation = {
      id: crypto.randomUUID(),
      title: trimmed.slice(0, 24),
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
  conversation.messages.push({ role: 'user', content: trimmed })
  touch(conversation)
  persist()

  await streamAssistantReply(conversation)
}

/** 重新生成最后一条助手回复 */
export async function regenerate() {
  const conversation = activeConversation()
  if (!conversation || C.streaming) return
  const messages = conversation.messages
  if (messages.at(-1)?.role === 'assistant') messages.pop()
  if (messages.at(-1)?.role !== 'user') return
  await streamAssistantReply(conversation)
}

async function streamAssistantReply(conversation) {
  const assistant = $state({ role: 'assistant', content: '', reasoning: '' })
  conversation.messages.push(assistant)
  C.streaming = true
  controller = new AbortController()
  const signal = controller.signal

  try {
    const history = conversation.messages
      .slice(0, -1)
      .filter((m) => !m.error || m.content)
      .map((m) => ({ role: m.role, content: m.content }))
    for await (const chunk of streamChat({
      model: conversation.model,
      messages: history,
      signal,
    })) {
      if (chunk.reasoning) assistant.reasoning += chunk.reasoning
      if (chunk.content) assistant.content += chunk.content
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      assistant.error = String(err?.message ?? err)
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

  maybeTitle(conversation)
}

/** 首轮回复完成后,用 llm-fast 起短标题(失败保留截断标题) */
async function maybeTitle(conversation) {
  if (conversation.titled) return
  const user = conversation.messages.find((m) => m.role === 'user')
  const assistant = conversation.messages.find(
    (m) => m.role === 'assistant' && m.content && !m.error,
  )
  if (!user || !assistant) return
  conversation.titled = true
  const title = await generateTitle(user.content, assistant.content, S.settings.locale)
  if (title) {
    conversation.title = title
    persist()
  }
}
