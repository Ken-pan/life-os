export const LIFE_OS_CONTENT_FRAME = {
  modeMax: 'max',
  modeSpan: 'span',
}

export const LIFE_OS_LAYOUT = {
  bpReflow: 320,
  bpNarrow: 380,
  bpCompact: 640,
  bpPhone: 599,
  bpTabletMin: 600,
  bpTabletMax: 839,
  bpMobile: 839,
  bpMobileMin: 840,
  contentMaxText: 820,
  contentMaxData: 1320,
  /** Desktop single-row AppBar offset（次级 sticky / 画布顶偏移） */
  appbarH: 56,
  /** Back-mode 单行 AppBar */
  appbarHBack: 52,
  /** Desktop 完整页头 / scroll-padding 基准 */
  pageHeaderH: 68,
  tabbarH: 62,
  /** Content frame modes for data-content-mode */
  contentFrameModeMax: 'max',
  contentFrameModeSpan: 'span',
}

/**
 * @param {number} px
 * @returns {string}
 */
export function lifeOsMaxWidthMq(px) {
  return `(max-width: ${px}px)`
}

/**
 * @param {number} px
 * @returns {string}
 */
export function lifeOsMinWidthMq(px) {
  return `(min-width: ${px}px)`
}

/** Mobile chrome（隐藏侧栏、显示底栏）≤839px */
export function lifeOsMobileMq() {
  return lifeOsMaxWidthMq(LIFE_OS_LAYOUT.bpMobile)
}

/** Desktop shell（持久侧栏）≥840px */
export function lifeOsDesktopMq() {
  return lifeOsMinWidthMq(LIFE_OS_LAYOUT.bpMobileMin)
}

/**
 * @param {Window | undefined} [win]
 * @returns {boolean}
 */
export function isLifeOsMobile(
  win = typeof window !== 'undefined' ? window : undefined,
) {
  return Boolean(win?.matchMedia?.(lifeOsMobileMq()).matches)
}

/**
 * @param {Window | undefined} [win]
 * @returns {boolean}
 */
export function isLifeOsDesktop(
  win = typeof window !== 'undefined' ? window : undefined,
) {
  return Boolean(win?.matchMedia?.(lifeOsDesktopMq()).matches)
}

/**
 * @param {string} query
 * @param {Window | undefined} [win]
 * @returns {boolean}
 */
export function matchLifeOsMedia(
  query,
  win = typeof window !== 'undefined' ? window : undefined,
) {
  return Boolean(win?.matchMedia?.(query).matches)
}

/**
 * 订阅 media query；返回 unsubscribe。
 * @param {string} query
 * @param {(matches: boolean) => void} onChange
 * @param {Window | undefined} [win]
 * @returns {() => void}
 */
export function bindLifeOsMedia(
  query,
  onChange,
  win = typeof window !== 'undefined' ? window : undefined,
) {
  if (!win?.matchMedia) {
    onChange(false)
    return () => {}
  }
  const mq = win.matchMedia(query)
  const handler = () => onChange(mq.matches)
  handler()
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
