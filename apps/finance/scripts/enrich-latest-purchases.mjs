#!/usr/bin/env node
/**
 * 新购买检测 → WST 定向抓单 → 最优匹配 → 写回 Finance OS 标注,一条命令跑完。
 *
 * 链路(Target / Best Buy / Amazon):
 *   1. 检测:查 finance_transactions 近 N 天、三商家、还没有 purchase_enrichment
 *      的交易(镜像行 exclude_reason 不算)。
 *   2. 定向抓单:只对有新交易的商家跑 Web State DevTools 定向 harvest ——
 *        amazon  → run-recipe.mjs amazon-orders-recent(last30 服务端过滤)
 *        target  → target-harvest-past-year.mjs --days N+15
 *        bestbuy → bestbuy-harvest-past-year.mjs --days N+15
 *      (+15 天缓冲:订单日期与扣款日期可能相差数天,且窗口边缘的单要能配上。)
 *   3. 匹配+标注:link-purchase-orders.mjs --only-transaction-ids <检测到的 id>
 *      --inserts-only --only-high-confidence,匹配引擎按金额差/日期差挑最 match
 *      的订单,写入 purchase_enrichment(默认 dry-run,--apply 才落库)。
 *
 * Usage:
 *   node scripts/enrich-latest-purchases.mjs                       # 检测 + dry-run 匹配(用现有导出)
 *   node scripts/enrich-latest-purchases.mjs --harvest             # 检测 + 定向抓单 + dry-run 匹配
 *   node scripts/enrich-latest-purchases.mjs --harvest --apply     # 全链路落库
 *   node scripts/enrich-latest-purchases.mjs --detect-only         # 只报告新购买
 *
 * Flags:
 *   --days N                 检测窗口,默认 30 天
 *   --merchants a,b          限定商家(amazon|target|bestbuy),默认三个都查
 *   --user-id UUID           用户(默认 FINANCE_OS_USER_ID;--apply 时必需)
 *   --detect-only            只检测,不匹配
 *   --harvest                检测到新交易后跑 WST 定向 harvest(需 bridge + Dev Agent Mode
 *                            + Chrome 已登录对应商家;不加则用现有导出匹配)
 *   --apply                  把高置信匹配写入 purchase_enrichment(否则 dry-run)
 *   --allow-medium           匹配放宽到 medium 置信(默认只写 high)
 *   --max-inserts N          单商家最多写入条数(透传 link 脚本)
 *
 * 前置(--harvest 时):
 *   cd web-state-devtools/bridge && WEB_STATE_ALLOW_ANY=1 npm run bridge
 *   Chrome 装好 WSD 扩展并开 Dev Agent Mode,登录 amazon/target/bestbuy。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iueozzuctstwvzbcxcyh'
const WSD_BRIDGE_DIR = path.resolve(
  __dirname,
  '../../../../web-state-devtools/bridge',
)
const BRIDGE_URL = process.env.WEB_STATE_BRIDGE_URL || 'http://127.0.0.1:17321'
const TAG = '[enrich-latest]'

const MERCHANTS = {
  amazon: {
    merchantSql: `(merchant_name ilike '%amazon%' or merchant ilike '%amazon%')`,
    allowEnv: 'WEB_STATE_ALLOW_AMAZON',
    harvest: () => ({
      script: path.join(WSD_BRIDGE_DIR, 'scripts/run-recipe.mjs'),
      args: ['amazon-orders-recent'],
    }),
    // recent recipe 导出到独立目录,link 脚本必须显式指到这里
    ordersPath: () =>
      path.join(
        WSD_BRIDGE_DIR,
        'data/amazon-export-recent/amazon-orders-recent-raw.json',
      ),
  },
  target: {
    merchantSql: `(merchant_name ilike '%target%' or merchant ilike '%target%')`,
    allowEnv: 'WEB_STATE_ALLOW_TARGET',
    harvest: (days) => ({
      script: path.join(WSD_BRIDGE_DIR, 'scripts/target-harvest-past-year.mjs'),
      args: ['--days', String(days + 15)],
    }),
    ordersPath: () => null, // link 脚本自动解析最新的 dated raw 导出
  },
  bestbuy: {
    merchantSql: `(merchant_name ilike '%best buy%' or merchant_name ilike '%bestbuy%' or merchant ilike '%best buy%' or merchant ilike '%bestbuy%')`,
    allowEnv: 'WEB_STATE_ALLOW_BESTBUY',
    harvest: (days) => ({
      script: path.join(
        WSD_BRIDGE_DIR,
        'scripts/bestbuy-harvest-past-year.mjs',
      ),
      args: ['--days', String(days + 15)],
    }),
    ordersPath: () => null,
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
  return JSON.parse(text)
}

function escSql(s) {
  return String(s).replace(/'/g, "''")
}

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** 近 N 天、指定商家、未标注的真实交易(镜像行剔除)。 */
async function detectNewPurchases(merchantKeys, days, userId) {
  const since = isoDaysAgo(days)
  const bySource = {}
  for (const key of merchantKeys) {
    const cfg = MERCHANTS[key]
    const rows = await runSql(`
      select id, txn_date, coalesce(source_amount, amount) as amount,
             coalesce(merchant_name, merchant) as merchant, flow, account
      from finance_transactions
      where ${cfg.merchantSql}
        and txn_date >= '${escSql(since)}'
        and purchase_enrichment is null
        and exclude_reason is null
        ${userId ? `and user_id = '${escSql(userId)}'` : ''}
      order by txn_date desc;
    `)
    bySource[key] = (rows ?? []).map((r) => ({
      id: String(r.id),
      date: String(r.txn_date).slice(0, 10),
      amount: Number(r.amount),
      merchant: String(r.merchant ?? ''),
      flow: r.flow ? String(r.flow) : '',
      account: r.account ? String(r.account) : '',
    }))
  }
  return { since, bySource }
}

