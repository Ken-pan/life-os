<script>
  // Port of HoldingsWatchlist from src/components/stocks/HoldingsWatchlist.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { money, signedMoney, depositDeltaClass } from '$lib/format.js'

  /** @typedef {import('../../engine/holdingsPortfolio.js').HoldingsSort} HoldingsSort */
  /** @typedef {import('../../engine/holdingsPortfolio.js').PositionRowView} PositionRowView */

  /** @param {number | undefined} amount @param {boolean} privacy */
  function returnAmount(amount, privacy) {
    if (amount == null || !Number.isFinite(amount)) return '--'
    return signedMoney(amount, privacy)
  }

  /** @type {{
   *   rows: PositionRowView[],
   *   privacy: boolean,
   *   sort: HoldingsSort,
   *   onSortChange: (s: HoldingsSort) => void,
   *   onSelect: (row: PositionRowView) => void,
   * }} */
  let { rows, privacy, sort, onSortChange, onSelect } = $props()

  const displayRows = $derived(
    rows.map((row) => {
      const p = row.position
      return {
        id: p.id,
        row,
        ticker: p.ticker,
        securityName: p.securityName,
        assetType: p.assetType.toUpperCase(),
        weightLabel: `${row.weightPct.toFixed(1)}%`,
        liveValueLabel: money(row.liveValue, privacy),
        costLabel:
          p.averageCostPerShare != null ? money(p.averageCostPerShare, privacy) : '--',
        todayReturnLabel: returnAmount(p.todayReturnAmount, privacy),
        todayReturnClass: depositDeltaClass(p.todayReturnAmount ?? 0),
        totalReturnLabel: returnAmount(p.totalReturnAmount, privacy),
        totalReturnClass: depositDeltaClass(p.totalReturnAmount ?? 0),
      }
    }),
  )

  const totals = $derived.by(() => {
    let marketValue = 0
    let todayReturn = 0
    let totalReturn = 0
    let hasToday = false
    let hasTotal = false
    for (const row of rows) {
      marketValue += row.liveValue
      if (row.position.todayReturnAmount != null && Number.isFinite(row.position.todayReturnAmount)) {
        todayReturn += row.position.todayReturnAmount
        hasToday = true
      }
      if (row.position.totalReturnAmount != null && Number.isFinite(row.position.totalReturnAmount)) {
        totalReturn += row.position.totalReturnAmount
        hasTotal = true
      }
    }
    return { marketValue, todayReturn, totalReturn, hasToday, hasTotal }
  })
</script>

<div class="card">
  <div class="section-head">
    <h3 class="flush">{t('stocks.watchlist.title')}</h3>
    <div class="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge">
      <button class={sort === 'weight' ? 'active' : ''} onclick={() => onSortChange('weight')}>
        {t('stocks.watchlist.sortWeight')}
      </button>
      <button class={sort === 'return-desc' ? 'active' : ''} onclick={() => onSortChange('return-desc')}>
        {t('stocks.watchlist.sortReturnDesc')}
      </button>
      <button class={sort === 'return-asc' ? 'active' : ''} onclick={() => onSortChange('return-asc')}>
        {t('stocks.watchlist.sortReturnAsc')}
      </button>
      <button class={sort === 'name' ? 'active' : ''} onclick={() => onSortChange('name')}>
        {t('stocks.watchlist.sortName')}
      </button>
    </div>
  </div>

  <div class="holdings-watchlist-cards">
    {#each displayRows as item (item.id)}
      <button type="button" class="holdings-position-card" onclick={() => onSelect(item.row)}>
        <div class="holdings-position-card-head">
          <span class="holdings-position-ticker">{item.ticker}</span>
          <span class="tag">{item.assetType}</span>
          <span class="holdings-position-weight">{item.weightLabel}</span>
        </div>
        <div class="holdings-position-card-meta">{item.securityName}</div>
        <div class="holdings-position-card-values">
          <span>{item.liveValueLabel}</span>
          <span class="text-secondary">
            {t('stocks.watchlist.costPrefix', { amount: item.costLabel })}
          </span>
        </div>
        <div class="holdings-position-card-sub">
          <span class={item.todayReturnClass}>
            {t('stocks.watchlist.todayPrefix', { amount: item.todayReturnLabel })}
          </span>
          <span class={item.totalReturnClass}>
            {t('stocks.watchlist.totalPrefix', { amount: item.totalReturnLabel })}
          </span>
        </div>
      </button>
    {/each}
  </div>

  <div class="holdings-watchlist-table life-os-scroll-x mt-3">
    <table class="review-table holdings-table">
      <thead>
        <tr>
          <th>{t('stocks.watchlist.table.symbol')}</th>
          <th>{t('stocks.watchlist.table.weight')}</th>
          <th class="num">{t('stocks.watchlist.table.marketValue')}</th>
          <th class="num">{t('stocks.watchlist.table.avgCost')}</th>
          <th class="num">{t('stocks.watchlist.table.todayPnL')}</th>
          <th class="num">{t('stocks.watchlist.table.cumulativePnL')}</th>
        </tr>
      </thead>
      <tbody>
        {#each displayRows as item (item.id)}
          <tr class="clickable" onclick={() => onSelect(item.row)}>
            <td class="holdings-table-symbol">{item.ticker}</td>
            <td>{item.weightLabel}</td>
            <td class="num">{item.liveValueLabel}</td>
            <td class="num">{item.costLabel}</td>
            <td class="num {item.todayReturnClass}">{item.todayReturnLabel}</td>
            <td class="num {item.totalReturnClass}">{item.totalReturnLabel}</td>
          </tr>
        {/each}
        <tr class="review-table-total">
          <td>{t('stocks.watchlist.table.total')}</td>
          <td></td>
          <td class="num">{money(totals.marketValue, privacy)}</td>
          <td></td>
          <td class="num {depositDeltaClass(totals.todayReturn)}">
            {totals.hasToday ? signedMoney(totals.todayReturn, privacy) : '--'}
          </td>
          <td class="num {depositDeltaClass(totals.totalReturn)}">
            {totals.hasTotal ? signedMoney(totals.totalReturn, privacy) : '--'}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
