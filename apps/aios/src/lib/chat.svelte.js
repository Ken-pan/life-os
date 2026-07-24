import { browser } from '$app/environment'
import { S } from '$lib/state.svelte.js'
import {
  streamChat,
  generateTitle,
  tinyComplete,
  resolveChatBackend,
  stopActiveSpeech,
  VISION_MODELS,
} from '$lib/localai.js'
import {
  toolDefinitionsForBackend,
  executeTool,
  consumePendingImages,
} from '$lib/tools.js'
import {
  buildKenosCloudRecencyRule,
  buildKenosCloudSystemBundle,
} from '$lib/cloudChat.core.js'
import {
  applyLeoToCloudBundle,
  buildLeoCompactPrompt,
  buildLeoImageGenGuidance,
  buildLeoLocalIdentityLines,
  buildLeoSceneBeatExtractPrompt,
  formatLeoSceneBeatForPrompt,
  isLeoPersona,
  leoComposerPreferEnglish,
  leoFirstMessage,
  leoLocalAftercareReply,
  matchesLeoSafeword,
  stripLeoRoleSplitReply,
  normalizeLeoIntensity,
  normalizeLeoPace,
  normalizeLeoSafeword,
  normalizeLeoScenarioId,
  normalizeLeoStyle,
  parseLeoSceneBeatResponse,
  resolveLeoFocusInjectionMode,
} from '$lib/kenos/leoPersona.core.js'
import {
  looksLikeLeoSpeakingSuggestion,
  leoFallbackSuggestions,
} from '$lib/kenos/leoSuggest.core.js'
import {
  getLeoStill,
  leoStillCaption,
  resolveLeoStill,
} from '$lib/kenos/leoStills.core.js'
import {
  bumpLeoPetActivity,
  triggerLeoPetSoft,
} from '$lib/kenos/leoPet.svelte.js'
import { mergeLeoBondMemories } from '$lib/kenos/leoMemory.core.js'
import {
  recallRelevant,
  autoExtractMemories,
  autoExtractLeoBond,
  M as MEM,
} from '$lib/memory.svelte.js'
import { isNative, NATIVE_DEFS } from '$lib/native.js'
import {
  buildLocalToolHandbookLines,
  detectLocalAssistNeeds,
  filterToolsByNeeds,
  priorToolNamesFromConversation,
  toolNamesForNeeds,
} from '$lib/chatPromptBudget.core.js'
import { dataChanged } from '$lib/syncBus.js'
import { isCloudAuthorized } from '$lib/cloud.svelte.js'
import { areProductionWritesBlocked } from '$lib/kenos/prodWriteGuard.core.js'
import { shouldSeedDemo } from '$lib/demoMode.js'
import { buildDemoConversations } from '$lib/demoData.js'
import {
  MAX_TOOL_ROUNDS,
  PARALLEL_SAFE_TOOLS,
  buildWireMessages,
  isBuildCodeAsk,
  normalizeToolResult,
  settleAbortedToolCalls,
  shouldAutoRetryTool,
} from '$lib/chat-tool-loop.core.js'
import {
  buildInjectionSteerBlock,
  detectPromptInjectionSignals,
} from '$lib/inputGuard.core.js'
import {
  CONVERSATION_STORAGE_KEY,
  isConversationPersistenceBlocked,
} from '$lib/kenos/conversationPersist.core.js'
import {
  buildReplyGuardRewritePrompt,
  detectReplyGuardViolations,
  filterToolsForVision,
  finalizeGuardedReply,
  shouldPreferQualityModel,
} from '$lib/replyGuard.core.js'

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
 *   leoLocal?: boolean,
 *   leoStillId?: string,
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
 *   leoSceneBeat?: { location: string, clothing: string, contact: string, aftercare: string },
 *   leoSceneBeatAt?: number,
 *   persona?: 'leo' | 'korben',
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
  /** @type {'local'|'kimi'|null} 当前对话后端;云端网关不可达时为 kimi */
  chatBackend: null,
  /** @type {{ id: string, index: number } | null} 刚完成的回复(供 artifact 自动预览,消费后置空) */
  freshAssistant: null,
  /** 递增计数:从输入框请求"编辑上一条用户消息"(↑ 键)的信号 */
  editSignal: 0,
  /** 递增计数:Leo 对讲模式请求开始聆听(朗读结束后自动续听) */
  leoListenSignal: 0,
  /** 递增以取消尚未触发的延时续听 */
  leoListenToken: 0,
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

/** 取消尚未触发的延时续听(发送/打断/关对讲时调用) */
export function cancelLeoListen() {
  C.leoListenToken++
}

/**
 * Leo 对讲:延时后请求 Composer 开麦。
 * @param {number} [delayMs]
 */
