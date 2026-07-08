const SOURCE_LABEL = {
  robinhood: 'Robinhood',
  rocketmoney: 'Rocket Money',
  fidelity: 'Fidelity',
}
const KIND_LABEL = {
  holdings: '持仓快照',
  accounts: '账户余额',
  transactions: '交易流水',
  recurring: '订阅账单',
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function summarize(capture) {
  const d = capture.data ?? {}
  if (capture.kind === 'holdings') return `${(d.positions ?? []).length} 只持仓`
  if (capture.kind === 'accounts') return `${(d.accounts ?? []).length} 组余额`
  if (capture.kind === 'transactions') return `${(d.rows ?? []).length} 笔交易`
  if (capture.kind === 'recurring') return `${(d.rows ?? []).length} 项订阅`
  return ''
}

function render(el, items, renderItem, emptyText) {
  el.innerHTML = ''
  if (items.length === 0) {
    const div = document.createElement('div')
    div.className = 'empty'
    div.textContent = emptyText
    el.appendChild(div)
    return
  }
  for (const item of items) el.appendChild(renderItem(item))
}

function itemEl(title, meta, badgeText, done) {
  const div = document.createElement('div')
  div.className = 'item'
  const left = document.createElement('div')
  const t = document.createElement('div')
  t.textContent = title
  const m = document.createElement('div')
  m.className = 'meta'
  m.textContent = meta
  left.append(t, m)
  const badge = document.createElement('span')
  badge.className = done ? 'badge done' : 'badge'
  badge.textContent = badgeText
  div.append(left, badge)
  return div
}

const CRAWL_PHASE_LABEL = {
  starting: '准备抓取…',
  dashboard: '抓取账户余额…',
  networth: '抓取逐账户余额…',
  recurring: '抓取订阅账单…',
  transactions: '滚动收集交易…',
  done: '抓取完成',
  error: '抓取失败',
}

const CRAWL_SLOW_MS = 90 * 1000
const CRAWL_STALE_MS = 30 * 1000
const CRAWL_STATE_TTL_MS = 10 * 60 * 1000
const CRAWL_BUTTON_TEXT = '抓取 Rocket Money（余额 + 订阅 + 交易）'
const CRAWL_BUTTON_PENDING_TEXT = '已有待同步数据，仍要重抓'

function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0 秒'
  const total = Math.floor(ms / 1000)
  const min = Math.floor(total / 60)
  const sec = total % 60
  return min > 0 ? `${min} 分 ${sec} 秒` : `${sec} 秒`
}

function clearNode(el) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

function appendSummaryLine(parent, label, value) {
  if (value === '' || value === null || value === undefined) return
  const row = document.createElement('div')
  row.className = 'crawl-summary-row'
  const key = document.createElement('span')
  key.textContent = label
  const val = document.createElement('strong')
  val.textContent = value
  row.append(key, val)
  parent.appendChild(row)
}

function slowestPhase(perf) {
  const durations = perf?.lastRun?.phaseDurations
  if (!durations || typeof durations !== 'object') return null
  let best = null
  for (const [phase, ms] of Object.entries(durations)) {
    if (!Number.isFinite(ms)) continue
    if (!best || ms > best.ms) best = { phase, ms }
  }
  return best
}

