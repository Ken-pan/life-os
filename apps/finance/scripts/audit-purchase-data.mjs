#!/usr/bin/env node
/**
 * Audit merchant order exports vs Supabase purchase_enrichment coverage.
 * Usage: node scripts/audit-purchase-data.mjs [--source bestbuy|target|all]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import {
  matchBestBuyOrdersToTxns,
  matchBestBuyRefundsToOrders,
} from '../src/engine/bestbuyOrderMatch.ts'
import {
  matchTargetOrdersToTxns,
  matchTargetRefundsToOrders,
} from '../src/engine/targetOrderMatch.ts'
import { isTargetAggregatePayment } from '../src/engine/merchantChargeFilters.ts'
import {
  resolveOrdersRawPath,
  summaryHarvestSince,
  summaryHarvestUntil,
} from '../../../../web-state-devtools/bridge/lib/orders-export.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'

const EXPORT_ROOT = path.resolve(
  __dirname,
  '../../../../web-state-devtools/bridge/data',
)
function exportPathFor(source) {
  const dir = path.join(EXPORT_ROOT, `${source}-export`)
  return (
    resolveOrdersRawPath(dir, source) ||
    path.join(dir, `${source}-orders-past-year-raw.json`)
  )
}

const SOURCES = {
  bestbuy: {
    exportPath: exportPathFor('bestbuy'),
    merchantSql: `(merchant_name ilike '%best buy%' or merchant_name ilike '%bestbuy%' or merchant ilike '%best buy%' or merchant ilike '%bestbuy%')`,
    matchOrders: matchBestBuyOrdersToTxns,
    matchRefunds: matchBestBuyRefundsToOrders,
    txnSinceFromExport: true,
  },
  target: {
    exportPath: exportPathFor('target'),
    merchantSql: `(merchant_name ilike '%target%' or merchant ilike '%target%')`,
    matchOrders: matchTargetOrdersToTxns,
    matchRefunds: matchTargetRefundsToOrders,
    txnSinceFromExport: true,
  },
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN)
    return process.env.SUPABASE_ACCESS_TOKEN
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

function auditExport(source, orders) {
  const required = ['orderId', 'orderDate', 'orderTotal', 'detailUrl']
  const issues = []
  const stats = {
    total: orders.length,
    withLineItems: 0,
    lineItemsEmpty: 0,
    missingFields: /** @type {Record<string, number>} */ ({}),
    inStore: 0,
    online: 0,
  }

  for (const f of required) stats.missingFields[f] = 0

  for (const o of orders) {
    if (/^BBY/i.test(o.orderId || '')) stats.online++
    else if (/\d{3}-\d{2}-\d{4}/.test(o.orderId || '')) stats.inStore++
    if (o.lineItems?.length) stats.withLineItems++
    else stats.lineItemsEmpty++

    for (const f of required) {
      if (!o[f]) stats.missingFields[f]++
    }
    if (!o.lineItems?.length) {
      issues.push({
        orderId: o.orderId,
        issue: 'missing lineItems',
        orderTotal: o.orderTotal,
        detailUrl: o.detailUrl,
      })
    }
    if (!o.orderTotal) {
      issues.push({ orderId: o.orderId, issue: 'missing orderTotal' })
    }
  }

  return { stats, issues }
}