export function requestLeoListen(delayMs = 900) {
  if (!browser) return false
  const token = ++C.leoListenToken
  const wait = Math.max(0, Number(delayMs) || 0)
  setTimeout(() => {
    if (token !== C.leoListenToken) return
    if (C.streaming) return
    C.leoListenSignal++
  }, wait)
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
                  toolCalls: m.toolCalls?.map((tc) => ({
                    ...tc,
                    images: undefined,
                  })),
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

/**
 * Reset to assistant home, or optionally seed a Leo greeting chat.
 *
 * IMPORTANT: URL reconciliation (`clear` / history.back / returnHome) must call
 * this WITHOUT `seedLeo`. Leo greeting creates a conversation with messages; if
 * we also clear `?c=`, reconcileUrlToState keeps calling startNewChat and floods
 * the sidebar up to MAX_CONVERSATIONS.
 *
 * Only explicit "New chat" UI should pass `{ seedLeo: true }`, and must then
 * navigate to `?c=<newId>` (not home).
 *
 * @param {{ seedLeo?: boolean }} [opts]
 */
export function startNewChat(opts = {}) {
  stopStreaming()
  const seedLeo = opts.seedLeo === true
  if (seedLeo && isLeoPersona(S.settings)) {
    const conversation = {
      id: crypto.randomUUID(),
      title: 'Leo',
      titled: true,
      persona: 'leo',
      model: S.settings.model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: leoFirstMessage(S.settings),
        },
      ],
    }
    C.conversations = [conversation, ...C.conversations].slice(
      0,
      MAX_CONVERSATIONS,
    )
    C.activeId = conversation.id
    rememberActive(conversation.id)
    persist()
    return
  }
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
  const backend = await resolveChatBackend()
  C.gatewayOk = backend.gatewayOk
  C.chatBackend = backend.kind
  return C.gatewayOk
}

