#!/usr/bin/env node
/**
 * Audit Amazon orders export for data quality + false returnInfo detection.
 *
 * Usage:
 *   node scripts/audit-amazon-export.mjs [--file path/to/raw.json] [--sample 20]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOrdersRawPath } from '../lib/orders-export.mjs'
import {
  hasExplicitReturnEvidence,
  isFalsePositiveReturnInfo,
} from '../lib/amazon-orders-parser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_EXPORT_DIR = path.join(__dirname, '..', 'data', 'amazon-export')

function argVal(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const sampleN = Number(argVal('--sample') || 20)
const fileArg = argVal('--file')

function parseMoney(v) {
  if (v == null || v === '') return NaN
  return parseFloat(String(v).replace(/[^0-9.-]/g, ''))
}

function toIsoDate(raw) {
  if (!raw) return null
  const t = Date.parse(String(raw))
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return null
}

function normalizedStatus(order) {
  const s = (order.status || '').trim()
  const ri = order.returnInfo?.status
  if (/^return complete$/i.test(s) || ri === 'returned') return 'returned'
  if (/^refund/i.test(s) || ri === 'refunded') return 'refunded'
  if (/^cancel/i.test(s) || ri === 'cancelled') return 'cancelled'
  if (/deliver/i.test(s)) return 'delivered'
  if (/arriv|ship/i.test(s)) return 'shipped'
  if (/purchas/i.test(s)) return 'purchased'
  return s.toLowerCase() || 'unknown'
}

function buildSamples(orders) {
  const delivered = orders.filter((o) => /deliver/i.test(o.status || ''))
  const arriving = orders.filter((o) => /arriv|ship/i.test(o.status || ''))
  const returnLike = orders.filter(
    (o) =>
      o.returnInfo?.status ||
      /return complete|refund|cancel/i.test(o.status || ''),
  )

  const pick = (arr, n) => arr.slice(0, n)
  const samples = []
  samples.push(...pick(delivered, 5).map((o) => formatSample(o)))
  samples.push(...pick(arriving, 5).map((o) => formatSample(o)))
  if (returnLike.length <= 10) {
    samples.push(...returnLike.map((o) => formatSample(o)))
  } else {
    samples.push(...pick(returnLike, 10).map((o) => formatSample(o)))
  }
  return samples.slice(0, sampleN)
}

function formatSample(o) {
  return {
    orderId: o.orderId,
    orderDate: toIsoDate(o.orderDate) || o.orderDate,
    status: normalizedStatus(o),
    statusRaw: o.status,
    returnInfo: o.returnInfo || null,
    returnEvidenceText: o.returnEvidenceText || null,
    returnInfoRaw: o.returnInfoRaw || null,
    itemTitles: (o.lineItems || []).slice(0, 3).map((li) => li.title),
    total: o.orderTotal,
    parserWarnings: o.parserWarnings || [],
  }
}

function main() {
  const file =
    fileArg ||
    resolveOrdersRawPath(DEFAULT_EXPORT_DIR, 'amazon') ||
    path.join(DEFAULT_EXPORT_DIR, 'amazon-orders-2026-raw.json')

  if (!fs.existsSync(file)) {
    console.error('File not found:', file)
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const orders = data.orders || []

  const statusCounts = {}
  for (const o of orders) {
    const ns = normalizedStatus(o)
    statusCounts[ns] = (statusCounts[ns] || 0) + 1
  }

  const falsePositives = orders.filter(isFalsePositiveReturnInfo)
  const missingDate = orders.filter((o) => !toIsoDate(o.orderDate)).length
  const missingTotal = orders.filter(
    (o) => !o.orderTotal || !Number.isFinite(parseMoney(o.orderTotal)),
  ).length
  const withReturnInfo = orders.filter((o) => o.returnInfo).length
  const refunded = orders.filter(
    (o) => o.returnInfo?.status === 'refunded' || /^refund/i.test(o.status || ''),
  ).length
  const returned = orders.filter(
    (o) => o.returnInfo?.status === 'returned' || /^return complete/i.test(o.status || ''),
  ).length
  const cancelled = orders.filter(
    (o) => o.returnInfo?.status === 'cancelled' || /^cancel/i.test(o.status || ''),
  ).length

  const report = {
    file: path.basename(file),
    summary: {
      totalOrders: orders.length,
      totalItems: orders.reduce((s, o) => s + (o.lineItems?.length || 0), 0),
      missingDateCount: missingDate,
      missingTotalCount: missingTotal,
      statusCounts,
      returnInfoCount: withReturnInfo,
      refundedCount: refunded,
      returnedCount: returned,
      cancelledCount: cancelled,
      falsePositiveReturnInfoCount: falsePositives.length,
      falsePositiveAssertionPass: falsePositives.length === 0,
    },
    falsePositives: falsePositives.map((o) => ({
      orderId: o.orderId,
      status: o.status,
      returnInfo: o.returnInfo,
      returnEvidenceText: o.returnEvidenceText,
      hasExplicitEvidence: hasExplicitReturnEvidence(
        o.returnEvidenceText,
        o.status,
      ),
    })),
    samples: buildSamples(orders),
  }

  console.log(JSON.stringify(report, null, 2))
  process.exit(falsePositives.length > 0 ? 1 : 0)
}

main()
