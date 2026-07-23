<script>
  // Port of src/components/ExtensionSyncBridge.tsx — Chrome extension capture bridge.
  import { onDestroy } from 'svelte'
  import { planCashReanchorTargets } from '../../engine/reconciliation.js'
  import {
    BRIDGE_MSG,
    buildAppSnapshot,
    computeEnvelopePayloadHash,
    holdingsCaptureToSnapshot,
    isCaptureEnvelope,
    isMerchantOrdersCaptureData,
    loadProcessedIds,
    markProcessed,
    newTxnToExtensionSyncPayload,
    planAccountsBalanceUpdate,
    planHoldingsBalanceUpdate,
    planMerchantOrderEnrichment,
    planNewTransactions,
    planRecurringUpdates,
  } from '$lib/extensionSync.js'
  import { EXTENSION_REANCHOR_NOTE } from '$lib/cashReanchor.js'
  import { coverageGaps } from '../../engine/transactions.js'
  import { planTxnBackfill, markBackfillRead } from '$lib/txnBackfill.js'
  import { finalizeExtensionSync } from '$lib/repo.js'
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import InstitutionLogo from './InstitutionLogo.svelte'
  import { money, redactMoneyText } from '$lib/format.js'

  /** @typedef {import('@life-os/finance-core/extension-sync').CaptureEnvelope} CaptureEnvelope */
  /** @typedef {import('@life-os/finance-core/extension-sync').SyncReport} SyncReport */
  /** @typedef {import('@life-os/finance-core/extension-sync').BridgeSyncResult} BridgeSyncResult */
  /** @typedef {import('../../engine/transactions.js').Txn} Txn */

  const SOURCE_LABEL = {
    robinhood: 'Robinhood',
    rocketmoney: 'Rocket Money',
    fidelity: 'Fidelity',
    amazon: 'Amazon',
    target: 'Target',
    bestbuy: 'Best Buy',
  }

  const DRAIN_RETRY_MS = 1500
  const HELLO_MAX_ATTEMPTS = 6
  const FINALIZE_ATTEMPTS = 3

  const finance = getFinanceStore()
  const transactions = getTransactionsStore()
  const timeline = getTimelineStore()

  /** @type {SyncReport[]} */
  let reports = $state([])
  /** @type {string | null} */
  let syncError = $state(null)

  /** @type {boolean} */
  let busy = false
  /** @type {CaptureEnvelope[]} */
  let queue = []
  /** @type {ReturnType<typeof setTimeout> | null} */
  let drainRetryTimer = null
  /** @type {Txn[]} */
  let sessionTxns = []
  /** @type {(() => void) | null} */
  let cleanup = null

  /** @param {unknown} e */
  function rpcErrorCode(e) {
    if (e && typeof e === 'object' && 'code' in e) {
      const code = /** @type {{ code?: unknown }} */ (e).code
      return typeof code === 'string' ? code : undefined
    }
    return undefined
  }

  /** @param {unknown} e */
  function isPermanentRpcError(e) {
    const code = rpcErrorCode(e)
    return code === '22P02' || code === '22007' || code === '22008'
  }

  /** @param {Parameters<typeof finalizeExtensionSync>[0]} input */
  async function finalizeCaptureWithRetry(input) {
    let lastErr = null
    for (let i = 0; i < FINALIZE_ATTEMPTS; i += 1) {
      try {
        return await finalizeExtensionSync(input)
      } catch (e) {
        lastErr = e
        if (isPermanentRpcError(e)) break
        if (i < FINALIZE_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        }
      }
    }
    throw lastErr
  }

  /** @param {Txn} txn */
  function txnKey(txn) {
    return `${txn.date}|${txn.merchant}|${txn.amount}`
  }

  function pruneSessionTxns() {
    if (sessionTxns.length === 0) return
    const counts = new Map()
    for (const txn of transactions.txns) {
      counts.set(txnKey(txn), (counts.get(txnKey(txn)) ?? 0) + 1)
    }
    sessionTxns = sessionTxns.filter((txn) => {
      const c = counts.get(txnKey(txn)) ?? 0
      if (c > 0) {
        counts.set(txnKey(txn), c - 1)
        return false
      }
      return true
    })
  }

  $effect(() => {
    transactions.txns
    finance.data
    pruneSessionTxns()
  })

  function startBridge() {
    /** @param {CaptureEnvelope} env */
    const applyOne = async (env) => {
      const store = finance
      /** @type {string[]} */
      const notes = []
      let summary
      /** @type {string[]} */
      const updatedAccountIds = []
      let rpcFinalized = false

      if (env.kind === 'holdings') {
        const { snapshot, warnings } = holdingsCaptureToSnapshot(env, store.data.accounts)
        notes.push(...warnings)
        store.upsertHoldingsSnapshot(snapshot)
        summary = t('extension.holdingsSummary', {
          count: snapshot.positionCount,
          value: money(snapshot.holdingsMarketValue, store.data.privacy),
        })
        const plan = planHoldingsBalanceUpdate(env, store.data.accounts)
        notes.push(...plan.notes)
        for (const a of plan.updates) {
          store.upsertAccount(a)
          updatedAccountIds.push(a.id)
        }
        if (plan.updates.length > 0) summary += t('extension.holdingsUpdated')
      } else if (env.kind === 'accounts') {
        const plan = planAccountsBalanceUpdate(env, store.data.accounts)
        notes.push(...plan.notes)
        for (const a of plan.updates) {
          store.upsertAccount(a)
          updatedAccountIds.push(a.id)
        }
        summary = t('extension.accountsSummary', { count: plan.updates.length })
      } else if (env.kind === 'recurring') {
        const plan = planRecurringUpdates(env, store.data.cashFlows)
        notes.push(...plan.notes)
        for (const c of plan.updates) store.upsertCashFlow(c)
        summary = t('extension.recurringSummary', {
          updated: plan.updates.length,
          missing: plan.missing.length,
        })
      } else if (env.kind === 'merchant_orders') {
        // 定向抓单：商家订单页最新订单 → 挑最 match 的交易写 purchase_enrichment。
        if (!isMerchantOrdersCaptureData(env.data)) {
          throw new Error('merchant_orders capture 数据格式不合法')
        }
        const plan = planMerchantOrderEnrichment(env.data, transactions.txns)
        const byId = new Map(transactions.txns.map((x) => [x.id, x]))
        let linked = 0
        for (const u of plan.updates) {
          const txn = byId.get(u.txnId)
          if (!txn) continue
          await transactions.editTxn({ ...txn, purchaseEnrichment: u.enrichment })
          linked += 1
          notes.push(
            `${txn.date} ${txn.merchant} $${Math.abs(txn.amount).toFixed(2)} → ${u.orderId}`,
          )
        }
        summary =
          linked > 0
            ? t('extension.merchantOrdersSummary', {
                linked,
                orders: plan.ordersConsidered,
                skipped: plan.skippedExisting,
              })
            : t('extension.merchantOrdersNone', {
                orders: plan.ordersConsidered,
              })
      } else {
        // 一批交易抓取已经送达：悬着的回读请求就此关单（哪怕这批里没有
        // 缺口段的行——那段可能确实没消费，「只读一次」以读过为准）。
        markBackfillRead()
        const known = [...transactions.txns, ...sessionTxns]
        const plan = planNewTransactions(env, known)
        const payloadHash = await computeEnvelopePayloadHash(env)
        const syncResult = await finalizeCaptureWithRetry({
          envelopeId: env.id,
          payloadHash,
          captureSource: env.source,
          captureKind: env.kind,
          transactions: plan.txns.map(newTxnToExtensionSyncPayload),
        })
        const mergedRows = [
          ...syncResult.transactions,
          ...(syncResult.updatedTransactions ?? []),
        ]
        if (mergedRows.length > 0) {
          transactions.mergeImportedTxns(mergedRows)
          for (const txn of syncResult.transactions) sessionTxns.push(txn)
        }
        // 陈旧 pending 清理（FINC.PENDING.1）：完整爬取（complete=true，从最新无空洞
        // 收集到停点）覆盖范围内，本地 pending 行的 platformId 若未再出现——扩展预过滤
        // 对 pendingPlatformIds 永远放行，所以「不在」只能是页面上消失了——即银行取消
        // 了这笔授权，删掉，别让它永远挂着。
        const capData = /** @type {{ rows?: Array<{ date?: string, platformId?: string }>, complete?: boolean }} */ (
          env.data
        )
        if (
          !syncResult.alreadyProcessed &&
          capData?.complete === true &&
          Array.isArray(capData.rows) &&
          capData.rows.length > 0
        ) {
          const seenIds = new Set(
            capData.rows.map((r) => r?.platformId).filter(Boolean),
          )
          let oldestCaptured = null
          for (const r of capData.rows) {
            if (r?.date && (oldestCaptured == null || r.date < oldestCaptured))
              oldestCaptured = r.date
          }
          const stale = transactions.txns.filter(
            (x) =>
              x.pending &&
              x.platformId &&
              x.id &&
              (x.captureSource ?? env.source) === env.source &&
              oldestCaptured != null &&
              x.date >= oldestCaptured &&
              !seenIds.has(x.platformId),
          )
          for (const s of stale) {
            await transactions.removeTxn(s.id)
          }
          if (stale.length > 0) {
            notes.push(t('extension.pendingRemoved', { count: stale.length }))
          }
        }
        rpcFinalized = true
        const dupTotal = plan.skippedDuplicate + syncResult.skippedTransactionCount
        summary = syncResult.alreadyProcessed
          ? t('extension.alreadySynced', { count: plan.txns.length })
          : t('extension.newTxnsV2', {
              inserted: syncResult.insertedTransactionCount,
              pendingIn: syncResult.transactions.filter((x) => x.pending).length,
              updated: syncResult.updatedTransactionCount ?? 0,
              dup: dupTotal,
            })
      }

      return {
        report: {
          envelopeId: env.id,
          source: env.source,
          kind: env.kind,
          summary,
          notes,
          syncedAt: new Date().toISOString(),
        },
        updatedAccountIds,
        assertionDate: env.asOfDate,
        rpcFinalized,
      }
    }

    /** @param {string} id */
    const emitAck = (id) => {
      window.postMessage({ type: BRIDGE_MSG.ack, id }, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.ack, { detail: { id } }))
    }

    const emitReady = () => {
      window.postMessage({ type: BRIDGE_MSG.ready }, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.ready))
    }

    /** @param {BridgeSyncResult} result */
    const emitSyncResult = (result) => {
      const payload = {
        type: BRIDGE_MSG.syncResult,
        result: { ...result, at: new Date().toISOString() },
      }
      window.postMessage(payload, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.syncResult, { detail: payload }))
    }

    const scheduleDrainRetry = () => {
      if (drainRetryTimer != null) return
      drainRetryTimer = setTimeout(() => {
        drainRetryTimer = null
        void drain()
      }, DRAIN_RETRY_MS)
    }

    /** @param {{ env: CaptureEnvelope, result: Awaited<ReturnType<typeof applyOne>> }} item */
    const finalizeNonTransactionCapture = async (item) => {
      const payloadHash = await computeEnvelopePayloadHash(item.env)
      const targets =
        item.result.updatedAccountIds.length > 0
          ? planCashReanchorTargets({
              accounts: finance.data.accounts,
              accountIds: new Set(item.result.updatedAccountIds),
              assertionDate: item.result.assertionDate,
            })
          : []

      await finalizeCaptureWithRetry({
        envelopeId: item.env.id,
        payloadHash,
        captureSource: item.env.source,
        captureKind: item.env.kind,
        balanceAssertions: targets.map((tgt) => ({
          account_id: tgt.accountId,
          assertion_date: tgt.date,
          amount: tgt.amount,
          note: EXTENSION_REANCHOR_NOTE,
        })),
      })

      if (targets.length > 0) {
        await timeline.reloadAssertions()
      }
    }

    const drainLocked = async () => {
      /** @type {Array<{ env: CaptureEnvelope, result: Awaited<ReturnType<typeof applyOne>> }>} */
      const applied = []
      /** @type {SyncReport[]} */
      const batchReports = []
      let applyFailed = false
      let stopRetry = false
      /** @type {string[]} */
      const failedEnvelopeIds = []

      while (queue.length > 0) {
        const env = queue.shift()
        if (!env) break
        const processed = loadProcessedIds()
        if (processed.has(env.id)) {
          emitAck(env.id)
          continue
        }
        try {
          const result = await applyOne(env)
          applied.push({ env, result })
        } catch (e) {
          console.error('[ext-sync] 应用 capture 失败：', env, e)
          const permanent = isPermanentRpcError(e)
          if (!permanent) queue.unshift(env)
          applyFailed = true
          stopRetry = stopRetry || permanent
          failedEnvelopeIds.push(env.id)
          syncError = e instanceof Error ? e.message : t('extension.applyFailed')
          break
        }
      }

      for (const item of applied) {
        if (item.result.rpcFinalized) {
          markProcessed(loadProcessedIds(), item.env.id)
          emitAck(item.env.id)
          batchReports.push(item.result.report)
          continue
        }

        try {
          await finalizeNonTransactionCapture(item)
          markProcessed(loadProcessedIds(), item.env.id)
          emitAck(item.env.id)
          batchReports.push(item.result.report)
        } catch (e) {
          console.error('[ext-sync] 扩展 capture 落库失败：', item.env, e)
          const permanent = isPermanentRpcError(e)
          syncError = e instanceof Error ? e.message : t('extension.finalizeFailed')
          if (!permanent) queue.unshift(item.env)
          stopRetry = stopRetry || permanent
          failedEnvelopeIds.push(item.env.id)
        }
      }

      if (batchReports.length > 0) {
        reports = [...reports.slice(-4), ...batchReports]
        syncError = null
      }

      const pending = queue.length
      const failed =
        failedEnvelopeIds.length > 0 ? failedEnvelopeIds.length : applyFailed ? 1 : 0
      if (batchReports.length > 0 || failed > 0 || pending > 0) {
        emitSyncResult({
          ok: !applyFailed && pending === 0 && failedEnvelopeIds.length === 0,
          processed: batchReports.length,
          failed,
          pending,
          summaries: batchReports.map((r) => r.summary),
          failedEnvelopeIds:
            failedEnvelopeIds.length > 0 ? [...new Set(failedEnvelopeIds)] : undefined,
        })
      }

      if (!stopRetry && (applyFailed || queue.length > 0)) {
        scheduleDrainRetry()
      }
    }

    const drain = async () => {
      if (busy) return
      busy = true
      try {
        if (navigator.locks?.request) {
          await navigator.locks.request('fos_ext_sync_drain', drainLocked)
        } else {
          await drainLocked()
        }
      } finally {
        busy = false
      }
    }

    /** @param {unknown[]} captures */
    const onCaptures = (captures) => {
      for (const c of captures) {
        if (isCaptureEnvelope(c) && !queue.some((q) => q.id === c.id)) {
          queue.push(c)
        }
      }
      void drain()
    }

    /** @param {MessageEvent} e */
    const onMessage = (e) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const msg = /** @type {{ type?: string, captures?: unknown[] }} */ (e.data)
      if (msg?.type !== BRIDGE_MSG.captures || !Array.isArray(msg.captures)) return
      onCaptures(msg.captures)
    }

    /** @param {Event} e */
    const onCapturesEvent = (e) => {
      const detail = /** @type {CustomEvent<{ captures?: unknown[] }>} */ (e).detail
      if (Array.isArray(detail?.captures)) onCaptures(detail.captures)
    }

    const emitSnapshot = () => {
      // 最近 120 天里连续 5 天以上零记录 → 随快照请求一次性回读。更老的
      // 空窗多半是当年账户还没接入，不值得让扩展深翻。只请求一次的记账在
      // planTxnBackfill 里（localStorage）。
      let txnBackfill = null
      const newest = transactions.txns.reduce((m, t) => (t.date > m ? t.date : m), '')
      if (newest) {
        const d = new Date(`${newest}T12:00:00`)
        d.setDate(d.getDate() - 120)
        const gaps = coverageGaps(transactions.txns, {
          from: d.toISOString().slice(0, 10),
          to: newest,
          minRun: 5,
        })
        txnBackfill = planTxnBackfill(gaps)
      }
      const snap = buildAppSnapshot(
        finance.data.accounts,
        transactions.txns,
        finance.data.cashFlows,
        finance.data.holdingsSnapshots,
        { privacy: finance.data.privacy, txnBackfill },
      )
      const payload = { type: BRIDGE_MSG.snapshot, snapshot: snap }
      window.postMessage(payload, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.snapshot, { detail: payload }))
    }

    /** @param {MessageEvent} e */
    const onRequestSnapshot = (e) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      if (/** @type {{ type?: string }} */ (e.data)?.type === BRIDGE_MSG.requestSnapshot) {
        emitSnapshot()
      }
    }

    const onRequestSnapshotEvent = () => emitSnapshot()

    const pingHello = () => {
      window.postMessage({ type: BRIDGE_MSG.hello }, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.hello))
      window.postMessage({ type: BRIDGE_MSG.requestSnapshot }, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.requestSnapshot))
    }

    window.addEventListener('message', onMessage)
    window.addEventListener('message', onRequestSnapshot)
    document.addEventListener(BRIDGE_MSG.captures, onCapturesEvent)
    document.addEventListener(BRIDGE_MSG.requestSnapshot, onRequestSnapshotEvent)

    emitReady()
    let helloAttempts = 0
    /** @type {ReturnType<typeof setTimeout> | null} */
    let helloTimer = null
    const scheduleHello = () => {
      if (helloAttempts >= HELLO_MAX_ATTEMPTS) return
      pingHello()
      helloAttempts += 1
      const delay = Math.min(8000, 500 * 2 ** (helloAttempts - 1))
      helloTimer = setTimeout(scheduleHello, delay)
    }
    scheduleHello()

    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('message', onRequestSnapshot)
      document.removeEventListener(BRIDGE_MSG.captures, onCapturesEvent)
      document.removeEventListener(BRIDGE_MSG.requestSnapshot, onRequestSnapshotEvent)
      if (helloTimer != null) clearTimeout(helloTimer)
      if (drainRetryTimer != null) clearTimeout(drainRetryTimer)
    }
  }

  $effect(() => {
    if (!transactions.syncReady) return
    cleanup?.()
    cleanup = startBridge()
    return () => {
      cleanup?.()
      cleanup = null
    }
  })

  onDestroy(() => {
    cleanup?.()
    if (drainRetryTimer != null) clearTimeout(drainRetryTimer)
  })

  const privacy = $derived(finance.data.privacy)
  const hasUi = $derived(reports.length > 0 || syncError != null)

  /** @param {string} envelopeId */
  function dismissReport(envelopeId) {
    reports = reports.filter((x) => x.envelopeId !== envelopeId)
  }
