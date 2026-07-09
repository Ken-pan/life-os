<script>
  // Port of PositionDrawer from src/components/stocks/PositionDrawer.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { money, signedMoney, depositDeltaClass, pct } from '$lib/format.js'
  import { pricePathPoints } from '../../../engine/sparkline'
  import SparklinePath from './SparklinePath.svelte'
  import DayReturnBar from './DayReturnBar.svelte'

  /** @typedef {import('../../engine/holdingsPortfolio.js').PositionRowView} PositionRowView */

  /** @type {{ row: PositionRowView, privacy: boolean, onClose: () => void }} */
  let { row, privacy, onClose } = $props()

  const p = $derived(row.position)
  const pathValues = $derived(pricePathPoints(row))
</script>

<div class="drawer-backdrop" onclick={onClose} role="presentation"></div>
<aside class="drawer" role="dialog" aria-label={t('stocks.position.ariaLabel', { ticker: p.ticker })}>
  <div class="drawer-head">
    <h3 class="flush">{p.ticker} · {p.securityName}</h3>
    <button class="icon-btn" onclick={onClose}>{t('stocks.position.close')}</button>
  </div>
  <p class="muted-note">{t('stocks.position.readOnlyNote')}</p>
  <div class="list">
    {#if p.averageCostPerShare != null}
      <div class="kv">
        <span class="k">{t('stocks.position.avgCost')}</span>
        <span>{money(p.averageCostPerShare, privacy)}</span>
      </div>
    {/if}
    {#if p.totalReturnAmount != null}
      <div class="kv">
        <span class="k">{t('stocks.position.cumulativePnL')}</span>
        <span class={depositDeltaClass(p.totalReturnAmount)}>
          {signedMoney(p.totalReturnAmount, privacy)}
          {#if p.totalReturnPctDisplayed != null}
            <span class="text-secondary inline-meta">
              {p.totalReturnPctDisplayed >= 0 ? '+' : ''}
              {pct(p.totalReturnPctDisplayed / 100, 2)}
            </span>
          {/if}
        </span>
      </div>
    {/if}
    {#if p.todayReturnPct != null}
      <div class="kv">
        <span class="k">{t('stocks.position.todayPnL')}</span>
        <span class={depositDeltaClass(p.todayReturnAmount ?? p.todayReturnPct)}>
          {#if p.todayReturnAmount != null}{signedMoney(p.todayReturnAmount, privacy)}{/if}
          {#if p.todayReturnAmount != null && p.todayReturnPct != null} · {/if}
          {p.todayReturnPct >= 0 ? '+' : ''}
          {pct(p.todayReturnPct / 100, 2)}
        </span>
      </div>
    {/if}
    <div class="kv">
      <span class="k">{t('stocks.position.shares')}</span>
      <span>{privacy ? '••••' : p.shares.toFixed(4)}</span>
    </div>
    <div class="kv">
      <span class="k">{t('stocks.position.portfolioWeight')}</span>
      <span>{row.weightPct.toFixed(2)}%</span>
    </div>
    <div class="kv">
      <span class="k">{t('stocks.position.marketValue')}</span>
      <span>{money(row.liveValue, privacy)}</span>
    </div>
    <div class="kv">
      <span class="k">{t('stocks.position.currentPrice')}</span>
      <span>
        {money(row.livePrice, privacy)}
        {#if !row.hasLiveQuote}
          <span class="text-secondary">{t('stocks.position.staleQuote')}</span>
        {/if}
      </span>
    </div>
  </div>
  {#if pathValues.length >= 2}
    <div class="position-drawer-spark mt-4">
      <span class="label">{t('stocks.position.pricePath')}</span>
      <SparklinePath values={pathValues} up={(p.totalReturnAmount ?? 0) >= 0} width={120} height={36} />
      <div class="muted-note mt-1">
        {t('stocks.position.pathSample', {
          count: row.pathSampleCount,
          min: money(row.pathMin, privacy),
          max: money(row.pathMax, privacy),
          spanPct: row.pathSpanPct.toFixed(2),
        })}
      </div>
    </div>
  {/if}
  {#if row.position.todayReturnPct != null}
    <div class="mt-3">
      <DayReturnBar pct={row.position.todayReturnPct} />
    </div>
  {/if}
</aside>