function renderRunSummary(parent, state, perf) {
  if (state.phase !== 'done' && state.phase !== 'error') return
  const stats = state.stats ?? {}
  const summary = document.createElement('div')
  summary.className = 'crawl-summary'
  const netWorthBits = []
  if (Number.isFinite(stats.netWorthFound))
    netWorthBits.push(`发现 ${stats.netWorthFound}`)
  if (Number.isFinite(stats.netWorthNeed))
    netWorthBits.push(`需同步 ${stats.netWorthNeed}`)
  if (Number.isFinite(stats.netWorthSkipped) && stats.netWorthSkipped > 0) {
    netWorthBits.push(`跳过 ${stats.netWorthSkipped}`)
  }
  if (Number.isFinite(stats.netWorthExpanded) && stats.netWorthExpanded > 0) {
    netWorthBits.push(`展开 ${stats.netWorthExpanded}`)
  }
  if (
    Number.isFinite(stats.dashboardSuppressed) &&
    stats.dashboardSuppressed > 0
  ) {
    netWorthBits.push(`已省略 Dashboard ${stats.dashboardSuppressed}`)
  } else if (
    Number.isFinite(stats.dashboardQueued) &&
    stats.dashboardQueued > 0
  ) {
    netWorthBits.push(`Dashboard 兜底 ${stats.dashboardQueued}`)
  }
  appendSummaryLine(summary, '余额', netWorthBits.join(' · '))

  const txnBits = []
  if (Number.isFinite(stats.newTransactions))
    txnBits.push(`新 ${stats.newTransactions}`)
  if (Number.isFinite(stats.skippedTxns) && stats.skippedTxns > 0)
    txnBits.push(`已有 ${stats.skippedTxns}`)
  if (Number.isFinite(stats.rawTransactions))
    txnBits.push(`扫描 ${stats.rawTransactions}`)
  appendSummaryLine(summary, '交易', txnBits.join(' · '))

  const recurBits = []
  if (Number.isFinite(stats.recurNeed))
    recurBits.push(`需同步 ${stats.recurNeed}`)
  if (Number.isFinite(stats.skippedRecurring) && stats.skippedRecurring > 0) {
    recurBits.push(`跳过 ${stats.skippedRecurring}`)
  }
  appendSummaryLine(summary, '订阅', recurBits.join(' · '))

  const lastRun = perf?.lastRun
  const slow = slowestPhase(perf)
  const perfBits = []
  if (Number.isFinite(lastRun?.totalMs))
    perfBits.push(`总耗时 ${fmtDuration(lastRun.totalMs)}`)
  if (slow)
    perfBits.push(
      `最慢 ${CRAWL_PHASE_LABEL[slow.phase] ?? slow.phase} ${fmtDuration(slow.ms)}`,
    )
  appendSummaryLine(summary, '性能', perfBits.join(' · '))

  if (summary.childElementCount > 0) parent.appendChild(summary)
}

async function renderCrawlState(queue = []) {
  const {
    fos_crawl_state: state,
    fos_crawl_log: log,
    fos_crawl_perf: perf,
  } = await chrome.storage.local.get([
    'fos_crawl_state',
    'fos_crawl_log',
    'fos_crawl_perf',
  ])
  const el = document.getElementById('crawl-state')
  const btn = document.getElementById('crawl-rm')
  const logBtn = document.getElementById('download-log')
  // 只显示最近 10 分钟内的状态，避免陈旧信息误导。
  const hasLog = Array.isArray(log?.entries) && log.entries.length > 0
  const hasPerf = perf?.v === 1 && (perf.lastRun || perf.recentRuns?.length > 0)
  const pendingRocket = queue.filter((c) => c?.source === 'rocketmoney').length
  btn.textContent =
    pendingRocket > 0 ? CRAWL_BUTTON_PENDING_TEXT : CRAWL_BUTTON_TEXT
  if (!state || Date.now() - state.at > CRAWL_STATE_TTL_MS) {
    clearNode(el)
    if (pendingRocket > 0) {
      el.style.display = 'block'
      el.className = 'crawl-state'
      const warn = document.createElement('div')
      warn.className = 'crawl-warning compact'
      warn.textContent = `已有 ${pendingRocket} 份 Rocket Money 数据待同步，建议先打开 Finance OS。`
      el.appendChild(warn)
    } else {
      el.style.display = 'none'
    }
    logBtn.style.display = hasLog || hasPerf ? 'inline-flex' : 'none'
    btn.disabled = false
    return
  }
  const now = Date.now()
  const running = state.phase !== 'done' && state.phase !== 'error'
  const elapsedMs = state.startedAt ? now - state.startedAt : 0
  const phaseElapsedMs = state.phaseStartedAt ? now - state.phaseStartedAt : 0
  const staleMs = now - state.at
  const stale = running && staleMs > CRAWL_STALE_MS
  const slow = running && elapsedMs > CRAWL_SLOW_MS
  const progress = Math.max(0, Math.min(100, Number(state.progress) || 0))
  el.style.display = 'block'
  el.className = state.phase === 'error' ? 'crawl-state error' : 'crawl-state'
  // detail 与阶段标签相同（如 dashboard 阶段刚启动）时只显示一份。
  const label = CRAWL_PHASE_LABEL[state.phase] ?? state.phase
  const detail = state.detail && state.detail !== label ? state.detail : ''
  clearNode(el)

  const top = document.createElement('div')
  top.className = 'crawl-topline'
  const title = document.createElement('strong')
  title.textContent = label
  const pct = document.createElement('span')
  pct.textContent = `${progress}%`
  top.append(title, pct)

  const bar = document.createElement('div')
  bar.className = 'progress'
  const fill = document.createElement('div')
  fill.style.width = `${progress}%`
  bar.appendChild(fill)

  const detailEl = document.createElement('div')
  detailEl.className = 'crawl-detail'
  detailEl.textContent = detail || '正在处理…'

  const meta = document.createElement('div')
  meta.className = 'crawl-meta'
  meta.textContent =
    `已用 ${fmtDuration(elapsedMs)} · 本步骤 ${fmtDuration(phaseElapsedMs)} · ` +
    `最近更新 ${fmtDuration(staleMs)} 前`

  el.append(top, bar, detailEl, meta)

  if (stale || slow) {
    const warn = document.createElement('div')
    warn.className = 'crawl-warning'
    warn.textContent = stale
      ? `可能卡在：${detail || label}。最近 ${fmtDuration(staleMs)} 没有进展。`
      : `耗时已超过 ${fmtDuration(CRAWL_SLOW_MS)}，如继续无进展可下载 log 排查。`
    el.appendChild(warn)
  }

  renderRunSummary(el, state, perf)

  if (!running && pendingRocket > 0) {
    const warn = document.createElement('div')
    warn.className = 'crawl-warning'
    warn.textContent = `已有 ${pendingRocket} 份 Rocket Money 数据待同步，重复抓取前建议先打开 Finance OS。`
    el.appendChild(warn)
  }

  logBtn.style.display = hasLog || hasPerf ? 'inline-flex' : 'none'
  btn.disabled = running && !stale
}

