#!/usr/bin/env node
/**
 * Match merchant order exports to finance_transactions (purchase + refund credits).
 *
 * Usage:
 *   node scripts/link-purchase-orders.mjs --source amazon|bestbuy|target [--user-id UUID] [--orders path] [--dry-run] [--apply]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import {
  matchAmazonOrdersToTxns,
  matchAmazonRefundsToOrders,
} from '../src/engine/amazonOrderMatch.ts'
import {
  matchTargetOrdersToTxns,
  matchTargetRefundsToOrders,
  enrichmentFromOrder as targetEnrichmentFromOrder,
} from '../src/engine/targetOrderMatch.ts'
import {
  matchBestBuyOrdersToTxns,
  matchBestBuyRefundsToOrders,
  enrichmentFromOrder as bestbuyEnrichmentFromOrder,
} from '../src/engine/bestbuyOrderMatch.ts'
import {
  uploadPurchaseEnrichmentImages,
  resolveServiceRoleKey,
} from './lib/purchaseImageStorage.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'

const SOURCE_CONFIG = {
  amazon: {
    label: 'amazon',
    merchantSql: `(merchant_name ilike '%amazon%' or merchant ilike '%amazon%')`,
    defaultOrders: path.resolve(
      __dirname,
      '../../../tools/web-state-devtools/bridge/data/amazon-export/amazon-orders-2026-raw.json',
    ),
    matchOrders: matchAmazonOrdersToTxns,
    matchRefunds: matchAmazonRefundsToOrders,
  },
  bestbuy: {
    label: 'bestbuy',
    merchantSql: `(merchant_name ilike '%best buy%' or merchant_name ilike '%bestbuy%' or merchant ilike '%best buy%' or merchant ilike '%bestbuy%')`,
    defaultOrders: path.resolve(
      __dirname,
      '../../../tools/web-state-devtools/bridge/data/bestbuy-export/bestbuy-orders-past-year-raw.json',
    ),
    matchOrders: matchBestBuyOrdersToTxns,
    matchRefunds: matchBestBuyRefundsToOrders,
  },
  target: {
    label: 'target',
    merchantSql: `(merchant_name ilike '%target%' or merchant ilike '%target%')`,
    defaultOrders: path.resolve(
      __dirname,
      '../../../tools/web-state-devtools/bridge/data/target-export/target-orders-past-year-raw.json',
    ),
    matchOrders: matchTargetOrdersToTxns,
    matchRefunds: matchTargetRefundsToOrders,
  },
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
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
  if (!token)
    throw new Error('Missing Supabase access token. Run: supabase login')
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
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function escSql(s) {
  return String(s).replace(/'/g, "''")
}

function mergeEnrichment(existing, incoming) {
  if (!existing?.source) return incoming
  return {
    ...existing,
    ...incoming,
    lineItems: incoming.lineItems?.length
      ? incoming.lineItems
      : existing.lineItems,
    returnInfo: incoming.returnInfo ?? existing.returnInfo,
  }
}

const ENRICHMENT_FROM_ORDER = {
  bestbuy: bestbuyEnrichmentFromOrder,
  target: targetEnrichmentFromOrder,
}

async function resolveCatalogUserId(explicit) {
  if (explicit) return explicit
  const rows = await runSql(
    `select user_id from finance_user_settings order by updated_at desc limit 1`,
  )
  return rows?.[0]?.user_id ? String(rows[0].user_id) : null
}

async function syncMerchantOrderCatalog(
  sourceKey,
  orders,
  purchaseMatches,
  userId,
  tag,
) {
  const build = ENRICHMENT_FROM_ORDER[sourceKey]
  if (!build || !userId) return 0

  const matchedIds = new Set(purchaseMatches.map((m) => m.orderId))
  const unlinked = orders.filter(
    (o) =>
      o.orderId &&
      !matchedIds.has(o.orderId) &&
      (o.lineItems?.length || o.orderTotal),
  )
  if (!unlinked.length) {
    console.log(tag, 'catalog: no unlinked orders to sync')
    return 0
  }

  const entries = unlinked.map((o) => ({
    ...build(o, 'low'),
    unlinked: true,
    unlinkedReason:
      sourceKey === 'target' ? 'redcard_or_no_bank_match' : 'no_bank_match',
  }))

  const patch = escSql(
    JSON.stringify({
      [sourceKey]: { orders: entries, syncedAt: new Date().toISOString() },
    }),
  )

  await runSql(`
    update finance_user_settings
    set merchant_order_catalog = coalesce(merchant_order_catalog, '{}'::jsonb)
      || '${patch}'::jsonb
      || jsonb_build_object('updatedAt', to_jsonb(now()::text)),
        updated_at = now()
    where user_id = '${escSql(userId)}';
  `)

  console.log(tag, 'catalog: synced', entries.length, 'unlinked orders')
  return entries.length
}

async function main() {
  const sourceKey = arg('--source', 'amazon')
  const cfg = SOURCE_CONFIG[sourceKey]
  if (!cfg) {
    console.error(
      '[link-purchase] unknown --source:',
      sourceKey,
      '(amazon|bestbuy|target)',
    )
    process.exit(1)
  }

  const userId = arg('--user-id', process.env.FINANCE_OS_USER_ID ?? null)

  const ordersPath = arg('--orders', cfg.defaultOrders)
  const year = arg('--year', '2026')
  const dryRun = hasFlag('--dry-run') || !hasFlag('--apply')
  const replace = hasFlag('--replace')
  const clearStale = replace && !hasFlag('--keep-stale')
  const minConfidence = arg('--min-confidence', 'low')
  const matchOpts = {
    minConfidence:
      minConfidence === 'high' || minConfidence === 'medium'
        ? minConfidence
        : 'low',
  }
  const uploadImages =
    hasFlag('--upload-images') ||
    (hasFlag('--apply') && !hasFlag('--no-upload-images'))
  const refreshImages = hasFlag('--refresh-images')
  const tag = `[link-${cfg.label}]`

  if (!userId) {
    console.warn(
      tag,
      'no --user-id / FINANCE_OS_USER_ID — matching across all users (unsafe on multi-tenant DB)',
    )
  }

  if (!fs.existsSync(ordersPath)) {
    console.error(tag, 'orders file not found:', ordersPath)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(ordersPath, 'utf8'))
  const orders = raw.orders ?? raw.items ?? []
  const exportSince =
    raw.summary?.pastYearCutoff || arg('--since', null) || `${year}-01-01`
  const txnSince = arg(
    '--since',
    sourceKey === 'bestbuy' || sourceKey === 'target'
      ? exportSince
      : `${year}-01-01`,
  )
  const txnUntil = arg('--until', `${year}-12-31`)
  console.log(tag, 'loaded', orders.length, 'orders from', ordersPath)
  console.log(tag, 'txn window', txnSince, '→', txnUntil)

  const returned = orders.filter(
    (o) =>
      o.returnInfo?.status || /returned|refund|cancel/i.test(o.status ?? ''),
  ).length
  console.log(tag, 'return/cancel flagged orders:', returned)

  const txnRows = await runSql(`
    select id, user_id, txn_date, coalesce(source_amount, amount) as amount, merchant_name, merchant, flow, purchase_enrichment
    from finance_transactions
    where ${cfg.merchantSql}
      and txn_date >= '${escSql(txnSince)}'
      and txn_date <= '${escSql(txnUntil)}'
      ${userId ? `and user_id = '${escSql(userId)}'` : ''}
    order by txn_date desc;
  `)

  const txns = (txnRows ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    merchant: String(r.merchant_name ?? r.merchant ?? ''),
    flow: r.flow ? String(r.flow) : undefined,
    purchaseEnrichment: r.purchase_enrichment,
  }))

  console.log(tag, cfg.label, 'txns in window:', txns.length)

  const purchaseMatches = cfg.matchOrders(orders, txns, matchOpts)
  const refundLinks = cfg.matchRefunds(orders, txns, purchaseMatches)
  const orderById = new Map(
    orders.filter((o) => o.orderId).map((o) => [o.orderId, o]),
  )
  const syncCatalog =
    (hasFlag('--sync-catalog') || hasFlag('--apply')) &&
    !hasFlag('--no-sync-catalog') &&
    (sourceKey === 'bestbuy' || sourceKey === 'target')

  const already = txns.filter(
    (t) => t.purchaseEnrichment?.source === cfg.label,
  ).length

  console.log(
    tag,
    'purchase matches:',
    purchaseMatches.length,
    '(already enriched:',
    already + ')',
  )
  console.log(tag, 'refund links:', refundLinks.length)
  console.log(
    tag,
    'purchase confidence:',
    purchaseMatches.reduce((acc, m) => {
      acc[m.confidence] = (acc[m.confidence] ?? 0) + 1
      return acc
    }, /** @type {Record<string, number>} */ ({})),
  )

  for (const m of purchaseMatches.slice(0, 6)) {
    const txn = txns.find((t) => t.id === m.txnId)
    const ret = m.enrichment.returnInfo?.status
    console.log(
      ' ',
      txn?.date,
      '$' + txn?.amount,
      '→',
      m.orderId,
      `(${m.confidence}, Δ${m.dayDiff.toFixed(1)}d${ret ? ', ' + ret : ''})`,
    )
  }
  if (purchaseMatches.length > 6)
    console.log('  …', purchaseMatches.length - 6, 'more purchase matches')

  for (const r of refundLinks.slice(0, 6)) {
    const refundTxn = txns.find((t) => t.id === r.refundTxnId)
    console.log(
      '  refund',
      refundTxn?.date,
      '$' + refundTxn?.amount,
      '↔ order',
      r.orderId,
      r.purchaseTxnId
        ? `(purchase txn ${r.purchaseTxnId.slice(0, 8)}…)`
        : '(no purchase txn)',
    )
  }
  if (refundLinks.length > 6)
    console.log('  …', refundLinks.length - 6, 'more refund links')

  if (dryRun) {
    console.log(
      '\n' + tag,
      'dry-run — pass --apply to write purchase_enrichment',
    )
    if (syncCatalog) {
      const matchedIds = new Set(purchaseMatches.map((m) => m.orderId))
      const unlinked = orders.filter(
        (o) => o.orderId && !matchedIds.has(o.orderId),
      ).length
      console.log(tag, 'would sync', unlinked, 'unlinked orders to catalog')
    }
    if (uploadImages)
      console.log(tag, 'would upload line-item thumbnails to Supabase Storage')
    if (clearStale)
      console.log(
        tag,
        'would clear stale',
        cfg.label,
        'enrichment in txn window',
      )
    return
  }

  if (clearStale) {
    const cleared = await runSql(`
      update finance_transactions
      set purchase_enrichment = null,
          updated_at = now()
      where ${cfg.merchantSql}
        and txn_date >= '${escSql(txnSince)}'
        and txn_date <= '${escSql(txnUntil)}'
        ${userId ? `and user_id = '${escSql(userId)}'` : ''}
        and purchase_enrichment is not null
        and purchase_enrichment->>'source' = '${escSql(cfg.label)}';
    `)
    console.log(
      tag,
      'cleared stale enrichment rows in window',
      cleared?.length ?? '',
    )
  }

  let skippedImageUpload = 0
  const serviceRoleKey = uploadImages ? resolveServiceRoleKey() : null
  if (uploadImages && !serviceRoleKey) {
    console.warn(
      tag,
      'SUPABASE_SERVICE_ROLE_KEY missing — skipping image upload (run: supabase login)',
    )
    skippedImageUpload = purchaseMatches.length + refundLinks.length
  } else if (serviceRoleKey && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
  }

  async function finalizeEnrichment(txnId, enrichment) {
    const txn = txns.find((t) => t.id === txnId)
    if (uploadImages && serviceRoleKey && txn?.userId) {
      return uploadPurchaseEnrichmentImages(enrichment, {
        userId: txn.userId,
        source: cfg.label,
      })
    }
    return enrichment
  }

  let updatedPurchase = 0
  let updatedRefund = 0
  let updatedPurchaseReturn = 0
  let uploadedImages = 0

  for (const m of purchaseMatches) {
    const existing = txns.find((t) => t.id === m.txnId)?.purchaseEnrichment
    if (existing?.source === cfg.label && !replace && !refreshImages) continue
    let enrichment = replace
      ? m.enrichment
      : refreshImages && existing?.source === cfg.label
        ? existing
        : mergeEnrichment(existing, m.enrichment)
    enrichment = await finalizeEnrichment(m.txnId, enrichment)
    if (enrichment.lineItems?.some((li) => li.imageStoragePath))
      uploadedImages++
    const json = escSql(JSON.stringify(enrichment))
    await runSql(`
      update finance_transactions
      set purchase_enrichment = '${json}'::jsonb,
          updated_at = now()
      where id = '${escSql(m.txnId)}';
    `)
    updatedPurchase++
  }

  for (const r of refundLinks) {
    const existingRefund = txns.find(
      (t) => t.id === r.refundTxnId,
    )?.purchaseEnrichment
    const exportOrder = orderById.get(r.orderId)
    const purchaseLineItems = r.purchaseTxnId
      ? txns.find((t) => t.id === r.purchaseTxnId)?.purchaseEnrichment
          ?.lineItems
      : undefined
    const lineItems =
      exportOrder?.lineItems?.length
        ? exportOrder.lineItems
        : purchaseLineItems
    let refundPayload = mergeEnrichment(existingRefund, {
      ...r.refundEnrichment,
      ...(lineItems?.length ? { lineItems } : {}),
    })
    refundPayload = await finalizeEnrichment(r.refundTxnId, refundPayload)
    const json = escSql(JSON.stringify(refundPayload))
    await runSql(`
      update finance_transactions
      set purchase_enrichment = '${json}'::jsonb,
          updated_at = now()
      where id = '${escSql(r.refundTxnId)}';
    `)
    updatedRefund++

    if (r.purchaseTxnId) {
      const existingPurchase = txns.find(
        (t) => t.id === r.purchaseTxnId,
      )?.purchaseEnrichment
      let purchasePayload = mergeEnrichment(
        existingPurchase,
        r.purchaseEnrichment,
      )
      purchasePayload = await finalizeEnrichment(
        r.purchaseTxnId,
        purchasePayload,
      )
      const pjson = escSql(JSON.stringify(purchasePayload))
      await runSql(`
        update finance_transactions
        set purchase_enrichment = '${pjson}'::jsonb,
            updated_at = now()
        where id = '${escSql(r.purchaseTxnId)}';
      `)
      updatedPurchaseReturn++
    }
  }

  console.log(
    '\n' + tag,
    'updated purchase:',
    updatedPurchase,
    '| refund credits:',
    updatedRefund,
    '| purchase return marks:',
    updatedPurchaseReturn,
    '| rows with stored images:',
    uploadedImages,
    skippedImageUpload > 0
      ? `| image uploads skipped (no service role): ${skippedImageUpload}`
      : '',
  )

  if (syncCatalog) {
    const catalogUser = await resolveCatalogUserId(userId)
    if (!catalogUser) {
      console.warn(tag, 'catalog: no user_id — skip sync')
    } else {
      await syncMerchantOrderCatalog(
        sourceKey,
        orders,
        purchaseMatches,
        catalogUser,
        tag,
      )
    }
  }
}

main().catch((e) => {
  console.error('[link-purchase] FATAL', e.message)
  process.exit(1)
})
