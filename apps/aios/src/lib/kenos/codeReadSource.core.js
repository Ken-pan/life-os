/**
 * Code Space read — 本机 Cursor app 对话监控(只读)。
 *
 * 纯投影层:不做 I/O。宿主(native.js)用 sqlite3 immutable 读出行,喂给这里投影。
 * 两个数据源:
 *   - conversation-search.db `conversations`  → 会话列表 + 标题 + 最近排序
 *   - state.vscdb `cursorDiskKV`
 *       composerData:<id>           → 会话头(有序 bubble 列表 + name/status/createdAt)
 *       bubbleId:<id>:<bubbleId>    → 单条消息(type 1=用户 / 2=助手,text 为内容)
 *
 * 隐私:Cursor 对话可能含密钥/隐私 —— 只在本机读、绝不上云。
 */

import { sourceState } from './readProjections.core.js'

export const CANONICAL_CODE_READ_SOURCE = 'local.cursor.state-vscdb'

/** 单条消息文本最大保留长度(防止 UI 与传输被超长 agent 输出撑爆)。 */
const MAX_MESSAGE_CHARS = 20000
/** 会话标题最大长度。 */
const MAX_TITLE_CHARS = 160

/** @param {unknown} v */
function str(v) {
  return typeof v === 'string' ? v : ''
}

/**
 * bubble type → 角色。1=用户,2=助手;其余归 'assistant'(工具/系统气泡少见,归入助手侧)。
 * @param {unknown} type
 * @returns {'user' | 'assistant'}
 */
export function bubbleRole(type) {
  return Number(type) === 1 ? 'user' : 'assistant'
}

/**
 * conversation-search.db 行(每行 {id,title,updated_at,is_archived,source})→ 会话摘要,最近在前。
 * @param {Array<Record<string, any>> | null | undefined} rows
 * @returns {Array<{ id: string, title: string, updatedAt: number, archived: boolean, source: string }>}
 */
