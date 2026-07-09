<script>
  // Port of src/components/AccountReconcileView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { money, signedMoney, depositDeltaClass } from '$lib/format.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import {
    computeReconciliationPreview,
    isReconcilableCashAccount,
    reconciliationAdjustmentAmount,
  } from '../../engine/reconciliation.js'
  import {
    finalizeAccountReconciliation,
    loadBalanceAssertions,
  } from '$lib/repo.js'
  import { trackFunnel, FUNNEL_EVENTS } from '$lib/analytics.js'

  /** @type {{ data: import('../../types.js').FinanceData }} */
  let { data } = $props()

  const transactions = getTransactionsStore()
  const store = getFinanceStore()
  const timeline = getTimelineStore()
  const privacy = $derived(data.privacy)

  const accounts = $derived(data.accounts.filter(isReconcilableCashAccount))

  let assertions = $state(/** @type {import('../../types.js').BalanceAssertion[]} */ ([]))
  let loading = $state(true)
  let error = $state(/** @type {string | null} */ (null))
  let selectedId = $state('')
  let statedBalance = $state('')
  let assertionDate = $state(todayIso())
  let note = $state('')
  let busy = $state(false)
  let result = $state(/** @type {import('$lib/repo.js').FinalizeReconciliationResult | null} */ (null))

  const selected = $derived(accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null)

  function todayIso() {
    return new Date().toISOString().slice(0, 10)
  }

  /** @param {unknown} e */
  function errorMessage(e, fallback) {
    if (e instanceof Error && e.message) return e.message
    if (e && typeof e === 'object' && 'message' in e) {
      const msg = /** @type {{ message: unknown }} */ (e).message
      if (typeof msg === 'string' && msg.trim()) return msg
    }
    return fallback
  }

  /** @param {import('../../types.js').BalanceAssertion[]} list @param {string} accountId */
  function lastAssertionForAccount(list, accountId) {
    return list.find((a) => a.accountId === accountId) ?? null
  }

  async function load() {
    loading = true
    error = null
    try {
      assertions = await loadBalanceAssertions()
    } catch (e) {
      error = errorMessage(e, t('reconcile.loadFailed'))
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void load()
  })

  $effect(() => {
    if (!selectedId && accounts[0]) selectedId = accounts[0].id
  })

  const preview = $derived.by(() => {
    if (!selected) return null
    const parsed = Number(statedBalance)
    if (!Number.isFinite(parsed)) return null
    const last = lastAssertionForAccount(assertions, selected.id)
    return computeReconciliationPreview({
      account: selected,
      assertionDate,
      statedBalance: parsed,
      txns: transactions.txns,
      lastAssertion: last ? { date: last.date, amount: last.amount } : null,
    })
  })

  /** @param {boolean} withAdjustment */
  async function onReconcile(withAdjustment) {
    if (!selected || !preview) return
    busy = true
    error = null
    result = null
    try {
      const res = await finalizeAccountReconciliation({
        account: selected,
        assertionDate,
        statedBalance: preview.statedBalance,
        note: note.trim() || undefined,
        adjustmentAmount: reconciliationAdjustmentAmount(preview.difference),
        createAdjustment: withAdjustment && !preview.isBalanced,
      })
      store.upsertAccount({
        ...selected,
        balance: preview.statedBalance,
        updatedAt: new Date().toISOString(),
      })
      result = res
      assertions = [res.assertion, ...assertions]
      await transactions.reload()
      await timeline.reload()
      statedBalance = ''
      note = ''
      trackFunnel(FUNNEL_EVENTS.reviewReconcileCompleted, {
        accountId: selected.id,
        withAdjustment: withAdjustment && !preview.isBalanced,
        balanced: preview.isBalanced,
      })
    } catch (e) {
      error = errorMessage(e, t('reconcile.reconcileFailed'))
    } finally {
      busy = false
    }
  }

  const lastForSelected = $derived(selected ? lastAssertionForAccount(assertions, selected.id) : null)
</script>

