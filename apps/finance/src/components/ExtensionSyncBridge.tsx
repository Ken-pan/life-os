// Chrome 扩展同步桥（app 侧）。
// 监听扩展 content script 通过 window.postMessage 投递的 CaptureEnvelope，
// 转换后写入 FinanceStore / TransactionsStore，并回 ACK 让扩展清除队列。
// 幂等：Supabase extension_processed_captures + finalize_extension_sync_v1 RPC。

import { useEffect, useRef, useState } from 'react'
import { useFinance } from '../store/store'
import { useTransactions } from '../store/transactions'
import { useTimeline } from '../store/timeline'
import type { Txn } from '../engine/transactions'
import { planCashReanchorTargets } from '../engine/reconciliation'
import {
  BRIDGE_MSG,
  buildAppSnapshot,
  computeEnvelopePayloadHash,
  holdingsCaptureToSnapshot,
  isCaptureEnvelope,
  loadProcessedIds,
  markProcessed,
  newTxnToExtensionSyncPayload,
  planAccountsBalanceUpdate,
  planHoldingsBalanceUpdate,
  planNewTransactions,
  planRecurringUpdates,
  type CaptureEnvelope,
  type SyncReport,
  type BridgeSyncResult,
} from '../lib/extensionSync'
import { EXTENSION_REANCHOR_NOTE } from '../lib/cashReanchor'
import { finalizeExtensionSync } from '../lib/repo'
import { t } from '../i18n/translate'
import { useLocale } from '../i18n/context'
import { InstitutionLogo } from './InstitutionLogo'
import { money, redactMoneyText } from '../format'

const SOURCE_LABEL: Record<CaptureEnvelope['source'], string> = {
  robinhood: 'Robinhood',
  rocketmoney: 'Rocket Money',
  fidelity: 'Fidelity',
}

const DRAIN_RETRY_MS = 1500
const HELLO_MAX_ATTEMPTS = 6
const FINALIZE_ATTEMPTS = 3

interface ApplyResult {
  report: SyncReport
  updatedAccountIds: string[]
  assertionDate: string
  rpcFinalized: boolean
}

async function finalizeCaptureWithRetry(
  input: Parameters<typeof finalizeExtensionSync>[0],
): Promise<Awaited<ReturnType<typeof finalizeExtensionSync>>> {
  let lastErr: unknown
  for (let i = 0; i < FINALIZE_ATTEMPTS; i += 1) {
    try {
      return await finalizeExtensionSync(input)
    } catch (e) {
      lastErr = e
      if (i < FINALIZE_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
      }
    }
  }
  throw lastErr
}

