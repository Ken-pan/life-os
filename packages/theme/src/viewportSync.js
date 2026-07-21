import { isLifeOsMobile } from './layout.js'

/** @typedef {{ height: number; width: number; offsetTop: number; offsetLeft: number }} ViewportRect */

/** Floor (px) so URL-bar / rubber-band jitter does not toggle keyboard chrome. */
export const KEYBOARD_INSET_FLOOR_PX = 80

/** @type {string | null} */
let lastSyncedAppVh = null

/** @returns {boolean} */
export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return (
    params.get('pwa_sim') === '1' ||
    window.matchMedia('(display-mode: standalone)').matches ||
    /** @type {{ standalone?: boolean }} */ (navigator).standalone === true ||
    document.documentElement.classList.contains('standalone-pwa')
  )
}

/** @returns {boolean} */
export function needsViewportHeightSync() {
  if (typeof window === 'undefined') return false
  if (isStandalonePwa()) return true
  return isLifeOsMobile()
}

/** @returns {ViewportRect} */
export function getViewportRect() {
  if (typeof window === 'undefined') {
    return { height: 0, width: 0, offsetTop: 0, offsetLeft: 0 }
  }

  const vv = window.visualViewport
  if (!vv) {
    return {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
    }
  }

  return {
    height: vv.height,
    width: vv.width,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
  }
}

/** @returns {number} */
export function getVisualViewportHeight() {
  return getViewportRect().height
}

/**
 * CSS value for --app-vh.
 * Mobile browser: visual viewport px (URL bar). Standalone PWA: 100vh — dvh/vv
 * lie on cold start. Desktop browser: 100dvh so CSS tracks window resize natively.
 * @returns {string}
 */
export function resolveAppVhCSSValue() {
  if (typeof window === 'undefined') return '100dvh'

  if (isStandalonePwa()) {
    const vv = window.visualViewport
    const layoutH = window.innerHeight
    if (vv && vv.height > 0 && layoutH > 0 && vv.height < layoutH * 0.82) {
      return `${Math.round(vv.height)}px`
    }
    return '100vh'
  }

  if (!isLifeOsMobile()) return '100dvh'

  const h = getVisualViewportHeight()
  return h > 0 ? `${Math.round(h)}px` : '100dvh'
}

/**
 * On-screen keyboard height (px).
 * Default: layout viewport − visual viewport − offsetTop (browser / most PWAs).
 * iOS standalone often keeps vv.height ≈ innerHeight and instead scrolls the
 * layout viewport; then scrollY + offsetTop is a better keyboard-height proxy.
 * Closed keyboard / URL-bar jitter stays under the floor.
 * @returns {number}
 */
export function resolveKeyboardInset() {
  if (typeof window === 'undefined') return 0
  const vv = window.visualViewport
  if (!vv) return 0
  const layoutGap = Math.max(
    0,
    window.innerHeight - vv.height - vv.offsetTop,
  )
  let inset = layoutGap
  if (isStandalonePwa()) {
    const scrollGap = (window.scrollY || 0) + (vv.offsetTop || 0)
    inset = Math.max(layoutGap, scrollGap)
  }
  return inset > KEYBOARD_INSET_FLOOR_PX ? Math.round(inset) : 0
}

/** @returns {boolean} */
export function isKeyboardOpen() {
  return resolveKeyboardInset() > 0
}

/**
 * @param {Element | null | undefined} el
 * @returns {el is HTMLElement}
 */
export function isEditableFocusTarget(el) {
  if (!el || typeof el !== 'object') return false
  // Node test env has no HTMLElement; still accept duck-typed elements.
  if (typeof HTMLElement !== 'undefined' && !(el instanceof HTMLElement)) {
    return false
  }
  if (!('tagName' in el) || typeof el.tagName !== 'string') return false
  if (/** @type {{ isContentEditable?: boolean }} */ (el).isContentEditable) {
    return true
  }
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type =
    (typeof el.getAttribute === 'function'
      ? el.getAttribute('type')
      : 'text') || 'text'
  return ![
    'button',
    'checkbox',
    'radio',
    'submit',
    'reset',
    'file',
    'image',
    'range',
    'color',
    'hidden',
  ].includes(String(type).toLowerCase())
}

/**
 * Keep the focused editable inside the visual viewport (above the keyboard).
 * Prefer nearest scroll; fall back to center when still clipped.
 * @param {{ padding?: number; force?: boolean }} [opts]
 * @returns {boolean} true when a scroll was attempted
 */
export function ensureFocusedInputVisible(opts = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false
  }
  const padding = opts.padding ?? 12
  const active = document.activeElement
  if (!isEditableFocusTarget(active)) return false

  const vv = window.visualViewport
  if (!vv) {
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return true
  }

  const rect = active.getBoundingClientRect()
  const top = vv.offsetTop + padding
  const bottom = vv.offsetTop + vv.height - padding
  const clipped = opts.force || rect.top < top || rect.bottom > bottom
  if (!clipped) return false

  try {
    active.scrollIntoView({
      block: rect.height > vv.height * 0.55 ? 'start' : 'center',
      inline: 'nearest',
    })
  } catch {
    active.scrollIntoView(false)
  }
  return true
}

/**
 * Bottom fixed chrome height (tab bar + visible mini player).
 * Prefers CSS `--bottom-chrome-h`, then live bottom-shell box height.
 * When the keyboard is open, web bottom chrome is suppressed via `.keyboard-open`.
 * @returns {number}
 */