{#if accounts.length === 0}
  <div class="card">
    <h3>{t('reconcile.title')}</h3>
    <p class="muted-note">{t('reconcile.noAccounts')}</p>
  </div>
{:else}
  <div class="grid gap-4">
    <div class="card">
      <div class="card-head">
        <h3>{t('reconcile.title')}</h3>
        <button class="btn ghost" onclick={() => void load()} disabled={loading}>
          {t('reconcile.refresh')}
        </button>
      </div>
      <p class="muted-note">{t('reconcile.intro')}</p>
      {#if error}<div class="banner">{error}</div>{/if}

      <div class="grid cols-2 gap-3 mt-3">
        <label class="field">
          <span>{t('reconcile.account')}</span>
          <select
            class="input"
            value={selected?.id ?? ''}
            onchange={(e) => {
              selectedId = e.currentTarget.value
              result = null
            }}
          >
            {#each accounts as a (a.id)}
              <option value={a.id}>
                {t('reconcile.accountOption', { name: a.name, balance: money(a.balance, privacy) })}
              </option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>{t('reconcile.assertionDate')}</span>
          <input
            class="input"
            type="date"
            value={assertionDate}
            onchange={(e) => (assertionDate = e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span>{t('reconcile.bankBalance')}</span>
          <input
            class="input"
            type="number"
            step="0.01"
            placeholder={t('reconcile.bankBalancePlaceholder')}
            value={statedBalance}
            oninput={(e) => (statedBalance = e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span>{t('reconcile.noteOptional')}</span>
          <input
            class="input"
            placeholder={t('reconcile.notePlaceholder')}
            value={note}
            oninput={(e) => (note = e.currentTarget.value)}
          />
        </label>
      </div>

      {#if lastForSelected}
        <p class="muted-note mt-2-5">
          {t('reconcile.lastAssertion', {
            date: lastForSelected.date,
            amount: money(lastForSelected.amount, privacy),
          })}
        </p>
      {/if}

      {#if preview}
        <div class="card card-compact mt-3">
          <h3>{t('reconcile.previewTitle')}</h3>
          {#if preview.isOpeningAssertion}
            <p class="muted-note">
              {t('reconcile.firstAssertion', {
                balance: money(preview.expectedBalance, privacy),
              })}
            </p>
          {:else}
            <div class="grid kpi-row-4">
              <div class="item">
                <div class="grow">
                  <div class="meta">{t('reconcile.lastAssertionStat')}</div>
                  <div class="name">{money(preview.lastAssertionAmount ?? 0, privacy)}</div>
                </div>
              </div>
              <div class="item">
                <div class="grow">
                  <div class="meta">{t('reconcile.txnNet')}</div>
                  <div class="name">{signedMoney(preview.txnNetSinceLast, privacy)}</div>
                  <div class="meta">{t('reconcile.txnCount', { count: preview.txnCount })}</div>
                </div>
              </div>
              <div class="item">
                <div class="grow">
                  <div class="meta">{t('reconcile.expectedBalance')}</div>
                  <div class="name">{money(preview.expectedBalance, privacy)}</div>
                </div>
              </div>
              <div class="item">
                <div class="grow">
                  <div class="meta">{t('reconcile.difference')}</div>
                  <div class="name {depositDeltaClass(-preview.difference)}">
                    {signedMoney(preview.difference, privacy)}
                  </div>
                </div>
              </div>
            </div>
          {/if}
          {#if !preview.isOpeningAssertion && Math.abs(preview.difference) >= 0.005}
            <p class="muted-note mt-2">
              {t('reconcile.diffHint', { count: preview.txnCount })}
            </p>
          {/if}
          <div class="row mt-3">
            {#if preview.isBalanced}
              <button class="btn" disabled={busy} onclick={() => void onReconcile(false)}>
                {busy ? t('reconcile.processing') : t('reconcile.confirmMatch')}
              </button>
            {:else}
              <button class="btn" disabled={busy} onclick={() => void onReconcile(false)}>
                {busy ? t('reconcile.processing') : t('reconcile.confirmWithoutAdj')}
              </button>
              <button class="btn ghost" disabled={busy} onclick={() => void onReconcile(true)}>
                {t('reconcile.confirmWithAdj')}
              </button>
            {/if}
          </div>
        </div>
      {/if}

      {#if result}
        <div class="banner positive mt-3">
          {t('reconcile.done', {
            date: result.assertion.date,
            amount: money(result.assertion.amount, privacy),
          })}
          {result.adjustmentTxn
            ? t('reconcile.doneWithAdj', {
                amount: signedMoney(result.adjustmentTxn.amount, privacy),
              })
            : t('reconcile.doneNoAdj')}
        </div>
      {/if}
    </div>

    <div class="card">
      <h3>{t('reconcile.historyTitle')}</h3>
      {#if loading}
        <p class="muted-note">{t('reconcile.loading')}</p>
      {:else if assertions.length === 0}
        <p class="muted-note">{t('reconcile.noHistory')}</p>
      {:else}
        <div class="life-os-scroll-x">
          <table class="review-table">
            <thead>
              <tr>
                <th>{t('reconcile.colDate')}</th>
                <th>{t('reconcile.colAccount')}</th>
                <th>{t('reconcile.colBalance')}</th>
                <th>{t('reconcile.colNote')}</th>
              </tr>
            </thead>
            <tbody>
              {#each assertions.slice(0, 20) as a (a.id)}
                {@const acct = data.accounts.find((x) => x.id === a.accountId)}
                <tr>
                  <td>{a.date}</td>
                  <td>{acct?.name ?? a.accountId}</td>
                  <td>{money(a.amount, privacy)}</td>
                  <td>
                    {a.note ?? (a.adjustmentTxnId ? t('reconcile.noteWithAdj') : t('common.emDash'))}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
{/if}
