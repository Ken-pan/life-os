#!/usr/bin/env node
/**
 * Repair legacy Rocket Money import rows:
 * - account stored as pipeline label → Unknown
 * - merchant equals category (no real merchant name) → left for re-sync
 *
 * Usage:
 *   node scripts/fix-legacy-import-txns.mjs --user-id UUID [--dry-run] [--apply]
 */
import { execSync } from 'node:child_process'

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
const PIPELINE_ACCOUNTS = ['Rocket Money', 'Robinhood', 'Fidelity']

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

function escSql(s) {
  return String(s).replace(/'/g, "''")
}

async function main() {
  const userId = arg('--user-id', process.env.FINANCE_OS_USER_ID ?? null)
  const dryRun = hasFlag('--dry-run') || !hasFlag('--apply')
  const userFilter = userId ? `and user_id = '${escSql(userId)}'` : ''

  const accountList = PIPELINE_ACCOUNTS.map((a) => `'${escSql(a)}'`).join(', ')

  const badAccount = await runSql(`
    select count(*)::int as n
    from finance_transactions
    where source_account_label in (${accountList})
      ${userFilter};
  `)
  const badMerchant = await runSql(`
    select count(*)::int as n
    from finance_transactions
    where merchant_name = normalized_category
      and merchant_name is not null
      and merchant_name <> ''
      ${userFilter};
  `)

  const accountCount = badAccount?.[0]?.n ?? 0
  const merchantCount = badMerchant?.[0]?.n ?? 0

  console.log('[fix-legacy]', 'pipeline account rows:', accountCount)
  console.log('[fix-legacy]', 'merchant=category rows:', merchantCount)
  console.log(
    '[fix-legacy]',
    merchantCount > 0
      ? 'merchant=category rows need Rocket Money re-sync (extension reload + re-crawl) — not auto-fixable without statement text'
      : 'no merchant=category rows',
  )

  if (dryRun) {
    console.log('\n[fix-legacy] dry-run — pass --apply to set pipeline accounts → Unknown')
    return
  }

  if (accountCount > 0) {
    await runSql(`
      update finance_transactions
      set source_account_label = 'Unknown',
          account = 'Unknown',
          updated_at = now()
      where source_account_label in (${accountList})
        ${userFilter};
    `)
    console.log('[fix-legacy] updated pipeline account labels → Unknown')
  }
}

main().catch((e) => {
  console.error('[fix-legacy] FATAL', e.message)
  process.exit(1)
})