export function getBottomChromeHeight() {
  if (typeof document === 'undefined') return 0
  if (isKeyboardOpen()) return 0

  const shell = document.querySelector('.bottom-shell')
  if (shell) {
    const token = parseFloat(
      getComputedStyle(shell).getPropertyValue('--bottom-chrome-h'),
    )
    if (Number.isFinite(token) && token > 0) return token

    const measured = shell.getBoundingClientRect().height
    if (measured > 0) return measured
  }

  const root = getComputedStyle(document.documentElement)
  const tabbar =
    parseFloat(root.getPropertyValue('--mobile-tabbar-total-h')) || 0
  const miniPlayer = document.querySelector('.mini-player.show')
  const mini = miniPlayer
    ? parseFloat(root.getPropertyValue('--mini-player-h')) || 0
    : 0
  return tabbar + mini
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {{ padding?: number; bottomInset?: number }} [opts]
 * @returns {{ left: number; top: number }}
 */
export function clampPopoverPosition(x, y, width, height, opts = {}) {
  const padding = opts.padding ?? 8
  const bottomInset = opts.bottomInset ?? getBottomChromeHeight() + padding
  const { height: vh, width: vw, offsetTop, offsetLeft } = getViewportRect()

  let left = x
  let top = y

  const maxRight = offsetLeft + vw - padding
  const minLeft = offsetLeft + padding
  const maxBottom = offsetTop + vh - bottomInset
  const minTop = offsetTop + padding

  if (left + width > maxRight) left = Math.max(minLeft, maxRight - width)
  if (left < minLeft) left = minLeft

  if (top + height > maxBottom) top = Math.max(minTop, maxBottom - height)
  if (top < minTop) top = minTop

  return { left, top }
}

function syncViewportHeight(force = false) {
  const appVh = resolveAppVhCSSValue()
  if (!force && lastSyncedAppVh === appVh) return
  lastSyncedAppVh = appVh
  document.documentElement.style.setProperty('--app-vh', appVh)
}

/** @type {number | null} */
let lastSyncedKbInset = null
/** @type {boolean | null} */
let lastSyncedKbOpen = null

function syncKeyboardInset(force = false) {
  const inset = resolveKeyboardInset()
  const open = inset > 0
  if (!force && lastSyncedKbInset === inset && lastSyncedKbOpen === open) return
  lastSyncedKbInset = inset
  lastSyncedKbOpen = open
  const root = document.documentElement
  root.style.setProperty('--keyboard-inset', `${inset}px`)
  root.classList.toggle('keyboard-open', open)
  root.dataset.keyboardOpen = open ? 'true' : 'false'
}

function syncStandaloneClass() {
  document.documentElement.classList.toggle('standalone-pwa', isStandalonePwa())
}

/** @returns {boolean} */
function isIosWebKit() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('(-webkit-touch-callout: none)')
}

/** iOS: env(safe-area-inset-top) can be 0 (WebKit #301994); floor at 59px on mobile */
function syncSafeTopEffective() {
  if (
    typeof document === 'undefined' ||
    !isIosWebKit() ||
    !isLifeOsMobile() ||
    !isStandalonePwa()
  )
    return

  const root = document.documentElement
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px)'
  document.body?.appendChild(probe)
  const measured = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()

  const effective = Math.max(59, measured)
  root.style.setProperty('--safe-top-effective', `${effective}px`)
}

/**
 * Keep --app-vh / --keyboard-inset aligned with viewport mode:
 * - Mobile Safari browser: visualViewport px (URL bar)
 * - iOS standalone PWA: 100vh (dvh/vv under-report safe-area-top on cold start)
 * - Desktop browser: 100dvh
 * Also tracks visualViewport scroll + focusin so iOS keyboard open/close and
 * focus-scroll offsetTop stay in sync; scrolls focused inputs into view.
 * Listeners are always attached: the mode is width-dependent (839px breakpoint),
 * so a desktop window resized narrow must start px sync — and vice versa.
 * @returns {() => void}
 */
export function bindViewportHeight() {
  if (typeof window === 'undefined') return () => {}

  syncViewportHeight(true)
  syncKeyboardInset(true)
  syncStandaloneClass()
  syncSafeTopEffective()

  /** @type {number | null} */
  let rafId = null
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let focusScrollTimer
  /** @type {number | null} */
  let lastKbForFocus = lastSyncedKbInset

  const flush = () => {
    rafId = null
    const prevKb = lastSyncedKbInset
    syncViewportHeight()
    syncKeyboardInset()
    syncStandaloneClass()
    syncSafeTopEffective()

    // When keyboard inset crosses open/close, re-place the caret field.
    if (
      prevKb !== lastSyncedKbInset &&
      isEditableFocusTarget(document.activeElement)
    ) {
      ensureFocusedInputVisible({ force: true })
    }
  }

  const schedule = () => {
    if (rafId !== null) return
    rafId = requestAnimationFrame(flush)
  }

  const onFocusIn = (event) => {
    if (!isEditableFocusTarget(event.target)) return
    schedule()
    if (focusScrollTimer !== undefined) clearTimeout(focusScrollTimer)
    // iOS keyboard animation ~250ms; settle then ensure visibility.
    focusScrollTimer = setTimeout(() => {
      focusScrollTimer = undefined
      syncKeyboardInset()
      ensureFocusedInputVisible({ force: lastKbForFocus === 0 })
      lastKbForFocus = lastSyncedKbInset
    }, 280)
  }

  const onFocusOut = () => {
    schedule()
    if (focusScrollTimer !== undefined) {
      clearTimeout(focusScrollTimer)
      focusScrollTimer = undefined
    }
  }

  window.visualViewport?.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('scroll', schedule)
  window.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)

  const standaloneMq = window.matchMedia('(display-mode: standalone)')
  standaloneMq.addEventListener('change', schedule)

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    if (focusScrollTimer !== undefined) clearTimeout(focusScrollTimer)
    window.visualViewport?.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    standaloneMq.removeEventListener('change', schedule)
  }
}
