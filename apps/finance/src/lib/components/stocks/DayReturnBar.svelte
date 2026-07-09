<script>
  // Port of DayReturnBar from src/components/stocks/MiniPricePath.tsx.
  import { t } from '$lib/i18n.svelte.js'

  /** @type {{ pct: number | undefined, class?: string }} */
  let { pct, class: klass } = $props()

  const cap = 5
  const width = $derived(
    pct != null && Number.isFinite(pct) ? (Math.min(Math.abs(pct), cap) / cap) * 50 : 0,
  )
  const up = $derived((pct ?? 0) >= 0)
  const sign = $derived((pct ?? 0) >= 0 ? '+' : '')
</script>

{#if pct != null && Number.isFinite(pct)}
  <span
    class={klass ?? 'day-return-bar'}
    title={t('stocks.position.dayChangeTitle', { sign, pct: pct.toFixed(2) })}
    aria-label={t('stocks.position.dayChangeAria', { pct: pct.toFixed(2) })}
  >
    <span class="day-return-bar-track">
      <span
        class="day-return-bar-fill{up ? ' up' : ' down'}"
        style="width: {width}%; margin-left: {up ? '50%' : `${50 - width}%`}"
      ></span>
    </span>
  </span>
{/if}