function renderRhEnrichState(rhEnrich, rhDetailsCount = 0) {
  const el = document.getElementById('rh-enrich-state')
  const btn = document.getElementById('crawl-rh-details')
  if (!el || !btn) return

  if (
    !rhEnrich?.running &&
    !(rhEnrich?.total > 0) &&
    !rhEnrich?.failures?.length
  ) {
    el.style.display = rhDetailsCount > 0 ? 'block' : 'none'
    el.className = 'crawl-state'
    clearNode(el)
    if (rhDetailsCount > 0) {
      const meta = document.createElement('div')
      meta.className = 'crawl-meta'
      meta.textContent = `已缓存 ${rhDetailsCount} 只 Robinhood 详情（24h 内有效）`
      el.appendChild(meta)
    }
    btn.disabled = false
    return
  }

  el.style.display = 'block'
  el.className =
    rhEnrich.failures?.length && !rhEnrich.running
      ? 'crawl-state error'
      : 'crawl-state'
  clearNode(el)

  const running = rhEnrich.running === true
  const total = Number(rhEnrich.total) || 0
  const done = Number(rhEnrich.done) || 0
  const progress =
    total > 0 ? Math.round((done / total) * 100) : running ? 5 : 100

  const top = document.createElement('div')
  top.className = 'crawl-topline'
  const title = document.createElement('strong')
  title.textContent = running
    ? `补齐 Robinhood 详情 · ${rhEnrich.current ?? '…'}`
    : 'Robinhood 详情补齐完成'
  const pct = document.createElement('span')
  pct.textContent = `${progress}%`
  top.append(title, pct)

  const bar = document.createElement('div')
  bar.className = 'progress'
  const fill = document.createElement('div')
  fill.style.width = `${progress}%`
  bar.appendChild(fill)

  const detailEl = document.createElement('div')
  detailEl.className = 'crawl-detail'
  detailEl.textContent = running
    ? `后台打开个股页 ${done}/${total} · 缓存 ${rhDetailsCount} 只`
    : `完成 ${done}/${total} · 缓存 ${rhDetailsCount} 只`

  el.append(top, bar, detailEl)

  if (Array.isArray(rhEnrich.failures) && rhEnrich.failures.length > 0) {
    const warn = document.createElement('div')
    warn.className = 'crawl-warning compact'
    warn.textContent = `未抓到：${rhEnrich.failures.join(', ')}`
    el.appendChild(warn)
  }

  btn.disabled = running
}

