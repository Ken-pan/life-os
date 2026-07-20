#!/usr/bin/env node
/**
 * PLAT.USAGE.0 / 0c — 第一方用量 / 功能利用率盘点（决策复利）。
 *
 * 默认 dry-run：写 docs/qa/usage-audit-YYYY-MM.md 骨架(表用上一版手工快照占位)。
 * `--apply`：经 ./scripts/supabase-sql.sh 跑真查询,**把两张表从实时 JSON 渲染出来**。
 * 本机探针（Knowledge Vault · HealthOS Focus）**始终跑**（PLAT.USAGE.0c），不依赖云。
 *
 * Usage:
 *   node scripts/lifeos-usage-audit.mjs
 *   node scripts/lifeos-usage-audit.mjs --apply
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath(不是 .pathname):.pathname 对非 ASCII 目录(仓库路径含「」)会留 %E3%80%8C
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APPLY = process.argv.includes('--apply')
const now = new Date()
const nowMs = now.getTime()
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
  aios: `
select
  (select count(*) from aios.conversations where deleted is not true
     and to_timestamp(updated_at/1000.0) > now() - interval '7 days') as conv_7d,
  (select count(*) from aios.conversations where deleted is not true
     and to_timestamp(updated_at/1000.0) > now() - interval '30 days') as conv_30d,
  (select count(*) from aios.memories where deleted is not true) as memories;
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

// ── PLAT.USAGE.0c：本机探针（始终跑）──────────────────────────────────────
function walkMd(dir, out = []) {
  if (!existsSync(dir)) return out
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === '.obsidian') continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walkMd(p, out)
    else if (ent.isFile() && /\.md$/i.test(ent.name)) out.push(p)
  }
  return out
}

function countMtime(paths, days) {
  const cutoff = nowMs - days * 86_400_000
  let n = 0
  for (const p of paths) {
    try {
      if (statSync(p).mtimeMs >= cutoff) n += 1
    } catch {
      /* ignore */
    }
  }
  return n
}

function parseJsonlTsCounts(filePath) {
  if (!existsSync(filePath)) return { lines: 0, n7: 0, n30: 0, mtime: null }
  const st = statSync(filePath)
  let n7 = 0
  let n30 = 0
  let lines = 0
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    lines += 1
    let o
    try {
      o = JSON.parse(s)
    } catch {
      continue
    }
    let ts = o.ts ?? o.time ?? o.at ?? o.started_at
    if (typeof ts !== 'number') continue
    if (ts > 1e12) ts /= 1000
    const d = (nowMs / 1000 - ts) / 86400
    if (d <= 7) n7 += 1
    if (d <= 30) n30 += 1
  }
  return { lines, n7, n30, mtime: st.mtimeMs }
}

function probeLocal() {
  const vaultRoot = join(homedir(), '「Projects」', 'Vault')
  const mdPaths = walkMd(vaultRoot)
  const knowledge = {
    root: vaultRoot,
    exists: existsSync(vaultRoot),
    md_total: mdPaths.length,
    md_7d: countMtime(mdPaths, 7),
    md_30d: countMtime(mdPaths, 30),
    app: existsSync('/Applications/KnowledgeOS.app'),
  }

  const healthDir = join(homedir(), 'Library', 'Application Support', 'HealthOS')
  const events = parseJsonlTsCounts(join(healthDir, 'events.jsonl'))
  const sessions = parseJsonlTsCounts(join(healthDir, 'sessions.jsonl'))
  const agentLog = join(healthDir, 'agent.log')
  const health = {
    dir: healthDir,
    exists: existsSync(healthDir),
    events,
    sessions,
    agent_log_mtime: existsSync(agentLog) ? statSync(agentLog).mtimeMs : null,
    app: existsSync('/Applications/HealthOS.app'),
  }

  return { knowledge, health }
}

const local = probeLocal()

// ── 判定口径 ───────────────────────────────────────────────────────────────
const daysSince = (iso) => (iso ? Math.floor((now - new Date(iso)) / 86_400_000) : null)
const openVerdict = (d) => (d == null ? '未知' : d <= 3 ? '日用' : d <= 30 ? `偶发（~${d}d）` : `冷（${d}d+）`)
const useVerdict = (n7, n30) => (n7 > 0 ? '日用' : n30 > 0 ? '偶发' : '冷/死')
const LOCAL_FIRST = ['aios', 'knowledge', 'health']

function mtimeVerdict(mtimeMs) {
  if (mtimeMs == null) return '未知'
  const d = Math.floor((nowMs - mtimeMs) / 86_400_000)
  return openVerdict(d)
}

// ── 表 1:跨站打开 ───────────────────────────────────────────────────────────
const HARDCODED_OPEN = `| finance | 2026-07-17 | 日用 |
| home | 2026-07-17 | 日用 |
| fitness | 2026-07-17 | 日用 |
| planner | 2026-07-17 | 日用 |
| music | 2026-07-17 | 日用 |
| portal | 2026-07-13 | 偶发（~4d） |
| aios / knowledge / health | — | 见下方本机探针 |`

