#!/usr/bin/env node
/**
 * Re-parse existing Best Buy raw export with fixed orderDate normalization.
 * Writes a versioned fixed file — does not overwrite the original.
 *
 * Usage: node scripts/reparse-bestbuy-export.mjs [--input path] [--out path]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOrdersRawPath } from '../lib/orders-export.mjs'
import { applyBestBuyOrderDateNormalization } from '../lib/bestbuy-orders-parser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dirname, '..', 'data', 'bestbuy-export')

function argVal(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main() {
  const input =
    argVal('--input') ||
    resolveOrdersRawPath(DATA, 'bestbuy') ||
    path.join(DATA, 'bestbuy-orders-past-year-raw.json')

  if (!fs.existsSync(input)) {
    console.error('Input not found:', input)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(input, 'utf8'))
  const orders = raw.orders || []
  let replacedByReceipt = 0
  let unknownDates = 0
  const sourceCounts = {}

  const fixedOrders = orders.map((order) => {
    const before = order.orderDate
    const fixed = applyBestBuyOrderDateNormalization(order)
    const src = fixed.orderDateSource || 'unknown'
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
    if (src === 'receipt_id' && before !== fixed.orderDate) replacedByReceipt++
    if (src === 'unknown') unknownDates++
    return fixed
  })

  const since =
    raw.summary?.harvestSince ||
    raw.summary?.since ||
    raw.summary?.legacyPastYearCutoff ||
    '2024-12-01'
  const until =
    raw.summary?.harvestUntil ||
    raw.summary?.until ||
    new Date().toISOString().slice(0, 10)

  const out =
    argVal('--out') ||
    path.join(DATA, `bestbuy-orders-${since}_to_${until}-fixed-dates-raw.json`)

  const output = {
    ...raw,
    orders: fixedOrders,
    summary: {
      ...raw.summary,
      reparseSource: path.basename(input),
      reparseAt: new Date().toISOString(),
      reparseKind: 'bestbuy_order_date_normalization',
      orderDateSourceCounts: sourceCounts,
      receiptIdDateReplacements: replacedByReceipt,
      unknownOrderDates: unknownDates,
    },
  }

  fs.writeFileSync(out, JSON.stringify(output, null, 2))

  console.log(
    JSON.stringify(
      {
        input: path.basename(input),
        output: path.basename(out),
        totalOrders: orders.length,
        orderDateSourceCounts: sourceCounts,
        receiptIdDateReplacements: replacedByReceipt,
        unknownOrderDates: unknownDates,
      },
      null,
      2,
    ),
  )
}

main()
