/**
 * Chat agent-loop 纯逻辑（STABLE.26）。
 * chat.svelte.js 负责流式 I/O；本文件锁定 wire 回放与生图误触发兜底。
 *
 * 另含工具结果规范化：空结果 / 失败须结构化回传模型（OpenAI/Anthropic 生产实践），
 * 避免「无命中却编造」或把例外冒成空字符串。
 */

export const HISTORY_CHAR_BUDGET = 28000
export const MAX_TOOL_ROUNDS = 10

export const PARALLEL_SAFE_TOOLS = new Set([
  'get_time',
  'calculate',
  'run_javascript',
  'fetch_url',
  'web_search',
  // Independent Life OS reads — safe to fan out in one cloud round
  'life_os_today',
  'finance_summary',
  'planner_tasks',
  'search_memory',
  'focus_status',
])

/** 只读/幂等：瞬时失败可自动重试一次（写工具绝不自动重试）。 */
export const IDEMPOTENT_RETRY_TOOLS = new Set([
  'get_time',
  'calculate',
  'fetch_url',
  'web_search',
  'search_memory',
  'search_notes',
  'ask_notes',
  'read_note',
  'life_os_today',
  'finance_summary',
  'planner_tasks',
  'focus_status',
  'browser_status',
  'browser_search',
  'list_characters',
  'list_styles',
])

const CODE_BUILD_RE =
  /游戏|小游戏|网页|网站|页面|应用|程序|代码|脚本|表格|对比|图表|柱状图|条形图|饼图|折线图|曲线图|散点图|直方图|甘特图|流程图|思维导图|数据可视化|可视化|贪吃蛇|计算器|俄罗斯方块|井字棋|扫雷|2048|待办|todo|html|css|canvas/i
// Image intent only — avoid bare「角色/人物」matching code/RP asks.
const IMAGE_INTENT_RE =
  /画一|画个|画张|画幅|生成图片|生成一[张幅]|来[张幅]|照片|摄影|插画|海报|头像|壁纸|图标|logo|封面|配图|立绘|原画|概念图|角色图|人物图|形象照|肖像|表情包|贴纸|图片/i

const EMPTY_RESULT_RE =
  /^(?:\(无结果\)|\(无输出\)|没有找到相关记忆。|笔记库中没有找到相关内容。|没有找到相关内容。|无结果)?\s*$/i
const TRANSIENT_FAIL_RE =
  /超时|timeout|ECONNREFUSED|ENOTFOUND|network|fetch failed|502|503|504|ECONNRESET|temporarily|重试一次|扩展未连接|bridge/i
const POLICY_BLOCK_RE =
  /写入已关闭|WRITE_BLOCKED|fail-closed|Read Client Canary|写入未开放|生产写入/i

/** 构建/技术类需求且无明确图片意图 → 拦 generate_image */
export function isBuildCodeAsk(text) {
  return !!text && CODE_BUILD_RE.test(text) && !IMAGE_INTENT_RE.test(text)
}

/**
 * @param {unknown} raw
 * @returns {'ok'|'empty'|'error'|'policy'|'transient'}
 */
export function classifyToolRawResult(raw) {
  if (raw == null) return 'empty'
  if (typeof raw === 'object') {
    const msg = String(raw.message ?? raw.error ?? JSON.stringify(raw))
    if (POLICY_BLOCK_RE.test(msg) || raw.code === 'KENOS_WRITE_BLOCKED')
      return 'policy'
    return 'error'
  }
  const text = String(raw).trim()
  if (!text || EMPTY_RESULT_RE.test(text)) return 'empty'
  if (POLICY_BLOCK_RE.test(text)) return 'policy'
  if (/^错误[:：]/.test(text) || /^原生工具执行失败/.test(text)) {
    return TRANSIENT_FAIL_RE.test(text) ? 'transient' : 'error'
  }
  if (
    TRANSIENT_FAIL_RE.test(text.slice(0, 120)) &&
    /失败|错误|不可用|无法/.test(text)
  ) {
    return 'transient'
  }
  return 'ok'
}

/**
 * 把工具原始返回整理成模型可推理的结构化文本。
 * 成功结果原样通过；空/失败/策略阻断加 error_type 与 next_hint。
 * @param {string} name
 * @param {unknown} raw
 */
