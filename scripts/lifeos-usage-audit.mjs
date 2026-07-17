#!/usr/bin/env node
/**
 * PLAT.USAGE.0 — 第一方用量 / 功能利用率盘点（决策复利）。
 *
 * 默认 dry-run：写 docs/qa/usage-audit-YYYY-MM.md 骨架(表用上一版手工快照占位)。
 * `--apply`：经 ./scripts/supabase-sql.sh 跑真查询,**把两张表从实时 JSON 渲染出来**
 * (数字与「日用/偶发/冷」判定都活的),不再重印写死的旧快照。凭证走钥匙串 "Supabase CLI"
 * (见 supabase-sql.sh)。判定是数据算的;战略「建议动作」仍是人工层,复跑后需人工复核。
 *
 * Usage:
 *   node scripts/lifeos-usage-audit.mjs
 *   node scripts/lifeos-usage-audit.mjs --apply
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath(不是 .pathname):.pathname 对非 ASCII 目录(仓库路径含「」)会留 %E3%80%8C
// 百分号编码,existsSync/writeFileSync 拿它当字面目录 → 静默写到乱码目录、--apply 从不生效。
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APPLY = process.argv.includes('--apply')
const now = new Date()
const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
const outDir = join(ROOT, 'docs/qa')
const outPath = join(outDir, `usage-audit-${ym}.md`)

const QUERIES = {
  last_opened: `
select app_id, max(last_opened_at) as last_opened_at
from public.core_user_app_settings
where last_opened_at is not null
group by app_id
order by last_opened_at desc;
`.trim(),
  music: `
select
  (select count(*) from music.play_events where created_at > now() - interval '7 days') as plays_7d,
  (select count(*) from music.play_events where created_at > now() - interval '30 days') as plays_30d,
  (select count(*) from music.recommendation_events where created_at > now() - interval '30 days') as rec_30d;
`.trim(),
  home: `
select
  (select count(*) from home.scans where to_timestamp(updated_at/1000.0) > now() - interval '7 days') as scans_7d,
  (select count(*) from home.scans where to_timestamp(updated_at/1000.0) > now() - interval '30 days') as scans_30d,
  (select count(*) from home.object_embeddings) as embeddings,
  (select count(*) from home.object_observations where (match->>'state') = 'possibly_same') as pending_recog,
  (select count(*) from home.events where to_timestamp(ts/1000.0) > now() - interval '30 days') as events_30d;
`.trim(),
  finance_life: `
select
  (select count(*) from public.purchase_associations where state = 'proposed') as proposed,
  (select count(*) from public.purchase_associations where state = 'confirmed') as confirmed,
  (select count(*) from public.purchase_associations where state = 'rejected') as rejected,
  (select count(*) from public.purchase_decisions where created_at > now() - interval '30 days') as decisions_30d,
  (select count(*) from public.life_events where created_at > now() - interval '30 days') as life_events_30d,
  (select count(*) from public.life_events where type = 'fitness.workout_logged' and created_at > now() - interval '30 days') as workout_30d,
  (select count(*) from public.life_events where type = 'finance.bill_due' and created_at > now() - interval '30 days') as bill_30d;
`.trim(),
}

/** 跑一条 SQL → 解析 supabase-sql.sh 的 JSON 数组输出。 */
function runSql(sql) {
  const r = spawnSync(join(ROOT, 'scripts/supabase-sql.sh'), [sql], { encoding: 'utf8', cwd: ROOT })
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || '').trim().slice(0, 300) }
  try {
    return { ok: true, rows: JSON.parse((r.stdout || '').trim()) }
  } catch {
    return { ok: false, error: 'JSON 解析失败: ' + (r.stdout || '').trim().slice(0, 200) }
  }
}

// --apply 时跑全部查询
const data = {}
const errors = []
if (APPLY && existsSync(join(ROOT, 'scripts/supabase-sql.sh'))) {
  for (const [name, sql] of Object.entries(QUERIES)) {
    const r = runSql(sql)
    if (r.ok) data[name] = r.rows
    else errors.push(`${name}: ${r.error}`)
  }
}
const live = !!data.last_opened && !!data.finance_life

