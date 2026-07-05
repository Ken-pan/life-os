/**
 * Vertical swipe-to-dismiss (art / header zone only — avoids progress scrub conflicts).
 * @param {HTMLElement} node
 * @param {{ onDismiss: () => void, threshold?: number }} opts
 */
export function swipeDismiss(node, opts) {
  let startY = 0;
  let startX = 0;
  let tracking = false;

  /** @param {TouchEvent} e */
  function onStart(e) {
    const t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    tracking = true;
    node.style.transition = 'none';
  }

  /** @param {TouchEvent} e */
  function onMove(e) {
    if (!tracking) return;
    const t = e.touches[0];
    const dy = t.clientY - startY;
    const dx = t.clientX - startX;
    if (dy > 8 && Math.abs(dx) < Math.abs(dy) * 0.75) {
      node.style.transform = `translateY(${dy}px)`;
      node.style.opacity = String(Math.max(0.35, 1 - dy / 420));
    }
  }

  /** @param {TouchEvent} e */
  function onEnd(e) {
    if (!tracking) return;
    tracking = false;
    const dy = e.changedTouches[0].clientY - startY;
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

  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: true });
  node.addEventListener('touchend', onEnd);

  return {
    destroy() {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
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

  /** @param {TouchEvent} e */
  function onStart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }

  /** @param {TouchEvent} e */
  function onEnd(e) {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const min = opts.threshold ?? 56;
    if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx > 0) opts.onPrev();
    else opts.onNext();
  }

  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchend', onEnd);

  return {
    destroy() {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchend', onEnd);
    }
  };
}