/** Map stream/proxy errors to stable codes for UI copy. */
function normalizeChatError(err) {
  const raw = String(err?.message ?? err ?? '')
  if (
    raw === 'kimi_not_configured' ||
    raw === 'not_configured' ||
    raw.includes('kimi_not_configured')
  ) {
    return 'kimi_not_configured'
  }
  if (raw === 'kimi_vision_unsupported' || raw === 'vision_unsupported') {
    return 'kimi_vision_unsupported'
  }
  return raw
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
  let primed = false
  const hasRaf = typeof requestAnimationFrame !== 'undefined'

  const markThinking = () => {
    if (target.thinkingMs || !target.content) return
    const inThink =
      target.content.startsWith('<think>') &&
      !target.content.includes('</think>')
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
      // First token: paint immediately (TTFT), then rAF-smooth the rest.
      if (!primed && (pendingReason || pendingContent)) {
        primed = true
        drainAll()
        return
      }
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

/**
 * @param {Conversation} conversation
 * @param {{ cloudAuthorized?: boolean, writesBlocked?: boolean }} [extra]
 */
function leoPromptOpts(conversation, extra = {}) {
  const beat = formatLeoSceneBeatForPrompt(conversation?.leoSceneBeat)
  const lastUser = [...(conversation?.messages || [])]
    .reverse()
    .find((m) => m?.role === 'user')
  const userText =
    typeof lastUser?.content === 'string' ? lastUser.content.slice(0, 2000) : ''
  return {
    intensity: normalizeLeoIntensity(S.settings.leoIntensity),
    style: normalizeLeoStyle(S.settings.leoStyle),
    scenarioId: normalizeLeoScenarioId(S.settings.leoScenario),
    pace: normalizeLeoPace(S.settings.leoPace),
    safeword: normalizeLeoSafeword(S.settings.leoSafeword),
    notes: S.settings.leoNotes,
    // 只传真实场景节拍;summary 另有摘要通道,勿冒充 beat(会双写 + 误触 lore)
    sceneBeat: beat || undefined,
    userText,
    ...extra,
  }
}

/**
 * @param {boolean} leo
 * @param {string} [lastUserContent]
 * @param {{ title?: string, mode?: string, status?: string, assistantScope?: { allowedDomains?: string[] }, activeSpace?: string } | null} focus
 * @param {'cloud'|'local'} flavor
 * @returns {string | null}
 */
function leoAwareFocusBlock(leo, lastUserContent, focus, flavor) {
  if (
    !focus ||
    !['active', 'paused', 'temporarily_left', 'ending'].includes(focus.status)
  ) {
    return null
  }
  const domains =
    focus.assistantScope?.allowedDomains?.join('、') || focus.activeSpace
  if (leo) {
    const mode = resolveLeoFocusInjectionMode(lastUserContent)
    if (mode === 'skip') return null
    if (mode === 'soft') {
      return `有活跃 Focus「${focus.title}」(status=${focus.status})。沉浸陪伴时不要主动拉回;用户谈正事/Focus 时再提。默认域:${domains}。`
    }
  }
  if (flavor === 'cloud') {
    return `Focus Session「${focus.title}」(mode=${focus.mode}, status=${focus.status})。默认域:${domains}。跨域须标明暂时离开 Focus。`
  }
  return (
    `当前 Focus Session：「${focus.title}」(mode=${focus.mode}, status=${focus.status})。` +
    `默认只处理这些域：${domains}。禁止主动提起被隐藏域的待办/角标/审批数量。` +
    `若用户明确问跨域问题：可以回答，并清楚标明“暂时跨出当前 Focus”；仅当用户明确要求结束/切换时才调用 end_focus / start_focus。` +
    `不要把 raw FocusContext JSON 或凭证写进回复。主动建议必须可解释（为什么现在、信号、影响、是否写入、可否忽略）。`
  )
}

/**
 * @param {Conversation} conversation
 * @param {{ backend?: 'local'|'kimi' }} [opts]
 */
async function buildSystemPrompt(conversation, { backend = 'local' } = {}) {
  const kimi = backend === 'kimi'
  const now = new Date()
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区'
  const cloudAuthorized = isCloudAuthorized()
  const writesBlocked = areProductionWritesBlocked()
  const clock = `当前时间:${now.toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'short' })}(${timeZone};日期 ${now.toLocaleDateString('sv-SE')})。`
  const lastUserForPrompt = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'user')

  // Cloud Kimi: durable agent contract (labeled sections + recency rule at end).
  // Avoid stacking the long local handbook — instruction dilution / conflicts.
  if (kimi) {
    const leo = isLeoPersona(S.settings)
    const leoOpts = leoPromptOpts(conversation, {
      cloudAuthorized,
      writesBlocked,
    })
    const cloudBundle = buildKenosCloudSystemBundle({
      webAccess: S.settings.webAccess,
      cloudAuthorized,
      writesBlocked,
    })
    /** @type {string[]} */
    const cloudLines = [
      ...(leo ? applyLeoToCloudBundle(cloudBundle, leoOpts) : cloudBundle),
      clock,
      '用户消息里的【附件文件:xxx】块是已解析全文;直接依据回答,不要说无法读取附件。',
    ]
    {
      const lastUser = [...conversation.messages]
        .reverse()
        .find((m) => m.role === 'user')
      const steer = buildInjectionSteerBlock(
        detectPromptInjectionSignals(lastUser?.content ?? ''),
      )
      if (steer) cloudLines.splice(1, 0, steer)
    }
    const loc = S.settings.location?.trim()
    if (loc) {
      cloudLines.push(
        `用户当前所在地:${loc}。本地推荐以此为准(与当下所说冲突时以对话为准)。`,
      )
    }
    if (S.settings.memory) {
      cloudLines.push(
        '画像/记忆是历史,不自动代表现状;无日期的「近期/正在」先开放地问。',
      )
    }
    if (S.settings.memory) {
      cloudLines.push(
        '记忆工具:稳定新事实 → save_memory;问历史而上下文没有 → search_memory。一次调用即可。',
      )
    }
    try {
      const { healthReadinessAssistantBlock } =
        await import('$lib/kenos/healthReadiness.host.js')
      const block = healthReadinessAssistantBlock({ locale: 'zh' })
      if (block) {
        cloudLines.push(
          '已注入 Health 准备度摘要(无 HRV/睡眠小时/步数)。身体/训练问题以此为准;明细引导 Health Space。\n' +
            block,
        )
      }
    } catch {
      /* ignore */
    }
    const custom = S.settings.customPrompt?.trim()
    if (custom) cloudLines.push(`用户的自定义指令:\n${custom}`)
    try {
      const { FOCUS } = await import('./kenos/focusStore.svelte.js')
      const focusBlock = leoAwareFocusBlock(
        leo,
        lastUserForPrompt?.content ?? '',
        FOCUS.focus,
        'cloud',
      )
      if (focusBlock) cloudLines.push(focusBlock)
    } catch {
      /* optional */
    }
    try {
      const { ASSISTANT_CTX } =
        await import('./kenos/assistantContext.svelte.js')
      if (ASSISTANT_CTX.work) {
        const title = ASSISTANT_CTX.work.title?.trim()
        cloudLines.push(
          `Assistant 上下文:Work${title ? `「${title}」` : ''}。优先该主题;云端无 Work Log 全文时请用户补充或打开 Work Space。`,
        )
      }
    } catch {
      /* optional */
    }
    if (conversation.summary) {
      cloudLines.push(
        leo
          ? `本对话较早部分的摘要(续写 Leo 场景时优先遵守):\n${conversation.summary}`
          : `本对话较早部分的摘要:\n${conversation.summary}`,
      )
    }
    if (S.settings.memory) {
      const profile = S.settings.userProfile?.trim()
      if (profile) cloudLines.push(`用户画像(长期资料):\n${profile}`)
      const lastUser = [...conversation.messages]
        .reverse()
        .find((m) => m.role === 'user')
      if (lastUser?.content) {
        const query = lastUser.content.slice(0, 300)
        const key = `${MEM.items.length}:${query}`
        let memories
        if (recallCache.key === key) memories = recallCache.memories
        else {
          // Cap wait so embeddings cold-start never blocks first cloud token.
          memories = await recallRelevant(query, 4, 0.5, {
            timeoutMs: 900,
            skipBackfill: true,
          })
          if (leo) memories = mergeLeoBondMemories(MEM.items, memories)
          recallCache = { key, memories }
        }
        if (memories.length) {
          cloudLines.push(
            leo
              ? `相关长期记忆(含 Leo 关系;优先遵守):\n${memories.map((m) => `- ${m}`).join('\n')}`
              : `相关长期记忆:\n${memories.map((m) => `- ${m}`).join('\n')}`,
          )
        }
      }
    }
    cloudLines.push(buildKenosCloudRecencyRule())
    return cloudLines.join('\n\n')
  }

  // 本地路径:行为纪律置顶(短)+ 长手册后置,避免指令悬崖。
  const leo = isLeoPersona(S.settings)
  const leoOpts = leoPromptOpts(conversation)
  const lines = [
    ...(leo
      ? buildLeoLocalIdentityLines(leoOpts)
      : [
          '你是 AI.OS,运行在用户本机上的私人 AI 助手。推理、记忆和数据全部在这台设备本地完成。',
        ]),
    clock,
    [
      '回复优先级(冲突时按序,前面覆盖后面):',
      '1) 安全与合法:拒答有害/违法请求,可给防御向建议',
      '2) 用户当轮硬约束:只要/仅输出/不要开场白/先别写代码/字数上限/是或否——必须遵守,不要加解释段',
      '3) 诚实:无来源或用户未给数据时,不编造精确股价、百分比、Benchmark、「提升 X%」等数字;不确定就说明并给查证路径',
      '4) 完成用户目标',
      '5) 详细与文采(默认克制,用户要展开再展开)',
      '澄清预算:请求模糊时,同一轮最多问 3 个关键问题(可并列);或先给一个合理假设方案并写明假设,让用户改。不要长问卷。',
      '阻塞/焦虑/「不知道从哪开始」:先给今天可在约 2 小时内完成的一件具体事,再问是否要更长计划——不要先甩多周大纲或鸡汤。首轮不要附带 12 周/三个月表格。',
      '规划且用户说先别写代码:只给阶段、验收标准、风险;不要函数名、API、代码块、存储选型细节(如 SQLite/localStorage 选型讨论也可延后),除非用户下轮要。',
      '多约束改写(如「更短/更具体各改一版」「分别」):用表格或成对列表逐条对应,不要只交一维结果。',
    ].join('\n'),
    '你的知识有截止日期,不掌握此刻的近况。涉及“今天/最新/现在/近期/新闻/价格/版本/天气/赛况”等随时间变化的事,别凭记忆当作现状——能联网就先 browser_search 查证、注明信息时间,不能联网就如实说明这是截止前的旧信息。',
    '回答使用 Markdown。代码放在带语言标注的代码块里。保持直接、具体,不要空洞客套。',
    '当用户要网页、数据可视化、动画、小游戏,或明确要 SVG/矢量图时,输出单文件自包含的 ```html 或 ```svg 代码块(内联 CSS/JS,不引外部资源)——界面会自动在旁边的预览面板实时渲染它。',
    leo
      ? '硬性规则:用户要画面/点了出图/说画一张时,调用 generate_image(本机生图),严禁用 HTML/SVG/CSS 模拟图片。不要每条回复都自动生图。讨论已有附件图、要图表可视化、只要文字、或明确要 SVG 时不要生图。Leo 出图时遵守下方「Leo 陪伴生图」一致性(同脸同身材,优先 character="leo_kuft")。'
      : '硬性规则:仅当用户想要一张全新的位图图像(画图/画画/生成图片/照片/插画/海报/头像/壁纸)时,才调用 generate_image 工具(本地 AI 生图),严禁用 HTML/SVG/CSS 代码模拟图片。以下情况不要生图:①用户在讨论、分析或询问某张已有图片(含刚发的附件图);②要的是图表/流程图/示意图/数据可视化(改用 ```html 或 ```svg 代码块,会自动预览);③只需要文字(文案、描述、创意、清单);④用户明确要 SVG/矢量图/用代码画。拿不准要不要真出图时,先用一句话问清("要我直接生成一张吗?"),不要贸然生成——生图较慢,误触发很打扰。',
    '用户消息里的【附件文件:xxx】块就是该文件的完整内容(PDF/Word/Excel/PPT/音频转写等已在本地解析为文本)。直接依据它回答,不要说"无法读取附件"。',
  ]
  {
    const lastUser = [...conversation.messages]
      .reverse()
      .find((m) => m.role === 'user')
    const steer = buildInjectionSteerBlock(
      detectPromptInjectionSignals(lastUser?.content ?? ''),
    )
    if (steer) {
      const behaviorIdx = lines.findIndex(
        (l) => typeof l === 'string' && l.startsWith('回复优先级'),
      )
      lines.splice(behaviorIdx >= 0 ? behaviorIdx + 1 : lines.length, 0, steer)
    }
  }
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
    // Intent-gated handbooks: long Obsidian/browser/image manuals inflate 35B
    // prefill on every phone Ask turn — only inject when the turn needs them.
    const lastUserForTools = [...conversation.messages]
      .reverse()
      .find((m) => m.role === 'user')
    const assistNeeds = detectLocalAssistNeeds(lastUserForTools?.content ?? '', {
      priorToolNames: priorToolNamesFromConversation(conversation),
      companionMode: leo,
    })
    lines.push(
      ...buildLocalToolHandbookLines(assistNeeds, {
        toolsEnabled: true,
        memoryEnabled: S.settings.memory,
        cloudAuthorized,
        writesBlocked,
        isNative,
        webAccess: S.settings.webAccess,
      }),
    )
    if (leo && assistNeeds.image) {
      lines.push(
        buildLeoImageGenGuidance({
          sceneBeat: leoOpts.sceneBeat,
        }),
      )
    }
    // Health readiness may be present on-device without cloud login (HealthKit inject).
    try {
      const { healthReadinessAssistantBlock } =
        await import('$lib/kenos/healthReadiness.host.js')
      const block = healthReadinessAssistantBlock({ locale: 'zh' })
      if (block) {
        lines.push(
          '当前设备已提供 Health 准备度摘要(无 HRV/睡眠小时/步数等明细)。回答身体/训练/精力相关问题时以此为准;不要编造生理数字;用户要明细时引导打开 Health Space。\n' +
            block,
        )
      }
    } catch {
      /* ignore */
    }
  }
  const custom = S.settings.customPrompt?.trim()
  if (custom) lines.push(`用户的自定义指令:\n${custom}`)

  try {
    const { FOCUS } = await import('./kenos/focusStore.svelte.js')
    const focusBlock = leoAwareFocusBlock(
      leo,
      lastUserForPrompt?.content ?? '',
      FOCUS.focus,
      'local',
    )
    if (focusBlock) lines.push(focusBlock)
  } catch {
    /* Focus store optional during early boot */
  }

  try {
    const { ASSISTANT_CTX } = await import('./kenos/assistantContext.svelte.js')
    if (ASSISTANT_CTX.work) {
      const title = ASSISTANT_CTX.work.title?.trim()
      lines.push(
        `当前 Assistant 上下文:Work${title ? `「${title}」` : ''}。` +
          `优先围绕该工作主题作答;需要跨域生活数据时仍可用 Life OS 工具,但要标明暂时离开 Work 语境。`,
      )
    }
  } catch {
    /* assistant context optional */
  }

  // 长对话压缩:更早的消息已由小模型摘要,注入摘要保住"长期剧情"
  if (conversation.summary) {
    lines.push(
      leo
        ? `本对话较早部分的摘要(续写 Leo 场景时优先遵守):\n${conversation.summary}`
        : `本对话较早部分的摘要(原文已省略):\n${conversation.summary}`,
    )
  }

  if (S.settings.memory) {
    // 画像 = 常驻核心记忆:最稳定的身份/偏好,不走检索,保证不漏
    const profile = S.settings.userProfile?.trim()
    if (profile) {
      lines.push(`用户画像(长期资料):\n${profile}`)
    }
    // 情景记忆 = 语义召回:只注入与本轮相关的,控制小模型的上下文负担
    const lastUser = [...conversation.messages]
      .reverse()
      .find((m) => m.role === 'user')
    if (lastUser?.content) {
      const query = lastUser.content.slice(0, 300)
      const key = `${MEM.items.length}:${query}`
      let memories
      if (recallCache.key === key) {
        memories = recallCache.memories
      } else {
        // Phone→Mac: never let embeddings swap wedge llm-fast before first token.
        memories = await recallRelevant(query, 4, 0.5, {
          timeoutMs: 900,
          skipBackfill: true,
        })
        if (leo) memories = mergeLeoBondMemories(MEM.items, memories)
        recallCache = { key, memories }
      }
      if (memories.length) {
        lines.push(
          leo
            ? `相关长期记忆(含 Leo 关系;优先遵守;与当下冲突时以对话为准):\n${memories.map((m) => `- ${m}`).join('\n')}`
            : `与本轮相关的长期记忆(按相关度;记忆可能过时,与用户当前所说冲突时以对话为准):\n${memories.map((m) => `- ${m}`).join('\n')}`,
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
    return S.settings.model === 'llm-quality'
      ? VISION_MODELS.quality
      : VISION_MODELS.fast
  }
  const lastUser = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'user')
  // 刁钻多约束轮次:静默升 llm-quality(prompt 是最弱层;升模补指令遵循)
  if (
    conversation.model === 'llm-fast' &&
    lastUser?.content &&
    shouldPreferQualityModel(lastUser.content)
  ) {
    return 'llm-quality'
  }
  return conversation.model
}

/**
 * 输出侧一刀重写:先别写代码泄漏 / 无依据百分比等硬约束被违反时,
 * 用同一模型(无工具)重写正文。最多一次,失败则保留原稿。
 */
async function maybeRewriteGuardedReply(
  conversation,
  { model, signal, temperature, backend },
) {
  const lastUser = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'user')
  const lastAsst = conversation.messages.at(-1)
  if (!lastUser?.content || lastAsst?.role !== 'assistant' || !lastAsst.content)
    return
  if (lastAsst.toolCalls?.length) return
  if (signal?.aborted) return

  const violations = detectReplyGuardViolations(
    lastUser.content,
    lastAsst.content,
  )
  if (!violations.length) return

  const draft = lastAsst.content
  let working = draft
  const startedAt = Date.now()
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const roundViolations = detectReplyGuardViolations(
        lastUser.content,
        working,
      )
      if (!roundViolations.length) break
      const rewritePrompt = buildReplyGuardRewritePrompt(
        roundViolations,
        lastUser.content,
        working,
      )
      // Stream into a temp buffer — never blank the visible reply during rewrite.
      const temp = { content: '', reasoning: '' }
      const reveal = createStreamReveal(temp, startedAt)
      const res = await streamChat({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是严格的修订器。只输出修订后的完整正文,遵守用户硬约束。',
          },
          { role: 'user', content: rewritePrompt },
        ],
        signal,
        temperature: Math.min(temperature ?? 0.4, 0.5),
        maxTokens: 4096,
        tools: undefined,
        thinking: false,
        backend,
        onDelta: (chunk) => reveal.push(chunk),
      }).finally(() => reveal.finish())
      if (!temp.content?.trim()) break
      working = temp.content
      lastAsst.content = working
      lastAsst.finishReason = res.finishReason
    }
    if (!working?.trim()) lastAsst.content = draft
    else lastAsst.content = finalizeGuardedReply(lastUser.content, working)
    lastAsst.durationMs = (lastAsst.durationMs ?? 0) + (Date.now() - startedAt)
  } catch (err) {
    // Always restore the pre-rewrite draft (esp. user Stop mid-rewrite).
    lastAsst.content = draft
    if (err?.name === 'AbortError') throw err
  }
}

