// FINC.PURCHASE.6b — 退款闭环 · refund-link index.
//
// Given the full loaded ledger, pair each returned/refunded purchase with the
// real negative refund transaction(s) that credited it back, so the purchase row
// can close the loop ("这笔已退款 −$X · 见 7/12 退款交易") instead of only showing
// an enrichment-side "returned" badge.
//
// The linker (packages/finance-core/.../purchaseOrderMatch.ts) writes returnInfo
// on BOTH rows: the purchase row gets `returnInfo.relatedTxnId` → refund txn id
// (status 'returned'/'cancelled'), and the refund credit row gets
// `isRefundCredit:true` + `relatedTxnId` → purchase id (status 'refunded'). This
// index resolves the pairing from whichever anchor survives in the loaded set,
// with an order-id fallback and a graceful "expected refund not in ledger" gap.
//
// Pure, app-local (no shared-package edit), unit-tested.

import type { Txn } from './transactions.js'
import { isRefundCreditTxn } from './purchaseReturnStatus.js'

/** One refund transaction linked to a purchase row. */
export interface RefundLink {
  /** Refund credit txn id (or the purchase's `relatedTxnId` when the row is absent). */
  txnId: string
  /** Refund date, or null when the refund txn is not in the loaded ledger. */
  date: string | null
  /** Refund merchant, or null when the refund txn is not in the loaded ledger. */
  merchant: string | null
  /** Positive refund amount in dollars. */
  amount: number
  /** How the pairing was resolved. */
  matchedBy: 'txn' | 'order'
  /** False = the enrichment says a refund happened but no ledger row was found. */
  present: boolean
}

const orderKey = (source: string | undefined, orderId: string | undefined) =>
  source && orderId ? `${source}::${orderId}` : null

/**
 * Build `purchase txn id → RefundLink[]`. Deterministic, deduped by refund txn id
 * (first/strongest match wins: present txn-anchored before order-anchored before
 * absent gap). Never mutates inputs.
 */
export function buildRefundLinkIndex(txns: readonly Txn[]): Map<string, RefundLink[]> {
  const byId = new Map<string, Txn>()
  const purchaseByOrder = new Map<string, Txn>()
  for (const t of txns) {
    if (!t.id) continue
    byId.set(t.id, t)
    if (!isRefundCreditTxn(t) && t.purchaseEnrichment) {
      const key = orderKey(t.purchaseEnrichment.source, t.purchaseEnrichment.orderId)
      // First purchase per order wins — a stable, order-unique anchor.
      if (key && !purchaseByOrder.has(key)) purchaseByOrder.set(key, t)
    }
  }

  const index = new Map<string, RefundLink[]>()
  const seen = new Map<string, Set<string>>()

  const add = (purchaseId: string, link: RefundLink) => {
    let ids = seen.get(purchaseId)
    if (!ids) {
      ids = new Set()
      seen.set(purchaseId, ids)
      index.set(purchaseId, [])
    }
    if (ids.has(link.txnId)) return // already linked (dedupe across directions)
    ids.add(link.txnId)
    index.get(purchaseId)!.push(link)
  }

  // Direction A — a refund credit txn points back at its purchase.
  for (const r of txns) {
    if (!r.id || !isRefundCreditTxn(r)) continue
    const ri = r.purchaseEnrichment?.returnInfo
    let purchaseId: string | null = null
    let matchedBy: 'txn' | 'order' = 'txn'
    if (ri?.relatedTxnId && ri.relatedTxnId !== r.id && byId.has(ri.relatedTxnId)) {
      purchaseId = ri.relatedTxnId
      matchedBy = 'txn'
    } else {
      const key = orderKey(
        r.purchaseEnrichment?.source,
        ri?.relatedOrderId ?? r.purchaseEnrichment?.orderId,
      )
      const p = key ? purchaseByOrder.get(key) : undefined
      if (p?.id && p.id !== r.id) {
        purchaseId = p.id
        matchedBy = 'order'
      }
    }
    if (!purchaseId) continue
    const amount = Math.abs(r.amount) || ri?.refundAmount || 0
    if (amount <= 0) continue
    add(purchaseId, {
      txnId: r.id,
      date: r.date,
      merchant: r.merchant,
      amount,
      matchedBy,
      present: true,
    })
  }

  // Direction B — a purchase row points at its refund txn. Catches refunds whose
  // own row lost the anchor, and surfaces the gap when the refund row is absent.
  for (const p of txns) {
    if (!p.id || isRefundCreditTxn(p)) continue
    const ri = p.purchaseEnrichment?.returnInfo
    const rel = ri?.relatedTxnId
    if (!rel || rel === p.id) continue
    const r = byId.get(rel)
    if (r) {
      const amount = Math.abs(r.amount) || ri?.refundAmount || 0
      if (amount <= 0) continue
      add(p.id, {
        txnId: rel,
        date: r.date,
        merchant: r.merchant,
        amount,
        matchedBy: 'txn',
        present: true,
      })
    } else {
      // Refund is claimed by enrichment but no ledger row is loaded — a real
      // closure gap worth showing rather than hiding.
      const amount = ri?.refundAmount ?? 0
      if (amount <= 0) continue
      add(p.id, {
        txnId: rel,
        date: null,
        merchant: null,
        amount,
        matchedBy: 'txn',
        present: false,
      })
    }
  }

  // Stable order: present refunds by date, then gaps.
  for (const links of index.values()) {
    links.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1
      return (a.date ?? '').localeCompare(b.date ?? '')
    })
  }
  return index
}
