/**
 * Chat agent-loop 纯逻辑（STABLE.26）。
 * chat.svelte.js 负责流式 I/O；本文件锁定 wire 回放与生图误触发兜底。
 */

export const HISTORY_CHAR_BUDGET = 28000
export const MAX_TOOL_ROUNDS = 10

export const PARALLEL_SAFE_TOOLS = new Set([
  'get_time',
  'calculate',
  'run_javascript',
  'fetch_url',
  'web_search',
])

const CODE_BUILD_RE =
  /游戏|小游戏|网页|网站|页面|应用|程序|代码|脚本|表格|对比|图表|柱状图|条形图|饼图|折线图|曲线图|散点图|直方图|甘特图|流程图|思维导图|数据可视化|可视化|贪吃蛇|计算器|俄罗斯方块|井字棋|扫雷|2048|待办|todo|html|css|canvas/i
const IMAGE_INTENT_RE =
  /画一|画个|画张|画幅|生成图片|生成一[张幅]|来[张幅]|照片|摄影|插画|海报|头像|壁纸|图标|logo|封面|配图|立绘|原画|概念图|角色|人物|形象|肖像|表情|贴纸|图片/i

/** 构建/技术类需求且无明确图片意图 → 拦 generate_image */
export function isBuildCodeAsk(text) {
  return !!text && CODE_BUILD_RE.test(text) && !IMAGE_INTENT_RE.test(text)
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
  const startIdx = Math.min(conversation.summarizedUpTo ?? 0, conversation.messages.length)
  for (const m of conversation.messages.slice(startIdx)) {
    if (m.role === 'user') {
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

  const kept = []
  let budget = budgetLimit
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
  while (kept.length && kept[0].role === 'tool') kept.shift()
  const lastUser = [...wire].reverse().find((m) => m.role === 'user')
  if (lastUser && !kept.includes(lastUser)) kept.unshift(lastUser)
  return [{ role: 'system', content: systemPrompt }, ...kept]
}
