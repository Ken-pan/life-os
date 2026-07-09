<script>
  // Port of src/components/AccountsView.tsx.
  import { goto } from '$app/navigation'
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import { getFinanceStore, uid } from '$lib/finance.svelte.js'
  import { money, daysSince, todayISO } from '$lib/format.js'
  import { buildAppPath } from '@life-os/finance-core/routing/app-route'
  import {
    accountTypeOptions,
    accountTypeLabel,
  } from '@life-os/finance-core/copy/terminology'
  import { sortedSnapshots } from '../../engine/holdingsPortfolio.js'
  import { resolveInstitutionMetaFrom } from '$lib/institutionLogos.js'
  import SortBySelect from './SortBySelect.svelte'
  import ImportSnapshotCard from './ImportSnapshotCard.svelte'
  import InstitutionLogo from './InstitutionLogo.svelte'
  import AccountRow from './AccountRow.svelte'

  /** @type {{ onGoStocks?: () => void }} */
  let { onGoStocks } = $props()

  const store = getFinanceStore()
  const accounts = $derived(store.data.accounts)
  const privacy = $derived(store.data.privacy)
  const holdingsSnapshots = $derived(store.data.holdingsSnapshots)

  const ASSET_TYPES = ['checking', 'savings', 'hsa', 'brokerage', 'retirement', 'property', 'other']
  const LIABILITY_TYPES = ['credit-card', 'mortgage', 'auto-loan']
  /** @type {Record<string, number>} */
  const ACCOUNT_SORT_PRIORITY = {
    checking: 0,
    savings: 1,
    hsa: 2,
    brokerage: 3,
    retirement: 4,
    property: 5,
    'credit-card': 6,
    mortgage: 7,
    'auto-loan': 8,
    other: 9,
  }

  let addAccountOpen = $state(false)
  let addAccountGroup = $state(/** @type {'assets' | 'liabilities'} */ ('assets'))
  let accountQuery = $state('')
  let accountFilter = $state(/** @type {'all' | 'assets' | 'liabilities' | 'stale' | 'reserve'} */ ('all'))
  /** @type {'logic' | 'balance-desc' | 'balance-asc' | 'name'} */
  let accountSort = $state('logic')

  const intlLoc = $derived(intlLocaleTag())

  /** @param {import('../../types.js').AccountType} type */
  function newAccount(type) {
    /** @type {import('../../types.js').Account} */
    const base = { id: uid('acct'), name: '', type, balance: 0, updatedAt: todayISO() }
    if (type === 'savings') base.annualReturn = 0.04
    if (type === 'brokerage' || type === 'retirement' || type === 'hsa') base.annualReturn = 0.06
    if (type === 'credit-card') {
      base.apr = 0.22
      base.creditMode = 'paid-in-full'
    }
    if (type === 'auto-loan' || type === 'mortgage') {
      base.apr = 0.06
      base.monthlyPayment = 0
    }
    return base
  }

  /** @param {import('../../types.js').AccountType} type */
  function addAccount(type) {
    store.upsertAccount(newAccount(type))
    addAccountOpen = false
  }

  function goStocks() {
    if (onGoStocks) onGoStocks()
    else goto(buildAppPath({ tab: 'stocks' }))
  }

  const institutionStack = $derived.by(() => {
    const seen = new Set()
    /** @type {import('../../types.js').Account[]} */
    const list = []
    for (const acct of accounts) {
      const meta = resolveInstitutionMetaFrom({ name: acct.name, accountType: acct.type })
      if (seen.has(meta.id)) continue
      seen.add(meta.id)
      list.push(acct)
      if (list.length >= 8) break
    }
    return list
  })

  const totalAssets = $derived(
    accounts.filter((a) => ASSET_TYPES.includes(a.type)).reduce((s, a) => s + a.balance, 0),
  )
  const totalLiab = $derived(
    accounts.filter((a) => !ASSET_TYPES.includes(a.type)).reduce((s, a) => s + a.balance, 0),
  )

  const filteredAccounts = $derived.by(() => {
    const accountQ = accountQuery.trim().toLowerCase()
    return accounts
      .filter((a) => {
        const typeText = accountTypeLabel(a.type).toLowerCase()
        const nameText = (a.name || '').toLowerCase()
        const noteText = (a.note || '').toLowerCase()
        const qOk =
          !accountQ || nameText.includes(accountQ) || typeText.includes(accountQ) || noteText.includes(accountQ)
        if (!qOk) return false
        if (accountFilter === 'assets') return ASSET_TYPES.includes(a.type)
        if (accountFilter === 'liabilities') return LIABILITY_TYPES.includes(a.type)
        if (accountFilter === 'stale') return daysSince(a.updatedAt) > 30
        if (accountFilter === 'reserve')
          return ['checking', 'savings', 'other'].includes(a.type) && a.liquid === false
        return true
      })
      .slice()
      .sort((a, b) => {
        if (accountSort === 'balance-desc') {
          const delta = Math.abs(b.balance) - Math.abs(a.balance)
          if (delta !== 0) return delta
          return (a.name || '').localeCompare(b.name || '', intlLoc)
        }
        if (accountSort === 'balance-asc') {
          const delta = Math.abs(a.balance) - Math.abs(b.balance)
          if (delta !== 0) return delta
          return (a.name || '').localeCompare(b.name || '', intlLoc)
        }
        if (accountSort === 'name') {
          return (a.name || '').localeCompare(b.name || '', intlLoc)
        }
        const typePriority = ACCOUNT_SORT_PRIORITY[a.type] - ACCOUNT_SORT_PRIORITY[b.type]
        if (typePriority !== 0) return typePriority
        const balanceDelta = Math.abs(b.balance) - Math.abs(a.balance)
        if (balanceDelta !== 0) return balanceDelta
        return (a.name || '').localeCompare(b.name || '', intlLoc)
      })
  })

  const brokerageAccounts = $derived(
    accounts.filter((a) => a.type === 'brokerage' || a.type === 'retirement'),
  )
  const latestSnapshot = $derived(sortedSnapshots(holdingsSnapshots)[0] ?? null)

  const addTypeOptions = $derived(
    addAccountGroup === 'assets'
      ? accountTypeOptions().filter((opt) => ASSET_TYPES.includes(opt.value))
      : accountTypeOptions().filter((opt) => LIABILITY_TYPES.includes(opt.value)),
  )
