/**
 * Rocket Money DOM probes + page interactions — shared by Finance OS Sync and WSD.
 * Self-contained (no FOS dependency) so WSD capture can inject this alone.
 */
;(() => {
  if (window.RM_PROBES) return

  function parseMoney(text) {
    if (!text) return null
    const cleaned = String(text).replace(/[,\s]/g, '')
    const m = cleaned.match(/^([+-]?)\$?([+-]?)([\d.]+)$/)
    if (!m) return null
    const sign = m[1] === '-' || m[2] === '-' ? -1 : 1
    const v = Number(m[3])
    return Number.isFinite(v) ? sign * v : null
  }

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
      value: Math.round((m[1] === '-' ? -1 : 1) * v * mult * 100) / 100,
      approximate: m[3] !== '',
    }
  }

  function monthDayToISO(text, today = new Date()) {
    const m = String(text ?? '')
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
    if (!m) return null
    const month = Number(m[1])
    const day = Number(m[2])
    let year
    if (m[3]) {
      year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    } else {
      year = today.getFullYear()
      const candidate = new Date(year, month - 1, day)
      if (candidate.getTime() > today.getTime() + 86400000) year -= 1
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  function clickLikeUser(el) {
    if (!el) return false
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, view: window }),
      )
    }
    return true
  }

  function clickOptional(el) {
    if (!el || el.disabled) return false
    try {
      return clickLikeUser(el)
    } catch {
      return false
    }
  }

  const GROUP_KIND = {
    checking: 'checking',
    savings: 'savings',
    'card balance': 'credit',
    investments: 'investment',
  }
  const DASHBOARD_GROUP_NAMES = new Set(Object.keys(GROUP_KIND))

  const NW_GROUP_KIND = [
    [/^credit cards/i, 'credit'],
    [/^savings/i, 'savings'],
    [/^cash/i, 'checking'],
    [/^auto loans/i, 'auto-loan'],
    [/^mortgages/i, 'mortgage'],
    [/^investments|^assets with loans|^other/i, undefined],
  ]

  function findAccountsCard() {
    const heads = [...document.querySelectorAll('h6')].filter(
      (h) => h.textContent.trim() === 'Accounts',
    )
    if (!heads.length) return null
    return (
      heads[0].closest('[data-testid="card"]') ??
      heads[0].parentElement?.parentElement
    )
  }

  function isCollapsedChevron(rowEl) {
    const paths = [...rowEl.querySelectorAll('svg path')].map(
      (p) => p.getAttribute('d') ?? '',
    )
    const collapsed = paths.some((d) => /M8\s*10L12\s*14L16\s*10/i.test(d))
    const expanded = paths.some((d) => /M16\s*14L12\s*10L8\s*14/i.test(d))
    return collapsed && !expanded
  }

  function dashboardGroupKind(label) {
    const key = String(label ?? '')
      .trim()
      .toLowerCase()
    if (key === 'investments') return 'investment'
    return GROUP_KIND[key]
  }

  function clickCollapsedDashboardAccountGroups() {
    const card = findAccountsCard()
    if (!card) return 0
    let clicked = 0
    for (const rowEl of card.querySelectorAll(
      'div[role="button"][aria-expanded="false"]',
    )) {
      const label = rowEl.querySelector('label')?.textContent.trim() ?? ''
      if (!DASHBOARD_GROUP_NAMES.has(label.toLowerCase())) continue
      if (!isCollapsedChevron(rowEl)) continue
      if (clickLikeUser(rowEl)) clicked += 1
    }
    return clicked
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

  function probeDashboardDetailAccounts() {
    const card = findAccountsCard()
    if (!card) return null
    const rows = []
    const seen = new Set()
    for (const rowEl of card.querySelectorAll('div[tabindex="0"]')) {
      if (rowEl.getAttribute('role') === 'button') continue
      if (rowEl.closest('div[role="button"][aria-expanded]')) continue
      const logo = rowEl.querySelector('img[alt$=" logo" i]')
      if (!logo || logo.closest('[tabindex="0"]') !== rowEl) continue
      const institution = logo
        .getAttribute('alt')
        .replace(/ logo$/i, '')
        .trim()
      const labels = [...rowEl.querySelectorAll('label')]
        .map((l) => l.textContent.trim())
        .filter(Boolean)
      if (!labels.length) continue
      const name = labels[0]
      if (DASHBOARD_GROUP_NAMES.has(name.toLowerCase())) continue
      let balance = null
      for (let i = labels.length - 1; i >= 0; i--) {
        balance = parseMoney(labels[i])
        if (balance != null) break
      }
      if (balance == null) {
        for (let i = labels.length - 1; i >= 0; i--) {
          const parsed = parseAbbrevMoney(labels[i])
          if (parsed) {
            balance = parsed.value
            break
          }
        }
      }
      if (!name || balance == null) continue
      const key = `${name}|${institution}|${balance}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        name,
        balance,
        institution,
        kindHint: inferDashboardKindHint(rowEl, card),
        approximate: false,
        source: 'dashboard-detail',
      })
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
      if (name.toLowerCase() === 'net cash') continue
      rows.push({
        name,
        balance,
        kindHint: dashboardGroupKind(name),
        source: 'dashboard-group',
      })
    }
    return rows.length > 0 ? rows : null
  }

  function probeDashboardAccounts() {
    return probeDashboardDetailAccounts() ?? probeDashboardGroupAccounts()
  }

  function clickCollapsedNetWorthGroupRows() {
    if (!/net-worth/i.test(location.pathname)) return 0
    const groupLabels =
      /^(assets with loans|investments|savings|cash|credit cards|auto loans|mortgages|other)$/i
    let clicked = 0
    for (const rowEl of document.querySelectorAll(
      '[role="row"][tabindex="0"]',
    )) {
      const labels = [...rowEl.querySelectorAll('label')]
        .map((l) => l.textContent.trim())
        .filter(Boolean)
      const group = labels.find((t) => groupLabels.test(t))
      const pct = labels.find((t) => /% of (assets|debts)/i.test(t))
      if (!group || !pct) continue
      if (!isCollapsedChevron(rowEl)) continue
      const target = rowEl.querySelector('div[role="cell"]:last-child') ?? rowEl
      if (clickLikeUser(target)) clicked += 1
    }
    return clicked
  }

  function probeNetWorthAccounts() {
    if (!/net-worth/i.test(location.pathname)) return null
    const rows = []
    let kindHint
    for (const rowEl of document.querySelectorAll('[role="row"]')) {
      const text = rowEl.textContent
      if (/% of (assets|debts)/i.test(text)) {
        const label = rowEl.querySelector('label')?.textContent.trim() ?? ''
        const hit = NW_GROUP_KIND.find(([re]) => re.test(label))
        kindHint = hit ? hit[1] : undefined
        continue
      }
      const logo = rowEl.querySelector('img[alt$=" logo" i]')
      if (!logo) continue
      const ps = [...rowEl.querySelectorAll('p')]
        .map((p) => p.textContent.trim())
        .filter(Boolean)
      if (!ps.length) continue
      const name = ps[0]
      const institution =
        ps[1] ?? logo.getAttribute('alt').replace(/ logo$/i, '')
      let money = null
      for (
        let i = [...rowEl.querySelectorAll('label')].length - 1;
        i >= 0;
        i--
      ) {
        const t = rowEl.querySelectorAll('label')[i].textContent.trim()
        if (t.includes('%')) continue
        money = parseAbbrevMoney(t)
        if (money) break
      }
      if (!name || !money) continue
      rows.push({
        name,
        balance: money.value,
        approximate: money.approximate,
        institution,
        kindHint,
        source: 'net-worth',
      })
    }
    return rows.length > 0 ? rows : null
  }

  function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

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

  function parseTxnRow(rowEl) {
    const cells = [...rowEl.querySelectorAll('[role="cell"]')]
    if (cells.length < 4) return null
    let date = null
    for (const c of cells) {
      date = monthDayToISO(c.textContent.trim())
      if (date) break
    }
    if (!date) return null
    let amount = null
    let credit = false
    for (let i = cells.length - 1; i >= 0; i--) {
      const t = cells[i].textContent.trim()
      const v = parseMoney(t)
      if (v != null && /\$/.test(t)) {
        amount = Math.abs(v)
        credit = t.trim().startsWith('+')
        break
      }
    }
    if (amount == null) return null
    let nameCell = cells.find((c) =>
      c.textContent.includes('Statement Description'),
    )
    if (!nameCell) {
      const dateIdx = cells.findIndex((c) =>
        monthDayToISO(c.textContent.trim()),
      )
      let best = null
      for (let i = dateIdx + 1; i < cells.length; i++) {
        const text = cells[i].textContent.trim()
        if (text.length < 2 || parseMoney(text) != null) continue
        if (!best || text.length > best.text.length)
          best = { cell: cells[i], text }
      }
      nameCell = best?.cell ?? null
    }
    if (!nameCell) return null
    const lines = []
    const walk = (el) => {
      for (const child of el.children) {
        if (child.children.length === 0) {
          const t = child.textContent.trim()
          if (t) lines.push(t)
        } else walk(child)
      }
    }
    walk(nameCell)
    if (lines.length === 0 && nameCell.textContent.trim())
      lines.push(nameCell.textContent.trim())
    const merchant = (lines[0] ?? '').replace(/\|.*$/, '').trim()
    if (!merchant) return null
    const pending = /pending/i.test(nameCell.textContent)
    const stmtIdx = lines.findIndex((l) => l === 'Statement Description')
    const statement = stmtIdx >= 0 ? lines[stmtIdx + 1] : undefined
    let category = 'Uncategorized'
    const nameIdx = cells.indexOf(nameCell)
    for (let i = nameIdx + 1; i < cells.length; i++) {
      const text = cells[i].textContent.trim()
      if (text && parseMoney(text) == null) {
        category = text
        break
      }
    }
    let account
    for (const c of cells) {
      const text = c.textContent.trim()
      if (!text || parseMoney(text) != null) continue
      const compact = text.replace(/\s+/g, '')
      if (/^••\d{4}$/.test(compact)) {
        account = text.trim()
        break
      }
      const inst = text.match(/^(.+?)\s+[•·]{2}\s*(\d{4})$/)
      if (inst) {
        account = `${inst[1].trim()} ••${inst[2]}`
        break
      }
    }
    const idMatch = rowEl
      .getAttribute('aria-label')
      ?.match(/\(([A-Za-z0-9+/=]+)\)\s*$/)
    return {
      date,
      merchant: merchant.slice(0, 120),
      category,
      amount,
      credit,
      pending,
      statement,
      account,
      platformId: idMatch?.[1],
    }
  }

  function probeTransactions() {
    const rows = [
      ...document.querySelectorAll('[data-testid="transaction-table-row"]'),
    ]
      .map(parseTxnRow)
      .filter(Boolean)
    return rows.length > 0 ? rows : null
  }

  function probeRecurring() {
    if (!/recurring/i.test(location.pathname)) return null
    const rows = []
    for (const section of document.querySelectorAll(
      '[data-testid="subscription-section-card"]',
    )) {
      const header =
        section.querySelector('[data-testid="card-header"] p')?.textContent ??
        ''
      const group = header.replace(/^\d+\s*/, '').trim() || 'Recurring'
      for (const rowEl of section.querySelectorAll(
        '[data-testid="table-row"]',
      )) {
        const labels = [...rowEl.querySelectorAll('label')].map((l) =>
          l.textContent.trim(),
        )
        if (labels.length < 3) continue
        let amount = null
        for (let i = labels.length - 1; i >= 0; i--) {
          const v = parseMoney(labels[i])
          if (v != null && labels[i].includes('$')) {
            amount = Math.abs(v)
            break
          }
        }
        if (amount == null) continue
        const account = labels.find((t) => t.startsWith('••'))
        const dueText = labels.find((t) =>
          /^in \d+|days? ago$|months? ago$|^today$|^tomorrow$/i.test(t),
        )
        const menu = rowEl.querySelector("[aria-controls^='recurring-list-']")
        rows.push({
          name: labels[0],
          frequency: labels[1],
          group,
          amount,
          account,
          nextDate: dueTextToISO(dueText),
          platformId: menu
            ?.getAttribute('aria-controls')
            ?.replace(/^recurring-list-/, ''),
        })
      }
    }
    return rows.length > 0 ? rows : null
  }

  function detectPageKind() {
    const p = location.pathname
    if (/transactions/i.test(p)) return 'transactions'
    if (/recurring/i.test(p)) return 'recurring'
    if (/net-worth/i.test(p)) return 'net-worth'
    if (p === '/' || /dashboard/i.test(p)) return 'dashboard'
    return 'unknown'
  }

  /** Expand collapsed groups before probe (WSD capture + verify). */
  async function preparePage(kind = detectPageKind()) {
    if (kind === 'dashboard') {
      const n = clickCollapsedDashboardAccountGroups()
      if (n > 0) await sleep(700)
      return { kind, expanded: n }
    }
    if (kind === 'net-worth') {
      const n = clickCollapsedNetWorthGroupRows()
      if (n > 0) await sleep(700)
      return { kind, expanded: n }
    }
    return { kind, expanded: 0 }
  }

  window.RM_PROBES = {
    parseMoney,
    parseAbbrevMoney,
    monthDayToISO,
    clickLikeUser,
    clickOptional,
    findAccountsCard,
    clickCollapsedDashboardAccountGroups,
    clickCollapsedNetWorthGroupRows,
    probeDashboardAccounts,
    probeDashboardDetailAccounts,
    probeDashboardGroupAccounts,
    probeNetWorthAccounts,
    probeRecurring,
    probeTransactions,
    parseTxnRow,
    detectPageKind,
    preparePage,
    sleep,
  }
})()