async function renderSyncHealth(lastSync, inFlight, queueLen, dlqLen) {
  const el = document.getElementById('sync-health')
  if (!el) return
  const inflightN = inFlight?.length ?? 0
  const pending = queueLen ?? 0
  const dlq = dlqLen ?? 0
  let cls = 'sync-health ok'
  let headline = '链路正常'
  if (dlq > 0) {
    cls = 'sync-health error'
    headline = `${dlq} 条投递失败，需人工处理`
  } else if (inflightN > 0 || pending > 0) {
    cls = 'sync-health warn'
    headline = inflightN > 0 ? `${inflightN} 条投递中` : `${pending} 条待同步`
  } else if (!lastSync?.at) {
    cls = 'sync-health'
    headline = '等待 Finance OS 页面响应…'
  }
  el.className = cls
  clearNode(el)
  const title = document.createElement('div')
  title.innerHTML = `<strong>${headline}</strong>`
  el.appendChild(title)
  if (lastSync?.at) {
    const row = document.createElement('div')
    row.className = 'sync-health-row'
    const status = lastSync.ok ? '成功' : '部分失败'
    row.innerHTML = `<span>最近写入 ${fmtTime(lastSync.at)}</span><strong>${status} · ${lastSync.processed ?? 0} 条</strong>`
    el.appendChild(row)
    if (Array.isArray(lastSync.summaries) && lastSync.summaries.length > 0) {
      const detail = document.createElement('div')
      detail.className = 'sync-health-row'
      detail.innerHTML = `<span>${lastSync.summaries[0]}</span>`
      el.appendChild(detail)
    }
  }
  if (inflightN > 0) {
    const row = document.createElement('div')
    row.className = 'sync-health-row'
    const maxAttempts = Math.max(...inFlight.map((x) => x.attempts ?? 1))
    row.innerHTML = `<span>投递中</span><strong>${inflightN} 条 · 最多 ${maxAttempts} 次尝试</strong>`
    el.appendChild(row)
    const resetBtn = document.getElementById('release-inflight')
    if (resetBtn) resetBtn.style.display = 'inline-flex'
  } else {
    const resetBtn = document.getElementById('release-inflight')
    if (resetBtn) resetBtn.style.display = 'none'
  }
}

function renderInFlightList(inFlight) {
  const el = document.getElementById('inflight')
  if (!el) return
  if (!inFlight?.length) {
    el.style.display = 'none'
    clearNode(el)
    return
  }
  el.style.display = 'block'
  clearNode(el)
  const heading = document.createElement('div')
  heading.className = 'meta'
  heading.style.margin = '6px 0 4px'
  heading.textContent = '投递中（已发给 Finance OS，等待 ACK）'
  el.appendChild(heading)
  for (const item of inFlight) {
    el.appendChild(
      itemEl(
        item.id.slice(0, 28) + (item.id.length > 28 ? '…' : ''),
        `尝试 ${item.attempts ?? 1} 次 · 发出 ${fmtTime(new Date(item.sentAt).toISOString())}`,
        '投递中',
        false,
      ),
    )
  }
}

async function renderSnapshotPlan(snapshot, txnWatermark) {
  const el = document.getElementById('snapshot-plan')
  if (!snapshot?.exportedAt) {
    el.className = 'plan-box missing'
    el.innerHTML =
      '尚未拉取 Finance OS 快照。<br>先打开 Finance OS 页面，或点下方「更新抓取计划」。'
    return
  }
  el.className = 'plan-box'
  const stop = snapshot.txnFastStopBefore ?? snapshot.txnScrollStopBefore ?? '—'
  const wm = txnWatermark ? `扩展水位 ${txnWatermark}` : '尚无扩展水位'
  if (snapshot.privacyRedacted) {
    el.innerHTML =
      `<div><strong>已同步账本</strong> · 更新于 ${fmtTime(snapshot.exportedAt)}</div>` +
      `<div>${snapshot.txnCount} 笔交易` +
      (snapshot.txnNewestDate ? `（最新 ${snapshot.txnNewestDate}）` : '') +
      ` · 隐私模式已开启</div>` +
      `<div class="meta">交易快速停点 ${stop} · ${wm}</div>` +
      `<div class="meta">抓取计划已最小化，不预先导出余额/订阅/交易键</div>`
    return
  }
  el.innerHTML =
    `<div><strong>已同步账本</strong> · 更新于 ${fmtTime(snapshot.exportedAt)}</div>` +
    `<div>${snapshot.accounts.length} 账户 · ${snapshot.txnCount} 笔交易` +
    (snapshot.txnNewestDate ? `（最新 ${snapshot.txnNewestDate}）` : '') +
    ` · ${snapshot.cashFlows.length} 订阅/账单</div>` +
    `<div class="meta">交易快速停点 ${stop} · ${wm}</div>` +
    `<div class="meta">下次抓取会跳过已在 app 的余额/订阅/交易</div>`
}

