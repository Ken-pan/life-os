# Life OS 用量审计 2026-07

> **Ticket：** PLAT.USAGE.0 · 透镜 [`../roadmap/USAGE_AUDIT.md`](../roadmap/USAGE_AUDIT.md)
> **生成：** 2026-07-18T01:04:21.672Z · `--apply` · 数据源:本次 `--apply` 远程复跑(2026-07-18T01:04Z)

## 判定口径

- **日用** — 7d 内有痕迹
- **偶发** — 30d 有痕迹 / 打开 ≤30d
- **冷 / 死** — 30d+ 零痕迹 → 候选冻结或删入口
- **未知** — 本地优先 app（AIOS / Knowledge / Health）需本机另查

## 跨站打开（`last_opened_at`）

| App | 最近打开 | 判定 |
| --- | --- | --- |
| planner | 2026-07-18 | 日用 |
| home | 2026-07-18 | 日用 |
| finance | 2026-07-18 | 日用 |
| fitness | 2026-07-17 | 日用 |
| music | 2026-07-17 | 日用 |
| portal | 2026-07-13 | 偶发（~4d） |
| aios / knowledge / health | — | 未知（本地优先，未进表或未部署） |

## 功能利用率(实时)

| 域 | 信号 | 数字 | 判定 | 决策暗示 |
| --- | --- | --- | --- | --- |
| Music | `play_events` / `recommendation_events` | 26 plays 7d · 242 plays 30d / 404 rec | **日用** | 推荐环在转;维护 PIPE 即可 |
| Home | scans / embeddings / pending recog | 30 7d · 30 30d · 546 emb · 21 pending | **日用** | 认亲主航道;pending 靠横幅消化 |
| Finance 审核 | proposed/confirmed/rejected · decisions 30d | 93 / 178 / 2 · 180 | **日用** | 队列在消化 |
| Fitness↔Planner | `fitness.workout_logged` | 9 / 30d | 偶发→日用边缘 | 事件链有效;勿扩无消费者事件 |
| Finance bills | `finance.bill_due` | 10 / 30d | 偶发 | 管道健康 |
| life_events(总) | outbox 30d | 19 / 30d | — | 跨 OS 消费活跃度底数 |
| AIOS | 对话 / 记忆(云端 aios schema) | 12 conv 7d · 12 30d · 19 mem | **日用** | 云同步在用;推理内核方向可投 |
| Knowledge / Health | 本地优先 | — | 未知 | 本机另查;VAULT.0 用几天后再审计 |

## 建议动作(人工层 —— 复跑数字后需据实复核)

1. **已收割：** FINC.PURCHASE.6.a closure ✅——干净关联批量确认(proposed 267→93、decisions→180),
   队列从"日用缺口"回落到"日用·在消化";采购评审已给足证据(明细+金额对比)。剩 owner 真机 QA。
2. **加码：** KNOW.VAULT.0 用几天验证日用(下次审计看 Vault watcher 是否日用)。当前**无紧急加码**——
   所有日用 app 健康,是**防表面积爆炸**的好时机,别硬塞新面。
3. **维持：** Music 推荐环 · Home 认亲 / refine(launchd 已激活)。
4. **冻结 / 勿扩：** Portal 硬凑本地优先卡 · INTG.EVENTS.2 无消费者智能 · Home 多项目云同步。
5. **补信号(可选):** AIOS(云端 aios schema 可直查)/ Health(本机)的最小用量探针,填 "未知" 盲区。

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
  (select count(*) from public.purchase_associations where state = 'proposed') as proposed,
  (select count(*) from public.purchase_associations where state = 'confirmed') as confirmed,
  (select count(*) from public.purchase_associations where state = 'rejected') as rejected,
  (select count(*) from public.purchase_decisions where created_at > now() - interval '30 days') as decisions_30d,
  (select count(*) from public.life_events where created_at > now() - interval '30 days') as life_events_30d,
  (select count(*) from public.life_events where type = 'fitness.workout_logged' and created_at > now() - interval '30 days') as workout_30d,
  (select count(*) from public.life_events where type = 'finance.bill_due' and created_at > now() - interval '30 days') as bill_30d;
```
