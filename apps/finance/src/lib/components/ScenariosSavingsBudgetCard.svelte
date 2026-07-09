<script>
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { money } from '$lib/format.js'
  import { stsBreakdown } from '../../copy/terminology.js'
  import { safeToSpendLabel } from '../../copy/metrics.js'
  import SliderField from './fields/SliderField.svelte'

  /** @type {{
   *   effBudget: number,
   *   committedBudget: number,
   *   surplus: number,
   *   recommendedBudget: number,
   *   reserveGoals: import('../../types.js').Goal[],
   *   onChange: (v: number) => void,
   *   onCommit: (v: number) => void,
   * }} */
  let { effBudget, committedBudget, surplus, recommendedBudget, reserveGoals, onChange, onCommit } = $props()

  const store = getFinanceStore()
  const privacy = $derived(store.data.privacy)
  const sts = $derived(stsBreakdown())
  const sliderMax = $derived(
    Math.max(1000, Math.ceil(Math.max(surplus * 1.2, committedBudget) / 50) * 50),
  )
  const safeToSpend = $derived(safeToSpendLabel())
  const hint = $derived.by(() => {
    const ratio = surplus > 0 ? effBudget / surplus : null
    let tone = t('scenarios.toneModerate')
    if (ratio != null) {
      if (ratio >= 0.9) tone = t('scenarios.toneTight', { safeToSpend })
      else if (ratio <= 0.4) tone = t('scenarios.toneLoose', { safeToSpend })
    }
    return surplus > 0
      ? effBudget > surplus
        ? t('scenarios.hintOverSurplus', { surplus: money(surplus, privacy) })
        : t('scenarios.hintSurplusTone', { surplus: money(surplus, privacy), tone })
      : t('scenarios.hintNoCashflows')
  })
  const allocated = $derived(
    reserveGoals.reduce(
      (s, g) =>
        s + Math.round(((g.monthlyAllocation ?? 0) / Math.max(1, committedBudget)) * effBudget),
      0,
    ),
  )
  const remainingBudget = $derived(effBudget - allocated)
  const allocatedPct = $derived(effBudget > 0 ? (allocated / effBudget) * 100 : 0)
</script>

<div class="card card-compact">
  <SliderField
    label={t('scenarios.monthlyBudgetTotal')}
    value={effBudget}
    {onChange}
    {onCommit}
    min={0}
    max={sliderMax}
    step={50}
    format={(v) => t('scenarios.monthlyBudgetFormat', { amount: money(v, privacy) })}
    {hint}
  />
  <div class="kv mt-2">
    <span class="k">{t('scenarios.recommendedToday')}</span>
    <span>{t('scenarios.monthlyBudgetFormat', { amount: money(recommendedBudget, privacy) })}</span>
  </div>
  <p class="muted-note mt-1-5">
    {t('scenarios.budgetSourceNote', { buffer: sts.buffer, goalReserve: sts.goalReserve })}
  </p>
  {#if Math.abs(effBudget - recommendedBudget) >= 50}
    <div class="mt-2">
      <button
        class="icon-btn"
        onclick={() => {
          onChange(recommendedBudget)
          onCommit(recommendedBudget)
        }}
      >
        {t('scenarios.applyRecommendation', { amount: money(recommendedBudget, privacy) })}
      </button>
    </div>
  {/if}
  {#if reserveGoals.length > 0}
    <div class="goal-progress mt-2-5">
      <div class="goal-progress-bar">
        <span
          style="width: {Math.min(100, allocatedPct)}%; background: {allocatedPct > 100
            ? 'var(--critical)'
            : undefined}"
        ></span>
      </div>
      <div class="goal-progress-meta">
        <span>
          {t('scenarios.allocatedTotal', {
            pct: Math.round(allocatedPct),
            amount: money(allocated, privacy),
          })}
        </span>
        <span class={remainingBudget < 0 ? 'text-neg' : 'text-secondary'}>
          {remainingBudget < 0
            ? t('scenarios.overBudget', { amount: money(-remainingBudget, privacy) })
            : t('scenarios.remainingBudget', { amount: money(remainingBudget, privacy) })}
        </span>
      </div>
    </div>
  {/if}
</div>
