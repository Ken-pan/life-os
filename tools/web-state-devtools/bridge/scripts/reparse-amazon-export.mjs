#!/usr/bin/env node
/**
 * Re-parse existing Amazon raw export with fixed returnInfo rules.
 * Writes a versioned fixed file — does not overwrite the original.
 *
 * Usage: node scripts/reparse-amazon-export.mjs [--input path] [--out path]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOrdersRawPath } from '../lib/orders-export.mjs'
import {
  deriveAmazonReturnInfoDecision,
  reparseReturnInfoFromStatusOnly,
} from '../lib/amazon-orders-parser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dirname, '..', 'data', 'amazon-export')

function argVal(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes())
  )
}

function main() {
  const input =
    argVal('--input') ||
    resolveOrdersRawPath(DATA, 'amazon') ||
    path.join(DATA, 'amazon-orders-2026-raw.json')

  if (!fs.existsSync(input)) {
    console.error('Input not found:', input)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(input, 'utf8'))
  const orders = raw.orders || []
  let stripped = 0
  let kept = 0
  const warnings = []

  const fixedOrders = orders.map((order) => {
    const before = order.returnInfo
    const { returnInfo, warnings: w } = reparseReturnInfoFromStatusOnly(order)
    if (before && !returnInfo) stripped++
    if (returnInfo) kept++
    if (w.length) {
      warnings.push({ orderId: order.orderId, warnings: w })
    }
    const parserWarnings = [
      ...(order.parserWarnings || []),
      ...w.filter((x) => !(order.parserWarnings || []).includes(x)),
    ]
    const patched = {
      ...order,
      returnInfo,
      parserWarnings: parserWarnings.length ? parserWarnings : undefined,
    }
    return {
      ...patched,
      returnInfoDecision: deriveAmazonReturnInfoDecision(patched),
    }
  })

  const out =
    argVal('--out') ||
    path.join(DATA, `amazon-orders-2026-fixed-returninfo-${stamp()}-raw.json`)

  const output = {
    ...raw,
    orders: fixedOrders,
    summary: {
      ...raw.summary,
      reparseSource: path.basename(input),
      reparseAt: new Date().toISOString(),
      returnInfoBefore: orders.filter((o) => o.returnInfo).length,
      returnInfoAfter: fixedOrders.filter((o) => o.returnInfo).length,
      returnInfoStripped: stripped,
    },
  }

  fs.writeFileSync(out, JSON.stringify(output, null, 2))

  console.log(
    JSON.stringify(
      {
        input: path.basename(input),
        output: path.basename(out),
        totalOrders: orders.length,
        returnInfoBefore: output.summary.returnInfoBefore,
        returnInfoAfter: output.summary.returnInfoAfter,
        stripped,
        warningsCount: warnings.length,
      },
      null,
      2,
    ),
  )
}

main()
