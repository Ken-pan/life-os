/**
 * Music Continuity gestures — timing/thresholds mirror KenosMotion /
 * KenosShelfGesture (CSS vars from @life-os/theme kenos-motion.css).
 */

/**
 * @param {EventTarget | null} target
 */
function isInteractiveGestureTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, [role="slider"], [role="tab"], .np-mobile-chrome',
    ),
  )
}

function prefersReducedMotion() {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Read a CSS custom property from :root (px / ms / unitless).
 * @param {string} name
 * @param {number} fallback
 */
function cssNumber(name, fallback) {
  if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') {
    return fallback
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

/** KenosShelfGesture.closeDistance ≈ 64 */
function dismissDistancePx() {
  return cssNumber('--kenos-gesture-dismiss-distance', 64)
}

/** KenosShelfGesture.closeVelocity 320 pts/sec → 0.32 px/ms */
function dismissFlickPxPerMs() {
  return cssNumber('--kenos-gesture-dismiss-velocity', 0.32)
}

function sheetMs() {
  return cssNumber('--kenos-motion-sheet', 320)
}

function reduceMs() {
  return cssNumber('--kenos-motion-reduce', 160)
}

function sheetEase() {
  if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') {
    return 'cubic-bezier(0.22, 1, 0.36, 1)'
  }
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--kenos-ease-page')
      .trim() || 'cubic-bezier(0.22, 1, 0.36, 1)'
  )
}

/** KenosShelfGesture.edgeStripWidth — leave leading strip for native Shelf. */
function edgeStripPx() {
  return cssNumber('--kenos-gesture-edge-strip', 28)
}

/**
 * Vertical swipe-to-dismiss (art / header zone only — avoids progress scrub conflicts).
 * Supports touch + pointer for mobile and desktop trackpads.
 *
 * Listens on `node` but moves `surface` — the whole presented view (its
 * background, grabber and content) so it dismisses as one cohesive card rather
 * than the content sliding out of its own chrome. Pass `surfaceSelector` to
 * transform an ancestor container instead of the listener element.
 * @param {HTMLElement} node
 * @param {{ onDismiss: () => void, threshold?: number, surfaceSelector?: string, onProgress?: (p: number) => void }} opts
 */
