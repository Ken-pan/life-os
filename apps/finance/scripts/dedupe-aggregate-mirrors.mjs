#!/usr/bin/env node
/**
 * Detect and exclude account-aggregator (Rocket Money / "Unknown" account) mirror
 * duplicates: same-date, same-amount copies of a real card/bank charge that the
 * legacy exact-merchant-string check misses because the aggregator normalizes
 * merchant names ("Amazon Purchase" vs "AMAZON MKTPL*..."). These inflate spending
 * (double count) and cause one merchant order to match two ledger rows.
 *
 * Detection logic is the pure, unit-tested finance-core engine
 * (detectAggregateMirrors); this script is the IO wrapper only.
 *
 * Usage:
 *   node --experimental-strip-types scripts/dedupe-aggregate-mirrors.mjs [--user-id UUID] [--apply]
 *
 * Default is dry-run. --apply sets, on each mirror row:
 *   include_in_spending_analytics = false, in_spending = false,
 *   exclude_reason = '<label>', and clears purchase_enrichment (the order detail
 *   stays only on the authoritative real-account row).
 */
import { execSync } from 'node:child_process'
import {
  detectAggregateMirrors,
  isAggregateFeedAccount,
} from '@life-os/finance-core/engine/aggregateMirror.ts'

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
const EXCLUDE_LABEL =
  'Rocket Money aggregate mirror of card charge (same date+amount)'

const args = process.argv.slice(2)
const hasFlag = (n) => args.includes(n)
const flagVal = (n) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const apply = hasFlag('--apply')
const userId = flagVal('--user-id')

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
function escSql(s) {
  return String(s).replace(/'/g, "''")
}
async function runSql(query) {
  const token = getToken()
  if (!token) throw new Error('Missing Supabase access token. Run: supabase login')
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

/**
 * Decide what happens to a mirror row's order enrichment. The order belongs to the
 * real charge, so we never silently drop it:
 *  - 'none'      mirror has no enrichment → just exclude it.
 *  - 'clear'     a real twin already carries the same order → drop the mirror copy.
 *  - 'transfer'  exactly one in-spending real twin, and it has no order yet → move
 *                the order onto the real card row, then drop the mirror copy.
 *  - 'keep'      ambiguous (twin already has a different order, or >1 empty twin) →
 *                exclude from spending but leave enrichment + warn for manual review.
 */
function planEnrichment(mirrorRow, twinRows) {
  if (!mirrorRow.purchase_enrichment) return { action: 'none' }
  const oid = mirrorRow.purchase_enrichment.orderId
  const sameOrderTwin = twinRows.find(
    (t) => t.purchase_enrichment && t.purchase_enrichment.orderId === oid,
  )
  if (sameOrderTwin) return { action: 'clear', twinId: sameOrderTwin.id }
  const emptyTwins = twinRows.filter((t) => !t.purchase_enrichment)
  if (emptyTwins.length === 1) {
    return { action: 'transfer', twinId: emptyTwins[0].id }
  }
  return { action: 'keep' }
}

async function main() {
  const tag = '[dedupe-mirrors]'
  const rows = await runSql(`
    select id, txn_date, coalesce(source_amount, amount) as amount, account,
           flow, coalesce(include_in_spending_analytics, in_spending) as in_spending,
           exclude_reason, capture_source, purchase_enrichment,
           coalesce(merchant_name, merchant) as merchant
    from finance_transactions
    where flow = 'expense'
      ${userId ? `and user_id = '${escSql(userId)}'` : ''}
  `)

  const candidates = (rows ?? []).map((r) => ({
    id: String(r.id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    account: r.account ? String(r.account) : '',
    isExpense: true,
    inSpending: Boolean(r.in_spending),
    excluded: Boolean(r.exclude_reason),
    isAggregateFeed: isAggregateFeedAccount(r.account, r.capture_source),
  }))

  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]))
  const mirrors = detectAggregateMirrors(candidates)

  if (!mirrors.length) {
    console.log(tag, 'no aggregate mirror duplicates found. Ledger is clean. ✓')
    return
  }

  let total = 0
  const plans = []
  console.log(`\n${tag} found ${mirrors.length} aggregate mirror duplicate(s):\n`)
  for (const m of mirrors) {
    const r = byId.get(m.mirrorId)
    const twinRows = m.keptTwinIds.map((id) => byId.get(id)).filter(Boolean)
    const plan = planEnrichment(r, twinRows)
    plans.push({ mirror: m, plan })
    const amt = (m.amountCents / 100).toFixed(2)
    total += m.amountCents / 100
    const twin = byId.get(m.keptTwinIds[0])
    const note =
      plan.action === 'transfer'
        ? `  · moves order → ${byId.get(plan.twinId)?.account}`
        : plan.action === 'clear'
          ? '  · twin already has order'
          : plan.action === 'keep'
            ? '  · ⚠ keeps enrichment (ambiguous — review)'
            : ''
    console.log(
      `  ${m.date}  $${amt.padStart(9)}  [${r?.merchant}]  →  keep: ${twin?.merchant} (${twin?.account})${note}`,
    )
  }
  console.log(
    `\n${tag} total double-counted spending to remove: $${total.toFixed(2)}`,
  )
  const transfers = plans.filter((p) => p.plan.action === 'transfer').length
  const warns = plans.filter((p) => p.plan.action === 'keep').length
  console.log(
    `${tag} enrichment: ${transfers} transferred to real card row, ${warns} left for manual review`,
  )

  if (!apply) {
    console.log(`\n${tag} DRY RUN — re-run with --apply to exclude these rows.`)
    return
  }

  // 1. Transfer orders onto the authoritative real-account rows first.
  for (const { mirror, plan } of plans) {
    if (plan.action !== 'transfer') continue
    const enrichment = byId.get(mirror.mirrorId).purchase_enrichment
    await runSql(`
      update finance_transactions
      set purchase_enrichment = '${escSql(JSON.stringify(enrichment))}'::jsonb,
          updated_at = now()
      where id = '${escSql(plan.twinId)}';
    `)
  }

  // 2. Exclude every mirror from spending. Clear enrichment except where we chose to
  //    keep it for manual review (action 'keep').
  const keepIds = new Set(
    plans.filter((p) => p.plan.action === 'keep').map((p) => p.mirror.mirrorId),
  )
  const clearIds = mirrors
    .map((m) => m.mirrorId)
    .filter((id) => !keepIds.has(id))
  const excludeSet = (ids, clearEnrichment) => {
    if (!ids.length) return Promise.resolve()
    const inClause = ids.map((id) => `'${escSql(id)}'`).join(', ')
    return runSql(`
      update finance_transactions
      set include_in_spending_analytics = false,
          in_spending = false,
          exclude_reason = '${escSql(EXCLUDE_LABEL)}',
          ${clearEnrichment ? 'purchase_enrichment = null,' : ''}
          updated_at = now()
      where id in (${inClause});
    `)
  }
  await excludeSet(clearIds, true)
  await excludeSet([...keepIds], false)

  console.log(
    `\n${tag} APPLIED — excluded ${mirrors.length} mirror rows` +
      `${transfers ? `, transferred ${transfers} order(s)` : ''}` +
      `${warns ? `, ${warns} kept for review` : ''}.`,
  )
}

main().catch((e) => {
  console.error('[dedupe-mirrors] failed:', e.message)
  process.exit(1)
})