async function bridgeReady() {
  try {
    const health = await fetch(`${BRIDGE_URL}/health`).then((r) => r.json())
    return { ok: true, version: health.version, agent: health.agent }
  } catch {
    return { ok: false }
  }
}

function runHarvest(key, days) {
  const cfg = MERCHANTS[key]
  const { script, args } = cfg.harvest(days)
  console.log(`\n${TAG} harvest ${key}: node ${path.basename(script)} ${args.join(' ')}`)
  const res = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    cwd: WSD_BRIDGE_DIR,
    env: { ...process.env, [cfg.allowEnv]: '1' },
  })
  if (res.status !== 0) {
    console.warn(
      `${TAG} ${key} harvest 退出码 ${res.status} — 跳过该商家的匹配(可稍后用现有导出重跑,不加 --harvest)`,
    )
    return false
  }
  return true
}

function runLink(key, txns, { days, userId, apply, allowMedium, maxInserts }) {
  const cfg = MERCHANTS[key]
  const linkScript = path.join(__dirname, 'link-purchase-orders.mjs')
  // link 脚本 import 的 finance-core 引擎是无扩展名 TS 相对导入,
  // node --experimental-strip-types 解析不了,必须走 vite-node。
  const viteNode = path.resolve(
    __dirname,
    '../../../node_modules/.bin/vite-node',
  )
  const ids = txns.map((t) => t.id).join(',')
  const args = [
    linkScript,
    '--',
    '--source',
    key,
    '--only-transaction-ids',
    ids,
    '--inserts-only',
  ]
  if (!allowMedium) args.push('--only-high-confidence')
  if (maxInserts) args.push('--max-inserts', String(maxInserts))
  if (userId) args.push('--user-id', userId)
  const ordersPath = cfg.ordersPath()
  if (ordersPath) {
    if (!fs.existsSync(ordersPath)) {
      console.warn(
        `${TAG} ${key}: 定向导出不存在(${path.relative(process.cwd(), ordersPath)})——先跑 --harvest,或手动 run-recipe.mjs amazon-orders-recent`,
      )
      return
    }
    args.push('--orders', ordersPath)
    // amazon 的 txn 窗口默认是全年,收窄到检测窗口(含缓冲),避免误配历史交易
    args.push('--since', isoDaysAgo(days + 15))
    args.push('--until', new Date().toISOString().slice(0, 10))
  }
  if (apply) {
    args.push('--apply')
    // 写入已被 --only-transaction-ids 限定在检测到的交易上,
    // target/bestbuy 的账户 scope 守卫在这里可安全放行。
    if (key === 'target' || key === 'bestbuy') args.push('--allow-unscoped')
  }
  console.log(`\n${TAG} link ${key}: ${apply ? 'APPLY' : 'dry-run'} → ${txns.length} 笔候选`)
  const res = spawnSync(viteNode, args, {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  })
  if (res.status !== 0)
    console.warn(`${TAG} ${key} link 退出码 ${res.status}`)
}

