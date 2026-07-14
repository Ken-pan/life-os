/**
 * @param {EventTarget | null} target
 */
function isInteractiveGestureTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, [role="slider"], [role="tab"], .np-mobile-chrome'
    )
  );
}

/**
 * Vertical swipe-to-dismiss (art / header zone only — avoids progress scrub conflicts).
 * Supports touch + pointer for mobile and desktop trackpads.
 * @param {HTMLElement} node
 * @param {{ onDismiss: () => void, threshold?: number }} opts
 */
export function swipeDismiss(node, opts) {
  let startY = 0;
  let startX = 0;
  let tracking = false;
  /** @type {number | null} */
  let pointerId = null;
  /** @type {number | null} */
  let rafId = null;
  let pendingDy = 0;

  /** Apply the drag transform once per frame (coalesces rapid touchmoves). */
  function flushTransform() {
    rafId = null;
    if (!tracking) return;
    node.style.transform = `translateY(${pendingDy}px)`;
    node.style.opacity = String(Math.max(0.35, 1 - pendingDy / 420));
  }

  function cancelPending() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /** @param {number} x @param {number} y */
  function begin(x, y) {
    startY = y;
    startX = x;
    tracking = true;
    node.style.transition = 'none';
  }

  /** @param {number} x @param {number} y */
  function move(x, y) {
    if (!tracking) return;
    const dy = y - startY;
    const dx = x - startX;
    if (dy > 8 && Math.abs(dx) < Math.abs(dy) * 0.75) {
      pendingDy = dy;
      if (rafId == null) rafId = requestAnimationFrame(flushTransform);
    }
  }

  /** @param {number} y */
  function end(y) {
    if (!tracking) return;
    tracking = false;
    pointerId = null;
    cancelPending();
    const dy = y - startY;
    node.style.transition = '';
    node.style.transform = '';
    node.style.opacity = '';
    if (dy > (opts.threshold ?? 88)) opts.onDismiss();
  }

  /** @param {TouchEvent} e */
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    if (isInteractiveGestureTarget(e.target)) return;
    begin(e.touches[0].clientX, e.touches[0].clientY);
  }

  /** @param {TouchEvent} e */
  function onTouchMove(e) {
    if (e.touches.length !== 1) return;
    move(e.touches[0].clientX, e.touches[0].clientY);
  }

  /** @param {TouchEvent} e */
  function onTouchEnd(e) {
    end(e.changedTouches[0].clientY);
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (e.pointerType === 'touch' || pointerId !== null) return;
    if (isInteractiveGestureTarget(e.target)) return;
    pointerId = e.pointerId;
    node.setPointerCapture(e.pointerId);
    begin(e.clientX, e.clientY);
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (e.pointerId !== pointerId) return;
    move(e.clientX, e.clientY);
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    try {
      node.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    end(e.clientY);
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: true });
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerUp);

  return {
    destroy() {
      cancelPending();
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerUp);
    }
  };
}

/**
 * Swipe on cover art / mini-player — horizontal for prev/next, optional
 * swipe-up. Axis is locked on first meaningful movement so a vertical drag
 * never also fires a track change (and vice-versa). When a swipe fires, the
 * follow-up synthetic click is swallowed so a tap-handler on the same node
 * (e.g. the mini-player's tap-to-expand link) doesn't also trigger.
 * @param {HTMLElement} node
 * @param {{ onPrev: () => void, onNext: () => void, onSwipeUp?: () => void, threshold?: number, touchOnly?: boolean }} opts
 */
export function swipeTrack(node, opts) {
  let startX = 0;
  let startY = 0;
  /** @type {'h' | 'v' | null} */
  let axis = null;

  /** Eat the click that a touchend/pointerup synthesizes right after a swipe. */
  function suppressNextClick() {
    /** @param {Event} e */
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    node.addEventListener('click', handler, { capture: true, once: true });
    setTimeout(
      () => node.removeEventListener('click', handler, { capture: true }),
      350,
    );
  }

  /** @param {number} x @param {number} y */
  function onStart(x, y) {
    startX = x;
    startY = y;
    axis = null;
  }

  /** @param {number} x @param {number} y */
  function onMove(x, y) {
    if (axis) return;
    const dx = x - startX;
    const dy = y - startY;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
      axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
  }

  /** @param {number} x @param {number} y */
  function onEnd(x, y) {
    const dx = x - startX;
    const dy = y - startY;
    const min = opts.threshold ?? 56;
    // Vertical: only an upward flick reveals lyrics. Downward is left to the
    // parent swipe-to-dismiss handler.
    if (axis === 'v') {
      if (opts.onSwipeUp && dy < -min && Math.abs(dy) > Math.abs(dx) * 1.2) {
        opts.onSwipeUp();
        suppressNextClick();
      }
      return;
    }
    if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx > 0) opts.onPrev();
    else opts.onNext();
    suppressNextClick();
  }

  /** @param {TouchEvent} e */
  function onTouchStart(e) {
    onStart(e.touches[0].clientX, e.touches[0].clientY);
  }

  /** @param {TouchEvent} e */
  function onTouchMove(e) {
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }

  /** @param {TouchEvent} e */
  function onTouchEnd(e) {
    onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (e.pointerType === 'touch') return;
    onStart(e.clientX, e.clientY);
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    onMove(e.clientX, e.clientY);
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (e.pointerType === 'touch') return;
    onEnd(e.clientX, e.clientY);
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: true });
  node.addEventListener('touchend', onTouchEnd);
  if (!opts.touchOnly) {
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
  }

  return {
    destroy() {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
    }
  };
}