async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: 'FOS_STATUS' })
  if (!res?.ok) return
  const queue = res.queue ?? []
  const inFlight = res.inFlight ?? []
  const dlq = res.dlq ?? []
  await renderCrawlState(queue)
  renderRhEnrichState(res.rhEnrich, res.rhDetailsCount ?? 0)
  await renderSnapshotPlan(res.snapshot, res.txnWatermark)
  renderSyncHealth(res.lastSync, inFlight, queue.length, dlq.length)
  renderInFlightList(inFlight)
  render(
    document.getElementById('queue'),
    queue,
    (c) =>
      itemEl(
        `${SOURCE_LABEL[c.source] ?? c.source} · ${KIND_LABEL[c.kind] ?? c.kind}`,
        `${summarize(c)} · 抓取于 ${fmtTime(c.capturedAt)}`,
        '待同步',
        false,
      ),
    '队列为空',
  )
  const dlqSection = document.getElementById('dlq-section')
  if (dlqSection) dlqSection.style.display = dlq.length > 0 ? 'block' : 'none'
  render(
    document.getElementById('dlq'),
    dlq,
    (d) =>
      itemEl(
        `${SOURCE_LABEL[d.source] ?? d.source} · ${KIND_LABEL[d.kind] ?? d.kind}`,
        `${d.reason ?? '投递失败'} · ${fmtTime(d.dlqAt)}`,
        '失败',
        false,
      ),
    '无失败项',
  )
  render(
    document.getElementById('history'),
    [...res.history].reverse(),
    (h) =>
      itemEl(
        `${SOURCE_LABEL[h.source] ?? h.source} · ${KIND_LABEL[h.kind] ?? h.kind}`,
        `同步于 ${fmtTime(h.syncedAt)}`,
        '已同步',
        true,
      ),
    '暂无记录',
  )
}

document.getElementById('crawl-rm').addEventListener('click', async () => {
  const now = Date.now()
  document.getElementById('crawl-rm').disabled = true
  await chrome.storage.local.set({
    fos_crawl_state: {
      v: 1,
      source: 'rocketmoney',
      phase: 'starting',
      detail: '正在启动 Rocket Money 抓取…',
      at: now,
      startedAt: now,
      phaseStartedAt: now,
      progress: 2,
    },
    fos_crawl_log: {
      v: 1,
      source: 'rocketmoney',
      startedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      entries: [],
    },
  })
  await chrome.runtime.sendMessage({ type: 'FOS_CRAWL_ROCKETMONEY' })
  await renderCrawlState()
})

document.getElementById('crawl-rh')?.addEventListener('click', async () => {
  const btn = document.getElementById('crawl-rh')
  if (btn) btn.disabled = true
  const res = await chrome.runtime.sendMessage({
    type: 'FOS_CAPTURE_ROBINHOOD',
  })
  if (btn) btn.disabled = false
  if (res?.pendingReload) {
    // 扩展 content script 未注入（常见于刚重载扩展）— 页面会自动 reload 后抓取
  } else if (res?.ok && res.positions === 0) {
    alert(
      'Robinhood 侧栏尚未加载出持仓。请等页面完全加载后再点一次；若刚重载过扩展，请先刷新本页。',
    )
  } else if (res?.error === 'content_script_unreachable') {
    alert(
      '无法连接 Robinhood 页面脚本。请在 chrome://extensions 重新加载 Finance OS Sync，然后刷新 Robinhood 页再试。',
    )
  }
  await refresh()
})