export function ExtensionSyncBridge() {
  const finance = useFinance()
  const { txns, mergeImportedTxns, syncReady } = useTransactions()
  const timeline = useTimeline()
  const [reports, setReports] = useState<SyncReport[]>([])
  const [syncError, setSyncError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const queueRef = useRef<CaptureEnvelope[]>([])
  const drainRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTxnsRef = useRef<Txn[]>([])

  const financeRef = useRef(finance)
  const txnsRef = useRef(txns)
  const mergeImportedTxnsRef = useRef(mergeImportedTxns)
  const timelineRef = useRef(timeline)

  useEffect(() => {
    financeRef.current = finance
    txnsRef.current = txns
    mergeImportedTxnsRef.current = mergeImportedTxns
    timelineRef.current = timeline
    if (sessionTxnsRef.current.length > 0) {
      const counts = new Map<string, number>()
      const keyOf = (t: Txn) => `${t.date}|${t.merchant}|${t.amount}`
      for (const t of txns)
        counts.set(keyOf(t), (counts.get(keyOf(t)) ?? 0) + 1)
      sessionTxnsRef.current = sessionTxnsRef.current.filter((t) => {
        const c = counts.get(keyOf(t)) ?? 0
        if (c > 0) {
          counts.set(keyOf(t), c - 1)
          return false
        }
        return true
      })
    }
  }, [finance, txns, mergeImportedTxns, timeline])

  useEffect(() => {
    if (!syncReady) return

    const applyOne = async (env: CaptureEnvelope): Promise<ApplyResult> => {
      const store = financeRef.current
      const notes: string[] = []
      let summary: string
      const updatedAccountIds: string[] = []
      let rpcFinalized = false

      if (env.kind === 'holdings') {
        const { snapshot, warnings } = holdingsCaptureToSnapshot(
          env,
          store.data.accounts,
        )
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
      } else {
        const known = [...txnsRef.current, ...sessionTxnsRef.current]
        const plan = planNewTransactions(env, known)
        const payloadHash = await computeEnvelopePayloadHash(env)
        const syncResult = await finalizeCaptureWithRetry({
          envelopeId: env.id,
          payloadHash,
          captureSource: env.source,
          captureKind: env.kind,
          transactions: plan.txns.map(newTxnToExtensionSyncPayload),
        })
        if (syncResult.transactions.length > 0) {
          mergeImportedTxnsRef.current(syncResult.transactions)
          for (const t of syncResult.transactions)
            sessionTxnsRef.current.push(t)
        }
        rpcFinalized = true
        const dupTotal =
          plan.skippedDuplicate + syncResult.skippedTransactionCount
        summary = syncResult.alreadyProcessed
          ? t('extension.alreadySynced', { count: plan.txns.length })
          : t('extension.newTxns', {
              inserted: syncResult.insertedTransactionCount,
              pending: plan.skippedPending,
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
        },
        updatedAccountIds,
        assertionDate: env.asOfDate,
        rpcFinalized,
      }
    }

    const emitAck = (id: string) => {
      window.postMessage({ type: BRIDGE_MSG.ack, id }, window.location.origin)
      document.dispatchEvent(
        new CustomEvent(BRIDGE_MSG.ack, { detail: { id } }),
      )
    }

    const emitReady = () => {
      window.postMessage({ type: BRIDGE_MSG.ready }, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.ready))
    }

    const emitSyncResult = (result: BridgeSyncResult) => {
      const payload = {
        type: BRIDGE_MSG.syncResult,
        result: { ...result, at: new Date().toISOString() },
      }
      window.postMessage(payload, window.location.origin)
      document.dispatchEvent(
        new CustomEvent(BRIDGE_MSG.syncResult, { detail: payload }),
      )
    }

    const scheduleDrainRetry = () => {
      if (drainRetryRef.current != null) return
      drainRetryRef.current = setTimeout(() => {
        drainRetryRef.current = null
        void drain()
      }, DRAIN_RETRY_MS)
    }

    const finalizeNonTransactionCapture = async (item: {
      env: CaptureEnvelope
      result: ApplyResult
    }) => {
      const payloadHash = await computeEnvelopePayloadHash(item.env)
      const targets =
        item.result.updatedAccountIds.length > 0
          ? planCashReanchorTargets({
              accounts: financeRef.current.data.accounts,
              accountIds: new Set(item.result.updatedAccountIds),
              assertionDate: item.result.assertionDate,
            })
          : []

      await finalizeCaptureWithRetry({
        envelopeId: item.env.id,
        payloadHash,
        captureSource: item.env.source,
        captureKind: item.env.kind,
        balanceAssertions: targets.map((t) => ({
          account_id: t.accountId,
          assertion_date: t.date,
          amount: t.amount,
          note: EXTENSION_REANCHOR_NOTE,
        })),
      })

      if (targets.length > 0) {
        await timelineRef.current.reloadAssertions()
      }
    }

    const drainLocked = async () => {
      const applied: Array<{ env: CaptureEnvelope; result: ApplyResult }> = []
      const batchReports: SyncReport[] = []
      let applyFailed = false
      const failedEnvelopeIds: string[] = []

      while (queueRef.current.length > 0) {
        const env = queueRef.current.shift()!
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
          queueRef.current.unshift(env)
          applyFailed = true
          failedEnvelopeIds.push(env.id)
          setSyncError(
            e instanceof Error ? e.message : t('extension.applyFailed'),
          )
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
          setSyncError(
            e instanceof Error ? e.message : t('extension.finalizeFailed'),
          )
          queueRef.current.unshift(item.env)
          failedEnvelopeIds.push(item.env.id)
        }
      }

      if (batchReports.length > 0) {
        setReports((prev) => [...prev.slice(-4), ...batchReports])
        setSyncError(null)
      }

      const pending = queueRef.current.length
      const failed =
        failedEnvelopeIds.length > 0
          ? failedEnvelopeIds.length
          : applyFailed
            ? 1
            : 0
      if (batchReports.length > 0 || failed > 0 || pending > 0) {
        emitSyncResult({
          ok: !applyFailed && pending === 0 && failedEnvelopeIds.length === 0,
          processed: batchReports.length,
          failed,
          pending,
          summaries: batchReports.map((r) => r.summary),
          failedEnvelopeIds:
            failedEnvelopeIds.length > 0
              ? [...new Set(failedEnvelopeIds)]
              : undefined,
        })
      }

      if (applyFailed || queueRef.current.length > 0) {
        scheduleDrainRetry()
      }
    }

    const drain = async () => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        if (navigator.locks?.request) {
          await navigator.locks.request('fos_ext_sync_drain', drainLocked)
        } else {
          await drainLocked()
        }
      } finally {
        busyRef.current = false
      }
    }

    const onCaptures = (captures: unknown[]) => {
      for (const c of captures) {
        if (
          isCaptureEnvelope(c) &&
          !queueRef.current.some((q) => q.id === c.id)
        ) {
          queueRef.current.push(c)
        }
      }
      void drain()
    }

    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const msg = e.data as { type?: string; captures?: unknown[] }
      if (msg?.type !== BRIDGE_MSG.captures || !Array.isArray(msg.captures))
        return
      onCaptures(msg.captures)
    }

    const onCapturesEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ captures?: unknown[] }>).detail
      if (Array.isArray(detail?.captures)) onCaptures(detail.captures)
    }

    const emitSnapshot = () => {
      const store = financeRef.current
      const snap = buildAppSnapshot(
        store.data.accounts,
        txnsRef.current,
        store.data.cashFlows,
        store.data.holdingsSnapshots,
        { privacy: store.data.privacy },
      )
      const payload = { type: BRIDGE_MSG.snapshot, snapshot: snap }
      window.postMessage(payload, window.location.origin)
      document.dispatchEvent(
        new CustomEvent(BRIDGE_MSG.snapshot, { detail: payload }),
      )
    }

    const onRequestSnapshot = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      if ((e.data as { type?: string })?.type === BRIDGE_MSG.requestSnapshot)
        emitSnapshot()
    }

    const onRequestSnapshotEvent = () => emitSnapshot()

    const pingHello = () => {
      window.postMessage({ type: BRIDGE_MSG.hello }, window.location.origin)
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.hello))
      window.postMessage(
        { type: BRIDGE_MSG.requestSnapshot },
        window.location.origin,
      )
      document.dispatchEvent(new CustomEvent(BRIDGE_MSG.requestSnapshot))
    }

    window.addEventListener('message', onMessage)
    window.addEventListener('message', onRequestSnapshot)
    document.addEventListener(BRIDGE_MSG.captures, onCapturesEvent)
    document.addEventListener(
      BRIDGE_MSG.requestSnapshot,
      onRequestSnapshotEvent,
    )

    emitReady()
    let helloAttempts = 0
    let helloTimer: ReturnType<typeof setTimeout> | null = null
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
      document.removeEventListener(
        BRIDGE_MSG.requestSnapshot,
        onRequestSnapshotEvent,
      )
      if (helloTimer != null) clearTimeout(helloTimer)
      if (drainRetryRef.current != null) clearTimeout(drainRetryRef.current)
    }
  }, [syncReady])

  const privacy = finance.data.privacy
  const { t: tl } = useLocale()
  const hasUi = reports.length > 0 || syncError != null
  if (!hasUi) return null

  return (
    <div className="ext-sync-toasts" aria-live="polite">
      {syncError && (
        <div className="ext-sync-toast ext-sync-toast--warn" role="alert">
          <strong>{tl('extension.title')}</strong>
          <span>{syncError}</span>
          <button
            aria-label={tl('extension.close')}
            onClick={() => setSyncError(null)}
          >
            ×
          </button>
        </div>
      )}
      {reports.map((r) => (
        <div key={r.envelopeId} className="ext-sync-toast">
          <div className="ext-sync-toast-head">
            <InstitutionLogo source={r.source} size="sm" />
            <strong>
              {tl('extension.synced', { source: SOURCE_LABEL[r.source] })}
            </strong>
          </div>
          <span>{redactMoneyText(r.summary, privacy)}</span>
          {r.notes.length > 0 && (
            <ul>
              {r.notes.map((n) => (
                <li key={n}>{redactMoneyText(n, privacy)}</li>
              ))}
            </ul>
          )}
          <button
            aria-label={tl('extension.close')}
            onClick={() =>
              setReports((prev) =>
                prev.filter((x) => x.envelopeId !== r.envelopeId),
              )
            }
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
