/**
 * In-page actions executed via chrome.scripting.executeScript.
 */
;(function initWsdActionRunner() {
  function query(selector) {
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
      selector,
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('aria-label') || undefined,
    }
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
