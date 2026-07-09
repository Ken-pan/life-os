<script>
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { money, monthOffsetToCalendarLabel } from '$lib/format.js'
  import { getGoalMetricOptions, getGoalReservePolicies, quoteSafeToSpend } from '../../copy/terminology.js'
  import { goalReservePolicy } from '../../engine/goals.js'
  import NumberField from './fields/NumberField.svelte'
  import SelectField from './fields/SelectField.svelte'
  import SliderField from './fields/SliderField.svelte'
  import TextField from './fields/TextField.svelte'

  /** @type {{
   *   g: import('../../types.js').Goal,
   *   effBudget: number,
   *   committedBudget: number,
   *   reserveAllocSum: number,
   * }} */
  let { g, effBudget, committedBudget, reserveAllocSum } = $props()

  const store = getFinanceStore()
  const privacy = $derived(store.data.privacy)
  const policy = $derived(goalReservePolicy(g))
  const reservePolicies = $derived(getGoalReservePolicies())
  const isReserve = $derived(policy !== 'milestone_only')
  const current = $derived(g.current ?? 0)
  const alloc = $derived(g.monthlyAllocation ?? 0)
  const pct = $derived(committedBudget > 0 ? Math.min(1, alloc / committedBudget) : 0)
  const siblingAlloc = $derived(Math.max(0, reserveAllocSum - alloc))
  const maxPct = $derived(
    committedBudget > 0 ? Math.max(0, ((committedBudget - siblingAlloc) / committedBudget) * 100) : 0,
  )
  const effMonthly = $derived(Math.round(pct * effBudget))
  const remaining = $derived(Math.max(0, g.target - current))
  const progressPct = $derived(g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0)
  const monthsToFill = $derived(effMonthly > 0 ? Math.ceil(remaining / effMonthly) : null)
  const fillHint = $derived.by(() => {
    if (effMonthly <= 0) return t('scenarios.fillHintDrag')
    if (remaining <= 0) return t('scenarios.fillHintFull', { amount: money(effMonthly, privacy) })
    if (monthsToFill != null) {
      return t('scenarios.fillHintProgress', {
        amount: money(effMonthly, privacy),
        months: monthsToFill,
        when: monthOffsetToCalendarLabel(monthsToFill),
      })
    }
    return t('scenarios.fillHintDragShort')
  })

  /** @param {Partial<import('../../types.js').Goal>} patch */
  function set(patch) {
    store.upsertGoal({ ...g, ...patch })
  }
</script>

<div class="card card-compact">
  <div class="row">
    <TextField label={t('scenarios.goalName')} value={g.name} onChange={(v) => set({ name: v })} />
    <SelectField
      label={t('scenarios.metric')}
      value={g.metric}
      options={getGoalMetricOptions()}
      onChange={(v) => set({ metric: v })}
    />
    <NumberField
      label={t('scenarios.targetAmount')}
      value={g.target}
      onChange={(v) => set({ target: v })}
      step={10000}
    />
    <div class="field field-actions">
      <label>&nbsp;</label>
      <button class="btn danger" onclick={() => store.removeGoal(g.id)}>{t('scenarios.delete')}</button>
    </div>
  </div>

  <label class="goal-reserve-toggle" title={t('scenarios.reservePolicyTitle', { safeToSpend: quoteSafeToSpend() })}>
    <select
      value={policy}
      onchange={(e) => {
        const nextPolicy = /** @type {import('../../types.js').GoalReservePolicy} */ (e.currentTarget.value)
        set({ reservePolicy: nextPolicy, reserve: nextPolicy !== 'milestone_only' })
      }}
    >
      {#each Object.keys(reservePolicies) as key (key)}
        <option value={key} title={reservePolicies[/** @type {keyof typeof reservePolicies} */ (key)].title}>
          {reservePolicies[/** @type {keyof typeof reservePolicies} */ (key)].label}
        </option>
      {/each}
    </select>
  </label>

  {#if isReserve}
    <div class="goal-bucket">
      <div class="row">
        <NumberField
          label={t('scenarios.savedAmount')}
          value={current}
          onChange={(v) => set({ current: Math.max(0, v) })}
          step={100}
          min={0}
        />
      </div>
      <SliderField
        label={t('scenarios.monthlySharePct')}
        value={Math.round(pct * 100)}
        onChange={(v) => {
          const capped = Math.min(v, maxPct)
          set({ monthlyAllocation: Math.round((capped / 100) * effBudget) })
        }}
        min={0}
        max={100}
        step={1}
        format={(v) =>
          t('scenarios.monthlyShareFormat', {
            pct: Math.min(v, Math.round(maxPct)),
            amount: money(Math.round((Math.min(v, maxPct) / 100) * effBudget), privacy),
          })}
        hint={maxPct < 100 && Math.round(pct * 100) >= Math.round(maxPct)
          ? t('scenarios.shareCapHint', { maxPct: Math.round(maxPct) })
          : fillHint}
      />
      <div class="goal-progress">
        <div class="goal-progress-bar">
          <span style="width: {progressPct}%"></span>
        </div>
        <div class="goal-progress-meta">
          <span>
            {t('scenarios.savedProgress', {
              current: money(current, privacy),
              target: money(g.target, privacy),
            })}
          </span>
          <span class="text-secondary">
            {t('scenarios.remaining', { amount: money(remaining, privacy) })}
          </span>
        </div>
      </div>
    </div>
  {/if}
</div>