export function normalizeToolResult(name, raw) {
  const tool = String(name || 'unknown')
  // 幂等：已结构化的结果不再包一层（历史回放 / 重试路径会再走一次）
  if (typeof raw === 'string' && raw.startsWith('[tool_result]')) return raw
  const kind = classifyToolRawResult(raw)
  if (kind === 'ok') return String(raw)

  if (kind === 'empty') {
    const hint = String(raw ?? '').trim()
    return [
      '[tool_result]',
      `tool: ${tool}`,
      'status: empty',
      'error_type: empty',
      `message: ${hint || '工具未返回可用内容'}`,
      'retry_suggested: false',
      'next_hint: 不要编造工具未提供的事实、链接或引用；可改参数重试、换只读工具，或如实告诉用户未找到。',
    ].join('\n')
  }

  const message =
    typeof raw === 'object' && raw
      ? String(raw.message ?? raw.error ?? JSON.stringify(raw))
      : String(raw)

  if (kind === 'policy') {
    return [
      '[tool_result]',
      `tool: ${tool}`,
      'status: blocked',
      'error_type: policy',
      `message: ${message}`,
      'retry_suggested: false',
      'next_hint: 不要假装写入已成功。用文字列出建议内容（标题/细节），说明当前为只读/演示模式，请用户在对应 App 手动添加或等待写入能力开放。',
    ].join('\n')
  }

  const transient = kind === 'transient'
  return [
    '[tool_result]',
    `tool: ${tool}`,
    'status: error',
    `error_type: ${transient ? 'transient' : 'permanent'}`,
    `message: ${message}`,
    `retry_suggested: ${transient ? 'true' : 'false'}`,
    transient
      ? 'next_hint: 可换参数或换工具再试一次；仍失败则向用户说明限制，不要编造结果。'
      : 'next_hint: 不要重复同一错误调用；向用户解释失败原因并给可行替代（澄清、换工具、手动操作）。',
  ].join('\n')
}

/**
 * 瞬时失败且工具幂等 → 允许应用层自动再执行一次。
 * @param {string} name
 * @param {unknown} rawOrNormalized
 * @param {number} [attempt] 已完成次数（0 = 尚未重试）
 */
export function shouldAutoRetryTool(name, rawOrNormalized, attempt = 0) {
  if (attempt > 0) return false
  if (!IDEMPOTENT_RETRY_TOOLS.has(String(name || ''))) return false
  const text =
    typeof rawOrNormalized === 'string'
      ? rawOrNormalized
      : String(rawOrNormalized ?? '')
  if (text.includes('error_type: transient')) return true
  return classifyToolRawResult(rawOrNormalized) === 'transient'
}

/**
 * Estimate wire message size for history budget (includes tool args + image URLs).
 * @param {object} msg
 */
export function wireMsgSize(msg) {
  let n = 50
  if (typeof msg?.content === 'string') n += msg.content.length
  else if (Array.isArray(msg?.content)) {
    for (const p of msg.content) {
      if (p?.type === 'text') n += p.text?.length ?? 0
      else if (p?.type === 'image_url') {
        // Cap dataURL contribution so one attachment cannot monopolize the budget math.
        n += Math.min(p.image_url?.url?.length ?? 0, 50_000)
      } else n += 200
    }
  }
  for (const tc of msg?.tool_calls ?? []) {
    n +=
      (tc.function?.name?.length ?? 0) + (tc.function?.arguments?.length ?? 0)
  }
  return n
}

/**
 * Mark unfinished tool calls as stopped so UI does not shimmer forever after abort.
 * @param {Array<{ running?: boolean, result?: string, name?: string }>} toolCalls
 */
export function settleAbortedToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return
  for (const tc of toolCalls) {
    if (!tc || (tc.result !== undefined && !tc.running)) continue
    tc.running = false
    if (tc.result === undefined) {
      tc.result = normalizeToolResult(
        tc.name,
        '错误:用户已停止生成。不要编造该工具的结果。',
      )
    }
  }
}

/**
 * 存储消息 → OpenAI wire（含 tool_calls 回放），带字符预算截断。
 * @param {{ messages: object[], summarizedUpTo?: number }} conversation
 * @param {string} systemPrompt
 * @param {{ charBudget?: number }} [opts]
 */
export function buildWireMessages(conversation, systemPrompt, opts = {}) {
  const budgetLimit = opts.charBudget ?? HISTORY_CHAR_BUDGET
  const wire = []
  const startIdx = Math.min(
    conversation.summarizedUpTo ?? 0,
    conversation.messages.length,
  )
  for (const m of conversation.messages.slice(startIdx)) {
    if (m.role === 'user') {
      const fileBlocks = (m.files ?? [])
        .map(
          (f) =>
            `【附件文件:${f.name}】\n\`\`\`\n${f.text.slice(0, 12000)}${f.text.length > 12000 ? '\n…(已截断)' : ''}\n\`\`\``,
        )
        .join('\n\n')
      const userText = fileBlocks
        ? `${fileBlocks}\n\n${m.content}`.trim()
        : m.content
      if (m.images?.length) {
        wire.push({
          role: 'user',
          content: [
            ...m.images.map((url) => ({
              type: 'image_url',
              image_url: { url },
            })),
            { type: 'text', text: userText || '描述这张图片。' },
          ],
        })
      } else {
        wire.push({ role: 'user', content: userText })
      }
      continue
    }
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
          content: normalizeToolResult(tc.name, tc.result ?? ''),
        })
      }
    } else {
      wire.push({ role: 'assistant', content: m.content })
    }
  }

  const kept = []
  let budget = budgetLimit
  for (let i = wire.length - 1; i >= 0; i--) {
    const msg = wire[i]
    const size = wireMsgSize(msg)
    budget -= size + 50
    if (budget < 0 && kept.length) break
    kept.unshift(msg)
  }
  while (kept.length && kept[0].role === 'tool') kept.shift()
  const lastUser = [...wire].reverse().find((m) => m.role === 'user')
  if (lastUser && !kept.includes(lastUser)) kept.unshift(lastUser)
  return [{ role: 'system', content: systemPrompt }, ...kept]
}
