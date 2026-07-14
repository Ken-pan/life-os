<script>
  // AccountRow — from AccountsView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { money, daysSince, formatDateForIntl, todayISO } from '$lib/format.js'
  import {
    accountTypeLabel,
    annualFeeLabel,
    aprLabel,
    liquidCashLabel,
    reserveAccountCheckboxLabel,
    reserveAccountTooltip,
    statementBalanceLabel,
  } from '@life-os/finance-core/copy/terminology'
  import { accountTypeOptions } from '@life-os/finance-core/copy/terminology'
  import { resolveCardPortal } from '$lib/cardPortals.js'
  import { resolveInstitutionMetaFrom } from '$lib/institutionLogos.js'
  import DateField from './fields/DateField.svelte'
  import NumberField from './fields/NumberField.svelte'
  import PercentField from './fields/PercentField.svelte'
  import SelectField from './fields/SelectField.svelte'
  import TextField from './fields/TextField.svelte'
  import CardPortalLink from './CardPortalLink.svelte'
  import InstitutionLogo from './InstitutionLogo.svelte'
  import DueDayField from './DueDayField.svelte'
  import { DUE_DAY_LAST_OF_MONTH } from '../../types.js'

  const ACCOUNT_TYPES = accountTypeOptions
  const ASSET_TYPES = ['checking', 'savings', 'hsa', 'brokerage', 'retirement', 'property', 'other']
  const LIABILITY_TYPES = ['credit-card', 'mortgage', 'auto-loan']

  /** @param {number | undefined} dueDay */
  function dueDayLabel(dueDay) {
    if (dueDay == null) return null
    if (dueDay === DUE_DAY_LAST_OF_MONTH || dueDay >= 29) return t('accounts.dueDayLast')
    return t('accounts.dueDayNth', { day: String(dueDay) })
  }

  /** @type {{
   *   a: import('../../types.js').Account,
   *   accounts: import('../../types.js').Account[],
   *   privacy: boolean,
   *   bulkOpenVersion?: number,
   *   bulkOpenValue?: boolean,
   * }} */
  let { a, accounts, privacy, bulkOpenVersion = 0, bulkOpenValue = false } = $props()

  const store = getFinanceStore()
  let open = $state(bulkOpenVersion > 0 ? bulkOpenValue : !a.name)

  /** @param {Partial<import('../../types.js').Account>} patch */
  function set(patch) {
    store.upsertAccount({
      ...a,
      ...patch,
      ...(patch.balance !== undefined ? { balanceManual: true } : {}),
      updatedAt: todayISO(),
    })
  }

  const showReturn = $derived(['savings', 'hsa', 'brokerage', 'retirement'].includes(a.type))
  const isCard = $derived(a.type === 'credit-card')
  const isLoan = $derived(LIABILITY_TYPES.includes(a.type) && !isCard)
  const cardPortal = $derived(isCard ? resolveCardPortal(a) : null)
  const isCashAsset = $derived(['checking', 'savings', 'other'].includes(a.type))
  const isAsset = $derived(ASSET_TYPES.includes(a.type))
  const isBrokerage = $derived(a.type === 'brokerage')
  const canManualBalance = $derived(isBrokerage || a.type === 'retirement' || a.type === 'hsa')
  const paymentSources = $derived(
    accounts.filter(
      (x) => x.id !== a.id && (x.type === 'checking' || x.type === 'savings' || x.type === 'other'),
    ),
  )
  const isReserve = $derived(isCashAsset && a.liquid === false)
  const age = $derived(daysSince(a.updatedAt))
  const stale = $derived(age > 30)
  const brand = $derived(resolveInstitutionMetaFrom({ name: a.name, accountType: a.type }))
  const dueMeta = $derived(dueDayLabel(a.dueDay))
</script>

