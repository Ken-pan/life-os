#!/usr/bin/env node
/**
 * Read-only Target link dry-run report (no DB writes).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import {
  matchTargetOrdersToTxns,
  matchTargetRefundsToOrders,
} from '../src/engine/targetOrderMatch.ts'
import { isRefundCreditTxn } from '../src/engine/purchaseReturnStatus.ts'
import {
  summaryHarvestSince,
  summaryHarvestUntil,
} from '../../../../web-state-devtools/bridge/lib/orders-export.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  try {
    return execSync('security find-generic-password -s "Supabase CLI" -w', {
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

async function runSql(query) {
  const token = getToken()
  if (!token) throw new Error('Missing Supabase access token')
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`)
  return JSON.parse(text)
}

function escSql(s) {
  return String(s).replace(/'/g, "''")
}

function isReturnedOrder(o) {
  const s = (o.status || '').toLowerCase()
  const ri = o.returnInfo?.status
  return (
    ri === 'returned' ||
    ri === 'refunded' ||
    /return complete|returned|refunded/.test(s)
  )
}

async function main() {
  const userId = arg('--user-id', process.env.FINANCE_OS_USER_ID)
  const sourceAccountLabel = arg('--source-account-label', null)
  const accountFilter = arg('--account', null)
  const ordersPath = arg(
    '--orders',
    path.resolve(
      __dirname,
      '../../../../web-state-devtools/bridge/data/target-export/target-orders-2024-07-01_to_2026-07-07-raw.json',
    ),
  )
  const since = arg('--since', '2024-07-01')
  const until = arg('--until', '2026-07-07')

  if (!userId) throw new Error('--user-id required')

  const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'))
  const orders = raw.orders ?? []
  const exportSince = summaryHarvestSince(raw.summary) || since
  const exportUntil = summaryHarvestUntil(raw.summary) || until

  const accountScopeSql = `
    ${accountFilter ? `and account = '${escSql(accountFilter)}'` : ''}
    ${sourceAccountLabel ? `and source_account_label = '${escSql(sourceAccountLabel)}'` : ''}`

  const txnRows = await runSql(`
    select id, user_id, txn_date, coalesce(source_amount, amount) as amount,
           merchant_name, merchant, flow, account, source_account_label, purchase_enrichment
    from finance_transactions
    where (merchant_name ilike '%target%' or merchant ilike '%target%')
      and txn_date >= '${escSql(exportSince)}'
      and txn_date <= '${escSql(exportUntil)}'
      and user_id = '${escSql(userId)}'${accountScopeSql}
    order by txn_date desc;
  `)

  const txns = (txnRows ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    merchant: String(r.merchant_name ?? r.merchant ?? ''),
    flow: r.flow ? String(r.flow) : undefined,
    account: r.account ? String(r.account) : '',
    sourceAccountLabel: r.source_account_label
      ? String(r.source_account_label)
      : '',
    purchaseEnrichment: r.purchase_enrichment,
  }))

  const purchaseTxns = txns.filter((t) => t.amount > 0 && !isRefundCreditTxn(t))
  const refundTxns = txns.filter((t) => isRefundCreditTxn(t))

  const purchaseMatches = matchTargetOrdersToTxns(orders, txns)
  const refundLinks = matchTargetRefundsToOrders(orders, txns, purchaseMatches)

  const matchedOrderIds = new Set(purchaseMatches.map((m) => m.orderId))
  const matchedTxnIds = new Set(purchaseMatches.map((m) => m.txnId))
  const unmatchedOrders = orders.filter(
    (o) => o.orderId && !matchedOrderIds.has(o.orderId),
  )
  const unmatchedPurchaseTxns = purchaseTxns.filter((t) => !matchedTxnIds.has(t.id))

  const returnedOrders = orders.filter(isReturnedOrder)
  const returnedMatched = returnedOrders.filter((o) =>
    matchedOrderIds.has(o.orderId),
  )

  const duplicateCandidates = purchaseMatches.filter((m) => m.confidence === 'low')
  const toleranceFailures = purchaseMatches.filter((m) => m.amountDiff > 0.5)

  const unknownAccountTxns = txns.filter(
    (t) => !t.account || t.account === 'Unknown' || t.sourceAccountLabel === 'Unknown',
  )

  const report = {
    ordersRead: orders.length,
    candidateBankTxns: txns.length,
    purchaseTxns: purchaseTxns.length,
    refundTxns: refundTxns.length,
    matchedCount: purchaseMatches.length,
    unmatchedOrderCount: unmatchedOrders.length,
    unmatchedTransactionCount: unmatchedPurchaseTxns.length,
    refundLinkCount: refundLinks.length,
    returnedOrderCount: returnedOrders.length,
    returnedMatchedAsPurchase: returnedMatched.length,
    duplicateCandidateCount: duplicateCandidates.length,
    amountToleranceGt50c: toleranceFailures.length,
    unknownAccountTxnCount: unknownAccountTxns.length,
    confidenceBreakdown: purchaseMatches.reduce((acc, m) => {
      acc[m.confidence] = (acc[m.confidence] ?? 0) + 1
      return acc
    }, {}),
    top20Matches: purchaseMatches.slice(0, 20).map((m) => {
      const txn = txns.find((t) => t.id === m.txnId)
      const order = orders.find((o) => o.orderId === m.orderId)
      return {
        txnDate: txn?.date,
        txnAmount: txn?.amount,
        account: txn?.account,
        orderId: m.orderId,
        orderDate: order?.orderDate,
        orderTotal: order?.orderTotal,
        sourceView: order?.sourceView,
        status: order?.status,
        confidence: m.confidence,
        dayDiff: m.dayDiff,
        amountDiff: m.amountDiff,
      }
    }),
    top20UnmatchedTxns: unmatchedPurchaseTxns.slice(0, 20).map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      account: t.account,
      merchant: t.merchant,
    })),
    top20UnmatchedOrders: unmatchedOrders.slice(0, 20).map((o) => ({
      orderId: o.orderId,
      orderDate: o.orderDate,
      orderTotal: o.orderTotal,
      sourceView: o.sourceView,
      status: o.status,
      storeName: o.storeName,
    })),
    crossAccountCandidates: purchaseMatches
      .filter((m) => {
        const txn = txns.find((t) => t.id === m.txnId)
        return txn?.account === 'Unknown' || txn?.sourceAccountLabel === 'Unknown'
      })
      .slice(0, 20),
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
