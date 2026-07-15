#!/usr/bin/env node
/**
 * Detect and exclude duplicate ledger rows. Two distinct shapes, two engines:
 *
 * 1. Cross-feed mirrors (detectAggregateMirrors): an account aggregator
 *    (Rocket Money / "Unknown" account) re-imports a charge the real card/bank feed
 *    already provides, under a normalized merchant name ("Amazon Purchase" vs the
 *    card descriptor "AMAZON MKTPL*..."). Same date + amount, DIFFERENT account.
 *
 * 2. Re-import duplicates (detectReimportDuplicates): one sync/import run overlaps
 *    an earlier one and re-writes rows it already wrote. Same date + amount +
 *    merchant, SAME account — distinguished from genuine same-day repeat charges
 *    (five $2.90 subway rides) by when each row was written. See the engine.
 *
 * Both detectors are pure, unit-tested finance-core engines; this script is the IO
 * wrapper only.
 *
 * Usage:
 *   node --experimental-strip-types scripts/dedupe-aggregate-mirrors.mjs [--user-id UUID] [--apply]
 *
 * Default is dry-run. --apply sets, on each duplicate row:
 *   include_in_spending_analytics = false, in_spending = false,
 *   exclude_reason = '<label>', and clears purchase_enrichment (the order detail
 *   stays only on the authoritative row). Exclusion is reversible on purpose — the
 *   job runs unattended, so it never hard-deletes.
 */
import { execSync } from 'node:child_process'
import {
  detectAggregateMirrors,
  isAggregateFeedAccount,
} from '@life-os/finance-core/engine/aggregateMirror'
import { detectReimportDuplicates } from '@life-os/finance-core/engine/reimportDuplicates'

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
const MIRROR_LABEL =
  'Rocket Money aggregate mirror of card charge (same date+amount)'
const REIMPORT_LABEL =
  'Duplicate write from an overlapping sync/import run (same date+amount+merchant)'

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
 * Decide what happens to a duplicate row's order enrichment. The order belongs to the
 * authoritative row, so we never silently drop it:
 *  - 'none'      duplicate has no enrichment → just exclude it.
 *  - 'clear'     a kept twin already carries the same order → drop the duplicate copy.
 *  - 'transfer'  exactly one kept twin, and it has no order yet → move the order onto
 *                the kept row, then drop the duplicate copy.
 *  - 'keep'      ambiguous (twin already has a different order, or >1 empty twin) →
 *                exclude from spending but leave enrichment + warn for manual review.
 */