async function auditSupabase(source, cfg, orders, txnSince, txnUntil) {
  const enrichedRows = await runSql(`
    select id, txn_date, amount, merchant_name,
           purchase_enrichment->>'orderId' as order_id,
           purchase_enrichment->>'orderTotal' as order_total,
           jsonb_array_length(coalesce(purchase_enrichment->'lineItems','[]'::jsonb)) as item_count,
           purchase_enrichment->>'detailUrl' as detail_url,
           purchase_enrichment->'returnInfo' as return_info
    from finance_transactions
    where purchase_enrichment->>'source' = '${escSql(source)}';
  `)

  const txnRows = await runSql(`
    select id, txn_date, coalesce(source_amount, amount) as amount, merchant_name, purchase_enrichment
    from finance_transactions
    where ${cfg.merchantSql}
      and txn_date >= '${escSql(txnSince)}'
      and txn_date <= '${escSql(txnUntil)}'
    order by txn_date desc;
  `)

  const txns = (txnRows ?? []).map((r) => ({
    id: String(r.id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    merchant: String(r.merchant_name ?? ''),
    purchaseEnrichment: r.purchase_enrichment,
  }))

  const matches = cfg.matchOrders(orders, txns, { minConfidence: 'low' })
  const refunds = cfg.matchRefunds(orders, txns, matches)

  const enrichedOrderIds = new Set(
    (enrichedRows ?? []).map((r) => r.order_id).filter(Boolean),
  )
  const matchedOrderIds = new Set(matches.map((m) => m.orderId))

  const exportOrderIds = new Set(orders.map((o) => o.orderId))
  const inSupabaseNotExport = [...enrichedOrderIds].filter(
    (id) => !exportOrderIds.has(id),
  )
  const matchedNotSaved = [...matchedOrderIds].filter(
    (id) => !enrichedOrderIds.has(id),
  )
  const exportNotMatched = orders.filter((o) => !matchedOrderIds.has(o.orderId))

  return {
    supabase: {
      enrichedCount: enrichedRows?.length ?? 0,
      withLineItems: (enrichedRows ?? []).filter(
        (r) => Number(r.item_count) > 0,
      ).length,
      withoutLineItems: (enrichedRows ?? []).filter(
        (r) => Number(r.item_count) === 0,
      ).length,
    },
    matching: {
      txnInWindow: txns.length,
      directPurchaseTxns: txns.filter(
        (t) => t.amount > 0 && !isTargetAggregatePayment(t.merchant),
      ).length,
      purchaseMatches: matches.length,
      refundLinks: refunds.length,
      matchedNotSaved,
      exportNotMatched: exportNotMatched.map((o) => ({
        orderId: o.orderId,
        orderDate: o.orderDate,
        orderTotal: o.orderTotal,
        lineItems: o.lineItems?.length ?? 0,
      })),
      inSupabaseNotExport,
    },
    enrichedRows: enrichedRows ?? [],
  }
}

async function main() {
  const which = arg('--source', 'all')
  const list = which === 'all' ? Object.keys(SOURCES) : [which]

  console.log('# Purchase Data Audit\n')

  for (const source of list) {
    const cfg = SOURCES[source]
    if (!cfg) {
      console.error('Unknown source:', source)
      process.exit(1)
    }

    console.log(`\n## ${source.toUpperCase()}\n`)

    if (!fs.existsSync(cfg.exportPath)) {
      console.log(`❌ Export missing: ${cfg.exportPath}`)
      continue
    }

    const raw = JSON.parse(fs.readFileSync(cfg.exportPath, 'utf8'))
    const orders = raw.orders ?? []
    const txnSince = cfg.txnSinceFromExport
      ? summaryHarvestSince(raw.summary) || '2025-07-07'
      : `${cfg.year ?? new Date().getFullYear()}-01-01`
    const txnUntil = arg('--until', summaryHarvestUntil(raw.summary) || '2026-12-31')

    const { stats, issues } = auditExport(source, orders)
    console.log('### Export quality')
    console.log(`- Orders: ${stats.total}`)
    console.log(
      `- With lineItems: ${stats.withLineItems} | Empty: ${stats.lineItemsEmpty}`,
    )
    if (source === 'bestbuy') {
      console.log(`- Online: ${stats.online} | In-store: ${stats.inStore}`)
    }
    for (const [f, n] of Object.entries(stats.missingFields)) {
      if (n) console.log(`- Missing ${f}: ${n}`)
    }

    const lineItemGaps = issues.filter((i) => i.issue === 'missing lineItems')
    if (lineItemGaps.length) {
      console.log(`\n### Export lineItems gaps (${lineItemGaps.length})`)
      for (const g of lineItemGaps.slice(0, 10)) {
        console.log(`- ${g.orderId} ${g.orderTotal || '?'}`)
      }
      if (lineItemGaps.length > 10)
        console.log(`  … +${lineItemGaps.length - 10} more`)
    }

    const db = await auditSupabase(source, cfg, orders, txnSince, txnUntil)
    console.log('\n### Supabase coverage')
    console.log(`- Enriched rows: ${db.supabase.enrichedCount}`)
    console.log(
      `- With lineItems: ${db.supabase.withLineItems} | Without: ${db.supabase.withoutLineItems}`,
    )
    console.log(`- Txns in match window: ${db.matching.txnInWindow}`)
    console.log(
      `- Matchable from export: ${db.matching.purchaseMatches} purchases, ${db.matching.refundLinks} refunds`,
    )

    if (db.matching.matchedNotSaved.length) {
      console.log(
        `\n### ⚠️ Matched but NOT in Supabase (${db.matching.matchedNotSaved.length})`,
      )
      for (const id of db.matching.matchedNotSaved.slice(0, 10)) {
        console.log(`- ${id} → run link:purchase --apply`)
      }
    }

    if (db.matching.exportNotMatched.length) {
      console.log(
        `\n### Export orders with no txn match (${db.matching.exportNotMatched.length})`,
      )
      for (const o of db.matching.exportNotMatched.slice(0, 8)) {
        console.log(
          `- ${o.orderId} ${o.orderDate || '?'} ${o.orderTotal || '?'} (${o.lineItems} items)`,
        )
      }
      if (source === 'target' && db.matching.directPurchaseTxns === 0) {
        console.log(
          `\n> RedCard note: ${db.matching.txnInWindow} Target txns in window; ${db.matching.directPurchaseTxns} direct store charges. Orders paid via RedCard monthly statement cannot auto-match to individual bank lines — link manually or use non-RedCard payment for per-order enrichment.`,
        )
      }
    }

    const savedWithoutItems = (db.enrichedRows ?? []).filter(
      (r) => Number(r.item_count) === 0,
    )
    if (savedWithoutItems.length) {
      console.log(
        `\n### Supabase rows missing lineItems (${savedWithoutItems.length})`,
      )
      for (const r of savedWithoutItems.slice(0, 8)) {
        console.log(`- ${r.order_id} txn ${r.txn_date} $${r.amount} items=0`)
      }
    }
  }

  console.log(
    '\n---\nLive page cross-check: run verify-*-sample.mjs with Dev Agent Mode ON',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
