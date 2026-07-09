<script>
  // CashFlowRow — extracted from CashFlowsView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { money, depositDeltaClass } from '$lib/format.js'
  import DateField from './fields/DateField.svelte'
  import NumberField from './fields/NumberField.svelte'
  import SelectField from './fields/SelectField.svelte'
  import TextField from './fields/TextField.svelte'

  /** @param {(key: string) => string} tr */
  function payFrequencyOptions(tr) {
    return [
      { value: 'monthly', label: tr('cashFlows.freqMonthly') },
      { value: 'semimonthly', label: tr('cashFlows.freqSemimonthly') },
      { value: 'biweekly', label: tr('cashFlows.freqBiweekly') },
      { value: 'weekly', label: tr('cashFlows.freqWeekly') },
    ]
  }

  /** @type {{
   *   c: import('../../types.js').CashFlowItem,
   *   privacy: boolean,
   *   bulkOpenVersion?: number,
   *   bulkOpenValue?: boolean,
   * }} */
  let { c, privacy, bulkOpenVersion = 0, bulkOpenValue = false } = $props()

  const store = getFinanceStore()
  let open = $state(bulkOpenVersion > 0 ? bulkOpenValue : !c.name)

  const payFreqOptions = $derived(payFrequencyOptions(t))
  const isIncome = $derived(c.type === 'income')
  const payFreq = $derived(c.payFrequency ?? 'monthly')
  const needsAnchor = $derived(isIncome && (payFreq === 'biweekly' || payFreq === 'weekly'))

  /** @param {Partial<import('../../types.js').CashFlowItem>} patch */
  function set(patch) {
    store.upsertCashFlow({ ...c, ...patch })
  }
</script>

<div class="flow-row">
  <button type="button" class="flow-head" onclick={() => (open = !open)}>
    <span class="dot {isIncome ? 'ok' : 'warning'}"></span>
    <span class="grow">
      <span class="name">
        {c.name || t('cashFlows.unnamed')}
        <span class="tag inline-meta">{isIncome ? t('cashFlows.income') : t('cashFlows.expense')}</span>
        <span class="tag inline-meta">
          {c.frequency === 'monthly' ? t('cashFlows.freqMonthlyShort') : t('cashFlows.freqAnnualShort')}
        </span>
      </span>
      <span class="meta">
        {isIncome ? t('cashFlows.afterTax') : c.essential ? t('cashFlows.essential') : t('cashFlows.nonEssential')}
        {#if c.category}<span class="inline-meta">· {c.category}</span>{/if}
      </span>
    </span>
    <span class="amount {depositDeltaClass(isIncome ? c.amount : -c.amount)}">
      {isIncome ? money(c.amount, privacy) : `-${money(c.amount, privacy)}`}
    </span>
    <span class="chev{open ? ' open' : ''}">⌄</span>
  </button>

  {#if open}
    <div class="flow-body">
      <div class="row">
        <TextField
          label={t('cashFlows.name')}
          value={c.name}
          onChange={(v) => set({ name: v })}
          placeholder={t('cashFlows.namePlaceholder')}
        />
        <SelectField
          label={t('cashFlows.type')}
          value={c.type}
          options={[
            { value: 'income', label: t('cashFlows.typeIncome') },
            { value: 'expense', label: t('cashFlows.typeExpense') },
          ]}
          onChange={(v) => set({ type: v })}
        />
        <SelectField
          label={t('cashFlows.frequency')}
          value={c.frequency}
          options={[
            { value: 'monthly', label: t('cashFlows.freqMonthlyShort') },
            { value: 'annual', label: t('cashFlows.freqAnnualShort') },
          ]}
          onChange={(v) => set({ frequency: v })}
        />
        <NumberField
          label={isIncome && payFreq !== 'monthly' && payFreq !== 'semimonthly'
            ? t('cashFlows.amountMonthly')
            : t('cashFlows.amount')}
          value={c.amount}
          onChange={(v) => set({ amount: v })}
          step={50}
        />
      </div>
      <div class="row middle">
        {#if isIncome}
          <SelectField
            label={t('cashFlows.payFrequency')}
            value={payFreq}
            options={payFreqOptions}
            onChange={(v) => set({ payFrequency: v })}
          />
        {/if}
        {#if needsAnchor}
          <DateField
            label={t('cashFlows.nextPayday')}
            value={c.anchorDate}
            onChange={(v) => set({ anchorDate: v })}
          />
        {/if}
        {#if c.type === 'expense'}
          <label class="field-inline-check">
            <input
              type="checkbox"
              checked={c.essential ?? false}
              onchange={(e) => set({ essential: e.currentTarget.checked })}
            />
            {t('cashFlows.essentialHint')}
          </label>
        {/if}
        <TextField
          label={t('cashFlows.categoryOptional')}
          value={c.category ?? ''}
          onChange={(v) => set({ category: v })}
          placeholder={t('cashFlows.categoryPlaceholder')}
        />
        <div class="field field-actions">
          <label>&nbsp;</label>
          <button type="button" class="btn danger" onclick={() => store.removeCashFlow(c.id)}>
            {t('cashFlows.delete')}
          </button>
        </div>
      </div>
      {#if needsAnchor}
        <span class="meta">{t('cashFlows.incomeSplitNote')}</span>
      {/if}
    </div>
  {/if}
</div>