// ── 判定口径 ───────────────────────────────────────────────────────────────
const daysSince = (iso) => (iso ? Math.floor((now - new Date(iso)) / 86_400_000) : null)
const openVerdict = (d) => (d == null ? '未知' : d <= 3 ? '日用' : d <= 30 ? `偶发（~${d}d）` : `冷（${d}d+）`)
const useVerdict = (n7, n30) => (n7 > 0 ? '日用' : n30 > 0 ? '偶发' : '冷/死')
/** 本地优先 app:很可能不进 core_user_app_settings,单独标未知(别误判成死) */
const LOCAL_FIRST = ['aios', 'knowledge', 'health']

// ── 表 1:跨站打开 ───────────────────────────────────────────────────────────
const HARDCODED_OPEN = `| finance | 2026-07-17 | 日用 |
| home | 2026-07-17 | 日用 |
| fitness | 2026-07-17 | 日用 |
| planner | 2026-07-17 | 日用 |
| music | 2026-07-17 | 日用 |
| portal | 2026-07-13 | 偶发（~4d） |
| aios / knowledge / health | — | 未知（本地优先，未进 \`core_user_app_settings\` 或未部署） |`

function openTable() {
  if (!live) return HARDCODED_OPEN
  const seen = new Set(data.last_opened.map((r) => r.app_id))
  const lines = data.last_opened.map((r) => {
    const d = daysSince(r.last_opened_at)
    return `| ${r.app_id} | ${(r.last_opened_at || '').slice(0, 10) || '—'} | ${openVerdict(d)} |`
  })
  const missing = LOCAL_FIRST.filter((a) => !seen.has(a))
  if (missing.length) lines.push(`| ${missing.join(' / ')} | — | 未知（本地优先，未进表或未部署） |`)
  return lines.join('\n')
}

// ── 表 2:功能利用率 ─────────────────────────────────────────────────────────
const HARDCODED_FEATURE = `| Music | \`play_events\` / \`recommendation_events\` | 29 plays · 242 plays / 404 rec | **日用** | 推荐环在转；维护 PIPE 即可 |
| Home | scans / embeddings / pending recog | 29 scans · 535 emb · 21 pending | **日用** | 认亲主航道值得护；pending 靠横幅消化 |
| Finance 审核 | associations proposed/confirmed/rejected | 267 / 4 / 2 · 6 decisions/30d | **日用缺口** | **6.a closure 必须收割**——队列大、确认少 |
| Fitness↔Planner | \`fitness.workout_logged\` | 9 / 30d | 偶发→日用边缘 | 事件链有效；勿再扩无消费者事件 |
| Finance bills | \`finance.bill_due\` | 10 / 30d | 偶发 | 管道健康 |
| Portal | last_opened | ~4d 前 | 偶发 | 不为凑卡扩本地优先入口 |
| Knowledge | Vault watcher | — | 未知→即将日用 | **VAULT.0** 刚落地，用几天后再审计 |
| AIOS / Health | 本地 | — | 未知 | 先 STABLE.26 / HLT-5，不上 Portal 卡 |`

