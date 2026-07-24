/**
 * Leo 关系记忆 — 从对话抽取 Ken↔Leo 稳定偏好,写入长期记忆。
 * 纯提示词 helpers 在此;实际写入由 memory.svelte.js 调用。
 */

/**
 * @param {string} userText
 * @param {string} [assistantText]
 */
export function buildLeoBondExtractPrompt(userText, assistantText = '') {
  const u = String(userText || '').trim().slice(0, 1500)
  const a = String(assistantText || '').trim().slice(0, 800)
  return (
    '从下面 Ken 与 Leo 的对话里,抽取值得长期记住的**关系事实**' +
    '(Ken 的偏好/雷点/称呼、臣服或主导倾向、明确说过的喜欢或不喜欢的玩法)。' +
    '只抽跨对话仍成立的稳定事实;临时骚话、一次性场景、Leo 的台词本身不要。' +
    '没有值得记的就返回 []。每条一句、以「Ken」开头、不超过 60 字。' +
    '输出 JSON 字符串数组,最多 2 条,只输出 JSON。\n\n' +
    `Ken:${u}` +
    (a ? `\nLeo:${a}` : '')
  )
}

/**
 * @param {string} fact
 * @returns {string | null}
 */
export function normalizeLeoBondFact(fact) {
  const t = String(fact || '').trim()
  if (t.length < 4 || t.length > 120) return null
  if (/\b(AI|LLM)\b|助手|机器人|Korben/i.test(t)) return null
  if (/^(Leo|他)[:：]/.test(t) && !/Ken/.test(t)) return null
  const body = /^(Ken|用户)/.test(t) ? t.replace(/^用户/, 'Ken') : `Ken${t}`
  return `Leo关系:${body}`
}

/**
 * 置顶近期 Leo 关系记忆,再与语义召回合并去重。
 * @param {Array<{ text?: string }>} items
 * @param {string[]} recalled
 * @param {number} [pinLimit]
 * @param {number} [totalLimit]
 * @returns {string[]}
 */
export function mergeLeoBondMemories(
  items,
  recalled = [],
  pinLimit = 3,
  totalLimit = 6,
) {
  const pinned = (Array.isArray(items) ? items : [])
    .map((m) => (typeof m?.text === 'string' ? m.text : ''))
    .filter((t) => t.startsWith('Leo关系:'))
    .slice(0, pinLimit)
  const out = []
  const seen = new Set()
  for (const t of [...pinned, ...(recalled || [])]) {
    const s = String(t || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= totalLimit) break
  }
  return out
}
