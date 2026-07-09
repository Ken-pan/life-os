<script>
  // FlowRow from FutureCashflowView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { fundingSourceLabels } from '@life-os/finance-core/copy/terminology'
  import { pickSpendingCard } from '../../engine/finance.js'
  import { signedMonthOffset } from '../../engine/calendar.js'
  import {
    confirmOccurredLabel,
    displayStatusClass,
    displayStatusLabel,
    occurrenceDisplayStatus,
  } from '../../engine/timeline.js'
  import { isoToCalendarLabel, signedMoney, depositDeltaClass } from '$lib/format.js'
  import DateField from './fields/DateField.svelte'
  import NumberField from './fields/NumberField.svelte'
  import SelectField from './fields/SelectField.svelte'
  import TextField from './fields/TextField.svelte'
  import TxnLinkPicker from './TxnLinkPicker.svelte'

  /** @param {import('../../types.js').ScenarioEvent} e @param {Date} now */
  function eventMonth(e, now) {
    return e.date ? signedMonthOffset(now, e.date) : Math.round(e.monthOffset ?? 0)
  }

  /** @param {number} months */
  function relativeWhen(months) {
    if (months === 0) return t('futureCashflow.thisMonth')
    const abs = Math.abs(months)
    const y = Math.floor(abs / 12)
    const m = abs % 12
    let span
    if (y > 0) {
      span = m > 0 ? `${y}年${m}月` : `${y}年`
    } else {
      span = `${m}月`
    }
    return months > 0 ? t('futureCashflow.relativeAfter', { span }) : t('futureCashflow.relativeBefore', { span })
  }

  /** @type {{
   *   e: import('../../types.js').ScenarioEvent,
   *   now: Date,
   *   occ?: import('../../engine/timeline.js').ExpectedOccurrence,
   *   matchedTxn?: import('../../engine/transactions.js').Txn,
   *   txns: import('../../engine/transactions.js').Txn[],
   *   showActions?: boolean,
   *   onSkip?: (occId: string) => void,
   *   onConfirm?: (occId: string) => void,
   *   onLinkTxn?: (occId: string, txnId: string) => void,
   *   onViewLedger?: (name: string) => void,
   * }} */
  let {
    e,
    now,
    occ,
    matchedTxn,
    txns,
    showActions = false,
    onSkip,
    onConfirm,
    onLinkTxn,
    onViewLedger,
  } = $props()

  const store = getFinanceStore()
  let open = $state(false)
  let linkOpen = $state(false)

  /** @param {Partial<import('../../types.js').ScenarioEvent>} patch */
  function set(patch) {
    store.upsertEvent({ ...e, ...patch })
  }

  const spendingCard = $derived(pickSpendingCard(store.data.accounts))
  const fundingOptions = $derived.by(() => {
    const opts = [
      { value: 'checking', label: fundingSourceLabels().checking },
      { value: 'savings', label: fundingSourceLabels().savings },
      { value: 'invested', label: fundingSourceLabels().invested },
    ]
    if (spendingCard) {
      opts.push({
        value: 'credit-card',
        label: spendingCard.name
          ? t('futureCashflow.creditCardNamed', { name: spendingCard.name })
          : t('futureCashflow.creditCardDefault'),
      })
    }
    return opts
  })

  const isIncome = $derived(e.eventType === 'windfall')
  const months = $derived(eventMonth(e, now))
  const amt = $derived(e.amount ?? 0)
  const signed = $derived(isIncome ? amt : -amt)
  const status = $derived(occ ? occurrenceDisplayStatus(occ) : null)
</script>

