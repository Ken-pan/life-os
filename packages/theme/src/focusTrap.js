const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {Element} el
 * @returns {el is HTMLElement}
 */
function isVisibleFocusable(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.getClientRects().length === 0) return false;
  return el.matches(FOCUSABLE_SELECTOR);
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getFocusableElements(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isVisibleFocusable);
}

/**
 * @typedef {Object} ActivateFocusTrapOptions
 * @property {string} [initialFocusSelector] 优先聚焦的选择器（默认 More Sheet 关闭按钮）
 */

/**
 * 将焦点限制在 dialog / sheet 内，关闭时恢复先前焦点。
 * @param {HTMLElement} container
 * @param {ActivateFocusTrapOptions} [options]
 * @returns {() => void}
 */
export function activateFocusTrap(container, options = {}) {
  const { initialFocusSelector = '.mobile-more-close' } = options;
  /** @type {HTMLElement | null} */
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  /** @param {KeyboardEvent} e */
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const focusInitial = () => {
    const preferred =
      initialFocusSelector && container.querySelector(initialFocusSelector);
    if (preferred instanceof HTMLElement && isVisibleFocusable(preferred)) {
      preferred.focus();
      return;
    }
    getFocusableElements(container)[0]?.focus();
  };

  container.addEventListener('keydown', onKeyDown);
  requestAnimationFrame(focusInitial);

  return () => {
    container.removeEventListener('keydown', onKeyDown);
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  };
}
