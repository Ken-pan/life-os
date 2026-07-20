# Life OS 用量审计 2026-07

> **Ticket：** PLAT.USAGE.0 / **0c** · 透镜 [`../roadmap/USAGE_AUDIT.md`](../roadmap/USAGE_AUDIT.md)
> **生成：** 2026-07-18T17:44:58.533Z · `--apply` · 数据源:本次 `--apply` 远程复跑(2026-07-18T17:44Z) + 本机探针

## 判定口径

- **日用** — 7d 内有痕迹
- **偶发** — 30d 有痕迹 / 打开 ≤30d
- **冷 / 死** — 30d+ 零痕迹 → 候选冻结或删入口
- **未知** — 云表无信号；本机探针尽量填盲区（Knowledge / Health）

## 跨站打开（`last_opened_at`）

| App | 最近打开 | 判定 |
| --- | --- | --- |
| music | 2026-07-18 | 日用 |
| fitness | 2026-07-18 | 日用 |
| planner | 2026-07-18 | 日用 |
| home | 2026-07-18 | 日用 |
| finance | 2026-07-18 | 日用 |
| portal | 2026-07-13 | 偶发（~5d） |
| aios / knowledge / health | — | 未知（云表无）；见本机探针 |

## 功能利用率(实时)

| 域 | 信号 | 数字 | 判定 | 决策暗示 |
| --- | --- | --- | --- | --- |
| Music | `play_events` / `recommendation_events` | 27 plays 7d · 243 plays 30d / 404 rec | **日用** | 推荐环在转;维护 PIPE 即可 |
| Home | scans / embeddings / pending recog | 32 7d · 32 30d · 560 emb · 21 pending | **日用** | 认亲主航道;pending 靠横幅消化 |
| Finance 审核 | proposed/confirmed/rejected · decisions 30d | 93 / 178 / 2 · 180 | **日用** | 队列在消化 |
| Fitness↔Planner | `fitness.workout_logged` | 10 / 30d | 偶发→日用边缘 | 事件链有效;勿扩无消费者事件 |
| Finance bills | `finance.bill_due` | 10 / 30d | 偶发 | 管道健康 |
| life_events(总) | outbox 30d | 20 / 30d | — | 跨 OS 消费活跃度底数 |
| AIOS | 对话 / 记忆(云端 aios schema) | 12 conv 7d · 12 30d · 19 mem | **日用** | 云同步在用;推理内核方向可投 |
| Knowledge | Vault `.md` mtime | 130 / 7d · 141 / 30d · 456 total | **日用** | 本机探针;VAULT.0 rebuild 后验 watcher |
| Health | Focus events/sessions | ev 138/138 · sess 0/0 | **日用** | Focus 代理在转;HLT-5 仍待真机 |

## 本机探针（PLAT.USAGE.0c · 始终跑）

| 域 | 路径 / 信号 | 数字 | 判定 |
| --- | --- | --- | --- |
| Knowledge Vault | `/Users/kenpan/「Projects」/Vault` · `.md` mtime | 456 篇 · 7d 130 · 30d 141 | **日用** |
| KnowledgeOS.app | `/Applications/KnowledgeOS.app` | 已装 | — |
| Health Focus | `events.jsonl` | 138 行 · 7d 138 · 30d 138 | **日用** |
| Health Focus | `sessions.jsonl` | 35 行 · 7d 0 | 冷/死 |
| Health agent | `agent.log` mtime | 日用 | Focus 代理活跃度 |
| HealthOS.app | `/Applications/HealthOS.app` | 已装 | HLT-5 前壳可用 |

**决策暗示（本机）：**
- Knowledge：**日用真源在转——值得做 VAULT.0 rebuild 验收，勿抢先 Vault 上云**。
- Health：**Focus 代理日用——HLT-5 companion 是下一 gate，勿扩 Portal/云明细**。

## 建议动作(人工层 —— 复跑数字后需据实复核)

1. **已收割：** FINC.PURCHASE.6.a closure · MCP 舰队 · 终局 Done when 文档。
2. **你回来后（Ken）：** AIOS 三问 + Portal 角标；SCHED/CAPTURE/HLT-5；KnowledgeOS VAULT.0 rebuild 验收（见 [`know-vault-0-acceptance.md`](./know-vault-0-acceptance.md)）。
3. **维持：** Music 推荐环 · Home 认亲 · Knowledge 日写 · Health Focus 代理。
4. **冻结 / 勿扩：** Portal 硬凑本地优先卡 · INTG.EVENTS.2 · Home 多项目云同步 · Vault 抢先上云。
5. **本机盲区已填（0c）：** Knowledge Vault mtime · Health Focus jsonl —— 不再标「完全未知」。

_验收:审计要产生决策而非仪表盘。数字实时化后,每月复跑即可据实调 hub ROI。_

## SQL（可复跑 / `--apply` 会执行并回填上表）

```sql
select app_id, max(last_opened_at) as last_opened_at
from public.core_user_app_settings
where last_opened_at is not null
group by app_id
order by last_opened_at desc;

select
  (select count(*) from music.play_events where created_at > now() - interval '7 days') as plays_7d,
  (select count(*) from music.play_events where created_at > now() - interval '30 days') as plays_30d,
  (select count(*) from music.recommendation_events where created_at > now() - interval '30 days') as rec_30d;

select
  (select count(*) from home.scans where to_timestamp(updated_at/1000.0) > now() - interval '7 days') as scans_7d,
  (select count(*) from home.scans where to_timestamp(updated_at/1000.0) > now() - interval '30 days') as scans_30d,
  (select count(*) from home.object_embeddings) as embeddings,
  (select count(*) from home.object_observations where (match->>'state') = 'possibly_same') as pending_recog,
  (select count(*) from home.events where to_timestamp(ts/1000.0) > now() - interval '30 days') as events_30d;

select
  (select count(*) from aios.conversations where deleted is not true
     and to_timestamp(updated_at/1000.0) > now() - interval '7 days') as conv_7d,
  (select count(*) from aios.conversations where deleted is not true
     and to_timestamp(updated_at/1000.0) > now() - interval '30 days') as conv_30d,
  (select count(*) from aios.memories where deleted is not true) as memories;

select
  (select count(*) from public.purchase_associations where state = 'proposed') as proposed,
  (select count(*) from public.purchase_associations where state = 'confirmed') as confirmed,
  (select count(*) from public.purchase_associations where state = 'rejected') as rejected,
  (select count(*) from public.purchase_decisions where created_at > now() - interval '30 days') as decisions_30d,
  (select count(*) from public.life_events where created_at > now() - interval '30 days') as life_events_30d,
  (select count(*) from public.life_events where type = 'fitness.workout_logged' and created_at > now() - interval '30 days') as workout_30d,
  (select count(*) from public.life_events where type = 'finance.bill_due' and created_at > now() - interval '30 days') as bill_30d;
```