function featureTable() {
  if (!live) return HARDCODED_FEATURE
  const m = data.music?.[0] || {}
  const h = data.home?.[0] || {}
  const f = data.finance_life?.[0] || {}
  // Finance 审核缺口判据:积压 proposed 多而近 30d 决策少 = closure 摩擦
  const financeGap = Number(f.proposed) > 50 && Number(f.decisions_30d) < 20
  return [
    `| Music | \`play_events\` / \`recommendation_events\` | ${m.plays_7d} plays 7d · ${m.plays_30d} plays 30d / ${m.rec_30d} rec | **${useVerdict(m.plays_7d, m.plays_30d)}** | 推荐环在转;维护 PIPE 即可 |`,
    `| Home | scans / embeddings / pending recog | ${h.scans_7d} 7d · ${h.scans_30d} 30d · ${h.embeddings} emb · ${h.pending_recog} pending | **${useVerdict(h.scans_7d, h.scans_30d)}** | 认亲主航道;pending 靠横幅消化 |`,
    `| Finance 审核 | proposed/confirmed/rejected · decisions 30d | ${f.proposed} / ${f.confirmed} / ${f.rejected} · ${f.decisions_30d} | **${financeGap ? '日用缺口' : '日用'}** | ${financeGap ? '**closure 必须收割**——积压大、决策少' : '队列在消化'} |`,
    `| Fitness↔Planner | \`fitness.workout_logged\` | ${f.workout_30d} / 30d | ${Number(f.workout_30d) >= 8 ? '偶发→日用边缘' : '偶发'} | 事件链有效;勿扩无消费者事件 |`,
    `| Finance bills | \`finance.bill_due\` | ${f.bill_30d} / 30d | 偶发 | 管道健康 |`,
    `| life_events(总) | outbox 30d | ${f.life_events_30d} / 30d | — | 跨 OS 消费活跃度底数 |`,
    `| Knowledge / AIOS / Health | 本地优先 | — | 未知 | 本机另查;VAULT.0 用几天后再审计 |`,
  ].join('\n')
}

const stamp = live
  ? `本次 \`--apply\` 远程复跑(${now.toISOString().slice(0, 16)}Z)`
  : `未跑远程查询;表为上一版手工快照占位`

const body = `# Life OS 用量审计 ${ym}

> **Ticket：** PLAT.USAGE.0 · 透镜 [\`../roadmap/USAGE_AUDIT.md\`](../roadmap/USAGE_AUDIT.md)
> **生成：** ${now.toISOString()} · \`${APPLY ? '--apply' : 'skeleton'}\` · 数据源:${stamp}

## 判定口径

- **日用** — 7d 内有痕迹
- **偶发** — 30d 有痕迹 / 打开 ≤30d
- **冷 / 死** — 30d+ 零痕迹 → 候选冻结或删入口
- **未知** — 本地优先 app（AIOS / Knowledge / Health）需本机另查

## 跨站打开（\`last_opened_at\`）

| App | 最近打开 | 判定 |
| --- | --- | --- |
${openTable()}

## 功能利用率${live ? '(实时)' : '(手工快照)'}

| 域 | 信号 | 数字 | 判定 | 决策暗示 |
| --- | --- | --- | --- | --- |
${featureTable()}

## 建议动作(人工层 —— 复跑数字后需据实复核)

1. **加码：** FINC.PURCHASE.6.a closure（proposed 积压是最高摩擦)· KNOW.VAULT.0 用几天验证日用。
2. **维持：** Music 推荐环 · Home 认亲 / refine（launchd 已激活)。
3. **冻结 / 勿扩：** Portal 硬凑本地优先卡 · INTG.EVENTS.2 无消费者智能 · Home 多项目云同步。
4. **补信号：** AIOS / Knowledge / Health 的最小本机用量探针（可选，下月）。

_验收:审计要产生决策而非仪表盘。数字实时化后,每月复跑即可据实调 hub ROI。_
${errors.length ? `\n> ⚠️ 部分查询失败(表回退占位):\n${errors.map((e) => `> - ${e}`).join('\n')}\n` : ''}
## SQL（可复跑 / \`--apply\` 会执行并回填上表）

\`\`\`sql
${QUERIES.last_opened}

${QUERIES.music}

${QUERIES.home}

${QUERIES.finance_life}
\`\`\`
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, body)
console.log(`wrote ${outPath}${live ? ' (live)' : ''}`)
if (errors.length) console.log(`query errors: ${errors.length}\n  ${errors.join('\n  ')}`)
if (!APPLY) console.log('tip: node scripts/lifeos-usage-audit.mjs --apply  # 钥匙串 Supabase CLI 凭证')