</script>

<div class="grid gap-4">
  <div class="accounts-section">
    <div class="section-head">
      <h2 class="section-title flush">{t('accounts.sectionTitle')}</h2>
      <button type="button" class="icon-btn" onclick={() => (addAccountOpen = !addAccountOpen)}>
        {addAccountOpen ? t('accounts.addToggleOpen') : t('accounts.addToggleClosed')}
      </button>
    </div>
    <p class="muted-note mt-1">{t('accounts.intro')}</p>
    <div class="account-summary-bar">
      {#if institutionStack.length > 0}
        <span class="account-logo-stack" aria-hidden="true">
          {#each institutionStack as acct (acct.id)}
            <InstitutionLogo name={acct.name} accountType={acct.type} size="sm" />
          {/each}
        </span>
      {/if}
      <span class="text-secondary">
        {t('accounts.assetsSummary')}
        <strong class="account-summary-pos">{money(totalAssets, privacy)}</strong>
        {' · '}
        {t('accounts.liabilitiesSummary')}
        <strong class="account-summary-neg">{money(totalLiab, privacy)}</strong>
      </span>
    </div>
    <div class="filter-bar">
      <div class="field filter-bar-search">
        <label>{t('accounts.searchLabel')}</label>
        <input
          class="input"
          bind:value={accountQuery}
          placeholder={t('accounts.searchPlaceholder')}
        />
      </div>
      <div class="field filter-bar-filters">
        <label>{t('accounts.filterLabel')}</label>
        <div class="seg">
          <button type="button" class={accountFilter === 'all' ? 'active' : ''} onclick={() => (accountFilter = 'all')}>
            {t('accounts.filterAll')}
          </button>
          <button type="button" class={accountFilter === 'assets' ? 'active' : ''} onclick={() => (accountFilter = 'assets')}>
            {t('accounts.filterAssets')}
          </button>
          <button type="button" class={accountFilter === 'liabilities' ? 'active' : ''} onclick={() => (accountFilter = 'liabilities')}>
            {t('accounts.filterLiabilities')}
          </button>
          <button type="button" class={accountFilter === 'stale' ? 'active' : ''} onclick={() => (accountFilter = 'stale')}>
            {t('accounts.filterStale')}
          </button>
          <button type="button" class={accountFilter === 'reserve' ? 'active' : ''} onclick={() => (accountFilter = 'reserve')}>
            {t('accounts.filterReserve')}
          </button>
        </div>
      </div>
      <SortBySelect
        label={t('accounts.sortLabel')}
        value={accountSort}
        onChange={(v) => (accountSort = v)}
        options={[
          { id: 'logic', label: t('accounts.sortLogic') },
          { id: 'balance-desc', label: t('accounts.sortBalanceDesc') },
          { id: 'balance-asc', label: t('accounts.sortBalanceAsc') },
          { id: 'name', label: t('accounts.sortName') },
        ]}
      />
    </div>
    {#if addAccountOpen}
      <div class="chart-controls mt-2">
        <div class="seg">
          <button type="button" class={addAccountGroup === 'assets' ? 'active' : ''} onclick={() => (addAccountGroup = 'assets')}>
            {t('accounts.filterAssets')}
          </button>
          <button type="button" class={addAccountGroup === 'liabilities' ? 'active' : ''} onclick={() => (addAccountGroup = 'liabilities')}>
            {t('accounts.filterLiabilities')}
          </button>
        </div>
        {#each addTypeOptions as opt (opt.value)}
          <button type="button" class="icon-btn" onclick={() => addAccount(opt.value)}>
            + {opt.label}
          </button>
        {/each}
      </div>
    {/if}
    <div class="grid gap-3">
      {#if accounts.length === 0}
        <div class="empty">{t('accounts.empty')}</div>
      {:else if filteredAccounts.length === 0}
        <div class="empty">{t('accounts.emptyFilter')}</div>
      {:else}
        {#each filteredAccounts as a (a.id)}
          <AccountRow {a} {accounts} {privacy} />
        {/each}
      {/if}
    </div>
  </div>

  <div class="accounts-section">
    <div class="section-head">
      <h2 class="section-title flush">{t('accounts.holdingsTitle')}</h2>
      <button type="button" class="btn" onclick={goStocks}>{t('accounts.goStocks')}</button>
    </div>
    {#if latestSnapshot}
      <p class="muted-note mt-1">
        {t('accounts.snapshotSummary', {
          date:
            latestSnapshot.asOfDate +
            (latestSnapshot.asOfTimeLocal ? ` · ${latestSnapshot.asOfTimeLocal}` : ''),
          value: money(latestSnapshot.holdingsMarketValue, privacy),
          count: String(latestSnapshot.positionCount),
        })}
        {t('accounts.snapshotHint')}
      </p>
    {:else}
      <p class="muted-note mt-1">{t('accounts.importHint')}</p>
    {/if}
    <ImportSnapshotCard {accounts} {privacy} {brokerageAccounts} compact />
  </div>
</div>