function openTable() {
  if (!live) return HARDCODED_OPEN
  const seen = new Set(data.last_opened.map((r) => r.app_id))
  const lines = data.last_opened.map((r) => {
    const d = daysSince(r.last_opened_at)
    return `| ${r.app_id} | ${(r.last_opened_at || '').slice(0, 10) || '—'} | ${openVerdict(d)} |`
  })
  const missing = LOCAL_FIRST.filter((a) => !seen.has(a))
  if (missing.length) lines.push(`| ${missing.join(' / ')} | — | 未知（云表无）；见本机探针 |`)
  return lines.join('\n')
}

// ── 表 2:功能利用率 ─────────────────────────────────────────────────────────
const HARDCODED_FEATURE = `| Music | \`play_events\` / \`recommendation_events\` | 29 plays · 242 plays / 404 rec | **日用** | 推荐环在转；维护 PIPE 即可 |
| Home | scans / embeddings / pending recog | 29 scans · 535 emb · 21 pending | **日用** | 认亲主航道值得护；pending 靠横幅消化 |
| Finance 审核 | associations proposed/confirmed/rejected | 267 / 4 / 2 · 6 decisions/30d | **日用缺口** | **6.a closure 必须收割**——队列大、确认少 |
| Fitness↔Planner | \`fitness.workout_logged\` | 9 / 30d | 偶发→日用边缘 | 事件链有效；勿再扩无消费者事件 |
| Finance bills | \`finance.bill_due\` | 10 / 30d | 偶发 | 管道健康 |
| Portal | last_opened | ~4d 前 | 偶发 | 不为凑卡扩本地优先入口 |
| Knowledge | Vault \`.md\` mtime | 本机探针 | — | 见 §本机探针 |
| AIOS / Health | 本地 | — | — | 见 §本机探针 / 云 aios |`

function featureTable() {
  if (!live) return HARDCODED_FEATURE
  const m = data.music?.[0] || {}
  const h = data.home?.[0] || {}
  const f = data.finance_life?.[0] || {}
  const a = data.aios?.[0] || {}
  const financeGap = Number(f.proposed) > 50 && Number(f.decisions_30d) < 20
  const k = local.knowledge
  const he = local.health
  return [
    `| Music | \`play_events\` / \`recommendation_events\` | ${m.plays_7d} plays 7d · ${m.plays_30d} plays 30d / ${m.rec_30d} rec | **${useVerdict(m.plays_7d, m.plays_30d)}** | 推荐环在转;维护 PIPE 即可 |`,
    `| Home | scans / embeddings / pending recog | ${h.scans_7d} 7d · ${h.scans_30d} 30d · ${h.embeddings} emb · ${h.pending_recog} pending | **${useVerdict(h.scans_7d, h.scans_30d)}** | 认亲主航道;pending 靠横幅消化 |`,
    `| Finance 审核 | proposed/confirmed/rejected · decisions 30d | ${f.proposed} / ${f.confirmed} / ${f.rejected} · ${f.decisions_30d} | **${financeGap ? '日用缺口' : '日用'}** | ${financeGap ? '**closure 必须收割**——积压大、决策少' : '队列在消化'} |`,
    `| Fitness↔Planner | \`fitness.workout_logged\` | ${f.workout_30d} / 30d | ${Number(f.workout_30d) >= 8 ? '偶发→日用边缘' : '偶发'} | 事件链有效;勿扩无消费者事件 |`,
    `| Finance bills | \`finance.bill_due\` | ${f.bill_30d} / 30d | 偶发 | 管道健康 |`,
    `| life_events(总) | outbox 30d | ${f.life_events_30d} / 30d | — | 跨 OS 消费活跃度底数 |`,
    `| AIOS | 对话 / 记忆(云端 aios schema) | ${a.conv_7d} conv 7d · ${a.conv_30d} 30d · ${a.memories} mem | **${useVerdict(a.conv_7d, a.conv_30d)}** | 云同步在用;推理内核方向可投 |`,
    `| Knowledge | Vault \`.md\` mtime | ${k.md_7d} / 7d · ${k.md_30d} / 30d · ${k.md_total} total | **${useVerdict(k.md_7d, k.md_30d)}** | 本机探针;VAULT.0 rebuild 后验 watcher |`,
    `| Health | Focus events/sessions | ev ${he.events.n7}/${he.events.n30} · sess ${he.sessions.n7}/${he.sessions.n30} | **${useVerdict(he.events.n7 || he.sessions.n7, he.events.n30 || he.sessions.n30)}** | Focus 代理在转;HLT-5 仍待真机 |`,
  ].join('\n')
}