<div class="flow-row account-card">
  <button type="button" class="flow-head" onclick={() => (open = !open)}>
    <span class="account-card-watermark" aria-hidden="true">{brand.label}</span>
    <InstitutionLogo name={a.name} accountType={a.type} size="lg" />
    <span class="grow">
      <span class="name">
        {a.name || t('accounts.unnamed')}
        <span class="tag inline-meta">{accountTypeLabel(a.type)}</span>
        {#if stale}
          <span class="tag warn inline-meta">
            {Number.isFinite(age)
              ? t('accounts.staleDays', { days: String(age) })
              : t('accounts.staleDaysUnknown')}
          </span>
        {/if}
      </span>
      <span class="meta">
        {a.updatedAt
          ? t('accounts.updatedAt', { date: formatDateForIntl(a.updatedAt) })
          : t('accounts.noUpdatedAt')}
        {#if isCard && a.creditMode === 'paid-in-full'}
          <span class="inline-meta">{t('accounts.paidInFull')}</span>
        {/if}
        {#if isCard && dueMeta}
          <span class="inline-meta">{t('accounts.dueDayMeta', { label: dueMeta })}</span>
        {/if}
        {#if cardPortal}
          <span class="inline-meta">
            · <CardPortalLink portal={cardPortal} compact showLogo={false} />
          </span>
        {/if}
        {#if isReserve}<span class="inline-meta">{t('accounts.reserveMeta')}</span>{/if}
      </span>
    </span>
    <span class="amount{isAsset ? '' : ' amount--negative'}">
      {isAsset ? money(a.balance, privacy) : `-${money(a.balance, privacy)}`}
    </span>
    <span class="chev{open ? ' open' : ''}">⌄</span>
  </button>

  {#if open}
    <div class="flow-body">
      <div class="row">
        <TextField
          label={t('accounts.name')}
          value={a.name}
          onChange={(v) => set({ name: v })}
          placeholder={t('accounts.namePlaceholder')}
        />
        <SelectField
          label={t('accounts.type')}
          value={a.type}
          options={ACCOUNT_TYPES()}
          onChange={(v) => set({ type: v })}
        />
        <NumberField
          label={ASSET_TYPES.includes(a.type) ? t('accounts.balanceAsset') : t('accounts.balanceLiability')}
          value={a.balance}
          onChange={(v) => set({ balance: v })}
          step={100}
        />
      </div>
      <div class="row">
        {#if showReturn}
          <PercentField
            label={t('accounts.annualReturn')}
            value={a.annualReturn ?? 0}
            onChange={(v) => set({ annualReturn: v })}
          />
        {/if}
        {#if isLoan}
          <PercentField label={aprLabel()} value={a.apr ?? 0} onChange={(v) => set({ apr: v })} />
        {/if}
        {#if isCard}
          <PercentField label={aprLabel()} value={a.apr ?? 0.22} onChange={(v) => set({ apr: v })} />
          <SelectField
            label={t('accounts.creditMode')}
            value={a.creditMode ?? 'paid-in-full'}
            options={[
              { value: 'paid-in-full', label: t('accounts.creditPaidInFull') },
              { value: 'revolving', label: t('accounts.creditRevolving') },
            ]}
            onChange={(v) => set({ creditMode: v })}
          />
        {/if}
        {#if a.type === 'auto-loan' || a.type === 'mortgage'}
          <NumberField
            label={t('accounts.monthlyPayment')}
            value={a.monthlyPayment ?? 0}
            onChange={(v) => set({ monthlyPayment: v })}
            step={50}
          />
          <NumberField
            label={t('accounts.remainingMonths')}
            value={a.termMonths ?? 0}
            onChange={(v) => set({ termMonths: Math.max(0, Math.round(v)) })}
            step={1}
            min={0}
          />
        {/if}
        {#if isCashAsset}
          <label class="field field-inline-check" title={reserveAccountTooltip()}>
            <input
              type="checkbox"
              checked={isReserve}
              onchange={(e) => set({ liquid: !e.currentTarget.checked })}
            />
            {reserveAccountCheckboxLabel()}
          </label>
        {/if}
        <div class="field field-actions">
          <label>&nbsp;</label>
          <button type="button" class="btn danger" onclick={() => store.removeAccount(a.id)}>
            {t('accounts.delete')}
          </button>
        </div>
      </div>
      {#if isCard}
        <div class="row">
          <NumberField
            label={statementBalanceLabel()}
            value={a.statementBalance ?? 0}
            onChange={(v) => set({ statementBalance: v })}
            step={50}
          />
          <DueDayField value={a.dueDay} onChange={(v) => set({ dueDay: v })} />
          <div class="field">
            <label>{t('accounts.paymentDayLabel')}</label>
            <input
              class="input"
              type="number"
              inputmode="numeric"
              min="1"
              max="28"
              value={a.paymentDay ?? ''}
              placeholder={t('accounts.paymentDayPlaceholder')}
              oninput={(e) => {
                const raw = e.currentTarget.value.trim()
                set({
                  paymentDay:
                    raw === '' ? undefined : Math.min(28, Math.max(1, Math.round(Number(raw)))),
                })
              }}
            />
            <span class="text-muted text-sm mt-1">{t('accounts.paymentDayHint')}</span>
          </div>
          <SelectField
            label={t('accounts.autoPay')}
            value={a.autoPayMode ?? (a.creditMode === 'revolving' ? 'minimum' : 'statement')}
            options={[
              { value: 'full-balance', label: t('accounts.autoPayFull') },
              { value: 'statement', label: t('accounts.autoPayStatement') },
              { value: 'minimum', label: t('accounts.autoPayMinimum') },
              { value: 'none', label: t('accounts.autoPayNone') },
            ]}
            onChange={(v) => set({ autoPayMode: v })}
          />
        </div>
      {/if}
      {#if isCard}
        <div class="row">
          <SelectField
            label={t('accounts.payFrom')}
            value={a.paymentAccountId ?? ''}
            options={[
              { value: '', label: t('accounts.payFromDefault', { liquidCash: liquidCashLabel() }) },
              ...paymentSources.map((x) => ({
                value: x.id,
                label: `${x.name || t('accounts.payFromUnnamed')}${x.liquid === false ? t('accounts.payFromReserve') : ''}`,
              })),
            ]}
            onChange={(v) => set({ paymentAccountId: v || undefined })}
          />
          <NumberField
            label={annualFeeLabel()}
            value={a.annualFee ?? 0}
            onChange={(v) => set({ annualFee: v })}
            step={5}
          />
          <DateField
            label={t('accounts.annualFeeDate')}
            value={a.annualFeeDate}
            onChange={(v) => set({ annualFeeDate: v })}
          />
        </div>
      {/if}
      {#if isCard && cardPortal}
        <div class="row">
          <div class="field">
            <label>{t('accounts.website')}</label>
            <CardPortalLink portal={cardPortal} />
          </div>
        </div>
      {/if}
      {#if canManualBalance}
        <div class="row">
          <label class="field field-inline-check" title={t('accounts.manualBalanceTitle')}>
            <input
              type="checkbox"
              checked={a.balanceManual ?? false}
              onchange={(e) => set({ balanceManual: e.currentTarget.checked })}
            />
            {t('accounts.manualBalance')}
          </label>
        </div>
      {/if}
      <div class="row">
        <TextField
          label={t('accounts.note')}
          value={a.note ?? ''}
          onChange={(v) => set({ note: v || undefined })}
          placeholder={t('accounts.notePlaceholder')}
        />
      </div>
    </div>
  {/if}
</div>
