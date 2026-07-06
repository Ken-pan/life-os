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
      node.style.transform = `translateY(${dy}px)`;
      node.style.opacity = String(Math.max(0.35, 1 - dy / 420));
    }
  }

  /** @param {number} y */
  function end(y) {
    if (!tracking) return;
    tracking = false;
    pointerId = null;
    const dy = y - startY;
    node.style.transition = '';
    if (dy > (opts.threshold ?? 88)) {
      node.style.transform = '';
      node.style.opacity = '';
      opts.onDismiss();
    } else {
      node.style.transform = '';
      node.style.opacity = '';
    }
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
 * Horizontal swipe on cover art — prev / next track.
 * @param {HTMLElement} node
 * @param {{ onPrev: () => void, onNext: () => void, threshold?: number }} opts
 */
export function swipeTrack(node, opts) {
  let startX = 0;
  let startY = 0;
  let movedVertically = false;

  /** @param {number} x @param {number} y */
  function onStart(x, y) {
    startX = x;
    startY = y;
    movedVertically = false;
  }

  /** @param {number} x @param {number} y */
  function onMove(x, y) {
    const dy = y - startY;
    if (Math.abs(dy) > 24) movedVertically = true;
  }

  /** @param {number} x @param {number} y */
  function onEnd(x, y) {
    if (movedVertically) return;
    const dx = x - startX;
    const dy = y - startY;
    const min = opts.threshold ?? 56;
    if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx > 0) opts.onPrev();
    else opts.onNext();
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
  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);

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
