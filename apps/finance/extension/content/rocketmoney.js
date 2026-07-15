// Rocket Money 抓取（https://app.rocketmoney.com/）。
// 依据 2026-07 实测 DOM：
// - Dashboard「Accounts」卡片：h6 为 "Accounts"。
//   分组行 div[role="button"][aria-expanded]（Checking / Card Balance / Savings / Investments）可展开，
//   展开后逐账户行 = 机构 logo + 账户名 label + 全精度余额；Net Cash 为派生值跳过。
//   抓取时会自动点击折叠的分组（与 Net Worth 展开逻辑类似）。
// - Net Worth 页（/net-worth）：分组标题行（Investments / Savings / Cash / Credit Cards…）
//   后跟账户表，每行 = 机构 logo(img[alt="X logo"]) + 账户名 + 机构名 + 缩写余额（$57.7k，3 位有效数字）。
// - Recurring 页（/recurring）：三个 [data-testid="subscription-section-card"] 分区
//   （Subscriptions / Bills & Utilities / Other），行 [data-testid="table-row"]，
//   label 依次为 名称 / 频率 / ••账户 / 到期 / 金额，外层 <a href="/recurring/detail?id=…"> 是平台 ID。
// - Transactions 页：[data-testid="transaction-table-row"]，row aria-label 尾部括号内是平台交易 ID，
//   单元格 [role="cell"] 依次为 选择框 / 日期(7/2) / 图标 / 名称(+Pending/Statement) / 类别 / 操作 / 金额。
//   表格是虚拟滚动，只抓当前渲染出的行（最近的交易在最上面）。
//
// 两种模式：
// 1. 被动：正常浏览时自动抓当前页（下方「调度」部分）。
// 2. 主动爬取：popup 点「主动抓取 Rocket Money」→ background 发 FOS_START_CRAWL →
//    Dashboard 余额 → Net Worth 逐账户 → Recurring 订阅 → Transactions 滚动收集交易，
//    交易滚到 app 快照与扩展水位线中更早的停止点（syncPlan.js）或到底为止。

