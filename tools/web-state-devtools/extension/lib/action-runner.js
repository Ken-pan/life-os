/**
 * In-page actions executed via chrome.scripting.executeScript.
 */
;(function initWsdActionRunner() {
  function isVisible(el) {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const style = window.getComputedStyle(el)
    return style.visibility !== 'hidden' && style.display !== 'none'
  }

  /**
   * Find a clickable element by visible text. Prefers an exact (trimmed,
   * whitespace-collapsed, case-insensitive) match over a substring match, and
   * only considers visible elements. Handy for buttons that lack a stable
   * selector (no id / aria-label / data-test), e.g. Target's "Load more
   * purchases".
   */
  function queryByText(raw) {
    const target = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
    if (!target) return null
    const nodes = document.querySelectorAll(
      'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]',
    )
    let partial = null
    for (const el of nodes) {
      const label = el.getAttribute('aria-label') || ''
      const t = (el.textContent || label || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
      if (!t || !isVisible(el)) continue
      if (t === target) return el
      if (!partial && t.includes(target)) partial = el
    }
    return partial
  }

  function query(selector) {
    if (typeof selector === 'string' && selector.startsWith('text=')) {
      return queryByText(selector.slice(5))
    }
    const deep = window.__WSD_DEEP_DOM__
    return deep?.deepQuerySelector(selector) || document.querySelector(selector)
  }

  function clickSelector(selector) {
    const el = query(selector)
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
      ok: true,
      selector,
      tag: el.tagName.toLowerCase(),
      name:
        el.getAttribute('aria-label') ||
        (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) ||
        undefined,
    }
  }

  /** Same as clickSelector but never throws — for optional UI (e.g. Load More). */
  function clickSelectorIfPresent(selector) {
    const el = query(selector)
    if (!el) {
      return { ok: false, selector, reason: 'not_found' }
    }
    return clickSelector(selector)
  }

  function fillSelector(selector, text, clear = true) {
    const el = query(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.scrollIntoView({ block: 'center', behavior: 'auto' })
    el.focus()
    if (clear) el.value = ''
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { selector, length: text.length }
  }

  function scrollPage(y = 800) {
    window.scrollBy({ top: y, behavior: 'auto' })
    return {
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
    }
  }

  function scrollToBottom() {
    window.scrollTo(0, document.documentElement.scrollHeight)
    return { scrollY: window.scrollY }
  }

  function waitForSelector(selector, timeoutMs = 10000) {
    const start = Date.now()
    return new Promise((resolve, reject) => {
      function check() {
        const el = query(selector)
        if (el)
          return resolve({
            selector,
            found: true,
            tag: el.tagName.toLowerCase(),
          })
        if (Date.now() - start > timeoutMs)
          return reject(new Error(`Timeout waiting for ${selector}`))
        requestAnimationFrame(check)
      }
      check()
    })
  }

  function getText(selector) {
    const el = selector ? query(selector) : document.body
    if (!el) throw new Error(`Element not found: ${selector}`)
    return {
      selector: selector || 'body',
      text: (el.innerText || '').slice(0, 8000),
    }
  }

  const PRESETS = {
    scroll_to_bottom: scrollToBottom,
    scroll_down: () => scrollPage(800),
    page_title: () => ({ title: document.title, url: location.href }),
    page_text_sample: () => ({
      text: (document.body.innerText || '').slice(0, 4000),
    }),
  }

  function runPreset(name) {
    const fn = PRESETS[name]
    if (!fn)
      throw new Error(
        `Unknown preset: ${name}. Available: ${Object.keys(PRESETS).join(', ')}`,
      )
    return fn()
  }

  window.__WSD_ACTIONS__ = {
    clickSelector,
    clickSelectorIfPresent,
    fillSelector,
    scrollPage,
    scrollToBottom,
    waitForSelector,
    getText,
    runPreset,
    PRESETS: Object.keys(PRESETS),
  }

  // legacy alias
  window.__WSD_INTERACT__ = { clickSelector }
})()