export function swipeDismiss(node, opts) {
  let startY = 0
  let startX = 0
  let tracking = false
  /** @type {number | null} */
  let pointerId = null
  /** @type {number | null} */
  let rafId = null
  let pendingDy = 0
  // Velocity estimate (px/ms), low-pass filtered for a stable read at release.
  let lastY = 0
  let lastT = 0
  let velocity = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let springTimer = null

  /** The element actually transformed (whole card), not just the listener. */
  const surface =
    (opts.surfaceSelector &&
      /** @type {HTMLElement | null} */ (node.closest(opts.surfaceSelector))) ||
    node

  const now = () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  const viewportH = () =>
    typeof window !== 'undefined' ? window.innerHeight || 800 : 800

  /** Follow the finger 1:1; the sheet recedes (scale + fade) as it sinks. */
  function flushTransform() {
    rafId = null
    if (!tracking) return
    if (prefersReducedMotion()) {
      // Opacity-only preview under Reduce Motion (no scale / travel).
      const p = Math.max(0, Math.min(1, pendingDy / viewportH()))
      surface.style.transform = ''
      surface.style.opacity = String(1 - p * 0.25)
      opts.onProgress?.(p)
      return
    }
    const p = Math.max(0, Math.min(1, pendingDy / viewportH()))
    const scale = 1 - p * 0.12
    surface.style.transform = `translateY(${pendingDy}px) scale(${scale})`
    surface.style.opacity = String(1 - p * 0.35)
    opts.onProgress?.(p)
  }

  function cancelPending() {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  /** @param {number} x @param {number} y */
  function begin(x, y) {
    startY = y
    startX = x
    tracking = true
    lastY = y
    lastT = now()
    velocity = 0
    if (springTimer != null) {
      clearTimeout(springTimer)
      springTimer = null
    }
    surface.style.transition = 'none'
    surface.style.transformOrigin = '50% 0%'
    surface.style.willChange = 'transform, opacity'
  }

  /** @param {number} x @param {number} y */
  function move(x, y) {
    if (!tracking) return
    const dy = y - startY
    const dx = x - startX
    const t = now()
    const dt = t - lastT
    // Ignore sub-frame samples: a near-zero dt yields an astronomical
    // instantaneous velocity that poisons the filter into a false flick
    // (high-rate digitizers can emit two moves in the same millisecond).
    if (dt >= 8) {
      const inst = Math.max(-6, Math.min(6, (y - lastY) / dt))
      velocity = velocity * 0.7 + inst * 0.3
      lastY = y
      lastT = t
    }
    if (dy > 2 && Math.abs(dx) < Math.abs(dy) * 0.85) {
      pendingDy = dy
      if (rafId == null) rafId = requestAnimationFrame(flushTransform)
    }
  }

  /** Ease the sheet back to rest with Kenos spatial / sheet tokens. */
  function springBack() {
    cancelPending()
    opts.onProgress?.(0)
    const reduce = prefersReducedMotion()
    const ms = reduce ? reduceMs() : sheetMs()
    const ease = reduce ? 'ease-out' : sheetEase()
    surface.style.transition = `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}`
    surface.style.transform = ''
    surface.style.opacity = ''
    const clear = () => {
      surface.style.willChange = ''
      surface.style.transformOrigin = ''
      surface.style.transition = ''
      if (springTimer != null) {
        clearTimeout(springTimer)
        springTimer = null
      }
      surface.removeEventListener('transitionend', clear)
    }
    surface.addEventListener('transitionend', clear)
    // Fallback: never leak will-change if transitionend doesn't fire.
    springTimer = setTimeout(clear, ms + 80)
  }

  /** @param {number} y */
  function end(y) {
    if (!tracking) return
    tracking = false
    pointerId = null
    cancelPending()
    const dy = y - startY
    const dist = opts.threshold ?? dismissDistancePx()
    // Dismiss on distance OR a fast downward flick (velocity in px/ms).
    const flick = velocity > dismissFlickPxPerMs()
    if (dy > 6 && (dy >= dist || flick)) {
      // Leave the transient transform in place; the route's view transition
      // captures it and carries the exit. The node unmounts on navigate.
      surface.style.willChange = ''
      opts.onDismiss()
    } else {
      springBack()
    }
  }

  /** @param {TouchEvent} e */
  function onTouchStart(e) {
    if (e.touches.length !== 1) return
    if (isInteractiveGestureTarget(e.target)) return
    begin(e.touches[0].clientX, e.touches[0].clientY)
  }

  /** @param {TouchEvent} e */
  function onTouchMove(e) {
    if (e.touches.length !== 1) return
    move(e.touches[0].clientX, e.touches[0].clientY)
  }

  /** @param {TouchEvent} e */
  function onTouchEnd(e) {
    end(e.changedTouches[0].clientY)
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (e.pointerType === 'touch' || pointerId !== null) return
    if (isInteractiveGestureTarget(e.target)) return
    pointerId = e.pointerId
    node.setPointerCapture(e.pointerId)
    begin(e.clientX, e.clientY)
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (e.pointerId !== pointerId) return
    move(e.clientX, e.clientY)
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return
    try {
      node.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    end(e.clientY)
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true })
  node.addEventListener('touchmove', onTouchMove, { passive: true })
  node.addEventListener('touchend', onTouchEnd)
  node.addEventListener('pointerdown', onPointerDown)
  node.addEventListener('pointermove', onPointerMove)
  node.addEventListener('pointerup', onPointerUp)
  node.addEventListener('pointercancel', onPointerUp)

  return {
    destroy() {
      cancelPending()
      if (springTimer != null) clearTimeout(springTimer)
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('pointermove', onPointerMove)
      node.removeEventListener('pointerup', onPointerUp)
      node.removeEventListener('pointercancel', onPointerUp)
    },
  }
}

/**
 * Swipe on cover art / mini-player — horizontal for prev/next, optional
 * swipe-up. Axis is locked on first meaningful movement so a vertical drag
 * never also fires a track change (and vice-versa). When a swipe fires, the
 * follow-up synthetic click is swallowed so a tap-handler on the same node
 * (e.g. the mini-player's tap-to-expand link) doesn't also trigger.
 *
 * Leading edge strip is ignored in iOS native shell so Shelf edge-open wins.
 * @param {HTMLElement} node
 * @param {{ onPrev: () => void, onNext: () => void, onSwipeUp?: () => void, threshold?: number, touchOnly?: boolean }} opts
 */
export function swipeTrack(node, opts) {
  let startX = 0
  let startY = 0
  /** @type {'h' | 'v' | null} */
  let axis = null
  let ignored = false

  /** Eat the click that a touchend/pointerup synthesizes right after a swipe. */
  function suppressNextClick() {
    /** @param {Event} e */
    const handler = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }
    node.addEventListener('click', handler, { capture: true, once: true })
    setTimeout(
      () => node.removeEventListener('click', handler, { capture: true }),
      350,
    )
  }

  /** @param {number} x @param {number} y */
  function onStart(x, y) {
    // Leave dock-adjacent leading strip for Kenos Space Shelf edge-open.
    const inNative =
      typeof document !== 'undefined' &&
      document.documentElement?.dataset?.iosNativeShell === 'true'
    ignored = inNative && x <= edgeStripPx()
    startX = x
    startY = y
    axis = null
  }

  /** @param {number} x @param {number} y */
  function onMove(x, y) {
    if (ignored || axis) return
    const dx = x - startX
    const dy = y - startY
    // Slightly stricter axis lock than before (was 12 / equal ratio).
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      axis = Math.abs(dx) > Math.abs(dy) * 1.05 ? 'h' : 'v'
    }
  }

  /** @param {number} x @param {number} y */
  function onEnd(x, y) {
    if (ignored) return
    const dx = x - startX
    const dy = y - startY
    const min = opts.threshold ?? 56
    // Vertical: only an upward flick reveals Now Playing / lyrics.
    if (axis === 'v') {
      if (opts.onSwipeUp && dy < -min && Math.abs(dy) > Math.abs(dx) * 1.25) {
        opts.onSwipeUp()
        suppressNextClick()
      }
      return
    }
    if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.25) return
    if (dx > 0) opts.onPrev()
    else opts.onNext()
    suppressNextClick()
  }

  /** @param {TouchEvent} e */
  function onTouchStart(e) {
    onStart(e.touches[0].clientX, e.touches[0].clientY)
  }

  /** @param {TouchEvent} e */
  function onTouchMove(e) {
    onMove(e.touches[0].clientX, e.touches[0].clientY)
  }

  /** @param {TouchEvent} e */
  function onTouchEnd(e) {
    onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (e.pointerType === 'touch') return
    onStart(e.clientX, e.clientY)
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (e.pointerType === 'touch') return
    onMove(e.clientX, e.clientY)
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (e.pointerType === 'touch') return
    onEnd(e.clientX, e.clientY)
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true })
  node.addEventListener('touchmove', onTouchMove, { passive: true })
  node.addEventListener('touchend', onTouchEnd)
  if (!opts.touchOnly) {
    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('pointermove', onPointerMove)
    node.addEventListener('pointerup', onPointerUp)
  }

  return {
    destroy() {
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('pointermove', onPointerMove)
      node.removeEventListener('pointerup', onPointerUp)
    },
  }
}