/* —— 发送 / 重生成 —— */

/**
 * 贴一张现成 Leo 静帧（零等待，不经 generate_image）。
 * 与 Composer「出图」分流：瞬间 = 角色库已有照；出图 = 本机新生成。
 * @param {{
 *   stillId?: unknown,
 *   text?: unknown,
 *   scenarioId?: unknown,
 * } | null | undefined} [opts]
 */
export function shareLeoStill(opts = {}) {
  if (C.streaming) return
  if (!isLeoPersona(S.settings)) return

  cancelLeoListen()
  stopActiveSpeech({ silent: true })

  const byId =
    typeof opts?.stillId === 'string' ? getLeoStill(opts.stillId) : null
  const picked =
    byId ||
    resolveLeoStill({
      scenarioId: opts?.scenarioId ?? S.settings.leoScenario,
      text: opts?.text,
    })

  const en = S.settings.locale === 'en'
  const caption = leoStillCaption(picked, { locale: en ? 'en' : 'zh' })

  let conversation = activeConversation()
  if (!conversation) {
    conversation = {
      id: crypto.randomUUID(),
      title: (en ? picked.labelEn : picked.labelZh).slice(0, 24),
      titled: true,
      model: S.settings.model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    }
    C.conversations = [conversation, ...C.conversations]
    C.activeId = conversation.id
    rememberActive(conversation.id)
  }

  conversation.messages.push({
    id: crypto.randomUUID(),
    role: 'assistant',
    content: caption,
    images: [picked.src],
    leoStillId: picked.id,
    leoLocal: true,
  })
  touch(conversation)
  persist()
}

