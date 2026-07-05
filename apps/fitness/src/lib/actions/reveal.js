/**
 * Svelte action：滚动进入视口时添加 .is-visible，实现 reveal 动效。
 * 复刻原 vanilla 版的 IntersectionObserver 行为，并支持 prefers-reduced-motion。
 * @param {HTMLElement} node
 * @param {{ delay?: number }} [params]
 */
export function reveal(node, params = {}) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  node.classList.add('motion-in');
  if (params.delay) node.style.setProperty('--motion-delay', `${params.delay}ms`);

  if (reduce || typeof IntersectionObserver === 'undefined') {
    node.classList.add('is-visible');
    return {};
  }

  let shown = false;

  function markVisible() {
    if (shown) return;
    shown = true;
    node.classList.add('is-visible');
    observer.disconnect();
  }

  /** Match IO rootMargin (bottom −8%) for above-the-fold fallback */
  function inViewNow() {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const rootBottom = window.innerHeight * 0.92;
    return rect.top < rootBottom && rect.bottom > 0;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        markVisible();
      });
    },
    { threshold: 0, rootMargin: '0px 0px -8% 0px' }
  );
  observer.observe(node);

  // Layout may not be settled when the action runs; IO can miss the first paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!shown && inViewNow()) markVisible();
    });
  });

  return {
    destroy() {
      observer.disconnect();
    }
  };
}