export function projectCursorSessions(rows) {
  if (!Array.isArray(rows)) return []
  const out = []
  for (const row of rows) {
    const id = str(row?.id)
    if (!id) continue
    const rawTitle = str(row?.title).trim()
    out.push({
      id,
      title: (rawTitle || '未命名对话').slice(0, MAX_TITLE_CHARS),
      updatedAt: Number(row?.updated_at) || 0,
      archived: Boolean(row?.is_archived),
      source: str(row?.source) || 'local',
    })
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

/**
 * composerData JSON 里取有序的 bubbleId 列表(带角色),兼容新旧结构。
 * 新:fullConversationHeadersOnly = 有序 [{bubbleId,type,createdAt}]
 * 旧:conversationMap = { <bubbleId>: {...} }(无序,退化为 keys 顺序)
 * @param {Record<string, any> | null | undefined} composerJson
 * @returns {Array<{ bubbleId: string, role: 'user' | 'assistant', ts: number | null }>}
 */
export function extractBubbleHeaders(composerJson) {
  if (!composerJson || typeof composerJson !== 'object') return []
  const headers = composerJson.fullConversationHeadersOnly
  if (Array.isArray(headers) && headers.length) {
    const out = []
    for (const h of headers) {
      const bubbleId = str(h?.bubbleId)
      if (!bubbleId) continue
      out.push({
        bubbleId,
        role: bubbleRole(h?.type),
        ts: h?.createdAt ? Date.parse(h.createdAt) || null : null,
      })
    }
    return out
  }
  const map = composerJson.conversationMap
  if (map && typeof map === 'object') {
    return Object.keys(map).map((bubbleId) => ({
      bubbleId,
      role: bubbleRole(map[bubbleId]?.type),
      ts: null,
    }))
  }
  return []
}

/** @param {string} text */
function clampMessageText(text) {
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…（已截断）` : text
}

/**
 * 从 composer JSON 提取会话元信息(模型/思考程度/速度/模式/上下文用量/子任务/工作区)——
 * 只读展示,对标 Cursor 原生的信息密度。字段形态在版本间有差异,做防御式解析。
 * @param {Record<string, any> | null | undefined} composerJson
 * @returns {{
 *   model?: string, effort?: string, fast?: boolean, maxMode?: boolean,
 *   mode?: string, contextPct?: number, subagents?: number, workspace?: string,
 * } | null}
 */
export function extractComposerMeta(composerJson) {
  const c = composerJson && typeof composerJson === 'object' ? composerJson : null
  if (!c) return null
  const mc = c.modelConfig && typeof c.modelConfig === 'object' ? c.modelConfig : {}
  const sel = Array.isArray(mc.selectedModels) ? mc.selectedModels[0] : null
  const params = Array.isArray(sel?.parameters) ? sel.parameters : []
  const paramVal = (id) => params.find((p) => p?.id === id)?.value
  // model 名有时已内嵌 effort/fast(cursor-grok-4.5-high-fast),优先干净的 modelName/modelId。
  let model = str(mc.modelName) || str(sel?.modelId)
  if (model === 'default') model = ''
  const effortRaw = str(paramVal('effort'))
  const fastRaw = paramVal('fast')
  const ctx = Number(c.contextUsagePercent)
  const out = {}
  if (model) out.model = model
  if (effortRaw) out.effort = effortRaw
  if (fastRaw === true || fastRaw === 'true') out.fast = true
  if (mc.maxMode === true) out.maxMode = true
  const mode = str(c.unifiedMode)
  if (mode) out.mode = mode
  if (Number.isFinite(ctx) && ctx > 0) out.contextPct = Math.round(ctx)
  const subs = Array.isArray(c.subagentComposerIds) ? c.subagentComposerIds.length : 0
  if (subs > 0) out.subagents = subs
  const repo = str(c.trackedGitRepos?.[0]?.repoPath)
  if (repo) out.workspace = repo.split('/').filter(Boolean).pop()
  return Object.keys(out).length ? out : null
}

/**
 * 从 Cursor 的 toolFormerData 提取步骤摘要:工具名 + 一行人类可读的参数
 * (文件路径→尾两段;命令→首个非注释行;搜索→pattern)+ 失败标记。
 * 桥与本机直读共用此提取,单一真源;rawArgs 全文(可达数 KB)不外传。
 * @param {Record<string, any> | null | undefined} tfd
 * @returns {{ tool: string, arg?: string, failed?: boolean } | null}
 */
export function extractToolSummary(tfd) {
  if (!tfd || typeof tfd !== 'object') return null
  const tool = str(tfd.name) || str(tfd.tool)
  if (!tool) return null
  let args = {}
  try {
    args = JSON.parse(str(tfd.rawArgs) || '{}')
  } catch {
    /* 参数解析失败就只留工具名 */
  }
  // 信息量优先:命令/搜索词 > glob > 文件路径(ripgrep 同时带 pattern+path,pattern 更有用)。
  let arg = ''
  if (str(args.command)) {
    arg =
      str(args.command)
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#')) || ''
  } else if (str(args.pattern)) {
    arg = str(args.pattern)
  } else if (str(args.globPattern)) {
    arg = str(args.globPattern)
  } else if (str(args.path)) {
    // 文件路径显示尾两段(portal/+page.svelte)而不是整条绝对路径。
    arg = str(args.path).split('/').slice(-2).join('/')
  } else {
    arg = str(args.description) || str(args.query)
  }
  arg = arg.trim()
  if (arg.length > 80) arg = `${arg.slice(0, 80)}…`
  const failed = tfd.status && tfd.status !== 'completed' ? true : undefined
  return { tool, ...(arg ? { arg } : {}), ...(failed ? { failed } : {}) }
}

/**
 * 增量合并:composerData 头 + 「本轮实际拉取的 bubble」+ 上一轮投影 → 新消息流。
 * bubbleJsons 只需含新增/可能变化的气泡;没拉的沿用 prevThread 里的旧消息对象
 * (内容没变时保持对象引用不变,下游 markdown 缓存 / DOM diff 可按引用短路)。
 * 本轮拉了但无文本的气泡跳过(工具态/占位)。prevThread 传 null 即全量投影。
 * @param {{ messages?: Array<any>, id?: string } | null | undefined} prevThread
 * @param {Record<string, any> | null | undefined} composerJson
 * @param {Record<string, any> | null | undefined} bubbleJsons
 * @returns {{
 *   id: string,
 *   title: string,
 *   status: string,
 *   createdAt: number | null,
 *   messages: Array<{ bubbleId: string, role: 'user' | 'assistant', text: string, ts: number | null }>,
 * }}
 */
export function mergeThreadDelta(prevThread, composerJson, bubbleJsons) {
  const composer = composerJson && typeof composerJson === 'object' ? composerJson : {}
  const bubbles = bubbleJsons && typeof bubbleJsons === 'object' ? bubbleJsons : {}
  const prevById = new Map(
    Array.isArray(prevThread?.messages) ? prevThread.messages.map((m) => [m.bubbleId, m]) : [],
  )
  const headers = extractBubbleHeaders(composer)
  const messages = []
  // 库异常时 headers 可能重复 bubbleId —— 必须去重,否则 keyed each 重复 key 直接白屏。
  const emitted = new Set()
  for (const h of headers) {
    if (emitted.has(h.bubbleId)) continue
    emitted.add(h.bubbleId)
    if (Object.hasOwn(bubbles, h.bubbleId)) {
      const bubble = bubbles[h.bubbleId]
      const text = str(bubble?.text).trim()
      // 无文本气泡:工具调用步骤(agent 工作过程),投影成 tool 消息供 UI 聚合展示;
      // 桥的精简行已带 .tool/.arg/.failed,本机直读的原始 bubble 现场提取。
      const step = bubble?.tool
        ? { tool: str(bubble.tool), arg: str(bubble.arg) || undefined, failed: bubble.failed || undefined }
        : extractToolSummary(bubble?.toolFormerData)
      if (!text && !step) continue
      const next = text
        ? {
            bubbleId: h.bubbleId,
            // bubble 自带 type 更权威;头缺失时用头的角色兜底。
            role: bubble?.type != null ? bubbleRole(bubble.type) : h.role,
            text: clampMessageText(text),
            ts: h.ts,
          }
        : { bubbleId: h.bubbleId, role: 'assistant', ...step, text: '', ts: h.ts }
      const prev = prevById.get(h.bubbleId)
      messages.push(
        prev &&
          prev.text === next.text &&
          prev.role === next.role &&
          prev.tool === next.tool &&
          prev.arg === next.arg
          ? prev
          : next,
      )
    } else {
      const prev = prevById.get(h.bubbleId)
      if (prev) messages.push(prev)
    }
  }
  // meta 优先用本轮 composer 提取;远程精简 composer 已带 meta 时直接用。
  const meta = composer.meta || extractComposerMeta(composer) || undefined
  return {
    id: str(composer.composerId) || str(composer.id) || str(prevThread?.id),
    title: (str(composer.name).trim() || '未命名对话').slice(0, MAX_TITLE_CHARS),
    status: str(composer.status) || 'unknown',
    createdAt: Number(composer.createdAt) || null,
    ...(meta ? { meta } : {}),
    messages,
  }
}

/**
 * composerData + 各 bubble JSON → 完整消息流投影(= 无历史的增量合并)。
 * @param {Record<string, any> | null | undefined} composerJson
 * @param {Record<string, any> | null | undefined} bubbleJsons
 */
export function projectCursorThread(composerJson, bubbleJsons) {
  return mergeThreadDelta(null, composerJson, bubbleJsons)
}

/**
 * 给模型工具用的消息截尾:保最近 maxMessages 条,总字符再超 maxChars 就继续从头丢。
 * 监控场景最新内容最重要,所以永远保尾;单条仍超限时截头保尾。
 * @param {Array<{ text: string }>} messages
 * @param {{ maxMessages?: number, maxChars?: number }} [opts]
 * @returns {{ messages: Array<any>, dropped: number }}
 */
export function clampThreadMessages(messages, { maxMessages = 20, maxChars = 12000 } = {}) {
  if (!Array.isArray(messages) || !messages.length) return { messages: [], dropped: 0 }
  // 模型工具只喂文本消息;工具步骤(无 text)是 UI 层的过程展示,不进上下文。
  messages = messages.filter((m) => m?.text)
  if (!messages.length) return { messages: [], dropped: 0 }
  let kept = messages.slice(-maxMessages)
  let total = kept.reduce((n, m) => n + (m?.text?.length || 0), 0)
  while (kept.length > 1 && total > maxChars) {
    total -= kept[0]?.text?.length || 0
    kept = kept.slice(1)
  }
  if (kept.length === 1 && (kept[0]?.text?.length || 0) > maxChars) {
    kept = [{ ...kept[0], text: `…（前文截断）${kept[0].text.slice(-maxChars)}` }]
  }
  return { messages: kept, dropped: messages.length - kept.length }
}

/**
 * 把宿主读取结果包成统一 {items,state}(与其他读源同形)。
 * @param {{
 *   native?: boolean,
 *   sessions?: Array<Record<string, any>> | null,
 *   error?: string | null,
 * }} opts
 */
export function projectCodeSessionsResult({ native = false, sessions = null, error = null } = {}) {
  if (!native) {
    return {
      items: [],
      state: sourceState('unsupported', {
        source: CANONICAL_CODE_READ_SOURCE,
        message: '此功能仅在 Mac app 内可用(需读取本机 Cursor 数据)。',
      }),
    }
  }
  if (error) {
    return {
      items: [],
      state: sourceState('unavailable', {
        source: CANONICAL_CODE_READ_SOURCE,
        message: `读取 Cursor 数据失败:${error}`,
        retryable: true,
      }),
    }
  }
  const items = projectCursorSessions(sessions)
  return {
    items,
    state: sourceState(items.length ? 'ready' : 'empty', {
      source: CANONICAL_CODE_READ_SOURCE,
      availableCount: items.length,
      lastUpdated: items[0]?.updatedAt || undefined,
    }),
  }
}
