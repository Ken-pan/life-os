<script>
  import { t } from '$lib/i18n.svelte.js'
  import { money, signedMoney } from '$lib/format.js'
  import StatChip from './StatChip.svelte'

  /** @type {{ w: ReturnType<typeof import('$lib/engine/realityLoop').computeBaselineWindows>[number], privacy: boolean }} */
  let { w, privacy } = $props()
</script>

<div class="grid kpi-row-4">
  <StatChip label={t('review.baselineAvgSpending')} value={money(w.averageMonthlySpending, privacy)} />
  <StatChip label={t('review.baselineMedianSpending')} value={money(w.medianMonthlySpending, privacy)} />
  <StatChip label={t('review.baselineMonthlyIncome')} value={money(Math.abs(w.monthlyIncome), privacy)} />
  <StatChip label={t('review.baselineMonthlyNet')} value={signedMoney(w.monthlyNetCashFlow, privacy)} />
</div>
<div class="grid baseline-kpi-pair">
  <StatChip label={t('review.baselineRecurring')} value={money(w.recurringSpending, privacy)} />
  <StatChip label={t('review.baselineOneTime')} value={money(w.oneTimeSpending, privacy)} />
</div>
{#if w.confidenceReasons.length > 0}
  <ul class="muted-note mt-2">
    {#each w.confidenceReasons as msg (msg)}
      <li>{msg}</li>
    {/each}
  </ul>
{/if}
