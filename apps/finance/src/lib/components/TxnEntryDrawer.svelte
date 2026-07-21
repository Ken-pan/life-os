<script>
  // Port of src/components/TxnEntryDrawer.tsx.
  import { onMount } from 'svelte'
  import { t, locale } from '$lib/i18n.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { toTxnPayload } from '$lib/txnPayload.js'
  import {
    categoryDisplayLabel,
    DEFAULT_CATEGORY_KEYS,
  } from '../../copy/categories.js'
  import { money, formatDateLocalized } from '$lib/format.js'
  import { sensory } from '@life-os/platform-web/kenos-sensory'
  import {
    clearMoneyOverlay,
    setMoneyOverlay,
  } from '$lib/kenos/financeSpaceAdapter.js'

  onMount(() => {
    setMoneyOverlay('compose')
    return () => clearMoneyOverlay()
  })

  /** @param {number} [offsetDays] */
  function localToday(offsetDays = 0) {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /** @type {{
   *   onAdd: (input: import('../../store/transactions.js').NewTxn) => Promise<void>,
   *   onClose: () => void,
   *   privacy: boolean,
   * }} */
  let { onAdd, onClose, privacy } = $props()

  const txStore = getTransactionsStore()
  const today = localToday()
  const yesterday = localToday(-1)

  let amountText = $state('')
  /** @type {import('../../engine/transactions.js').FlowType} */
  let flow = $state('expense')
  let category = $state('')
  let merchant = $state('')
  let account = $state('')
  let date = $state(today)
  let showMore = $state(false)
  let busy = $state(false)
  let err = $state(null)
  let savedCount = $state(0)
  let lastSaved = $state(null)
  /** @type {HTMLInputElement | null} */
  let amountRef = $state(null)

  const suggestions = $derived.by(() => {
    const catCount = new Map()
    const merchants = []
    const accounts = []
    for (const txn of txStore.txns.slice(0, 400)) {
      if (txn.inSpending && txn.category && txn.category !== 'Uncategorized') {
        catCount.set(txn.category, (catCount.get(txn.category) ?? 0) + 1)
      }
      if (
        txn.merchant &&
        txn.merchant !== 'Manual' &&
        !merchants.includes(txn.merchant)
      ) {
        merchants.push(txn.merchant)
      }
      if (
        txn.account &&
        txn.account !== 'Manual' &&
        !accounts.includes(txn.account)
      ) {
        accounts.push(txn.account)
      }
    }
    const recentCats = [...catCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
    const merged = [...new Set([...recentCats, ...DEFAULT_CATEGORY_KEYS])]
    const seenLabels = new Set()
    const categories = merged
      .filter((c) => {
        const label = categoryDisplayLabel(c)
        if (seenLabels.has(label)) return false
        seenLabels.add(label)
        return true
      })
      .slice(0, 10)
    return {
      categories,
      merchants: merchants.slice(0, 12),
      accounts: accounts.slice(0, 6),
    }
  })

  const amount = $derived(Number(amountText))
  const valid = $derived(Number.isFinite(amount) && amount > 0)

  /** @param {boolean} keepOpen */
  async function save(keepOpen) {
    if (!valid || busy) return
    busy = true
    err = null
    try {
      await onAdd(
        toTxnPayload({
          date,
          merchant: merchant.trim() || 'Manual',
          category: category.trim() || 'Uncategorized',
          account: account.trim() || 'Manual',
          flow,
          amount,
        }),
      )
      void sensory('success')
      if (keepOpen) {
        savedCount += 1
        lastSaved = `${category.trim() ? categoryDisplayLabel(category.trim()) : t('txn.uncategorized')} ${money(amount, privacy)}`
        amountText = ''
        merchant = ''
        amountRef?.focus()
      } else {
        onClose()
      }
    } catch (error) {
      err = error instanceof Error ? error.message : t('txn.saveFailed')
      void sensory('error')
    } finally {
      busy = false
    }
  }
</script>

<div
  class="drawer-backdrop kenos-drawer-backdrop"
  onclick={onClose}
  role="presentation"
></div>
<aside class="drawer kenos-drawer-panel quick-txn">
  <div class="drawer-head">
    <h2>
      {t('txn.title')}
      {#if savedCount > 0}
        <span class="tag inline-meta"
          >{t('txn.savedCount', { count: savedCount })}</span
        >
      {/if}
    </h2>
    <button type="button" class="icon-btn" onclick={onClose}
      >{t('common.close')}</button
    >
  </div>

  <form
    onsubmit={(e) => {
      e.preventDefault()
      void save(false)
    }}
  >
    <div
      class="seg quick-txn-flow"
      role="radiogroup"
      aria-label={t('txn.flowType')}
    >
      <button
        type="button"
        class={flow === 'expense' ? 'active' : ''}
        onclick={() => (flow = 'expense')}
      >
        {t('txn.expense')}
      </button>
      <button
        type="button"
        class={flow === 'income' ? 'active' : ''}
        onclick={() => (flow = 'income')}
      >
        {t('txn.income')}
      </button>
      <button
        type="button"
        class={flow === 'refund_or_reversal' ? 'active' : ''}
        onclick={() => (flow = 'refund_or_reversal')}
      >
        {t('txn.refund')}
      </button>
    </div>

    <div class="quick-txn-amount">
      <span class="quick-txn-currency">$</span>
      <input
        bind:this={amountRef}
        type="number"
        inputmode="decimal"
        step="0.01"
        min="0"
        placeholder="0.00"
        bind:value={amountText}
        autofocus
        aria-label={t('txn.amount')}
      />
    </div>

    <div class="quick-txn-section">
      <span class="quick-txn-label">{t('txn.category')}</span>
      <div class="quick-txn-chips">
        {#each suggestions.categories as c (c)}
          <button
            type="button"
            class="chip{category === c ? ' active' : ''}"
            onclick={() => (category = category === c ? '' : c)}
          >
            {categoryDisplayLabel(c)}
          </button>
        {/each}
      </div>
      <input
        class="input"
        bind:value={category}
        placeholder={t('txn.categoryPlaceholder')}
      />
    </div>

    <div class="quick-txn-section">
      <span class="quick-txn-label">{t('txn.date')}</span>
      <div class="quick-txn-chips">
        <button
          type="button"
          class="chip{date === today ? ' active' : ''}"
          onclick={() => (date = today)}
        >
          {t('txn.today')}
        </button>
        <button
          type="button"
          class="chip{date === yesterday ? ' active' : ''}"
          onclick={() => (date = yesterday)}
        >
          {t('txn.yesterday')}
        </button>
        <input
          type="date"
          class="input quick-txn-date"
          lang={locale()}
          bind:value={date}
          aria-label={t('txn.pickDate')}
        />
        <span class="muted-note quick-txn-date-zh"
          >{formatDateLocalized(date)}</span
        >
      </div>
    </div>

    <button
      type="button"
      class="quick-txn-more-toggle"
      onclick={() => (showMore = !showMore)}
      aria-expanded={showMore}
    >
      {showMore
        ? t('txn.merchantAccountToggleHide')
        : t('txn.merchantAccountToggleShow')}
    </button>
    {#if showMore}
      <div class="quick-txn-section">
        <input
          class="input"
          bind:value={merchant}
          placeholder={t('txn.merchantPlaceholder')}
          list="quick-txn-merchants"
        />
        <datalist id="quick-txn-merchants">
          {#each suggestions.merchants as m (m)}<option value={m}
            ></option>{/each}
        </datalist>
        {#if suggestions.accounts.length > 0}
          <div class="quick-txn-chips mt-2">
            {#each suggestions.accounts as a (a)}
              <button
                type="button"
                class="chip{account === a ? ' active' : ''}"
                onclick={() => (account = account === a ? '' : a)}
              >
                {a}
              </button>
            {/each}
          </div>
        {/if}
        <input
          class="input mt-2"
          bind:value={account}
          placeholder={t('txn.accountPlaceholder')}
        />
      </div>
    {/if}

    {#if lastSaved}
      <p class="muted-note quick-txn-saved">
        {t('txn.lastSaved', { detail: lastSaved })}
      </p>
    {/if}
    {#if err}<p class="text-critical mt-2">{err}</p>{/if}

    <div class="quick-txn-actions">
      <button
        type="button"
        class="btn ghost"
        disabled={!valid || busy}
        onclick={() => void save(true)}
      >
        {t('common.saveAndContinue')}
      </button>
      <button class="btn" type="submit" disabled={!valid || busy}>
        {busy ? t('common.saving') : t('common.save')}
      </button>
    </div>
  </form>
</aside>