/** 发送一条用户消息并流式接收回复 */
export async function sendMessage(text, images = [], files = []) {
  const trimmed = text.trim()
  if ((!trimmed && !images.length && !files.length) || C.streaming) return

  // 新一轮开口:取消续听,静默打断上一句朗读(不触发 onEnd 续听)
  cancelLeoListen()
  stopActiveSpeech({ silent: true })

  let conversation = activeConversation()
  if (!conversation) {
    const leo = isLeoPersona(S.settings)
    conversation = {
      id: crypto.randomUUID(),
      title: (trimmed || files[0]?.name || '图片对话').slice(0, 24),
      titled: false,
      persona: leo ? 'leo' : 'korben',
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
    id: crypto.randomUUID(),
    role: 'user',
    content: trimmed,
    images: images.length ? images : undefined,
    files: files.length ? files : undefined,
  })
  touch(conversation)
  persist()

  // Leo 安全词:客户端硬停 + 本地 aftercare(不依赖模型)
  if (
    isLeoPersona(S.settings) &&
    trimmed &&
    !images.length &&
    !files.length &&
    matchesLeoSafeword(trimmed, S.settings)
  ) {
    conversation.messages.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: leoLocalAftercareReply(S.settings),
      /** 本地 aftercare:无流式,仍应自动朗读并对讲续听 */
      leoLocal: true,
    })
    touch(conversation)
    persist()
    triggerLeoPetSoft()
    bumpLeoPetActivity()
    return
  }

  bumpLeoPetActivity()
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
  const tailHasContent = tail.some(
    (m) => m.role === 'assistant' && m.content && !m.error,
  )
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
  user.branches[user.branch ?? 0] = snapshotTail(
    conversation.messages.slice(userIndex + 1),
  )
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

  const backend = await resolveChatBackend()
  C.gatewayOk = backend.gatewayOk
  C.chatBackend = backend.kind

  let systemPrompt
  try {
    systemPrompt = await buildSystemPrompt(conversation, {
      backend: backend.kind,
    })
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
      backend,
      thinking: false,
      onDelta: (chunk) => {
        if (chunk.content) reveal.push({ content: chunk.content }) // 续写只接正文
      },
    }).finally(() => reveal.finish())
    last.finishReason = res.finishReason
    last.durationMs = (last.durationMs ?? 0) + (Date.now() - startedAt)
    if (isLeoPersona(S.settings) && last.content) {
      const cleaned = stripLeoRoleSplitReply(last.content)
      if (cleaned && cleaned !== last.content) last.content = cleaned
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      last.error = normalizeChatError(err)
      await refreshGateway()
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

  const backend = await resolveChatBackend()
  C.gatewayOk = backend.gatewayOk
  C.chatBackend = backend.kind

  const useVision = conversationHasImages(conversation)
  const lastUserText =
    [...conversation.messages].reverse().find((m) => m.role === 'user')
      ?.content ?? ''
  const model = resolveModel(conversation)
  const useTools = S.settings.tools
  const assistNeeds = detectLocalAssistNeeds(lastUserText, {
    priorToolNames: priorToolNamesFromConversation(conversation),
  })
  const rawTools = useTools
    ? toolDefinitionsForBackend(backend.kind, {
        webAccess: S.settings.webAccess,
      })
    : undefined
  const visionTools = filterToolsForVision(rawTools, useVision)
  const allowedToolNames =
    backend.kind === 'local' && visionTools
      ? toolNamesForNeeds(assistNeeds, {
          webAccess: S.settings.webAccess,
          includeNativeNames: isNative
            ? NATIVE_DEFS.map((t) => t.key)
            : [],
        })
      : null
  const tools = allowedToolNames
    ? filterToolsByNeeds(visionTools, allowedToolNames)
    : visionTools

  // 先挂占位消息再组装 prompt:记忆召回(嵌入模型冷启动)可能耗时几十秒,
  // 这段时间界面必须有等待反馈,不能空白
  const firstAssistant = $state({
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    reasoning: '',
  })
  conversation.messages.push(firstAssistant)

  if (backend.kind === 'kimi' && useVision) {
    firstAssistant.error = 'kimi_vision_unsupported'
    C.streaming = false
    controller = null
    touch(conversation)
    persist()
    return
  }

  let systemPrompt
  try {
    systemPrompt = await buildSystemPrompt(conversation, {
      backend: backend.kind,
    })
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
        const next = $state({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          reasoning: '',
        })
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
          backend,
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
      if (
        (res.finishReason === 'loop' || isStubbedStop) &&
        !signal.aborted &&
        !res.toolCalls.length
      ) {
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
      const pending = assistant.toolCalls.filter(
        (tc) => tc.result === undefined,
      )
      const runOne = async (tc) => {
        if (signal.aborted) {
          settleAbortedToolCalls([tc])
          return
        }
        let raw = await executeTool(tc.name, tc.arguments, { callId: tc.id })
        let result = normalizeToolResult(tc.name, raw)
        // 幂等只读工具：瞬时失败自动再试一次（写工具绝不重试）
        if (!signal.aborted && shouldAutoRetryTool(tc.name, result, 0)) {
          raw = await executeTool(tc.name, tc.arguments, { callId: tc.id })
          result = normalizeToolResult(tc.name, raw)
        }
        if (signal.aborted) {
          settleAbortedToolCalls([tc])
          // Drop orphan images from this call — do not attach to a stopped turn.
          consumePendingImages(tc.id)
          return
        }
        tc.result = result
        // 生图类工具的产出图片挂到调用记录上,由 Message 直接渲染(不进模型上下文)
        const images = consumePendingImages(tc.id)
        if (images.length) tc.images = images
        tc.running = false
      }
      const concurrent = pending.filter((tc) =>
        PARALLEL_SAFE_TOOLS.has(tc.name),
      )
      if (concurrent.length && !signal.aborted)
        await Promise.all(concurrent.map(runOne))
      for (const tc of pending) {
        if (PARALLEL_SAFE_TOOLS.has(tc.name)) continue
        if (signal.aborted) {
          settleAbortedToolCalls(pending.filter((t) => t.result === undefined))
          break
        }
        await runOne(tc)
      }
      persist()
      if (signal.aborted) {
        settleAbortedToolCalls(assistant.toolCalls)
        break
      }
    }

    // 轮次耗尽仍停在工具调用、没产出正文(模型一路检索没收尾,常见于笔记 RAG 打满 10 轮):
    // 撤掉工具强制再作答一次,基于已积累的工具结果综合出答案,避免"检索一大堆却零回答"。
    const stuck = conversation.messages.at(-1)
    if (
      !signal.aborted &&
      stuck?.role === 'assistant' &&
      !stuck.content &&
      stuck.toolCalls?.length
    ) {
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
        backend,
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

    // 硬约束输出守卫(先别写代码 / 无依据百分比):一刀重写
    if (!signal.aborted) {
      await maybeRewriteGuardedReply(conversation, {
        model,
        signal,
        temperature: sampleTemp,
        backend,
      })
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      const last = conversation.messages.at(-1)
      if (last?.role === 'assistant') last.error = normalizeChatError(err)
      await refreshGateway()
    }
  } finally {
    if (signal.aborted) {
      for (const m of conversation.messages) {
        if (m?.role === 'assistant' && m.toolCalls?.length) {
          settleAbortedToolCalls(m.toolCalls)
        }
      }
    }
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
        // 用户主动中断:静默清掉空壳（有正文的 draft 绝不应走到这里）
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
      if (isLeoPersona(S.settings)) {
        const cleaned = stripLeoRoleSplitReply(last.content)
        if (cleaned && cleaned !== last.content) last.content = cleaned
      }
      C.freshAssistant = {
        id: conversation.id,
        index: conversation.messages.length - 1,
      }
    }
    touch(conversation)
    persist()
  }

  // 回复落定后的小模型辅助:串行 + idle,且用户开新一轮时让路(不抢 35B / chat 槽)
  enqueuePostTurn(async () => {
    await maybeTitle(conversation)
    if (C.streaming) return
    await maybeSuggest(conversation)
    if (C.streaming) return
    await maybeCompact(conversation)
    if (C.streaming) return
    maybeExtractMemories(conversation)
    if (C.streaming) return
    await maybeExtractLeoSceneBeat(conversation)
  })
}

