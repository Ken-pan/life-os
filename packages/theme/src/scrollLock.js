/** @type {number} */
let locks = 0;
/** @type {number} */
let scrollY = 0;

/** 锁定背景滚动（iOS-safe：position fixed + 恢复 scrollY） */
export function lockScroll() {
  if (typeof document === 'undefined') return;
  if (locks++ === 0) {
    scrollY = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }
}

/** 解除背景滚动锁（引用计数，支持嵌套 Sheet） */
export function unlockScroll() {
  if (typeof document === 'undefined') return;
  if (locks <= 0) return;
  if (--locks === 0) {
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.overflow = '';
    window.scrollTo(0, scrollY);
  }
}