;(() => {
  const {
    parseMoney,
    parseAbbrevMoney,
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
  } = window.FOS
  const RM = window.RM_PROBES
  const plan = window.FOS_PLAN
  if (!RM) {
    console.error('[FOS] rmFinanceProbes.js 未加载')
    return
  }
  if (!plan) {
    console.error('[FOS] syncPlan.js 未加载，抓取计划去重不可用')
  }

  async function loadAppSnapshot() {
    const { fos_app_snapshot: snap } =
      await chrome.storage.local.get('fos_app_snapshot')
    return snap?.v === 1 ? snap : null
  }

  async function loadScrollStopBefore() {
    const [{ fos_txn_watermark: watermark }, snap] = await Promise.all([
      chrome.storage.local.get('fos_txn_watermark'),
      loadAppSnapshot(),
    ])
    return plan.resolveTxnScrollStopBefore(snap, watermark)
  }

  function planDetail(need, skipped, unit) {
    if (skipped > 0)
      return `${need} ${unit}需抓，${skipped} 已在 Finance OS 跳过`
    return `${need} ${unit}需抓`
  }

  // ---------- Dashboard: Accounts ----------

  const GROUP_KIND = {
    checking: 'checking',
    savings: 'savings',
    'card balance': 'credit',
    investments: 'investment',
  }

  const DASHBOARD_GROUP_NAMES = new Set(Object.keys(GROUP_KIND))

  function findAccountsCard() {
    const heads = [...document.querySelectorAll('h6')].filter(
      (h) => h.textContent.trim() === 'Accounts',
    )
    if (heads.length === 0) return null
    return (
      heads[0].closest('[data-testid="card"]') ??
      heads[0].parentElement?.parentElement
    )
  }

  function dashboardGroupKind(label) {
    const key = String(label ?? '')
      .trim()
      .toLowerCase()
    if (key === 'investments') return 'investment'
    return GROUP_KIND[key]
  }

  function isCollapsedChevron(rowEl) {
    const paths = [...rowEl.querySelectorAll('svg path')].map(
      (p) => p.getAttribute('d') ?? '',
    )
    const collapsed = paths.some((d) => /M8\s*10L12\s*14L16\s*10/i.test(d))
    const expanded = paths.some((d) => /M16\s*14L12\s*10L8\s*14/i.test(d))
    return collapsed && !expanded
  }

  function clickCollapsedDashboardAccountGroups() {
    const n = RM.clickCollapsedDashboardAccountGroups()
    if (n > 0 && crawling) {
      appendCrawlLog('info', '展开 Dashboard Accounts 分组', { expanded: n })
    }
    return n
  }

  function inferDashboardKindHint(rowEl, card) {
    const ordered = [
      ...card.querySelectorAll(
        'div[role="button"][aria-expanded], div[tabindex="0"]',
      ),
    ]
    let kindHint
    for (const el of ordered) {
      if (el === rowEl) return kindHint
      if (el.getAttribute('role') !== 'button') continue
      if (el.getAttribute('aria-expanded') !== 'true') continue
      const label = el.querySelector('label')?.textContent.trim() ?? ''
      kindHint = dashboardGroupKind(label)
    }
    return kindHint
  }

  function parseDashboardAccountRow(rowEl, kindHint) {
    const logo = rowEl.querySelector('img[alt$=" logo" i]')
    if (!logo) return null
    const institution = logo
      .getAttribute('alt')
      .replace(/ logo$/i, '')
      .trim()
    const labels = [...rowEl.querySelectorAll('label')]
      .map((l) => l.textContent.trim())
      .filter(Boolean)
    if (labels.length === 0) return null
    const name = labels[0]
    if (DASHBOARD_GROUP_NAMES.has(name.toLowerCase())) return null
    let balance = null
    for (let i = labels.length - 1; i >= 0; i -= 1) {
      const parsed = parseMoney(labels[i])
      if (parsed != null) {
        balance = parsed
        break
      }
    }
    if (balance == null) {
      for (let i = labels.length - 1; i >= 0; i -= 1) {
        const parsed = parseAbbrevMoney(labels[i])
        if (parsed) {
          balance = parsed.value
          break
        }
      }
    }
    if (!name || balance == null) return null
    return { name, balance, institution, kindHint, approximate: false }
  }

  /** 展开后的逐账户行（全精度；比 Net Worth 缩写余额更准）。 */
  function probeDashboardDetailAccounts() {
    const card = findAccountsCard()
    if (!card) return null
    const hasExpanded = card.querySelector(
      'div[role="button"][aria-expanded="true"]',
    )
    if (!hasExpanded) return null
    const rows = []
    const seen = new Set()
    for (const rowEl of card.querySelectorAll('div[tabindex="0"]')) {
      if (rowEl.getAttribute('role') === 'button') continue
      if (rowEl.closest('div[role="button"][aria-expanded]')) continue
      const logo = rowEl.querySelector('img[alt$=" logo" i]')
      if (!logo || logo.closest('[tabindex="0"]') !== rowEl) continue
      const kindHint = inferDashboardKindHint(rowEl, card)
      const parsed = parseDashboardAccountRow(rowEl, kindHint)
      if (!parsed) continue
      const key = `${parsed.name}|${parsed.institution ?? ''}|${parsed.balance}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(parsed)
    }
    return rows.length > 0 ? rows : null
  }

  function probeDashboardGroupAccounts(card = findAccountsCard()) {
    if (!card) return null
    const rows = []
    for (const rowEl of card.querySelectorAll('div[role="button"]')) {
      const labels = rowEl.querySelectorAll('label')
      if (labels.length < 2) continue
      const name = labels[0].textContent.trim()
      const balance = parseMoney(labels[labels.length - 1].textContent)
      if (!name || balance == null) continue
      const key = name.toLowerCase()
      if (key === 'net cash') continue
      rows.push({ name, balance, kindHint: dashboardGroupKind(name) })
    }
    return rows.length > 0 ? rows : null
  }

  function probeAccounts() {
    return RM.probeDashboardAccounts()
  }

  function accountRowLikelySame(a, b) {
    const an = String(a?.name ?? '')
      .trim()
      .toLowerCase()
    const bn = String(b?.name ?? '')
      .trim()
      .toLowerCase()
    if (!an || !bn) return false
    if (an === bn || an.includes(bn) || bn.includes(an)) return true
    const ai = String(a?.institution ?? '')
      .trim()
      .toLowerCase()
    const bi = String(b?.institution ?? '')
      .trim()
      .toLowerCase()
    if (ai && bi && (ai === bi || an.includes(bi) || bn.includes(ai)))
      return true
    return false
  }

  function filterNetWorthAgainstDashboardDetails(nwRows, detailRows) {
    if (!detailRows?.length) return { rows: nwRows, skipped: 0 }
    const out = []
    let skipped = 0
    for (const row of nwRows) {
      if (detailRows.some((d) => accountRowLikelySame(row, d))) skipped += 1
      else out.push(row)
    }
    return { rows: out, skipped }
  }

  async function waitForDashboardAccounts() {
    const start = Date.now()
    let expanded = 0
    while (Date.now() - start < PAGE_PROBE_TIMEOUT_MS) {
      expanded += clickCollapsedDashboardAccountGroups()
      const details = RM.probeDashboardDetailAccounts()
      if (details) return { rows: details, expanded, mode: 'detail' }
      const card = findAccountsCard()
      const collapsedGroups = card
        ? [
            ...card.querySelectorAll(
              'div[role="button"][aria-expanded="false"]',
            ),
          ].filter((el) => {
            const label =
              el.querySelector('label')?.textContent.trim().toLowerCase() ?? ''
            return DASHBOARD_GROUP_NAMES.has(label)
          })
        : []
      if (collapsedGroups.length === 0) {
        const groups = RM.probeDashboardGroupAccounts()
        if (groups) return { rows: groups, expanded, mode: 'group' }
      }
      await sleep(expanded > 0 ? 700 : 350)
    }
    const details = probeDashboardDetailAccounts()
    const groups = probeDashboardGroupAccounts()
    return {
      rows: details ?? groups,
      expanded,
      mode: details ? 'detail' : groups ? 'group' : 'none',
    }
  }

  // ---------- Net Worth：逐账户余额 ----------

  // 分组标题 → financeOS 类型提示。Investments 组混着 401k/券商/HSA，不给类型提示，
  // 靠账户名 + 机构名匹配。
  const NW_GROUP_KIND = [
    [/^credit cards/i, 'credit'],
    [/^savings/i, 'savings'],
    [/^cash/i, 'checking'],
    [/^auto loans/i, 'auto-loan'],
    [/^mortgages/i, 'mortgage'],
    [/^investments|^assets with loans|^other/i, undefined],
  ]

  /**
   * 扫描页面上所有 role="row"（文档序）：碰到分组标题行（"Investments" + "% of assets/debts"）
   * 更新当前分组；碰到账户行（机构 logo + 名称 + 机构 + 缩写余额）归入当前分组。
   */
  function probeNetWorthAccounts() {
    return RM.probeNetWorthAccounts()
  }

  // ---------- Recurring：订阅 / 账单 ----------

  /** "in 24 days" / "2 days ago" / "in 1 month" → ISO 日期（尽力而为，解析不了返回 undefined）。 */
  function dueTextToISO(text) {
    const t = String(text ?? '')
      .trim()
      .toLowerCase()
    let m = t.match(/^in (\d+) days?$/)
    let offsetDays = null
    if (m) offsetDays = Number(m[1])
    else if ((m = t.match(/^(\d+) days? ago$/))) offsetDays = -Number(m[1])
    else if (t === 'today') offsetDays = 0
    else if (t === 'tomorrow') offsetDays = 1
    if (offsetDays == null) {
      m = t.match(/^in (\d+) months?$/)
      if (m) offsetDays = Number(m[1]) * 30
      else if ((m = t.match(/^(\d+) months? ago$/)))
        offsetDays = -Number(m[1]) * 30
    }
    if (offsetDays == null) return undefined
    const d = new Date(`${todayISO()}T00:00:00`)
    d.setDate(d.getDate() + offsetDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function parseRecurringRow(rowEl, group) {
    const labels = [...rowEl.querySelectorAll('label')].map((l) =>
      l.textContent.trim(),
    )
    if (labels.length < 3) return null
    const name = labels[0]
    const frequency = labels[1] ?? ''
    let amount = null
    for (let i = labels.length - 1; i >= 0; i--) {
      const v = parseMoney(labels[i])
      if (v != null && labels[i].includes('$')) {
        amount = Math.abs(v)
        break
      }
    }
    if (!name || amount == null) return null
    const account = labels.find((t) => t.startsWith('••'))
    const dueText = labels.find((t) =>
      /^in \d+|days? ago$|months? ago$|^today$|^tomorrow$/i.test(t),
    )
    // 平台 ID：行内 kebab 菜单 aria-controls="recurring-list-<base64 id>"。
    // （行外层的 <a href="/recurring/detail?id=…"> 是嵌套 <a>，HTML 解析后不一定是祖先，不可靠。）
    const menu = rowEl.querySelector("[aria-controls^='recurring-list-']")
    const controls = menu?.getAttribute('aria-controls')
    const platformId = controls
      ? controls.replace(/^recurring-list-/, '')
      : undefined
    return {
      name,
      frequency,
      group,
      amount,
      account,
      nextDate: dueTextToISO(dueText),
      platformId,
    }
  }

  function probeRecurring() {
    return RM.probeRecurring()
  }

  function parseTxnRow(rowEl) {
    return RM.parseTxnRow(rowEl)
  }

  function probeTransactions() {
    return RM.probeTransactions()
  }

  // ---------- 主动爬取 ----------

  let crawling = false
  let crawlMeta = null
  let crawlLogEntries = []
  let crawlRunStats = null
  let logFlushTimer = null
  let logWrite = Promise.resolve()
  const CRAWL_LOG_KEY = 'fos_crawl_log'
  const CRAWL_PERF_KEY = 'fos_crawl_perf'
  const PERF_RECENT_RUNS_MAX = 20
  const NAV_TIMEOUT_MS = 10000
  const PAGE_PROBE_TIMEOUT_MS = 8000
  const TXN_PROBE_TIMEOUT_MS = 10000
  const TXN_SCROLL_TIMEOUT_MS = 320
  const TXN_SCROLL_SETTLE_MS = 70
  const TXN_SCROLL_FRAME_FALLBACK_MS = 90
  const TXN_LOAD_MORE_TIMEOUT_MS = 3000
  const TXN_LOAD_MORE_SETTLE_MS = 160
  // 无限滚动追加下一批要走网络：实测 1–3 秒，取 5 秒留余量。这个等待是
  // 「到底」判定的唯一依据，宁可慢也不能早退——早退会被当成「历史抓完了」。
  const TXN_INFINITE_TIMEOUT_MS = 5000
  const CRAWL_PHASE_PROGRESS = {
    starting: 2,
    dashboard: 12,
    networth: 32,
    recurring: 52,
    transactions: 70,
    done: 100,
    error: 100,
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  /** 轮询 probe 直到返回真值或超时。 */
  async function waitFor(probe, maxMs, intervalMs = 250) {
    const start = Date.now()
    while (Date.now() - start < maxMs) {
      try {
        const r = probe()
        if (r) return r
      } catch {
        /* 渲染中途容错 */
      }
      await sleep(intervalMs)
    }
    return null
  }

  function clampProgress(value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return undefined
    return Math.max(0, Math.min(100, Math.round(n)))
  }

  async function startCrawlMeta() {
    const now = Date.now()
    crawlLogEntries = []
    clearTimeout(logFlushTimer)
    logFlushTimer = null
    crawlMeta = {
      runId: `rm_${now}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: now,
      phase: null,
      phaseStartedAt: now,
    }
    crawlRunStats = {
      v: 1,
      source: 'rocketmoney',
      runId: crawlMeta.runId,
      startedAt: new Date(now).toISOString(),
      startedAtMs: now,
      phases: {},
      routeTimeouts: [],
      probeTimeouts: [],
      transactionScroll: null,
    }
    await chrome.storage.local.set({
      [CRAWL_LOG_KEY]: {
        v: 1,
        source: 'rocketmoney',
        runId: crawlMeta.runId,
        startedAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        entries: [],
      },
    })
  }

  function finishCurrentPerfPhase(now = Date.now()) {
    if (!crawlRunStats || !crawlMeta?.phase || !crawlMeta.phaseStartedAt) return
    const phase = crawlMeta.phase
    const prev = crawlRunStats.phases[phase] ?? { durationMs: 0, visits: 0 }
    crawlRunStats.phases[phase] = {
      ...prev,
      durationMs: prev.durationMs + Math.max(0, now - crawlMeta.phaseStartedAt),
      visits: prev.visits + 1,
    }
  }

  function recordProbeTimeout(phase, timeoutMs) {
    if (!crawlRunStats) return
    crawlRunStats.probeTimeouts.push({
      phase,
      timeoutMs,
      path: location.pathname,
      atMs: Date.now() - crawlRunStats.startedAtMs,
    })
    appendCrawlLog('warn', `DOM 探测超时：${phase}`, {
      code: 'PROBE_TIMEOUT',
      phase,
      timeoutMs,
      path: location.pathname,
    })
  }

  function recordRouteTimeout(path, timeoutMs) {
    if (!crawlRunStats) return
    crawlRunStats.routeTimeouts.push({
      path,
      timeoutMs,
      currentPath: location.pathname,
      atMs: Date.now() - crawlRunStats.startedAtMs,
    })
    appendCrawlLog('warn', `路由跳转超时：${path}`, {
      code: 'ROUTE_TIMEOUT',
      path,
      timeoutMs,
      currentPath: location.pathname,
    })
  }

  async function finalizeCrawlPerf(status, summary) {
    if (!crawlRunStats || !crawlMeta) return
    finishCurrentPerfPhase()
    const finishedAtMs = Date.now()
    const run = {
      ...crawlRunStats,
      status,
      summary,
      finishedAt: new Date(finishedAtMs).toISOString(),
      totalMs: finishedAtMs - crawlRunStats.startedAtMs,
    }
    const obj = await chrome.storage.local.get(CRAWL_PERF_KEY)
    const prev = obj[CRAWL_PERF_KEY]?.v === 1 ? obj[CRAWL_PERF_KEY] : null
    const recentRuns = [...(prev?.recentRuns ?? []), run].slice(
      -PERF_RECENT_RUNS_MAX,
    )
    const phaseTotals = {}
    for (const recent of recentRuns) {
      for (const [phase, data] of Object.entries(recent.phases ?? {})) {
        if (!phaseTotals[phase]) phaseTotals[phase] = { totalMs: 0, count: 0 }
        phaseTotals[phase].totalMs += data.durationMs ?? 0
        phaseTotals[phase].count += 1
      }
    }
    const phaseAverages = {}
    for (const [phase, data] of Object.entries(phaseTotals)) {
      phaseAverages[phase] = {
        avgMs: Math.round(data.totalMs / data.count),
        samples: data.count,
      }
    }
    await chrome.storage.local.set({
      [CRAWL_PERF_KEY]: {
        v: 1,
        source: 'rocketmoney',
        updatedAt: run.finishedAt,
        lastRun: run,
        recentRuns,
        phaseAverages,
      },
    })
  }

  function flushCrawlLog() {
    clearTimeout(logFlushTimer)
    logFlushTimer = null
    const entries = crawlLogEntries.slice(-300)
    logWrite = logWrite
      .then(() =>
        chrome.storage.local.set({
          [CRAWL_LOG_KEY]: {
            v: 1,
            source: 'rocketmoney',
            runId: crawlMeta?.runId,
            startedAt: new Date(
              crawlMeta?.startedAt ?? Date.now(),
            ).toISOString(),
            updatedAt:
              entries[entries.length - 1]?.at ?? new Date().toISOString(),
            entries,
          },
        }),
      )
      .catch((e) => console.debug('[FOS] 写入爬取日志失败', e))
    return logWrite
  }

  function scheduleCrawlLogFlush() {
    if (logFlushTimer != null) return
    logFlushTimer = setTimeout(() => {
      void flushCrawlLog()
    }, 700)
  }

  function appendCrawlLog(level, message, extra) {
    if (!crawling) return
    crawlLogEntries.push({
      at: new Date().toISOString(),
      elapsedMs: crawlMeta ? Date.now() - crawlMeta.startedAt : 0,
      phase: crawlMeta?.phase ?? 'starting',
      level,
      message,
      url: location.href,
      extra,
    })
    if (crawlLogEntries.length > 300)
      crawlLogEntries = crawlLogEntries.slice(-300)
    scheduleCrawlLogFlush()
  }

  function setCrawlState(phase, detail, options = {}) {
    const now = Date.now()
    if (!crawlMeta) {
      crawlMeta = {
        runId: `rm_${now}_${Math.random().toString(36).slice(2, 8)}`,
        startedAt: now,
        phase: null,
        phaseStartedAt: now,
      }
    }
    if (crawlMeta.phase !== phase) {
      finishCurrentPerfPhase(now)
      crawlMeta.phase = phase
      crawlMeta.phaseStartedAt = now
    }
    const progress =
      clampProgress(options.progress) ??
      CRAWL_PHASE_PROGRESS[phase] ??
      CRAWL_PHASE_PROGRESS.starting
    void chrome.storage.local.set({
      fos_crawl_state: {
        v: 1,
        source: 'rocketmoney',
        phase,
        detail,
        at: now,
        startedAt: crawlMeta.startedAt,
        phaseStartedAt: crawlMeta.phaseStartedAt,
        progress,
        runId: crawlMeta.runId,
        url: location.href,
        stats: options.stats,
      },
    })
    if (options.log !== false) {
      const extra =
        options.stats && typeof options.stats === 'object'
          ? { ...options.stats }
          : options.stats != null
            ? { stats: options.stats }
            : {}
      if (options.level === 'warn' && !extra.code)
        extra.code = 'CRAWL_PHASE_WARN'
      if (options.level === 'error' && !extra.code)
        extra.code = 'CRAWL_STATE_ERROR'
      extra.phase = phase
      appendCrawlLog(options.level ?? 'info', detail, extra)
    }
  }

  function isRouteMatch(path) {
    if (path === '/dashboard')
      return (
        location.pathname === '/' || location.pathname.startsWith('/dashboard')
      )
    return location.pathname.startsWith(path)
  }

  function clickCollapsedNetWorthGroupRows() {
    const n = RM.clickCollapsedNetWorthGroupRows()
    if (n > 0 && crawling) {
      appendCrawlLog('info', '展开 Net Worth 分组行', { expanded: n })
    }
    return n
  }

  async function waitForNetWorthAccounts() {
    const start = Date.now()
    let expanded = 0
    while (Date.now() - start < PAGE_PROBE_TIMEOUT_MS) {
      expanded += clickCollapsedNetWorthGroupRows()
      const rows = probeNetWorthAccounts()
      if (rows) return { rows, expanded }
      await sleep(expanded > 0 ? 700 : 350)
    }
    return { rows: null, expanded }
  }

  /** SPA 内跳转：优先点侧栏（保持登录态与已加载数据），退回改 URL。 */
  async function gotoPath(path, sidebarTestId) {
    if (isRouteMatch(path)) return true
    const link = document.querySelector(`[data-testid="${sidebarTestId}"]`)
    if (link) {
      appendCrawlLog('info', `点击侧栏进入 ${path}`, { sidebarTestId })
      link.click()
    } else {
      appendCrawlLog('info', `侧栏入口不存在，直接跳转 ${path}`, {
        sidebarTestId,
      })
      location.assign(`${location.origin}${path}`)
    }
    const ok = await waitForRoute(() => isRouteMatch(path), NAV_TIMEOUT_MS)
    if (!ok) recordRouteTimeout(path, NAV_TIMEOUT_MS)
    appendCrawlLog(
      ok ? 'info' : 'warn',
      ok ? `已进入 ${path}` : `进入 ${path} 超时`,
      {
        path,
        sidebarTestId,
        currentPath: location.pathname,
      },
    )
    return ok
  }

  const CRAWL_MAX_ROWS = 600
  const CRAWL_MAX_STEPS = 90
  /**
   * 找到交易表的滚动容器，多级兜底：
   * 1. 虚拟列表的 inner div（overflowY auto/scroll 且内容超高）
   * 2. RocketMoney 的页面级滚动容器 #scrollable-content
   * 3. document.scrollingElement（整页滚动布局）
   */
  function findTxnScroller() {
    const container = document.querySelector(
      '[data-testid="transactions-page-list-container"]',
    )
    if (container) {
      for (const el of container.querySelectorAll('div')) {
        if (el.scrollHeight > el.clientHeight + 100) {
          const oy = getComputedStyle(el).overflowY
          if (oy === 'auto' || oy === 'scroll') return el
        }
      }
    }
    const pageScroller = document.getElementById('scrollable-content')
    if (
      pageScroller &&
      pageScroller.scrollHeight > pageScroller.clientHeight + 100
    ) {
      return pageScroller
    }
    const root = document.scrollingElement
    if (root && root.scrollHeight > root.clientHeight + 100) return root
    return null
  }

  /** 表格底部的「Load More」分页按钮（列表加载完一页后出现，点击拉取下一批）。 */
  function findLoadMoreButton() {
    for (const btn of document.querySelectorAll('button')) {
      const label = btn.textContent.trim()
      // 「See More」也算：Rocket Money 的文案不是 Load More，只认后者等于永远
      // 找不到按钮。
      if (!/^(load|see|show)\s*more$/i.test(label) || btn.disabled) continue
      // 但要跳过 0x0 的隐形按钮：RM 的交易表里就挂着一个 aria-label="See More"
      // 的零尺寸按钮，点它不会加载任何东西（实测 scrollHeight 纹丝不动）。
      const r = btn.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      return btn
    }
    return null
  }

  function waitForScrollRender(target, action) {
    return new Promise((resolve) => {
      let settled = false
      let settleTimer = null
      let fallbackTimer = null
      const finish = () => {
        if (settled) return
        settled = true
        observer.disconnect()
        clearTimeout(settleTimer)
        clearTimeout(fallbackTimer)
        clearTimeout(hardTimer)
        resolve()
      }
      const observer = new MutationObserver(() => {
        clearTimeout(settleTimer)
        settleTimer = setTimeout(finish, TXN_SCROLL_SETTLE_MS)
      })
      observer.observe(target, { childList: true, subtree: true })
      const hardTimer = setTimeout(finish, TXN_SCROLL_TIMEOUT_MS)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fallbackTimer = setTimeout(finish, TXN_SCROLL_FRAME_FALLBACK_MS)
        })
      })
      action()
    })
  }

  /**
   * 自动滚动虚拟表格并累积解析到的行。
   * 分页机制（2026-07 实测）：一页约 170 行虚拟渲染，滚到底后出现「Load More」按钮，
   * 点击加载下一批——所以到底时先找按钮点掉再继续滚。
   * 停止条件：滚到 watermark 之前（已同步过）/ 到底且无 Load More / 连续 3 步无新行 / 达到上限。
   *
   * 返回 { rows, complete }：complete=true 表示「从最新一直收集到 watermark 或列表底部」，
   * 中间没有空洞——只有这种情况 background 才允许推进水位线；
   * 因达到行数/步数上限而中断的爬取（以及被动抓取）不推进，避免留下永远不会被补的日期空洞。
   */
  async function scrollAndCollect(stopBefore) {
    const scrollStartedAt = performance.now()
    const collected = new Map()
    let complete = false
    let stopReason = 'unknown'
    let stepsTaken = 0
    let loadMoreClicks = 0
    let lastAdded = 0
    const addVisibleRows = () => {
      let added = 0
      for (const rowEl of document.querySelectorAll(
        '[data-testid="transaction-table-row"]',
      )) {
        const r = parseTxnRow(rowEl)
        if (!r) continue
        const key = r.platformId ?? `${r.date}|${r.merchant}|${r.amount}`
        if (!collected.has(key)) {
          collected.set(key, r)
          added += 1
        }
      }
      return added
    }
    addVisibleRows()
    const scroller = findTxnScroller()
    if (!scroller) {
      console.warn('[FOS] 未找到交易表滚动容器，只抓取当前可见行。')
      appendCrawlLog('warn', '未找到交易表滚动容器，只抓取当前可见行', {
        visibleRows: collected.size,
      })
      if (crawlRunStats) {
        crawlRunStats.transactionScroll = {
          durationMs: Math.round(performance.now() - scrollStartedAt),
          rows: collected.size,
          complete: false,
          stopReason: 'no-scroller',
          steps: 0,
          loadMoreClicks: 0,
        }
      }
      return { rows: [...collected.values()], complete: false }
    }
    // 必须从列表顶部开始：收集是「从当前位置往下」的单向扫描，如果页面停在
    // 中间（用户刚浏览过），视口上方的行会被整段跳过——而停止条件（滚过
    // stopBefore）照样满足，complete=true 推进水位线，漏掉的段落从此不会再补。
    // 实测漏过 6/13–6/23 共 14+ 笔，包括一笔 $319 的 Best Buy。
    if (scroller.scrollTop > 0) {
      appendCrawlLog('info', '列表不在顶部，先回到顶部再开始收集', {
        scrollTop: scroller.scrollTop,
      })
      await waitForScrollRender(scroller, () => {
        scroller.scrollTop = 0
      })
      await sleep(250)
      collected.clear()
      addVisibleRows()
    }
    appendCrawlLog('info', '找到交易表滚动容器，开始滚动收集', {
      initialRows: collected.size,
      stopBefore,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    })
    let idleSteps = 0
    for (
      let step = 0;
      step < CRAWL_MAX_STEPS && collected.size < CRAWL_MAX_ROWS;
      step++
    ) {
      stepsTaken = step + 1
      if (stopBefore) {
        let oldest = null
        for (const r of collected.values()) {
          if (oldest == null || r.date < oldest) oldest = r.date
        }
        if (oldest != null && oldest < stopBefore) {
          complete = true // 已滚过停止点，watermark 之后的行无空洞
          stopReason = 'watermark'
          appendCrawlLog('info', '交易滚动已越过停止点', {
            oldest,
            stopBefore,
            rows: collected.size,
          })
          break
        }
      }
      const before = scroller.scrollTop
      // 先挂 MutationObserver 再滚动，避免虚拟列表同步渲染时漏掉 mutation。
      await waitForScrollRender(scroller, () => {
        scroller.scrollTop = before + scroller.clientHeight * 0.95
      })
      let added = addVisibleRows()
      if (added === 0 && scroller.scrollTop !== before) {
        await sleep(180)
        added = addVisibleRows()
      }
      lastAdded = added
      const progress =
        70 + Math.min(25, Math.round((step / CRAWL_MAX_STEPS) * 25))
      setCrawlState('transactions', `已收集 ${collected.size} 笔交易…`, {
        progress,
        stats: {
          rows: collected.size,
          step: step + 1,
          maxSteps: CRAWL_MAX_STEPS,
          added,
        },
        log: added > 0 || step % 10 === 0,
      })
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
      if (added === 0 && (atBottom || scroller.scrollTop === before)) {
        // 到底了：先看有没有「Load More」分页按钮，点掉继续。
        const loadMore = findLoadMoreButton()
        if (loadMore) {
          loadMoreClicks += 1
          setCrawlState(
            'transactions',
            `已收集 ${collected.size} 笔，加载下一页…`,
            {
              progress,
              stats: {
                rows: collected.size,
                step: step + 1,
                maxSteps: CRAWL_MAX_STEPS,
              },
            },
          )
          if (!clickOptional(loadMore)) {
            appendCrawlLog('warn', 'Load More 按钮存在但点击失败', {
              rows: collected.size,
            })
          }
          // 下一批走网络请求，等待放宽；比普通滚动慢，但避免无谓等满 5 秒。
          await waitForMutationOrTimeout(
            scroller,
            TXN_LOAD_MORE_TIMEOUT_MS,
            TXN_LOAD_MORE_SETTLE_MS,
          )
          addVisibleRows()
          idleSteps = 0
          continue
        }
        // Rocket Money 没有分页按钮，滚到底是异步追加下一批（页面上转 spinner）。
        // 加载中的状态和「真的到底了」在 DOM 上一模一样：没有新行、scrollTop 也
        // 不再变。唯一的区别是再等一会儿 scrollHeight 会长高。
        //
        // 之前 3 个 idle step（不到 1 秒）就断言 complete=true，而这一批实测要
        // 1–3 秒才到 —— 于是「还在加载」被当成「历史抓完了」，水位线照常推进，
        // 中间整段（实测 6/14–6/23，14+ 笔含一笔 $319 Best Buy）永久丢失。
        const shBeforeWait = scroller.scrollHeight
        await waitForMutationOrTimeout(
          scroller,
          TXN_INFINITE_TIMEOUT_MS,
          TXN_LOAD_MORE_SETTLE_MS,
        )
        const grew = scroller.scrollHeight > shBeforeWait
        const lateRows = addVisibleRows()
        if (grew || lateRows > 0) {
          appendCrawlLog('info', '无限滚动追加了下一批，继续收集', {
            rows: collected.size,
            added: lateRows,
            grewBy: scroller.scrollHeight - shBeforeWait,
          })
          idleSteps = 0
          continue
        }
        idleSteps += 1
        if (idleSteps >= 3) {
          complete = true // 真正到底：等过网络仍无新数据，整个历史都收集到了
          stopReason = 'bottom'
          appendCrawlLog('info', '交易列表已到底', {
            rows: collected.size,
            step: step + 1,
          })
          break
        }
      } else {
        idleSteps = 0
      }
    }
    if (!complete && collected.size >= CRAWL_MAX_ROWS) {
      stopReason = 'max-rows'
      appendCrawlLog('warn', '达到交易行数上限，提前停止', {
        rows: collected.size,
        maxRows: CRAWL_MAX_ROWS,
      })
    } else if (!complete) {
      stopReason = 'max-steps'
      appendCrawlLog('warn', '达到交易滚动步数上限，提前停止', {
        rows: collected.size,
        maxSteps: CRAWL_MAX_STEPS,
      })
    }
    const durationMs = Math.round(performance.now() - scrollStartedAt)
    if (crawlRunStats) {
      crawlRunStats.transactionScroll = {
        durationMs,
        rows: collected.size,
        rowsPerSecond:
          durationMs > 0
            ? Math.round((collected.size / durationMs) * 100000) / 100
            : 0,
        complete,
        stopReason,
        steps: stepsTaken,
        maxSteps: CRAWL_MAX_STEPS,
        loadMoreClicks,
        lastAdded,
        stopBefore,
      }
    }
    return {
      rows: [...collected.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
      complete,
    }
  }

  async function startCrawl() {
    if (crawling) return
    await startCrawlMeta()
    if (!plan) {
      setCrawlState('error', '扩展脚本不完整，请重新加载扩展', {
        level: 'error',
      })
      return
    }
    crawling = true
    let skippedAccounts = 0
    let skippedRecurring = 0
    let skippedTxns = 0
    let acctNeed = 0
    let recurNeed = 0
    let dashboardAccounts = null
    let dashboardFallbackQueued = false
    let dashboardDetailQueued = false
    let dashboardSuppressed = 0
    let netWorthFound = 0
    let netWorthNeed = 0
    let netWorthSkipped = 0
    let netWorthExpanded = 0
    try {
      setCrawlState('starting', '读取 Finance OS 快照与抓取计划…', {
        progress: 3,
      })
      const snap = await loadAppSnapshot()
      if (snap) {
        if (snap.privacyRedacted) {
          console.info(
            `[FOS] 抓取计划：Finance OS ${snap.txnCount} 笔交易，隐私模式下快照已最小化`,
          )
          appendCrawlLog('info', '读取到 Finance OS 快照（隐私模式）', {
            txnCount: snap.txnCount,
          })
        } else {
          console.info(
            `[FOS] 抓取计划：Finance OS ${snap.txnCount} 笔交易，` +
              `${snap.accounts.length} 账户，${snap.cashFlows.length} 订阅/账单`,
          )
          appendCrawlLog('info', '读取到 Finance OS 快照', {
            txnCount: snap.txnCount,
            accountCount: snap.accounts.length,
            cashFlowCount: snap.cashFlows.length,
          })
        }
      } else {
        console.info(
          '[FOS] 尚无 Finance OS 快照：打开 Finance OS 后可跳过已同步数据',
        )
        appendCrawlLog('warn', '尚无 Finance OS 快照，无法预先跳过已同步数据')
      }

      // 1) Dashboard：账户余额
      setCrawlState('dashboard', '进入 Dashboard，等待 Accounts 卡片…', {
        progress: 10,
      })
      const dashboardOk = await gotoPath('/dashboard', 'sidebar-Dashboard')
      if (!dashboardOk)
        appendCrawlLog('warn', 'Dashboard 跳转失败，继续尝试读取当前页面')
      const {
        rows: accounts,
        expanded: dashboardExpanded,
        mode: dashboardMode,
      } = await waitForDashboardAccounts()
      if (accounts?.length) {
        const filtered = plan.filterAccountRows(accounts, snap)
        dashboardAccounts = {
          found: accounts.length,
          rows: filtered.rows,
          need: filtered.rows.length,
          skipped: filtered.skipped,
          mode: dashboardMode,
          expanded: dashboardExpanded,
        }
        if (dashboardMode === 'detail' && filtered.rows.length > 0) {
          await enqueue(
            makeEnvelope('rocketmoney', 'accounts', {
              accounts: filtered.rows,
            }),
          )
          dashboardDetailQueued = true
          acctNeed += filtered.rows.length
          skippedAccounts += filtered.skipped
        }
        setCrawlState(
          'dashboard',
          'Dashboard 余额已读取，等待 Net Worth 精细账户确认…',
          {
            progress: 25,
            stats: {
              found: dashboardAccounts.found,
              need: dashboardAccounts.need,
              skipped: dashboardAccounts.skipped,
              deferred: dashboardAccounts.need,
              mode: dashboardMode,
              expanded: dashboardExpanded,
            },
          },
        )
        console.info(
          `[FOS] 爬取：Dashboard ${dashboardMode === 'detail' ? '逐账户' : '分组'} ` +
            `${filtered.rows.length} 条，${filtered.skipped} 已一致跳过` +
            (dashboardExpanded ? `（展开 ${dashboardExpanded} 组）` : ''),
        )
      } else {
        recordProbeTimeout('dashboard', PAGE_PROBE_TIMEOUT_MS)
        setCrawlState(
          'dashboard',
          '等待 8 秒后仍未找到 Dashboard Accounts 卡片，已跳过',
          {
            progress: 25,
            level: 'warn',
          },
        )
        console.warn('[FOS] 爬取：Dashboard 账户卡片未出现，跳过余额。')
      }

      // 2) Net Worth：逐账户余额（缩写精度，机构 + 账户名可精确匹配）
      setCrawlState('networth', '进入 Net Worth，等待账户表…', { progress: 30 })
      const netWorthOk = await gotoPath('/net-worth', 'sidebar-NetWorth')
      if (!netWorthOk)
        appendCrawlLog('warn', 'Net Worth 跳转失败，继续尝试读取当前页面')
      const { rows: nwAccounts, expanded: nwExpanded } =
        await waitForNetWorthAccounts()
      netWorthExpanded = nwExpanded
      if (nwAccounts) {
        const filtered = plan.filterAccountRows(nwAccounts, snap)
        netWorthFound = nwAccounts.length
        let nwRows = filtered.rows
        let nwDeduped = 0
        if (
          dashboardAccounts?.mode === 'detail' &&
          dashboardAccounts.rows.length > 0
        ) {
          const deduped = filterNetWorthAgainstDashboardDetails(
            nwRows,
            dashboardAccounts.rows,
          )
          nwRows = deduped.rows
          nwDeduped = deduped.skipped
        }
        netWorthNeed = nwRows.length
        netWorthSkipped = filtered.skipped + nwDeduped
        skippedAccounts += netWorthSkipped
        acctNeed += nwRows.length
        if (nwRows.length > 0) {
          await enqueue(
            makeEnvelope('rocketmoney', 'accounts', { accounts: nwRows }),
          )
        }
        if (dashboardAccounts) {
          if (dashboardDetailQueued) {
            appendCrawlLog(
              'info',
              'Dashboard 逐账户已入队，Net Worth 去重后补充',
              {
                dashboardFound: dashboardAccounts.found,
                dashboardNeed: dashboardAccounts.need,
                netWorthFound,
                netWorthNeed,
                netWorthDeduped: nwDeduped,
              },
            )
          } else {
            dashboardSuppressed = dashboardAccounts.need
            appendCrawlLog('info', 'Net Worth 成功，Dashboard 聚合余额不入队', {
              dashboardFound: dashboardAccounts.found,
              dashboardSuppressed,
              netWorthFound,
              netWorthNeed,
            })
          }
        }
        setCrawlState(
          'networth',
          planDetail(nwRows.length, netWorthSkipped, '账户'),
          {
            progress: 45,
            stats: {
              found: netWorthFound,
              need: netWorthNeed,
              skipped: netWorthSkipped,
              expanded: netWorthExpanded,
              dashboardSuppressed: dashboardDetailQueued
                ? 0
                : dashboardSuppressed,
              dashboardDetailQueued,
              netWorthDeduped: nwDeduped,
            },
          },
        )
        console.info(
          `[FOS] 爬取：Net Worth ${nwRows.length} 个需抓，${netWorthSkipped} 已跳过` +
            (nwDeduped ? `（${nwDeduped} 与 Dashboard 逐账户重复）` : ''),
        )
      } else {
        recordProbeTimeout('networth', PAGE_PROBE_TIMEOUT_MS)
        if (dashboardAccounts && !dashboardDetailQueued) {
          skippedAccounts += dashboardAccounts.skipped
          acctNeed += dashboardAccounts.need
          dashboardFallbackQueued = true
          if (dashboardAccounts.rows.length > 0) {
            await enqueue(
              makeEnvelope('rocketmoney', 'accounts', {
                accounts: dashboardAccounts.rows,
              }),
            )
          }
          appendCrawlLog(
            'warn',
            'Net Worth 未读取成功，已使用 Dashboard 余额兜底',
            {
              dashboardFound: dashboardAccounts.found,
              dashboardNeed: dashboardAccounts.need,
              dashboardSkipped: dashboardAccounts.skipped,
            },
          )
        }
        setCrawlState(
          'networth',
          dashboardFallbackQueued
            ? '等待 8 秒后仍未找到 Net Worth 账户表，已使用 Dashboard 余额兜底'
            : '等待 8 秒后仍未找到 Net Worth 账户表，已跳过',
          {
            progress: 45,
            level: 'warn',
            stats: {
              expanded: netWorthExpanded,
              dashboardFallbackQueued: dashboardFallbackQueued
                ? (dashboardAccounts?.need ?? 0)
                : 0,
            },
          },
        )
        console.warn('[FOS] 爬取：Net Worth 账户表未出现，跳过。')
      }

      // 3) Recurring：订阅 / 账单
      setCrawlState('recurring', '进入 Recurring，等待订阅列表…', {
        progress: 50,
      })
      const recurringOk = await gotoPath('/recurring', 'sidebar-Recurring')
      if (!recurringOk)
        appendCrawlLog('warn', 'Recurring 跳转失败，继续尝试读取当前页面')
      const recurring = await waitFor(probeRecurring, PAGE_PROBE_TIMEOUT_MS)
      if (recurring) {
        const filtered = plan.filterRecurringRows(recurring, snap)
        skippedRecurring = filtered.skipped
        recurNeed = filtered.rows.length
        if (filtered.rows.length > 0) {
          await enqueue(
            makeEnvelope('rocketmoney', 'recurring', { rows: filtered.rows }),
          )
        }
        setCrawlState(
          'recurring',
          planDetail(filtered.rows.length, filtered.skipped, '订阅'),
          {
            progress: 65,
            stats: {
              found: recurring.length,
              need: filtered.rows.length,
              skipped: filtered.skipped,
            },
          },
        )
        console.info(
          `[FOS] 爬取：Recurring ${filtered.rows.length} 项需抓，${filtered.skipped} 已在 app 跳过`,
        )
      } else {
        recordProbeTimeout('recurring', PAGE_PROBE_TIMEOUT_MS)
        setCrawlState(
          'recurring',
          '等待 8 秒后仍未找到 Recurring 列表，已跳过',
          {
            progress: 65,
            level: 'warn',
          },
        )
        console.warn('[FOS] 爬取：Recurring 列表未出现，跳过。')
      }

      // 4) Transactions：滚动收集
      setCrawlState('transactions', '进入 Transactions，等待交易表…', {
        progress: 68,
      })
      const transactionsOk = await gotoPath(
        '/transactions',
        'sidebar-Transactions',
      )
      if (!transactionsOk)
        appendCrawlLog('warn', 'Transactions 跳转失败，继续尝试读取当前页面')
      const initialTxnRows = await waitFor(
        probeTransactions,
        TXN_PROBE_TIMEOUT_MS,
      )
      if (!initialTxnRows) {
        recordProbeTimeout('transactions', TXN_PROBE_TIMEOUT_MS)
        setCrawlState(
          'transactions',
          '等待 10 秒后仍未找到交易表，将尝试滚动当前页面',
          {
            progress: 70,
            level: 'warn',
          },
        )
      }
      const stopBefore = await loadScrollStopBefore()
      setCrawlState('transactions', '开始滚动交易列表…', {
        progress: 70,
        stats: { stopBefore },
      })
      const { rows: rawRows, complete } = await scrollAndCollect(stopBefore)
      const { rows, skippedDuplicate } = plan.filterNewCaptureTxnRows(
        rawRows,
        snap,
        'rocketmoney',
      )
      skippedTxns = skippedDuplicate
      if (rows.length > 0) {
        // complete 标记：只有「从最新无空洞收集到 watermark/底部」的爬取才允许推进水位线。
        await enqueue(
          makeEnvelope('rocketmoney', 'transactions', { rows, complete }),
        )
      }
      const doneMsg =
        `完成：${rows.length} 笔新交易` +
        (skippedTxns ? `（跳过 ${skippedTxns} 笔已有）` : '') +
        ` + ${acctNeed} 项余额` +
        (skippedAccounts ? `（跳过 ${skippedAccounts} 已一致）` : '') +
        ` + ${recurNeed} 项订阅` +
        (skippedRecurring ? `（跳过 ${skippedRecurring} 已有）` : '') +
        '，打开 Finance OS 即写入'
      setCrawlState('done', doneMsg, {
        progress: 100,
        stats: {
          newTransactions: rows.length,
          rawTransactions: rawRows.length,
          skippedTxns,
          acctNeed,
          skippedAccounts,
          dashboardFound: dashboardAccounts?.found ?? 0,
          dashboardNeed: dashboardAccounts?.need ?? 0,
          dashboardSkipped: dashboardAccounts?.skipped ?? 0,
          dashboardQueued: dashboardFallbackQueued
            ? (dashboardAccounts?.need ?? 0)
            : 0,
          dashboardSuppressed,
          netWorthFound,
          netWorthNeed,
          netWorthSkipped,
          netWorthExpanded,
          recurNeed,
          skippedRecurring,
          complete,
        },
      })
      await finalizeCrawlPerf('done', {
        newTransactions: rows.length,
        rawTransactions: rawRows.length,
        skippedTxns,
        acctNeed,
        skippedAccounts,
        dashboardFound: dashboardAccounts?.found ?? 0,
        dashboardNeed: dashboardAccounts?.need ?? 0,
        dashboardSkipped: dashboardAccounts?.skipped ?? 0,
        dashboardQueued: dashboardFallbackQueued
          ? (dashboardAccounts?.need ?? 0)
          : 0,
        dashboardSuppressed,
        netWorthFound,
        netWorthNeed,
        netWorthSkipped,
        netWorthExpanded,
        recurNeed,
        skippedRecurring,
        complete,
      })
      console.info(`[FOS] 爬取 ${doneMsg}`)
    } catch (e) {
      const errMsg = e?.message ?? String(e)
      appendCrawlLog('error', errMsg, {
        code: 'CRAWL_EXCEPTION',
        name: e?.name,
        stack: e?.stack,
      })
      setCrawlState('error', e?.stack ?? errMsg, {
        level: 'error',
        progress: 100,
      })
      await finalizeCrawlPerf('error', {
        message: errMsg,
        stack: e?.stack,
        name: e?.name,
      })
      console.warn('[FOS] 爬取失败', e)
    } finally {
      crawling = false
      await flushCrawlLog()
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'FOS_START_CRAWL') {
      void startCrawl()
      sendResponse({ ok: true, started: true })
    }
    return false
  })

  // 新开标签页触发的爬取：background 设置 pending 标记，本脚本加载后消费。
  void chrome.storage.local
    .get('fos_pending_crawl')
    .then(({ fos_pending_crawl }) => {
      if (fos_pending_crawl === 'rocketmoney') {
        void chrome.storage.local.remove('fos_pending_crawl')
        void startCrawl()
      }
    })

  // ---------- 被动抓取调度 ----------

  let lastAccountsSig = null
  let lastNwSig = null
  let lastRecurringSig = null
  let lastTxnSig = null
  let cancel = null

  function startCapture() {
    if (cancel) cancel()
    const path = location.pathname
    if (/transactions/i.test(path)) {
      cancel = captureWhenStable({
        probe: probeTransactions,
        capture: (rows) => {
          if (crawling || !plan) return // 爬取模式接管，避免入队半途的部分行
          const sig = JSON.stringify(
            rows.map(
              (r) => r.platformId ?? `${r.date}|${r.merchant}|${r.amount}`,
            ),
          )
          if (sig === lastTxnSig) return
          lastTxnSig = sig
          void (async () => {
            const snap = await loadAppSnapshot()
            const { rows: need, skippedDuplicate } =
              plan.filterNewCaptureTxnRows(rows, snap, 'rocketmoney')
            if (need.length === 0) {
              if (skippedDuplicate > 0) {
                console.info(
                  `[FOS] RocketMoney 交易 ${skippedDuplicate} 笔已在 Finance OS，跳过`,
                )
              }
              return
            }
            await enqueue(
              makeEnvelope('rocketmoney', 'transactions', { rows: need }),
            )
            console.info(
              `[FOS] RocketMoney 交易已抓取：${need.length} 笔` +
                (skippedDuplicate ? `（跳过 ${skippedDuplicate} 已有）` : ''),
            )
          })()
        },
      })
    } else if (/net-worth/i.test(path)) {
      cancel = captureWhenStable({
        probe: probeNetWorthAccounts,
        capture: (accounts) => {
          if (crawling || !plan) return
          const sig = JSON.stringify(accounts)
          if (sig === lastNwSig) return
          lastNwSig = sig
          void (async () => {
            const snap = await loadAppSnapshot()
            const { rows: need, skipped } = plan.filterAccountRows(
              accounts,
              snap,
            )
            if (need.length === 0) {
              if (skipped > 0)
                console.info(
                  `[FOS] Net Worth ${skipped} 账户已在 Finance OS，跳过`,
                )
              return
            }
            await enqueue(
              makeEnvelope('rocketmoney', 'accounts', { accounts: need }),
            )
            console.info(
              `[FOS] RocketMoney Net Worth 账户已抓取：${need.length} 个` +
                (skipped ? `（跳过 ${skipped} 已一致）` : ''),
            )
          })()
        },
      })
    } else if (/recurring/i.test(path)) {
      cancel = captureWhenStable({
        probe: probeRecurring,
        capture: (rows) => {
          if (crawling || !plan) return
          const sig = JSON.stringify(rows)
          if (sig === lastRecurringSig) return
          lastRecurringSig = sig
          void (async () => {
            const snap = await loadAppSnapshot()
            const { rows: need, skipped } = plan.filterRecurringRows(rows, snap)
            if (need.length === 0) {
              if (skipped > 0)
                console.info(
                  `[FOS] Recurring ${skipped} 项已在 Finance OS，跳过`,
                )
              return
            }
            await enqueue(
              makeEnvelope('rocketmoney', 'recurring', { rows: need }),
            )
            console.info(
              `[FOS] RocketMoney 订阅已抓取：${need.length} 项` +
                (skipped ? `（跳过 ${skipped} 已有）` : ''),
            )
          })()
        },
      })
    } else {
      let dashboardExpandPass = false
      cancel = captureWhenStable({
        probe: () => {
          if (!dashboardExpandPass) {
            const clicked = clickCollapsedDashboardAccountGroups()
            if (clicked > 0) {
              dashboardExpandPass = true
              return null
            }
            dashboardExpandPass = true
          }
          return probeAccounts()
        },
        capture: (accounts) => {
          if (crawling || !plan) return
          const sig = JSON.stringify(accounts)
          if (sig === lastAccountsSig) return
          lastAccountsSig = sig
          void (async () => {
            const snap = await loadAppSnapshot()
            const { rows: need, skipped } = plan.filterAccountRows(
              accounts,
              snap,
            )
            if (need.length === 0) {
              if (skipped > 0)
                console.info(
                  `[FOS] Dashboard ${skipped} 组余额已在 Finance OS，跳过`,
                )
              return
            }
            await enqueue(
              makeEnvelope('rocketmoney', 'accounts', { accounts: need }),
            )
            const mode = accounts.some((a) => a.institution) ? '逐账户' : '分组'
            console.info(
              `[FOS] RocketMoney 账户余额已抓取：${need.length} ${mode}` +
                (skipped ? `（跳过 ${skipped} 已一致）` : ''),
            )
          })()
        },
      })
    }
  }

  startCapture()
  onUrlChange(() => startCapture())
})()
