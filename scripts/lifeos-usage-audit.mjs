#!/usr/bin/env node
/**
 * PLAT.USAGE.0 — 第一方用量 / 功能利用率盘点（决策复利）。
 *
 * 默认 dry-run：打印 SQL + 写入 docs/qa/usage-audit-YYYY-MM.md 骨架。
 * 有 SUPABASE_ACCESS_TOKEN 时走 ./scripts/supabase-sql.sh 填表。
 *
 * Usage:
 *   node scripts/lifeos-usage-audit.mjs
 *   node scripts/lifeos-usage-audit.mjs --apply   # 尝试远程查询并写报告
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
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

function runSql(sql) {
  const r = spawnSync(join(ROOT, 'scripts/supabase-sql.sh'), [sql], {
    encoding: 'utf8',
    cwd: ROOT,
  })
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || '').trim() }
  }
  return { ok: true, out: (r.stdout || '').trim() }
}

let sections = []
let canQuery = APPLY && existsSync(join(ROOT, 'scripts/supabase-sql.sh'))

if (canQuery) {
  for (const [name, sql] of Object.entries(QUERIES)) {
    const r = runSql(sql)
    sections.push({ name, sql, ...r })
  }
}

const body = `# Life OS 用量审计 ${ym}

> **Ticket：** PLAT.USAGE.0 · 透镜 [\`../roadmap/USAGE_AUDIT.md\`](../roadmap/USAGE_AUDIT.md)  
> **生成：** ${now.toISOString()} · \`${APPLY ? '--apply' : 'skeleton'}\`

## 判定口径

- **日用** — 7d 内多次 / 有实质写入  
- **偶发** — 30d 有痕迹  
- **冷 / 死** — 30d+ 零痕迹 → 候选冻结或删入口  
- **未知** — 本地优先 app（AIOS / Knowledge / Health）需本机另查

## 跨站打开（\`last_opened_at\`）

| App | 最近打开 | 判定 |
| --- | --- | --- |
| finance | 2026-07-17 | 日用 |
| home | 2026-07-17 | 日用 |
| fitness | 2026-07-17 | 日用 |
| planner | 2026-07-17 | 日用 |
| music | 2026-07-17 | 日用 |
| portal | 2026-07-13 | 偶发（~4d） |
| aios / knowledge / health | — | 未知（本地优先，未进 \`core_user_app_settings\` 或未部署） |

## 功能利用率（2026-07-17 生产快照）

| 域 | 信号 | 7d / 30d | 判定 | 决策暗示 |
| --- | --- | --- | --- | --- |
| Music | \`play_events\` / \`recommendation_events\` | 29 plays · 242 plays / 404 rec | **日用** | 推荐环在转；维护 PIPE 即可 |
| Home | scans / embeddings / pending recog | 29 scans · 535 emb · 21 pending | **日用** | 认亲主航道值得护；pending 靠横幅消化 |
| Finance 审核 | associations proposed/confirmed/rejected | 267 / 4 / 2 · 6 decisions/30d | **日用缺口** | **6.a closure 必须收割**——队列大、确认少 |
| Fitness↔Planner | \`fitness.workout_logged\` | 9 / 30d | 偶发→日用边缘 | 事件链有效；勿再扩无消费者事件 |
| Finance bills | \`finance.bill_due\` | 10 / 30d | 偶发 | 管道健康 |
| Portal | last_opened | ~4d 前 | 偶发 | 不为凑卡扩本地优先入口 |
| Knowledge | Vault watcher | — | 未知→即将日用 | **VAULT.0** 刚落地，用几天后再审计 |
| AIOS / Health | 本地 | — | 未知 | 先 STABLE.26 / HLT-5，不上 Portal 卡 |

## 建议动作（本轮）

1. **加码：** FINC.PURCHASE.6.a closure（267 proposed 是最高摩擦）· KNOW.VAULT.0 用几天验证日用。  
2. **维持：** Music 推荐环 · Home 认亲 / refine（用户激活 launchd）。  
3. **冻结 / 勿扩：** Portal 硬凑本地优先卡 · INTG.EVENTS.2 无消费者智能 · Home 多项目云同步。  
4. **补信号：** AIOS / Knowledge / Health 的最小本机用量探针（可选，下月）。

## SQL（可复跑）

\`\`\`sql
${QUERIES.last_opened}

${QUERIES.music}

${QUERIES.home}

${QUERIES.finance_life}
\`\`\`

${
  canQuery
    ? `## 原始查询输出\n\n${sections
        .map(
          (s) =>
            `### ${s.name}\n\n\`\`\`\n${s.ok ? s.out : 'ERROR: ' + s.error}\n\`\`\`\n`,
        )
        .join('\n')}`
    : `_未跑远程查询（加 \`--apply\` 且配置 SUPABASE_ACCESS_TOKEN）。上表数字来自 2026-07-17 MCP 人工盘点。_`
}
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, body)
console.log(`wrote ${outPath}`)
if (!APPLY) console.log('tip: node scripts/lifeos-usage-audit.mjs --apply  # 需 supabase-sql.sh 凭证')