async function main() {
  const days = Number(arg('--days', '30')) || 30
  const userId = arg('--user-id', process.env.FINANCE_OS_USER_ID ?? null)
  const detectOnly = hasFlag('--detect-only')
  const doHarvest = hasFlag('--harvest')
  const apply = hasFlag('--apply')
  const allowMedium = hasFlag('--allow-medium')
  const maxInserts = arg('--max-inserts', null)
  const merchantKeys = (arg('--merchants', 'amazon,target,bestbuy') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((k) => MERCHANTS[k])

  if (!merchantKeys.length) {
    console.error(TAG, '--merchants 需为 amazon|target|bestbuy 组合')
    process.exit(1)
  }
  if (apply && !userId) {
    console.error(TAG, '--apply 需要 --user-id(或 FINANCE_OS_USER_ID)')
    process.exit(1)
  }

  console.log(TAG, `检测近 ${days} 天未标注的购买:`, merchantKeys.join(', '))
  const { since, bySource } = await detectNewPurchases(
    merchantKeys,
    days,
    userId,
  )

  let total = 0
  for (const key of merchantKeys) {
    const txns = bySource[key]
    total += txns.length
    console.log(`\n${TAG} ${key}: ${txns.length} 笔新购买(${since} 起)`)
    for (const t of txns.slice(0, 10)) {
      console.log(
        `  ${t.date}  $${Math.abs(t.amount).toFixed(2)}  ${t.merchant}  [${t.account || '账户未知'}]`,
      )
    }
    if (txns.length > 10) console.log(`  … 另有 ${txns.length - 10} 笔`)
  }

  if (total === 0) {
    console.log(`\n${TAG} 没有需要标注的新购买,收工。`)
    return
  }
  if (detectOnly) {
    console.log(`\n${TAG} --detect-only:跳过匹配。`)
    return
  }

  const activeKeys = merchantKeys.filter((k) => bySource[k].length > 0)

  if (doHarvest) {
    const bridge = await bridgeReady()
    if (!bridge.ok) {
      console.error(
        `${TAG} WST bridge 不在线(${BRIDGE_URL})。启动:\n` +
          `  cd "${WSD_BRIDGE_DIR}" && WEB_STATE_ALLOW_ANY=1 npm run bridge\n` +
          `并确认 Chrome 的 Web State DevTools 扩展已开 Dev Agent Mode。`,
      )
      process.exit(2)
    }
    console.log(
      `\n${TAG} bridge ${bridge.version} 就绪,定向抓单:`,
      activeKeys.join(', '),
    )
    for (const key of activeKeys) {
      const ok = runHarvest(key, days)
      if (ok) runLink(key, bySource[key], { days, userId, apply, allowMedium, maxInserts })
    }
  } else {
    console.log(`\n${TAG} 未加 --harvest,用现有导出匹配(可能缺最新订单)。`)
    for (const key of activeKeys) {
      runLink(key, bySource[key], { days, userId, apply, allowMedium, maxInserts })
    }
  }

  if (!apply) {
    console.log(
      `\n${TAG} dry-run 完成 — 确认匹配无误后加 --apply 写入 purchase_enrichment。`,
    )
  }
}

main().catch((e) => {
  console.error(TAG, 'FATAL', e.message)
  process.exit(1)
})
