<script>
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { isoToCalendarLabel, monthOffsetToCalendarLabel } from '$lib/format.js'
  import { dateToMonthOffset } from '../../engine/calendar.js'
  import DateField from './fields/DateField.svelte'
  import NumberField from './fields/NumberField.svelte'
  import PercentField from './fields/PercentField.svelte'
  import SelectField from './fields/SelectField.svelte'
  import TextField from './fields/TextField.svelte'
  import { defaultEvent, eventTypeOptions } from '$lib/scenarios.js'

  /** @type {{ e: import('../../types.js').ScenarioEvent }} */
  let { e } = $props()

  const store = getFinanceStore()
  const eventTypes = $derived(eventTypeOptions(t))
  const whenLabel = $derived(
    e.date ? isoToCalendarLabel(e.date) : monthOffsetToCalendarLabel(e.monthOffset),
  )

  /** @param {Partial<import('../../types.js').ScenarioEvent>} patch */
  function set(patch) {
    store.upsertEvent({ ...e, ...patch })
  }
</script>

<div class="card card-compact" style:opacity={e.enabled ? 1 : 0.55}>
  <div class="row">
    <TextField label={t('scenarios.name')} value={e.name} onChange={(v) => set({ name: v })} />
    <SelectField
      label={t('scenarios.type')}
      value={e.eventType}
      options={eventTypes}
      onChange={(v) =>
        store.upsertEvent({
          ...defaultEvent(v, t),
          id: e.id,
          name: e.name,
          monthOffset: e.monthOffset,
          date: e.date,
        })}
    />
    <DateField
      label={t('scenarios.effectiveDate')}
      value={e.date}
      onChange={(v) =>
        set({ date: v || undefined, monthOffset: v ? dateToMonthOffset(new Date(), v) : e.monthOffset })}
    />
  </div>
  <div class="row">
    {#if e.eventType === 'salary-change' || e.eventType === 'expense-change'}
      <NumberField
        label={t('scenarios.monthlyDelta')}
        value={e.amount ?? 0}
        onChange={(v) => set({ amount: v })}
        step={50}
      />
    {/if}
    {#if e.eventType === 'partner-contribution'}
      <PercentField
        label={t('scenarios.partnerShare')}
        value={e.contributionPercent ?? 0.5}
        onChange={(v) => set({ contributionPercent: v })}
      />
      <TextField
        label={t('scenarios.expenseCategory')}
        value={e.expenseCategory ?? ''}
        onChange={(v) => set({ expenseCategory: v })}
        placeholder={t('scenarios.expenseCategoryPlaceholder')}
      />
    {/if}
    <div class="field field-actions">
      <label>&nbsp;</label>
      <div class="flex-row-tight">
        <button class="btn ghost" onclick={() => store.toggleEvent(e.id)}>
          {e.enabled ? t('scenarios.disable') : t('scenarios.enable')}
        </button>
        <button class="btn danger" onclick={() => store.removeEvent(e.id)}>
          {t('scenarios.delete')}
        </button>
      </div>
    </div>
  </div>
  <span class="meta">
    {t('scenarios.effective', {
      when: whenLabel,
      suffix: e.enabled ? '' : t('scenarios.effectiveDisabled'),
    })}
  </span>
</div>
