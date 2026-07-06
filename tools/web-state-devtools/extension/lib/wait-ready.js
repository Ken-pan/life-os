/**
 * Content-ready waits — wait for target elements, not network idle or fixed sleep.
 * Industry pattern: condition-based sync tied to data you came for (Playwright locator.waitFor).
 */
;(function initWaitReady() {
  const core = () => window.__WSD_CORE__

  function isVisible(el) {
    return core()?.isVisible?.(el) ?? false
  }

  function countVisible(selectors) {
    let max = 0
    for (const sel of selectors) {
      if (!sel) continue
      let n = 0
      for (const el of document.querySelectorAll(sel)) {
        if (isVisible(el)) n++
      }
      if (n > max) max = n
    }
    return max
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  function hasPriceSignal() {
    return /\$[\d,]+\.\d{2}/.test(
      document.body?.innerText?.slice(0, 80000) || '',
    )
  }

  /**
   * Wait until minCount visible elements match any selector, count stable for stableMs.
   * @param {object} cfg
   */
  async function waitForContent(cfg = {}) {
    const selectors = cfg.selectors || []
    const minCount = cfg.minCount ?? 1
    const stableMs = cfg.stableMs ?? 250
    const timeoutMs = cfg.timeoutMs ?? 8000
    const pollMs = cfg.pollMs ?? 40
    const requirePrice = !!cfg.requirePrice

    if (!selectors.length && !requirePrice) {
      return { ready: true, skipped: true, count: 0, waitedMs: 0 }
    }

    const start = Date.now()
    let lastCount = -1
    let stableSince = 0

    while (Date.now() - start < timeoutMs) {
      const count = selectors.length ? countVisible(selectors) : 1
      const priceOk = !requirePrice || hasPriceSignal()
      if (count >= minCount && priceOk) {
        if (count === lastCount) {
          if (Date.now() - stableSince >= stableMs) {
            return {
              ready: true,
              count,
              priceOk,
              waitedMs: Date.now() - start,
              selectors,
            }
          }
        } else {
          lastCount = count
          stableSince = Date.now()
        }
      } else {
        lastCount = -1
        stableSince = 0
      }
      await sleep(pollMs)
    }

    const count = selectors.length ? countVisible(selectors) : 0
    return {
      ready: count >= minCount && (!requirePrice || hasPriceSignal()),
      count,
      priceOk: hasPriceSignal(),
      timedOut: true,
      waitedMs: Date.now() - start,
      selectors,
    }
  }

  window.__WSD_WAIT_READY__ = { waitForContent, countVisible }
})()
