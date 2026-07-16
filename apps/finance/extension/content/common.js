// 三个平台抓取脚本共享的工具函数（content script 全局命名空间）。
// 注意：这里不用 ES module（MV3 content_scripts 不支持），统一挂到 window.FOS。

;(() => {
  if (window.FOS) return

  // 扩展重载/更新后，残留在页面里的旧 content script 会失去 chrome.runtime 与
  // chrome.storage（孤儿脚本），任何 chrome.* 访问都会抛
  // "Cannot read properties of undefined"。与 bridge.js 的 extAlive 同一手法：
  // 所有触碰 chrome.* 的入口先检查，孤儿态静默停止，提示用户刷新页面。
  let orphanNotified = false
  function extAlive() {
    let alive = false
    try {
      alive = !!chrome.runtime?.id && !!chrome.storage?.local
    } catch {
      alive = false
    }
    if (!alive && !orphanNotified) {
      orphanNotified = true
      console.info('[FOS] 扩展已重载/更新，本页旧脚本停止抓取；刷新页面恢复。')
    }
    return alive
  }

  /** "$1,234.56" / "-$7,104" / "+$5.60" → 数值；解析失败返回 null。 */
  function parseMoney(text) {
    if (!text) return null
    const cleaned = String(text).replace(/[,\s]/g, '')
    const m = cleaned.match(/^([+-]?)\$?([+-]?)([\d.]+)$/)
    if (!m) return null
    const sign = m[1] === '-' || m[2] === '-' ? -1 : 1
    const v = Number(m[3])
    return Number.isFinite(v) ? sign * v : null
  }

  /**
   * 缩写金额："$57.7k" → 57700、"$1.2M" → 1200000、"$0.15" → 0.15。
   * 返回 { value, approximate }；approximate=true 表示页面只给了 3 位有效数字
   * （Rocket Money Net Worth 页），下游更新余额时应放宽容差。
   */
  function parseAbbrevMoney(text) {
    if (!text) return null
    const cleaned = String(text).replace(/[,\s]/g, '')
    const m = cleaned.match(/^([+-]?)\$?([\d.]+)([kKmM]?)$/)
    if (!m) return null
    const v = Number(m[2])
    if (!Number.isFinite(v)) return null
    const mult =
      m[3].toLowerCase() === 'k' ? 1e3 : m[3].toLowerCase() === 'm' ? 1e6 : 1
    return {
      // 乘法会带浮点尾巴（4.03*1000 = 4030.0000000000005），归整到分。
      value: Math.round((m[1] === '-' ? -1 : 1) * v * mult * 100) / 100,
      approximate: m[3] !== '',
    }
  }

  /** "65.55 shares" → 65.55 */
  function parseShares(text) {
    const m = String(text ?? '').match(/([\d,.]+)\s*shares?/i)
    if (!m) return null
    const v = Number(m[1].replace(/,/g, ''))
    return Number.isFinite(v) ? v : null
  }

  /** "-0.70%" → -0.7 */
  function parsePct(text) {
    const m = String(text ?? '').match(/([+-]?[\d,.]+)\s*%/)
    if (!m) return null
    const v = Number(m[1].replace(/,/g, ''))
    return Number.isFinite(v) ? v : null
  }

  /**
   * "7/2" / "7/2/25" / "7/2/2025" → ISO 日期。
   * 无年份时推断：若该月/日在今天之后则视为去年（只对最近 12 个月内的日期可靠，
   * 更久远的行 RocketMoney 会带年份显示，走显式分支）。
   */
  function monthDayToISO(text, today = new Date()) {
    const m = String(text ?? '')
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
    if (!m) return null
    const month = Number(m[1])
    const day = Number(m[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    let year
    if (m[3]) {
      year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    } else {
      year = today.getFullYear()
      const candidate = new Date(year, month - 1, day)
      if (candidate.getTime() > today.getTime() + 24 * 3600 * 1000) year -= 1
    }
    const mm = String(month).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function localTime() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  /** FNV-1a：用于 envelope 内容指纹（确定性 id）。 */
  function contentHash(text) {
    let h = 2166136261
    const s = String(text)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0).toString(36)
  }

  function capturePathname() {
    try {
      return new URL(location.href).pathname
    } catch {
      return ''
    }
  }

  function makeEnvelope(source, kind, data) {
    const pathname = capturePathname()
    const fingerprint = contentHash(
      JSON.stringify({ source, kind, pathname, asOfDate: todayISO(), data }),
    )
    return {
      v: 1,
      id: `${source}_${kind}_${fingerprint}`,
      source,
      kind,
      capturedAt: new Date().toISOString(),
      asOfDate: todayISO(),
      asOfTimeLocal: localTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      pageUrl: location.href,
      data,
    }
  }

  async function enqueue(envelope) {
    if (!extAlive()) return null
    try {
      return await chrome.runtime.sendMessage({
        type: 'FOS_ENQUEUE',
        capture: envelope,
      })
    } catch (e) {
      console.debug('[FOS] sendMessage 失败 — 扩展可能已重载，请刷新本页', e)
      return null
    }
  }

  /**
   * SPA 页面数据是异步渲染的：等 DOM「静默」后执行 probe，稳定则 capture。
   *
   * 实现要点（对齐 MutationObserver quiescence 最佳实践，替代旧的定时轮询）：
   * - MutationObserver 观察 childList+subtree，最后一次变更后 quietMs 内无新变更才评估；
   * - maxWaitMs 兜底：动画/实时行情类页面（如 Robinhood 数字滚动）永不静默，
   *   保证评估至少每 maxWaitMs 执行一次；
   * - 二次确认：首次得到结果后 confirmMs 再评估一次，签名一致才提交，避免抓到渲染半途；
   *   连续 maxConfirmAttempts 次不一致（实时行情页价格一直在跳）则接受最新结果，
   *   保证盘中也能完成抓取；
   * - 持续监听：提交后不断开，数据再变化（如用户滚动出新行）会再次触发 capture，
   *   由调用方按签名去重；
   * - pagehide 自动清理，防止对已卸载文档持续观察。
   */
  function captureWhenStable({
    probe,
    capture,
    quietMs = 500,
    confirmMs = 400,
    maxWaitMs = 2000,
    maxConfirmAttempts = 5,
  }) {
    let cancelled = false
    let quietTimer = null
    let confirmTimer = null
    let lastEvalAt = 0
    let pendingSig = null
    let confirmAttempts = 0
    let lastCapturedSig = null

    const commit = (result, sig) => {
      if (sig === lastCapturedSig) return
      lastCapturedSig = sig
      try {
        capture(result)
      } catch (e) {
        console.warn('[FOS] capture failed', e)
      }
    }

    const evaluate = () => {
      if (cancelled) return
      if (!extAlive()) {
        cancel() // 孤儿脚本：断开 observer，不再触发任何 capture
        return
      }
      lastEvalAt = Date.now()
      let result
      try {
        result = probe()
      } catch {
        return // 渲染中途容错
      }
      if (!result) {
        pendingSig = null
        confirmAttempts = 0
        return
      }
      const sig = JSON.stringify(result)
      if (sig === pendingSig || confirmAttempts >= maxConfirmAttempts) {
        commit(result, sig)
        pendingSig = null
        confirmAttempts = 0
        return
      }
      // 首见此结果：confirmMs 后再验一次，两次一致才提交。
      pendingSig = sig
      confirmAttempts += 1
      clearTimeout(confirmTimer)
      confirmTimer = setTimeout(evaluate, confirmMs)
    }

    // 去抖 + 最大等待：静默 quietMs 触发；持续变更的页面至少每 maxWaitMs 评估一次。
    const schedule = () => {
      if (cancelled) return
      clearTimeout(quietTimer)
      const overdue = Date.now() - lastEvalAt >= maxWaitMs
      quietTimer = setTimeout(evaluate, overdue ? 0 : quietMs)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
    })
    // 静态/已渲染完成的页面没有后续 mutation：主动评估一次。
    quietTimer = setTimeout(evaluate, quietMs)

    const cancel = () => {
      if (cancelled) return
      cancelled = true
      observer.disconnect()
      clearTimeout(quietTimer)
      clearTimeout(confirmTimer)
    }
    window.addEventListener('pagehide', cancel, { once: true })
    return cancel
  }

  /**
   * 等待 target 子树出现一次 DOM 变更（变更后再等 settleMs 让本批渲染完），
   * 或超时兜底。虚拟滚动场景用它取代固定 sleep：新行渲染快时立即继续，慢时不至于漏。
   */
  function waitForMutationOrTimeout(target, timeoutMs = 900, settleMs = 150) {
    return new Promise((resolve) => {
      let settleTimer = null
      const finish = () => {
        observer.disconnect()
        clearTimeout(settleTimer)
        clearTimeout(hardTimer)
        resolve()
      }
      const observer = new MutationObserver(() => {
        clearTimeout(settleTimer)
        settleTimer = setTimeout(finish, settleMs)
      })
      observer.observe(target, { childList: true, subtree: true })
      const hardTimer = setTimeout(finish, timeoutMs)
    })
  }

  /** SPA 路由变化时重新触发抓取（History API 无事件，靠 mutation 时比对 href）。 */
  function onUrlChange(handler) {
    let href = location.href
    const observer = new MutationObserver(() => {
      if (location.href !== href) {
        href = location.href
        handler(href)
      }
    })
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
    })
    window.addEventListener('pagehide', () => observer.disconnect(), {
      once: true,
    })
  }

  /** 模拟完整指针/点击序列（Rocket Money 折叠行等需要）。 */
  function clickLikeUser(el) {
    if (!el) return false
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      )
    }
    return true
  }

  /** 元素不存在或 disabled 时不抛错（对齐 WSD clickSelectorIfPresent）。 */
  function clickOptional(el) {
    if (!el || el.disabled) return false
    try {
      return clickLikeUser(el)
    } catch {
      return false
    }
  }

  /**
   * 轮询直到路由匹配或超时（SPA 侧栏点击后比固定 sleep 更稳）。
   * @param {(href?: string) => boolean} matchFn
   */
  function waitForRoute(matchFn, timeoutMs = 10000, intervalMs = 120) {
    return new Promise((resolve) => {
      const start = Date.now()
      const tick = () => {
        try {
          if (matchFn(location.href)) {
            resolve(true)
            return
          }
        } catch {
          /* ignore */
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(false)
          return
        }
        setTimeout(tick, intervalMs)
      }
      tick()
    })
  }

  window.FOS = {
    extAlive,
    parseMoney,
    parseAbbrevMoney,
    parseShares,
    parsePct,
    monthDayToISO,
    todayISO,
    makeEnvelope,
    enqueue,
    captureWhenStable,
    waitForMutationOrTimeout,
    onUrlChange,
    clickLikeUser,
    clickOptional,
    waitForRoute,
  }
})()