</script>

{#if hasUi}
  <div class="ext-sync-toasts" aria-live="polite">
    {#if syncError}
      <div class="ext-sync-toast ext-sync-toast--warn" role="alert">
        <strong>{t('extension.title')}</strong>
        <span>{syncError}</span>
        <button type="button" aria-label={t('extension.close')} onclick={() => (syncError = null)}>
          ×
        </button>
      </div>
    {/if}
    {#each reports as r (r.envelopeId)}
      <div class="ext-sync-toast">
        <div class="ext-sync-toast-head">
          <InstitutionLogo source={r.source} size="sm" />
          <strong>{t('extension.synced', { source: SOURCE_LABEL[r.source] })}</strong>
          <span class="ext-sync-toast-time">
            {new Date(r.syncedAt ?? Date.now()).toLocaleTimeString()}
          </span>
        </div>
        <span>{redactMoneyText(r.summary, privacy)}</span>
        {#if r.notes.length > 0}
          <ul>
            {#each r.notes as n (n)}
              <li>{redactMoneyText(n, privacy)}</li>
            {/each}
          </ul>
        {/if}
        <button type="button" aria-label={t('extension.close')} onclick={() => dismissReport(r.envelopeId)}>
          ×
        </button>
      </div>
    {/each}
  </div>
{/if}
