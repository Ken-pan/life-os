/**
 * Safe in-page interactions for Dev Agent Mode.
 */
;(function initWsdInteract() {
  function clickSelector(selector) {
    const deep = window.__WSD_DEEP_DOM__
    const el =
      deep?.deepQuerySelector(selector) || document.querySelector(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.scrollIntoView({ block: 'center', behavior: 'auto' })
    el.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )
    if (typeof el.click === 'function') el.click()
    return {
      selector,
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('aria-label') || undefined,
    }
  }

  window.__WSD_INTERACT__ = { clickSelector }
})()