function localProbeSection() {
  const k = local.knowledge
  const h = local.health
  const agentAge = h.agent_log_mtime != null ? mtimeVerdict(h.agent_log_mtime) : '无'
  const kHint =
    k.md_7d > 0
      ? '日用真源在转——值得做 VAULT.0 rebuild 验收，勿抢先 Vault 上云'
      : '近 7d 无 .md 改动——先确认日写习惯再堆编辑器'
  const hHint =
    h.events.n7 || h.sessions.n7
      ? 'Focus 代理日用——HLT-5 companion 是下一 gate，勿扩 Portal/云明细'
      : 'Focus 无近期事件——先确认代理在跑'
  return `## 本机探针（PLAT.USAGE.0c · 始终跑）

| 域 | 路径 / 信号 | 数字 | 判定 |
| --- | --- | --- | --- |
| Knowledge Vault | \`${k.root}\` · \`.md\` mtime | ${k.exists ? `${k.md_total} 篇 · 7d ${k.md_7d} · 30d ${k.md_30d}` : '目录不存在'} | **${k.exists ? useVerdict(k.md_7d, k.md_30d) : '未知'}** |
| KnowledgeOS.app | \`/Applications/KnowledgeOS.app\` | ${k.app ? '已装' : '未装'} | — |
| Health Focus | \`events.jsonl\` | ${h.exists ? `${h.events.lines} 行 · 7d ${h.events.n7} · 30d ${h.events.n30}` : '无数据目录'} | **${h.exists ? useVerdict(h.events.n7, h.events.n30) : '未知'}** |
| Health Focus | \`sessions.jsonl\` | ${h.exists ? `${h.sessions.lines} 行 · 7d ${h.sessions.n7}` : '—'} | ${h.exists ? useVerdict(h.sessions.n7, h.sessions.n30) : '—'} |
| Health agent | \`agent.log\` mtime | ${agentAge} | Focus 代理活跃度 |
| HealthOS.app | \`/Applications/HealthOS.app\` | ${h.app ? '已装' : '未装'} | HLT-5 前壳可用 |

**决策暗示（本机）：**
- Knowledge：**${kHint}**。
- Health：**${hHint}**。`
}

const stamp = live
  ? `本次 \`--apply\` 远程复跑(${now.toISOString().slice(0, 16)}Z) + 本机探针`
  : `未跑远程查询;云表为占位 + 本机探针已跑`

const body = `# Life OS 用量审计 ${ym}

> **Ticket：** PLAT.USAGE.0 / **0c** · 透镜 [\`../roadmap/USAGE_AUDIT.md\`](../roadmap/USAGE_AUDIT.md)
> **生成：** ${now.toISOString()} · \`${APPLY ? '--apply' : 'skeleton'}\` · 数据源:${stamp}

## 判定口径

- **日用** — 7d 内有痕迹
- **偶发** — 30d 有痕迹 / 打开 ≤30d
- **冷 / 死** — 30d+ 零痕迹 → 候选冻结或删入口
- **未知** — 云表无信号；本机探针尽量填盲区（Knowledge / Health）

## 跨站打开（\`last_opened_at\`）

| App | 最近打开 | 判定 |
| --- | --- | --- |
${openTable()}

## 功能利用率${live ? '(实时)' : '(手工快照 + 本机)'}

| 域 | 信号 | 数字 | 判定 | 决策暗示 |
| --- | --- | --- | --- | --- |
${featureTable()}

${localProbeSection()}

## 建议动作(人工层 —— 复跑数字后需据实复核)

1. **已收割：** FINC.PURCHASE.6.a closure · MCP 舰队 · 终局 Done when 文档。
2. **你回来后（Ken）：** AIOS 三问 + Portal 角标；SCHED/CAPTURE/HLT-5；KnowledgeOS VAULT.0 rebuild 验收（见 [\`know-vault-0-acceptance.md\`](./know-vault-0-acceptance.md)）。
3. **维持：** Music 推荐环 · Home 认亲 · Knowledge 日写 · Health Focus 代理。
4. **冻结 / 勿扩：** Portal 硬凑本地优先卡 · INTG.EVENTS.2 · Home 多项目云同步 · Vault 抢先上云。
5. **本机盲区已填（0c）：** Knowledge Vault mtime · Health Focus jsonl —— 不再标「完全未知」。

_验收:审计要产生决策而非仪表盘。数字实时化后,每月复跑即可据实调 hub ROI。_
${errors.length ? `\n> ⚠️ 部分查询失败(表回退占位):\n${errors.map((e) => `> - ${e}`).join('\n')}\n` : ''}
## SQL（可复跑 / \`--apply\` 会执行并回填上表）

\`\`\`sql
${QUERIES.last_opened}

${QUERIES.music}

${QUERIES.home}

${QUERIES.aios}

${QUERIES.finance_life}
\`\`\`
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, body)
console.log(
  `wrote ${outPath}${live ? ' (live)' : ''} · local knowledge md7d=${local.knowledge.md_7d} health ev7d=${local.health.events.n7}`,
)
if (errors.length) console.log(`query errors: ${errors.length}\n  ${errors.join('\n  ')}`)
if (!APPLY) console.log('tip: node scripts/lifeos-usage-audit.mjs --apply  # 钥匙串 Supabase CLI 凭证')