/** @type {Promise<void>} */
let postTurnChain = Promise.resolve()

/** @param {() => Promise<void> | void} task */
function enqueuePostTurn(task) {
  postTurnChain = postTurnChain
    .then(async () => {
      while (C.streaming) {
        await new Promise((r) => setTimeout(r, 180))
      }
      await new Promise((resolve) => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => resolve(undefined), { timeout: 1800 })
        } else {
          setTimeout(resolve, 80)
        }
      })
      if (C.streaming) return
      await task()
    })
    .catch(() => {})
}

/** 回复完成后被动萃取用户稳定事实(补模型忘了 save_memory 的情况) */
function maybeExtractMemories(conversation) {
  const lastUser = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'user')
  const lastAssistant = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content && !m.error)
  if (!lastUser?.content) return
  const answer = (lastAssistant?.content ?? '')
    .replace(/^<think>[\s\S]*?<\/think>/, '')
    .trim()
  autoExtractMemories(lastUser.content, answer)
  if (isLeoPersona(S.settings)) {
    autoExtractLeoBond(lastUser.content, answer)
  }
}

const LEO_SCENE_BEAT_EVERY = 4

/**
 * 每 N 轮用户消息滚动抽取场景节拍(地点/衣着/接触/aftercare)。
 * 失败静默保留旧值。
 * @param {Conversation} conversation
 */