function planEnrichment(dupRow, twinRows) {
  if (!dupRow.purchase_enrichment) return { action: 'none' }
  const oid = dupRow.purchase_enrichment.orderId
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

/** Report one detector's findings and return the plans the applier needs. */
function reportFindings(tag, title, findings, byId, describe) {
  console.log(`\n${tag} found ${findings.length} ${title}:\n`)
  const plans = []
  let total = 0
  for (const f of findings) {
    const row = byId.get(f.id)
    const twinRows = f.keptIds.map((id) => byId.get(id)).filter(Boolean)
    const plan = planEnrichment(row, twinRows)
    plans.push({ finding: f, plan })
    total += f.amountCents / 100
    const note =
      plan.action === 'transfer'
        ? `  · moves order → ${byId.get(plan.twinId)?.account}`
        : plan.action === 'clear'
          ? '  · twin already has order'
          : plan.action === 'keep'
            ? '  · ⚠ keeps enrichment (ambiguous — review)'
            : ''
    console.log(`  ${describe(f, row, twinRows)}${note}`)
  }
  console.log(`\n${tag} ${title}: $${total.toFixed(2)} double-counted`)
  return plans
}

/** Exclude each duplicate from spending, moving/clearing enrichment per its plan. */
async function applyPlans(plans, label, byId) {
  // Transfer orders onto the authoritative rows first, so no order is dropped.
  for (const { finding, plan } of plans) {
    if (plan.action !== 'transfer') continue
    const enrichment = byId.get(finding.id).purchase_enrichment
    await runSql(`
      update finance_transactions
      set purchase_enrichment = '${escSql(JSON.stringify(enrichment))}'::jsonb,
          updated_at = now()
      where id = '${escSql(plan.twinId)}';
    `)
  }

  const keepIds = plans
    .filter((p) => p.plan.action === 'keep')
    .map((p) => p.finding.id)
  const clearIds = plans
    .filter((p) => p.plan.action !== 'keep')
    .map((p) => p.finding.id)
  const excludeSet = (ids, clearEnrichment) => {
    if (!ids.length) return Promise.resolve()
    const inClause = ids.map((id) => `'${escSql(id)}'`).join(', ')
    return runSql(`
      update finance_transactions
      set include_in_spending_analytics = false,
          in_spending = false,
          exclude_reason = '${escSql(label)}',
          ${clearEnrichment ? 'purchase_enrichment = null,' : ''}
          updated_at = now()
      where id in (${inClause});
    `)
  }
  await excludeSet(clearIds, true)
  await excludeSet(keepIds, false)
}

/**
 * First day on which every written row carried a duplicate guard.
 *
 * 3e8fcc15 (2026-07-06) aligned finalize_extension_sync_v1's ON CONFLICT with the
 * partial platform_id index; before it the upsert raised 42P10 and deduped nothing,
 * which is how the 2026-07-04 duplicates got in. Rows written before this date have
 * no guard and never will — anchoring here keeps the canary quiet about settled
 * history instead of re-reporting it every night until a rolling window slides past.
 */
const GUARD_EPOCH = '2026-07-07'

/**
 * Canary for the write-side duplicate guards.
 *
 * Two paths, two guards: extension sync relies on platform_id (partial unique index
 * `transactions_user_capture_platform_uidx`), CSV import on transaction_fingerprint
 * (plus a source_file_hash re-import block). A row carrying NEITHER was written by
 * something with no guard at all — that is the 2026-07-04 shape.
 *
 * Both guards can lapse silently: platform_id is scraped out of the page, so an
 * upstream markup change starts yielding rows without one and the PARTIAL index
 * simply stops applying. Nothing else surfaces that, so the job checks it.
 */
async function reportGuardCoverage(tag) {
  const rows = await runSql(`
    select count(*) as written,
           count(*) filter (
             where (platform_id is null or platform_id = '')
               and transaction_fingerprint is null
           ) as unguarded
    from finance_transactions
    where created_at >= '${GUARD_EPOCH}'
      ${userId ? `and user_id = '${escSql(userId)}'` : ''}
  `)
  const written = Number(rows?.[0]?.written ?? 0)
  const unguarded = Number(rows?.[0]?.unguarded ?? 0)
  if (unguarded > 0) {
    console.log(
      `\n${tag} ⚠ ${unguarded}/${written} row(s) written since ${GUARD_EPOCH} carry no` +
        ` platform_id and no transaction_fingerprint — nothing stops them from being` +
        ` written twice. Check the extension's platformId extraction.`,
    )
  }
}

async function main() {
  const tag = '[dedupe-mirrors]'
  await reportGuardCoverage(tag)
  const rows = await runSql(`
    select id, txn_date, coalesce(source_amount, amount) as amount, account,
           flow, coalesce(include_in_spending_analytics, in_spending) as in_spending,
           exclude_reason, capture_source, purchase_enrichment, created_at,
           coalesce(merchant_name, merchant) as merchant
    from finance_transactions
    where flow = 'expense'
      ${userId ? `and user_id = '${escSql(userId)}'` : ''}
  `)

  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]))
  const base = (r) => ({
    id: String(r.id),
    date: String(r.txn_date).slice(0, 10),
    amount: Number(r.amount),
    account: r.account ? String(r.account) : '',
    isExpense: true,
    inSpending: Boolean(r.in_spending),
    excluded: Boolean(r.exclude_reason),
  })

  const mirrors = detectAggregateMirrors(
    (rows ?? []).map((r) => ({
      ...base(r),
      isAggregateFeed: isAggregateFeedAccount(r.account, r.capture_source),
    })),
  ).map((m) => ({
    id: m.mirrorId,
    keptIds: m.keptTwinIds,
    date: m.date,
    amountCents: m.amountCents,
  }))

  const reimports = detectReimportDuplicates(
    (rows ?? []).map((r) => ({
      ...base(r),
      merchant: r.merchant ? String(r.merchant) : '',
      createdAt: new Date(r.created_at).toISOString(),
    })),
  ).map((d) => ({
    id: d.duplicateId,
    keptIds: d.keptIds,
    date: d.date,
    amountCents: d.amountCents,
    gapMinutes: d.gapMinutes,
  }))

  if (!mirrors.length && !reimports.length) {
    console.log(tag, 'no duplicate rows found. Ledger is clean. ✓')
    return
  }

  const plans = []
  if (mirrors.length) {
    plans.push({
      label: MIRROR_LABEL,
      plans: reportFindings(
        tag,
        'cross-feed aggregate mirror(s)',
        mirrors,
        byId,
        (f, row, twins) =>
          `${f.date}  $${(f.amountCents / 100).toFixed(2).padStart(9)}  [${row?.merchant}]  →  keep: ${twins[0]?.merchant} (${twins[0]?.account})`,
      ),
    })
  }
  if (reimports.length) {
    plans.push({
      label: REIMPORT_LABEL,
      plans: reportFindings(
        tag,
        're-import duplicate(s)',
        reimports,
        byId,
        (f, row) =>
          `${f.date}  $${(f.amountCents / 100).toFixed(2).padStart(9)}  [${row?.merchant}] (${row?.account})  →  re-written ${f.gapMinutes}min after the first write`,
      ),
    })
  }

  const warns = plans
    .flatMap((p) => p.plans)
    .filter((p) => p.plan.action === 'keep').length
  if (warns) {
    console.log(`\n${tag} ${warns} row(s) kept enrichment for manual review`)
  }

  if (!apply) {
    console.log(`\n${tag} DRY RUN — re-run with --apply to exclude these rows.`)
    return
  }

  for (const group of plans) {
    await applyPlans(group.plans, group.label, byId)
  }

  console.log(
    `\n${tag} APPLIED — excluded ${mirrors.length} mirror(s), ${reimports.length} re-import duplicate(s).`,
  )
}

main().catch((e) => {
  console.error('[dedupe-mirrors] failed:', e.message)
  process.exit(1)
})
