/**
 * Leo 聊天气泡头像 — 静态素材 SSOT（apps/aios/static/leo/）。
 * 对齐 SillyTavern Expressions：固定角色在场 + 轻量表情切换。
 */

/** @typedef {'neutral'|'smile'|'serious'|'soft'|'thinking'} LeoExpression */

/** @type {Readonly<Record<LeoExpression, string>>} */
export const LEO_AVATAR_SRC = Object.freeze({
  neutral: '/leo/neutral.png',
  smile: '/leo/smile.png',
  serious: '/leo/serious.png',
  soft: '/leo/soft.png',
  thinking: '/leo/thinking.png',
})

/**
 * @param {unknown} value
 * @returns {LeoExpression}
 */
export function normalizeLeoExpression(value) {
  if (
    value === 'smile' ||
    value === 'serious' ||
    value === 'soft' ||
    value === 'thinking'
  ) {
    return value
  }
  return 'neutral'
}

/**
 * @param {{ expression?: unknown } | null | undefined} [opts]
 * @returns {string}
 */
export function leoAvatarSrc(opts = {}) {
  const key = normalizeLeoExpression(opts?.expression)
  return LEO_AVATAR_SRC[key] || LEO_AVATAR_SRC.neutral
}

/** 已预热过的头像 src(去重,跨调用/跨表情切换只请求一次)。 */
const preloadedLeoAvatarSrcs = new Set()

/**
 * 预热全部表情素材(neutral/smile/serious/soft),避免首次切到某个表情时
 * 因网络加载出现空白/闪烁。幂等 + SSR/测试环境(无 `Image`)下安全跳过。
 * @param {{ imageFactory?: () => { src: string } | null | undefined } | null | undefined} [opts]
 */
export function preloadLeoAvatars(opts = {}) {
  const factory =
    opts?.imageFactory ??
    (() => (typeof Image !== 'undefined' ? new Image() : null))
  for (const src of Object.values(LEO_AVATAR_SRC)) {
    if (preloadedLeoAvatarSrcs.has(src)) continue
    const img = factory()
    if (!img) continue
    preloadedLeoAvatarSrcs.add(src)
    img.src = src
  }
}

/** 仅测试用:清空预热去重缓存,避免用例间互相影响。 */
export function __resetLeoAvatarPreloadCacheForTest() {
  preloadedLeoAvatarSrcs.clear()
}

/**
 * Strip think / tool noise before expression heuristics.
 * @param {string} [text]
 */
export function stripLeoAvatarNoise(text = '') {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()
}

/**
 * 从助手正文启发式选表情（无匹配 → neutral）。
 * 优先级：aftercare/soft > serious > smile > soft intimacy。
 * @param {string} [text]
 * @returns {LeoExpression}
 */
export function inferLeoExpression(text = '') {
  const s = stripLeoAvatarNoise(text)
  if (!s) return 'neutral'

  // 安全词 / aftercare 优先温柔（最高优先）
  if (
    /(?:红灯|绿灯|黄灯|safeword|aftercare|停手|手拿开|靠着我|喘口气|先抱|别急|擦汗|I got you|you'?re safe|we stop)/i.test(
      s,
    ) ||
    /(?:^|\n)\s*(?:Okay\.?\s*)?Stop\b/i.test(s)
  ) {
    return 'soft'
  }
  // 命令 / 霸道
  if (
    /(?:转过去|看着我|夹紧|听话|过来|别躲|撑好|手撑|听清楚|命令|跪下)/i.test(s) ||
    /\b(?:turn around|look at me|hold tight|on your knees|don'?t move|listen)\b/i.test(
      s,
    ) ||
    /\*(?:掌心|压住|抵|顶|grab|pin)/i.test(s)
  ) {
    return 'serious'
  }
  // 思考 / 认真想（不含命令式「听着」——那走 serious）
  if (
    /(?:让我想|等等先|thinking|hmm+|let me think|one sec|hold on)/i.test(s) ||
    /(?:^|\n)\s*(?:嗯{1,3}[…。.])/.test(s)
  ) {
    return 'thinking'
  }
  // 调情 / 笑 / 亲昵
  if (
    /(?:哈哈|坏笑|笑|babe|嘿|想你|好看|真棒|乖|cute|handsome)/i.test(s) ||
    /(?:😉|😊|😏|😍)/.test(s) ||
    /\b(?:come here|miss you|so good|good boy)\b/i.test(s)
  ) {
    return 'smile'
  }
  // 亲密喘息 / 在场偏 soft
  if (
    /(?:喘|低语|耳廓|吻|贴着|放松|靠着我|whisper|breath|kiss|hold you|lean on me)/i.test(
      s,
    )
  ) {
    return 'soft'
  }
  return 'neutral'
}

/**
 * 流式中防闪：可升级(soft>serious>smile>neutral)，不降级回 neutral。
 * 对齐 ST Expressions「本条情绪一旦确立就稳住」。
 * @param {LeoExpression | null | undefined} previous
 * @param {LeoExpression} next
 * @param {{ streaming?: boolean } | null | undefined} [opts]
 * @returns {LeoExpression}
 */
export function stabilizeLeoExpression(previous, next, opts = {}) {
  const prev = normalizeLeoExpression(previous)
  const cur = normalizeLeoExpression(next)
  if (!opts?.streaming) return cur
  const rank = { soft: 4, serious: 3, smile: 2, thinking: 1, neutral: 0 }
  return (rank[cur] ?? 0) >= (rank[prev] ?? 0) ? cur : prev
}

/**
 * 用户消息是否像「要 Leo 出图」（handbook / chip 共用）。
 * @param {string} [text]
 */
export function looksLikeLeoImageAsk(text = '') {
  const s = String(text || '')
  return /画一张|配一张|再画|出图|生图|生成(?:一张)?图|要像你|draw this|draw a|also draw|generate (?:an? )?image|picture of (?:this|us|you)/i.test(
    s,
  )
}

/**
 * Composer「出图」用户草稿（Ken→Leo）。
 * 触发词对齐 detectLocalAssistNeeds / looksLikeLeoImageAsk。
 * @param {{ locale?: unknown, hasDraft?: boolean } | null | undefined} [opts]
 */
export function leoImageDraft(opts = {}) {
  const en = opts?.locale === 'en'
  if (opts?.hasDraft) {
    return en
      ? '\n\n(Also draw this moment — look like you.)'
      : '\n\n（再画一张这一幕，要像你。）'
  }
  return en
    ? 'Draw this moment — look like you, same face and body. One image.'
    : '画一张现在这一幕，要像你：同一张脸、同一副身材。一张就好。'
}