async function maybeExtractLeoSceneBeat(conversation) {
  if (!isLeoPersona(S.settings) || C.streaming) return
  const userTurns = conversation.messages.filter((m) => m.role === 'user').length
  if (userTurns < LEO_SCENE_BEAT_EVERY) return
  if (userTurns % LEO_SCENE_BEAT_EVERY !== 0) return
  if (conversation.leoSceneBeatAt === userTurns) return

  const recent = conversation.messages.slice(-16)
  const transcript = recent
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        m.content &&
        !m.error,
    )
    .map((m) => {
      const role = m.role === 'user' ? 'Ken' : 'Leo'
      const body = String(m.content)
        .replace(/^<think>[\s\S]*?<\/think>/, '')
        .trim()
        .slice(0, 500)
      return `${role}: ${body}`
    })
    .join('\n')
  if (transcript.length < 40) return

  const raw = await tinyComplete(buildLeoSceneBeatExtractPrompt(transcript), {
    maxTokens: 160,
    temperature: 0.2,
    allowFastFallback: false,
  })
  if (!raw || C.streaming) return
  const beat = parseLeoSceneBeatResponse(raw)
  if (!beat) return
  conversation.leoSceneBeat = beat
  conversation.leoSceneBeatAt = userTurns
  persist()
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
  const title = await generateTitle(
    user.content,
    assistant.content,
    S.settings.locale,
  )
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
  const lastUser = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'user')
  if (!lastUser?.content) return
  const answer = last.content.replace(/^<think>[\s\S]*?<\/think>/, '').trim()
  if (!answer) return

  const leo = isLeoPersona(S.settings)
  const en = leo
    ? leoComposerPreferEnglish(S.settings, answer)
    : S.settings.locale === 'en'
  let instruction
  if (leo) {
    instruction = en
      ? 'Help USER (Ken) reply to Leo. Suggest 3 short messages Ken would send TO Leo next. Write in English as Ken addressing Leo (you/Leo). Never speak as Leo. Never refer to Ken/Ken儿 in third person. May include slow down / keep going / stop / hold me. One per line, max 12 words. Output only the 3 lines.'
      : '你在帮用户 Ken 给 Leo 写下一句可发送的话。给出 3 条「Ken→Leo」的短消息(用户视角)。用对 Leo 说话的口吻(你/Leo)。禁止写成 Leo 在说话;禁止用第三人称称呼 Ken/肯儿。可含「慢一点/继续/停/先抱一下」。每行一条,不超过 16 字。只输出 3 行,不要编号。'
  } else {
    instruction = en
      ? 'Based on this exchange, suggest 3 natural follow-up questions the user might send next. One per line, max 8 words each. Output only the 3 lines, no numbering.'
      : '基于这轮对话,替用户想 3 个自然的追问(用户视角、可直接发送),每行一个,每个不超过 16 个字。只输出 3 行问题本身,不要编号和其他内容。'
  }
  const transcript = leo
    ? `Ken(用户): ${lastUser.content.slice(0, 400)}\nLeo: ${answer.slice(0, 800)}`
    : `用户: ${lastUser.content.slice(0, 400)}\n助手: ${answer.slice(0, 800)}`
  const raw = await tinyComplete(`${instruction}\n\n${transcript}`, {
    maxTokens: 96,
    temperature: 0.7,
    allowFastFallback: false,
  })
  if (!raw) return
  let suggestions = raw
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').trim())
    .filter((l) => l.length >= 2 && l.length <= 40)
  if (leo) {
    suggestions = suggestions.filter((l) => !looksLikeLeoSpeakingSuggestion(l))
    if (!suggestions.length) {
      suggestions = leoFallbackSuggestions(en, {
        intensity: normalizeLeoIntensity(S.settings.leoIntensity),
        scenarioId: normalizeLeoScenarioId(S.settings.leoScenario),
      })
    }
  }
  suggestions = suggestions.slice(0, 3)
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

  const leo = isLeoPersona(S.settings)
  const chunk = messages
    .slice(start, cut)
    .map((m) => {
      const who = leo
        ? m.role === 'user'
          ? 'Ken'
          : 'Leo'
        : m.role === 'user'
          ? '用户'
          : '助手'
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
    const compactPrompt = leo
      ? buildLeoCompactPrompt(conversation.summary, chunk.slice(0, 8000))
      : `把以下对话内容压缩成不超过 400 字的要点摘要,保留:关键事实与数据、做出的决定、用户偏好、未解决的问题。只输出摘要本身。\n\n${conversation.summary ? `【已有摘要】\n${conversation.summary}\n\n` : ''}【新增对话】\n${chunk.slice(0, 8000)}`
    const merged = await tinyComplete(compactPrompt, {
      maxTokens: 800,
      temperature: 0.3,
      timeoutMs: 60000,
      allowFastFallback: false,
    })
    if (merged) {
      conversation.summary = merged.slice(0, 1200)
      conversation.summarizedUpTo = cut
      persist()
    }
  } finally {
    compacting = false
  }
}
