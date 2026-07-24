/**
 * Leo follow-up chip helpers — composer suggestions must stay Ken→Leo.
 */

import { leoComposerQuickOpeners, leoReplyLooksTooChinese } from './leoPersona.core.js'

export { leoComposerPreferEnglish, textLooksMostlyEnglish } from './leoPersona.core.js'

/** @param {string} text */
export function looksLikeLeoSpeakingSuggestion(text) {
  const s = String(text || '').trim()
  if (!s) return true
  // 第三人称提用户 / 明显 Leo 口吻开场
  if (/(?:肯儿|Ken\s*啊|我是\s*Leo|刚练完|过来靠)/i.test(s)) return true
  if (/Ken，我|听着[，,]\s*Ken|让我摸|让我抱/i.test(s)) return true
  if (/^(?:嘿|啧|过来|听着|乖)[，,]?(?:\s)*(?:Ken|肯)/i.test(s)) return true
  // Leo 口吻开场;勿误伤 Ken→Leo「Come closer」
  if (/^(?:Hey(?:\s+(?:babe|Ken))?|Yeah\.\s*$|Okay\.\s*$)\b/i.test(s)) return true
  if (/^Come here\b/i.test(s) && !/^Come closer\b/i.test(s)) return true
  if (/\b(?:babe|I got you)\b/i.test(s) && /(?:Ken|你)/i.test(s)) return true
  // 流利长中文 + Leo 口吻痕迹 → 当 Leo 破戏建议丢掉
  if (
    leoReplyLooksTooChinese(s) &&
    /(?:过来|听着|babe|Ken|我帮你|别装)/i.test(s)
  ) {
    return true
  }
  return false
}

/**
 * @param {boolean} [en]
 * @param {{ intensity?: string, scenarioId?: string }} [ctx]
 */
export function leoFallbackSuggestions(en = false, ctx = {}) {
  const explicit = ctx.intensity === 'explicit'
  if (en) {
    return explicit
      ? ['Keep going.', 'Slow down.', 'Hold me for a bit.']
      : ['Tell me more.', 'Come closer.', 'What do you want tonight?']
  }
  return explicit
    ? ['继续，别停。', '慢一点。', '先抱一下，别急。']
    : ['再说具体点。', '再靠近一点。', '今晚你想怎样？']
}

/**
 * Assistant 首页 Leo 空态 opener chips — 与 Composer 的 quick openers 同源,
 * 保证点击路径/文案跟聊天里已经在用的 Ken→Leo 开场一致。
 * @param {{ leoIntensity?: unknown, locale?: unknown } | null | undefined} [settings]
 * @returns {ReadonlyArray<{ id: string, text: string }>}
 */
export function leoHomeOpeners(settings = {}) {
  const openers = leoComposerQuickOpeners(settings)
  return openers.slice(0, 4)
}