document
  .getElementById('crawl-rh-details')
  ?.addEventListener('click', async () => {
    const btn = document.getElementById('crawl-rh-details')
    if (btn) btn.disabled = true
    let res = await chrome.runtime.sendMessage({
      type: 'FOS_RH_ENRICH_MANUAL',
    })
    if (!res?.ok && res?.error === 'no_robinhood_holdings') {
      const cap = await chrome.runtime.sendMessage({
        type: 'FOS_CAPTURE_ROBINHOOD',
      })
      if (cap?.pendingReload) {
        await new Promise((r) => setTimeout(r, 8000))
      } else {
        await new Promise((r) => setTimeout(r, 5000))
      }
      res = await chrome.runtime.sendMessage({ type: 'FOS_RH_ENRICH_MANUAL' })
    }
    if (!res?.ok) {
      alert(
        res?.error === 'no_robinhood_holdings'
          ? '仍未抓到 Robinhood 持仓。请先点「打开 Robinhood 抓取持仓」，等侧栏列表加载完再试。'
          : '无法启动详情补齐，请重试。',
      )
      if (btn) btn.disabled = false
      return
    }
    await refresh()
    if (btn) btn.disabled = false
  })

document.getElementById('download-log').addEventListener('click', async () => {
  const manifest = chrome.runtime.getManifest()
  const status = await chrome.runtime
    .sendMessage({ type: 'FOS_STATUS' })
    .catch(() => null)
  const storage = await chrome.storage.local.get([
    'fos_crawl_state',
    'fos_crawl_log',
    'fos_crawl_perf',
  ])
  const tabs = await chrome.tabs
    .query({})
    .then((list) =>
      list.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active,
        isRocketMoney: /app\.rocketmoney\.com/i.test(t.url ?? ''),
        isRobinhood: /robinhood\.com/i.test(t.url ?? ''),
        isFinanceOs:
          /finance\.kenos\.space/i.test(t.url ?? '') ||
          /kensfinanceos\.netlify\.app/i.test(t.url ?? '') ||
          (/localhost|127\.0\.0\.1|netlify\.app|kenos\.space/i.test(t.url ?? '') &&
            /finance\.os|finance os/i.test(t.title ?? '')),
      })),
    )
    .catch(() => [])

  const raw = {
    manifest,
    userAgent: navigator.userAgent,
    locale: navigator.language,
    state: storage.fos_crawl_state ?? null,
    log: storage.fos_crawl_log ?? null,
    performance: storage.fos_crawl_perf ?? null,
    queue: status?.queue ?? [],
    dlq: status?.dlq ?? [],
    inFlight: status?.inFlight ?? [],
    lastSync: status?.lastSync ?? null,
    txnWatermark: status?.txnWatermark ?? null,
    rhEnrich: status?.rhEnrich ?? null,
    rhDetailsCount: status?.rhDetailsCount ?? 0,
    snapshot: status?.snapshot ?? null,
    history: status?.history ?? [],
    tabs,
  }

  const payload = window.FOS_DEBUG_LOG?.buildDebugExport
    ? window.FOS_DEBUG_LOG.buildDebugExport(raw)
    : raw

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const ver = manifest.version ?? '0'
  a.href = url
  a.download = `finance-os-sync-debug-v${ver}-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

document.getElementById('refresh-plan').addEventListener('click', async () => {
  document.getElementById('refresh-plan').disabled = true
  await chrome.runtime.sendMessage({ type: 'FOS_REQUEST_SNAPSHOT' })
  setTimeout(() => {
    document.getElementById('refresh-plan').disabled = false
  }, 2000)
})

/** 打开已有 Finance OS 标签页（finance.kenos.space / kensfinanceos.netlify.app / 本地 dev），或新开生产站。 */
document.getElementById('open-app').addEventListener('click', async () => {
  const btn = document.getElementById('open-app')
  if (btn) btn.disabled = true
  await chrome.runtime.sendMessage({ type: 'FOS_OPEN_APP' })
  await refresh()
  if (btn) btn.disabled = false
})

document.getElementById('release-inflight')?.addEventListener('click', async () => {
  const btn = document.getElementById('release-inflight')
  if (btn) btn.disabled = true
  await chrome.runtime.sendMessage({ type: 'FOS_RELEASE_INFLIGHT' })
  await refresh()
  if (btn) btn.disabled = false
})

document.getElementById('retry-dlq')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'FOS_RETRY_DLQ' })
  await refresh()
})

document.getElementById('clear-dlq')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'FOS_CLEAR_DLQ' })
  await refresh()
})

void refresh()
setInterval(refresh, 1500)