<div id="oneoff-event-{e.id}" class="oneoff-event-row flow-row-wrap{e.enabled ? '' : ' is-off'}">
  <div class="flow-row{e.enabled ? '' : ' is-off'}">
    <button type="button" class="flow-head" onclick={() => (open = !open)}>
      <span class="dot {isIncome ? 'ok' : 'critical'}"></span>
      <span class="grow">
        <span class="name">
          {e.name}
          {#if !e.enabled}<span class="tag inline-meta">{t('futureCashflow.disabledTag')}</span>{/if}
          {#if occ && status}
            <span class="occ-status-pill {displayStatusClass(status)} inline-meta">
              {displayStatusLabel(status)}
            </span>
          {/if}
        </span>
        <span class="meta">
          {relativeWhen(months)}
          {e.date ? ` · ${isoToCalendarLabel(e.date)}` : ''}
          {#if matchedTxn}
            <span class="tag inline-meta">
              {t('futureCashflow.linkedTxn', {
                name: matchedTxn.merchant || matchedTxn.category || '',
              })}
            </span>
          {/if}
        </span>
      </span>
      <span class="amount {depositDeltaClass(signed)}">{signedMoney(signed, store.data.privacy)}</span>
      <span class="chev{open ? ' open' : ''}">⌄</span>
    </button>

    {#if showActions && occ && !linkOpen}
      <div class="oneoff-actions">
        <button type="button" class="occ-micro-btn primary" onclick={() => onConfirm?.(occ.id)}>
          {confirmOccurredLabel(occ)}
        </button>
        <button type="button" class="occ-micro-btn" onclick={() => (linkOpen = true)}>
          {t('futureCashflow.linkTxn')}
        </button>
        <button type="button" class="occ-micro-btn" onclick={() => onSkip?.(occ.id)}>
          {t('futureCashflow.notOccurred')}
        </button>
        {#if onViewLedger}
          <button type="button" class="occ-micro-btn" onclick={() => onViewLedger(e.name)}>
            {t('futureCashflow.viewLedger')}
          </button>
        {/if}
      </div>
    {/if}

    {#if linkOpen && occ && onLinkTxn}
      <TxnLinkPicker
        {occ}
        {txns}
        privacy={store.data.privacy}
        onPick={(txnId) => {
          onLinkTxn(occ.id, txnId)
          linkOpen = false
        }}
        onCancel={() => (linkOpen = false)}
      />
    {/if}

    {#if open}
      <div class="flow-body">
        <div class="row">
          <TextField label={t('futureCashflow.name')} value={e.name} onChange={(v) => set({ name: v })} />
          <SelectField
            label={t('futureCashflow.type')}
            value={e.eventType}
            options={[
              { value: 'windfall', label: t('futureCashflow.typeWindfall') },
              { value: 'one-time-purchase', label: t('futureCashflow.typeOneTimePurchase') },
            ]}
            onChange={(v) =>
              set({
                eventType: v,
                fundingSource: v === 'one-time-purchase' ? e.fundingSource ?? 'checking' : undefined,
              })}
          />
          <DateField
            label={t('futureCashflow.date')}
            value={e.date}
            onChange={(v) =>
              set({
                date: v || undefined,
                monthOffset: v ? signedMonthOffset(now, v) : e.monthOffset,
              })}
          />
          <NumberField
            label={t('futureCashflow.amount')}
            value={e.amount ?? 0}
            onChange={(v) => set({ amount: v })}
            step={50}
            min={0}
          />
        </div>
        <div class="row">
          {#if !isIncome}
            <SelectField
              label={t('futureCashflow.fundingSource')}
              value={e.fundingSource ?? 'checking'}
              options={fundingOptions}
              onChange={(v) => set({ fundingSource: v })}
            />
          {/if}
          <div class="field field-actions">
            <label>&nbsp;</label>
            <div class="flex-row-tight">
              <button type="button" class="btn ghost" onclick={() => store.toggleEvent(e.id)}>
                {e.enabled ? t('futureCashflow.disable') : t('futureCashflow.enable')}
              </button>
              <button type="button" class="btn danger" onclick={() => store.removeEvent(e.id)}>
                {t('futureCashflow.delete')}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
