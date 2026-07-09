import { isStandalonePwa } from './viewportSync.js';

/** @type {number} */
let locks = 0;
/** @type {number} */
let scrollY = 0;
/** @type {HTMLElement | null} */
let scrollRoot = null;
/** @type {number} */
let scrollRootTop = 0;

const SCROLL_ROOT_SELECTOR =
  '#main-content, .main-wrap > .content, .main-col > .life-os-page-workspace, .main-col > .wrap, .main-col > .auth-wrap';

function activeScrollRoot() {
  if (typeof document === 'undefined') return null;
  for (const el of document.querySelectorAll(SCROLL_ROOT_SELECTOR)) {
    if (!(el instanceof HTMLElement)) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (el.scrollHeight > el.clientHeight + 1) return el;
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return el;
  }
  return document.querySelector(SCROLL_ROOT_SELECTOR);
}

/** 锁定背景滚动（浏览器：body fixed；PWA：内层 scroll root overflow hidden） */
export function lockScroll() {
  if (typeof document === 'undefined') return;
  if (locks++ === 0) {
    if (isStandalonePwa()) {
      scrollRoot = activeScrollRoot();
      scrollRootTop = scrollRoot?.scrollTop ?? 0;
      if (scrollRoot) scrollRoot.style.overflow = 'hidden';
      return;
    }

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
    if (isStandalonePwa()) {
      if (scrollRoot) {
        scrollRoot.style.overflow = '';
        scrollRoot.scrollTop = scrollRootTop;
      }
      scrollRoot = null;
      scrollRootTop = 0;
      return;
    }

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

/** 强制清除滚动锁（路由卸载 / Sheet 异常关闭时兜底） */
export function resetScrollLock() {
  if (typeof document === 'undefined') return;
  if (locks === 0 && !scrollRoot && !document.body.style.position) return;
  locks = 0;
  if (scrollRoot) {
    scrollRoot.style.overflow = '';
    scrollRoot.scrollTop = scrollRootTop;
    scrollRoot = null;
    scrollRootTop = 0;
  }
  const body = document.body;
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';
  body.style.overflow = '';
  if (!isStandalonePwa()) {
    window.scrollTo(0, scrollY);
  }
}
