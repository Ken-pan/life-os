<script>
  // Port of src/components/FutureCashflowView.tsx.
  import { goto } from '$app/navigation'
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import { buildAppPath } from '@life-os/finance-core/routing/app-route'
  import { signedMonthOffset } from '../../engine/calendar.js'
  import { classifyEventClosure, occurrenceForEvent } from '../../engine/timeline.js'
  import SortBySelect from './SortBySelect.svelte'
  import OneOffEventRow from './OneOffEventRow.svelte'

  const ARCHIVE_MONTHS = 12

  /** @param {import('../../types.js').ScenarioEvent} e @param {Date} now */
  function eventMonth(e, now) {
    return e.date ? signedMonthOffset(now, e.date) : Math.round(e.monthOffset ?? 0)
  }

  /** @param {import('../../types.js').ScenarioEvent} e */
  function eventSortKey(e) {
    if (e.date) {
      const ts = new Date(e.date).getTime()
      if (Number.isFinite(ts)) return ts
    }
    return Math.round((e.monthOffset ?? 0) * 30) * 24 * 60 * 60 * 1000
  }

  /** @param {string} iso @param {number} months */
  function monthsBefore(iso, months) {
    const [y, m, d] = iso.split('-').map(Number)
    const total = y * 12 + (m - 1) - months
    const yy = Math.floor(total / 12)
    const mm = (total % 12) + 1
    return `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  /** @param {string | undefined} eventDate @param {Date} now */
  function isArchived(eventDate, now) {
    if (!eventDate) return false
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return eventDate < monthsBefore(todayIso, ARCHIVE_MONTHS)
  }

  /** @param {import('../../types.js').ScenarioEvent[]} items @param {'timeline' | 'amount-desc' | 'name' | 'latest'} mode @param {string} intlLoc */
  function sortEvents(items, mode, intlLoc) {
    return items.slice().sort((a, b) => {
      if (mode === 'amount-desc') return (b.amount ?? 0) - (a.amount ?? 0)
      if (mode === 'name') return a.name.localeCompare(b.name, intlLoc)
      const delta =
        mode === 'latest' ? eventSortKey(b) - eventSortKey(a) : eventSortKey(a) - eventSortKey(b)
      if (delta !== 0) return delta
      return a.name.localeCompare(b.name, intlLoc)
    })
  }

  /** @type {{
   *   onGoTab?: (tab: string, section?: string, opts?: { ledgerSearch?: string, focusEventId?: string }) => void,
   *   focusEventId?: string,
   *   onFocusConsumed?: () => void,
   * }} */
  let { onGoTab, focusEventId, onFocusConsumed } = $props()

  const store = getFinanceStore()
  const txStore = getTransactionsStore()
  const timeline = getTimelineStore()
  const now = new Date()
  const intlLoc = $derived(intlLocaleTag())

  let plannedSort = $state(/** @type {'timeline' | 'amount-desc' | 'name'} */ ('timeline'))
  let pendingSort = $state(/** @type {'latest' | 'amount-desc' | 'name'} */ ('latest'))
  let closedSort = $state(/** @type {'latest' | 'amount-desc' | 'name'} */ ('latest'))
  let showClosed = $state(false)
  let showArchived = $state(false)

  const all = $derived(
    store.data.events.filter((e) => e.eventType === 'windfall' || e.eventType === 'one-time-purchase'),
  )

  const enriched = $derived(
    all.map((e) => {
      const occ = occurrenceForEvent(timeline.occurrences, e.id, e.date)
      const bucket = classifyEventClosure(e, occ, now)
      const matchedTxn = occ?.matchedTxnId
        ? txStore.txns.find((txn) => txn.id === occ.matchedTxnId)
        : undefined
      return { e, occ, bucket, matchedTxn }
    }),
  )

  const lookup = $derived.by(() => {
    const map = new Map()
    for (const row of enriched) map.set(row.e.id, row)
    return map
  })

  const planned = $derived(
    sortEvents(
      enriched.filter((x) => x.bucket === 'planned').map((x) => x.e),
      plannedSort,
      intlLoc,
    ),
  )
  const pending = $derived(
    sortEvents(
      enriched.filter((x) => x.bucket === 'pending').map((x) => x.e),
      pendingSort,
      intlLoc,
    ),
  )
  const closedAll = $derived(enriched.filter((x) => x.bucket === 'closed'))
  const closedRecent = $derived(closedAll.filter((x) => !isArchived(x.e.date, now)))
  const closedArchived = $derived(closedAll.filter((x) => isArchived(x.e.date, now)))
  const closedShown = $derived(showArchived ? closedAll : closedRecent)

  /** @param {import('../../types.js').ScenarioEvent} e @param {boolean} [showActions] */
  function rowProps(e, showActions = false) {
    const row = lookup.get(e.id)
    return {
      e,
      now,
      occ: row?.occ,
      matchedTxn: row?.matchedTxn,
      txns: txStore.txns,
      showActions,
      onSkip: (id) => void timeline.markSkipped(id),
      onConfirm: (id) => void timeline.markConfirmedPaid(id),
      onLinkTxn: (occId, txnId) => void timeline.markMatchedWithTxn(occId, txnId),
      onViewLedger: onGoTab
        ? (name) => onGoTab('history', 'insights', { ledgerSearch: name })
        : undefined,
    }
  }

  function defaultGoTab(tab, section, opts) {
    let path = buildAppPath({ tab, section })
    const params = new URLSearchParams()
    if (opts?.ledgerSearch) params.set('q', opts.ledgerSearch)
    if (opts?.focusEventId) params.set('focus', opts.focusEventId)
    const qs = params.toString()
    goto(qs ? `${path}?${qs}` : path)
  }

  const goTabFn = $derived(onGoTab ?? defaultGoTab)

  $effect(() => {
    if (!focusEventId) return
    const row = lookup.get(focusEventId)
    if (row?.bucket === 'closed') showClosed = true

    const timer = window.setTimeout(() => {
      const el = document.getElementById(`oneoff-event-${focusEventId}`)
      if (!el) {
        onFocusConsumed?.()
        return
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('is-focused')
      window.setTimeout(() => {
        el.classList.remove('is-focused')
        onFocusConsumed?.()
      }, 2200)
    }, 80)

    return () => window.clearTimeout(timer)
  })

  const sortOptions = $derived([
    { id: 'timeline', label: t('futureCashflow.sortTimeline') },
    { id: 'amount-desc', label: t('futureCashflow.sortAmountDesc') },
    { id: 'name', label: t('futureCashflow.sortName') },
  ])
  const latestSortOptions = $derived([
    { id: 'latest', label: t('futureCashflow.sortLatest') },
    { id: 'amount-desc', label: t('futureCashflow.sortAmountDesc') },
    { id: 'name', label: t('futureCashflow.sortName') },
  ])
</script>

<div class="records-oneoff-panel">
  <p class="muted-note">{t('futureCashflow.intro')}</p>

  <section class="oneoff-section">
    <div class="section-head-inline">
      <h2 class="section-title flush">{t('futureCashflow.plannedTitle')}</h2>
      <SortBySelect
        label={t('futureCashflow.sort')}
        value={plannedSort}
        onChange={(v) => (plannedSort = v)}
        compact
        options={sortOptions}
      />
    </div>
    <div class="grid gap-2 mt-3">
      {#if planned.length === 0}
        <div class="empty">{t('futureCashflow.plannedEmpty')}</div>
      {:else}
        {#each planned as e (e.id)}
          <OneOffEventRow {...rowProps(e)} />
        {/each}
      {/if}
    </div>
  </section>

  {#if pending.length > 0}
    <section class="oneoff-section oneoff-section-pending">
      <div class="section-head-inline">
        <h2 class="section-title flush">
          {t('futureCashflow.pendingTitle')}
          <span class="tag warn inline-meta">{pending.length}</span>
        </h2>
        <div class="section-head-actions">
          <button type="button" class="icon-btn" onclick={() => goTabFn('home', 'today')}>
            {t('futureCashflow.viewInToday')}
          </button>
          <SortBySelect
            label={t('futureCashflow.sort')}
            value={pendingSort}
            onChange={(v) => (pendingSort = v)}
            compact
            options={latestSortOptions}
          />
        </div>
      </div>
      <p class="muted-note mt-2">{t('futureCashflow.pendingIntro')}</p>
      <div class="grid gap-2 mt-3">
        {#each pending as e (e.id)}
          <OneOffEventRow {...rowProps(e, true)} />
        {/each}
      </div>
    </section>
  {/if}

  {#if closedAll.length > 0}
    <section class="oneoff-section">
      <button type="button" class="group-toggle" onclick={() => (showClosed = !showClosed)}>
        <span class="chev{showClosed ? ' open' : ''}">⌄</span>
        {t('futureCashflow.closedTitle', { count: closedAll.length })}
        {#if closedArchived.length > 0 && !showArchived}
          <span class="tag inline-meta">
            {t('futureCashflow.archivedTag', {
              count: closedArchived.length,
              months: ARCHIVE_MONTHS,
            })}
          </span>
        {/if}
      </button>
      {#if showClosed}
        <div class="grid gap-2 mt-2 past-group">
          <div class="section-head-inline">
            <SortBySelect
              label={t('futureCashflow.sort')}
              value={closedSort}
              onChange={(v) => (closedSort = v)}
              compact
              options={latestSortOptions}
            />
            {#if closedArchived.length > 0}
              <button type="button" class="btn ghost" onclick={() => (showArchived = !showArchived)}>
                {showArchived
                  ? t('futureCashflow.hideOlder')
                  : t('futureCashflow.showOlder', {
                      months: ARCHIVE_MONTHS,
                      count: closedArchived.length,
                    })}
              </button>
            {/if}
          </div>
          {#each sortEvents(closedShown.map((x) => x.e), closedSort, intlLoc) as e (e.id)}
            <OneOffEventRow {...rowProps(e)} />
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
