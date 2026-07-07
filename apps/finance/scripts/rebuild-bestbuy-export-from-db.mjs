#!/usr/bin/env node
/**
 * Rebuild Best Buy export skeleton from Supabase purchase_enrichment (fallback when harvest wiped).
 * Does not restore lineItems — re-harvest after logging into Best Buy for full detail.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(
  __dirname,
  '../../../tools/web-state-devtools/bridge/data/bestbuy-export/bestbuy-orders-past-year-raw.json',
)
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN)
    return process.env.SUPABASE_ACCESS_TOKEN
  return execSync('security find-generic-password -s "Supabase CLI" -w', {
    encoding: 'utf8',
  }).trim()
}

async function runSql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  )
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function fmtDate(iso) {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

async function main() {
  const rows = await runSql(`
    select purchase_enrichment
    from finance_transactions
    where purchase_enrichment->>'source' = 'bestbuy'
      and purchase_enrichment->>'orderId' is not null;
  `)

  const byOrder = new Map()
  for (const r of rows ?? []) {
    const e = r.purchase_enrichment
    if (!e?.orderId || byOrder.has(e.orderId)) continue
    byOrder.set(e.orderId, {
      orderId: e.orderId,
      orderDate: fmtDate(e.orderDate),
      orderTotal:
        e.orderTotal != null
          ? `$${Number(e.orderTotal).toFixed(2)}`
          : undefined,
      status: e.status,
      detailUrl: e.detailUrl,
      lineItems: e.lineItems?.length ? e.lineItems : [],
      returnInfo: e.returnInfo,
    })
  }

  const orders = [...byOrder.values()].sort((a, b) => {
    const da = Date.parse(a.orderDate || '') || 0
    const db = Date.parse(b.orderDate || '') || 0
    return db - da
  })

  const payload = {
    summary: {
      recipeId: 'bestbuy-orders',
      harvestedAt: new Date().toISOString(),
      pastYearCutoff: new Date(Date.now() - 365 * 86400000)
        .toISOString()
        .slice(0, 10),
      harvestedCount: orders.length,
      rebuiltFromSupabase: true,
      note: 'Skeleton export — re-harvest Best Buy for missing lineItems',
    },
    orders,
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2))
  const base = OUT.replace('-raw.json', '.json')
  fs.writeFileSync(base, JSON.stringify(payload, null, 2))
  console.log(`[rebuild-bestbuy-export] wrote ${orders.length} orders → ${OUT}`)
  console.log(
    `  with lineItems: ${orders.filter((o) => o.lineItems?.length).length}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
