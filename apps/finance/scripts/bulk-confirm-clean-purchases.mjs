#!/usr/bin/env node
/**
 * FINC.PURCHASE.6.a closure —— 批量确认「干净」的采购关联,把 proposed 队列收敛到
 * 真正需要人工看的那几条(matched_review)。
 *
 * 背景:migration 把**每一笔**有 purchase_enrichment 的交易都默认 seed 成 proposed
 * (267 条),但用户实际要看的只是分类器判为 matched_review 的那撮。clean_enriched 是
 * 高置信精确匹配,不该占着 proposed 逼人逐条点。
 *
 * 做法:
 *   - 分类**完全用 SSOT**(`@life-os/finance-enrichment-contract/classify` 的
 *     classifyCleanReasons/resolveDisplayState/buildDuplicateMaps),不自造判据,不发散。
 *   - 确认走**已测过的决策引擎 RPC** `purchase_review_decide`(写 decision 日志 + 版本递增),
 *     绝不裸改 association 表 / 绕过引擎(文档明令禁止)。
 *   - 只碰 state='clean_enriched' 的;matched_review / return_refund / 其它一律不动,留给用户。
 *
 * 默认 dry-run(只分类 + 报数);--apply 才调 RPC 写库。凭证走钥匙串(supabase-sql.sh)。
 *
 * Usage:
 *   node apps/finance/scripts/bulk-confirm-clean-purchases.mjs          # dry-run
 *   node apps/finance/scripts/bulk-confirm-clean-purchases.mjs --apply
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  classifyCleanReasons,
  resolveDisplayState,
  buildDuplicateMaps,
  inferSourceView,
  mergeKeyFor,
} from '@life-os/finance-enrichment-contract/classify'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const APPLY = process.argv.includes('--apply')

function runSql(sql) {
  const r = spawnSync(`${ROOT}scripts/supabase-sql.sh`, [sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`supabase-sql 失败: ${(r.stderr || r.stdout || '').slice(0, 400)}`)
  const out = (r.stdout || '').trim()
  try {
    return JSON.parse(out)
  } catch {
    throw new Error(`JSON 解析失败: ${out.slice(0, 300)}`)
  }
}

// ── 规范化:enrichment JSONB → 分类器 order(镜像 finance-core txnToNormalizedOrder)──
const centsFromDollars = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(Math.abs(v) * 100))
const isReturnLike = (info) => info != null && info.status !== 'none' && info.status !== 'return_in_progress'

function txnToNormalizedOrder(t) {
  const e = t.purchase_enrichment
  if (!e?.source) return { transactionId: t.id, source: null, merchantAccount: t.account || 'Unknown' }
  const source = e.source
  const lineItems = e.lineItems || []
  const orderTotalCents = centsFromDollars(e.orderTotal)
  const txnAmountCents = centsFromDollars(t.amount)
  const amountDiffCents =
    orderTotalCents != null && txnAmountCents != null ? orderTotalCents - txnAmountCents : null
  const sourceView = inferSourceView(source, e)
  const isInstore =
    source === 'target' && (sourceView === 'in_store' || /^\d{3}-\d{2}-\d{4}-\d{6}$/.test(e.orderId || ''))
  return {
    transactionId: t.id,
    source,
    sourceView,
    merchantAccount: t.account || 'Unknown',
    sourceOrderId: isInstore ? null : e.orderId || null,
    sourceReceiptId: isInstore ? e.orderId || null : null,
    mergeKey: mergeKeyFor(source, e),
    status: e.status || 'unknown',
    matchConfidence: e.matchConfidence || 'unknown',
    qualityPass: e.quality?.pass === true,
    itemCount: lineItems.length,
    missingTitles: lineItems.filter((li) => !li.title).length,
    missingQty: lineItems.filter((li) => !li.quantity || li.quantity < 1).length,
    totalCents: orderTotalCents,
    amountDiffCents,
    hasReturnInfo: Boolean(e.returnInfo && isReturnLike(e.returnInfo)),
  }
}

// 1) 拉全部有增强的交易(算重复图要全量)+ 全部 proposed 关联
console.log('拉取交易 + proposed 关联…')
const txns = runSql(
  `select id, amount, account, purchase_enrichment from public.finance_transactions where purchase_enrichment is not null;`,
)
const proposed = runSql(
  `select id, transaction_id, association_version from public.purchase_associations where state='proposed';`,
)
console.log(`  有增强交易 ${txns.length} · proposed 关联 ${proposed.length}`)

// 2) 分类(SSOT)
const byId = new Map(txns.map((t) => [t.id, t]))
const orders = txns.filter((t) => t.purchase_enrichment?.source).map(txnToNormalizedOrder)
const dupMaps = buildDuplicateMaps(orders)

const buckets = { clean_enriched: [], matched_review: [], return_refund: [], merchant_only: [], unsupported_source: [], no_txn: [] }
for (const a of proposed) {
  const t = byId.get(a.transaction_id)
  if (!t) { buckets.no_txn.push(a); continue }
  const order = txnToNormalizedOrder(t)
  const reasons = order.source ? classifyCleanReasons(order, dupMaps) : []
  const state = resolveDisplayState(order, reasons)
  ;(buckets[state] ?? (buckets[state] = [])).push({ ...a, source: order.source, reasons })
}

console.log('\n=== proposed 关联分类(SSOT) ===')
for (const [k, v] of Object.entries(buckets)) if (v.length) console.log(`  ${k.padEnd(18)} ${v.length}`)
const clean = buckets.clean_enriched
console.log(`\n干净可自动确认: ${clean.length} · 留给用户(review/return/其它): ${proposed.length - clean.length}`)
// review 原因分布(帮用户判断剩下的是什么)
const reasonCount = {}
for (const a of buckets.matched_review) for (const r of a.reasons) reasonCount[r] = (reasonCount[r] ?? 0) + 1
if (Object.keys(reasonCount).length) {
  console.log('matched_review 原因分布:', Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}=${n}`).join(' · '))
}

if (!APPLY) {
  console.log('\ndry-run(不写库)。确认干净那批加 --apply。')
  process.exit(0)
}

// 3) --apply:逐条走 RPC 确认(一条 SQL 批量调 function,每行各自锁 + 写 decision 日志)
if (!clean.length) { console.log('没有可确认的干净关联,结束。'); process.exit(0) }
console.log(`\n--apply:经 purchase_review_decide RPC 确认 ${clean.length} 条干净关联…`)
const values = clean.map((a) => `('${a.id}'::uuid, ${a.association_version})`).join(',')
// lateral:每行**只调一次** RPC(同 action_key 幂等,重跑也安全)。
const sql = `
select a.id::text as id, x.r->>'ok' as ok, x.r->>'status' as status, x.r->>'error' as error
from (values ${values}) as a(id, ver)
cross join lateral (
  select public.purchase_review_decide(a.id, 'confirm', a.ver, 'bulk-clean-v1:'||a.id::text) as r
) x;`
const res = runSql(sql)
const ok = res.filter((r) => r.ok === 'true').length
const fail = res.filter((r) => r.ok !== 'true')
console.log(`✔ 确认成功 ${ok} / ${res.length}`)
if (fail.length) {
  console.log(`⚠️ 失败 ${fail.length}:`)
  for (const f of fail.slice(0, 10)) console.log(`   ${f.id} status=${f.status}`)
}
// 复核:现在还剩多少 proposed
const after = runSql(`select count(*) as n from public.purchase_associations where state='proposed';`)
console.log(`\n收敛后 proposed 剩: ${after[0].n}(= 真正待你审核的 matched_review)`)
