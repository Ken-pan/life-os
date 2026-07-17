# Life OS 用量审计 2026-07

> **Ticket：** PLAT.USAGE.0 · 透镜 [`../roadmap/USAGE_AUDIT.md`](../roadmap/USAGE_AUDIT.md)
> **生成：** 2026-07-17T23:38:32.995Z · `--apply` · 数据源:本次 `--apply` 远程复跑(2026-07-17T23:38Z)

## 判定口径

- **日用** — 7d 内有痕迹
- **偶发** — 30d 有痕迹 / 打开 ≤30d
- **冷 / 死** — 30d+ 零痕迹 → 候选冻结或删入口
- **未知** — 本地优先 app（AIOS / Knowledge / Health）需本机另查

## 跨站打开（`last_opened_at`）

| App | 最近打开 | 判定 |
| --- | --- | --- |
| home | 2026-07-17 | 日用 |
| planner | 2026-07-17 | 日用 |
| finance | 2026-07-17 | 日用 |
| fitness | 2026-07-17 | 日用 |
| music | 2026-07-17 | 日用 |
| portal | 2026-07-13 | 偶发（~4d） |
| aios / knowledge / health | — | 未知（本地优先，未进表或未部署） |

## 功能利用率(实时)

| 域 | 信号 | 数字 | 判定 | 决策暗示 |
| --- | --- | --- | --- | --- |
| Music | `play_events` / `recommendation_events` | 26 plays 7d · 242 plays 30d / 404 rec | **日用** | 推荐环在转;维护 PIPE 即可 |
| Home | scans / embeddings / pending recog | 30 7d · 30 30d · 546 emb · 21 pending | **日用** | 认亲主航道;pending 靠横幅消化 |
| Finance 审核 | proposed/confirmed/rejected · decisions 30d | 267 / 4 / 2 · 6 | **日用缺口** | **closure 必须收割**——积压大、决策少 |
| Fitness↔Planner | `fitness.workout_logged` | 9 / 30d | 偶发→日用边缘 | 事件链有效;勿扩无消费者事件 |
| Finance bills | `finance.bill_due` | 10 / 30d | 偶发 | 管道健康 |
| life_events(总) | outbox 30d | 19 / 30d | — | 跨 OS 消费活跃度底数 |
| Knowledge / AIOS / Health | 本地优先 | — | 未知 | 本机另查;VAULT.0 用几天后再审计 |

## 建议动作(人工层 —— 复跑数字后需据实复核)

1. **加码：** FINC.PURCHASE.6.a closure（proposed 积压是最高摩擦)· KNOW.VAULT.0 用几天验证日用。
2. **维持：** Music 推荐环 · Home 认亲 / refine（launchd 已激活)。
3. **冻结 / 勿扩：** Portal 硬凑本地优先卡 · INTG.EVENTS.2 无消费者智能 · Home 多项目云同步。
4. **补信号：** AIOS / Knowledge / Health 的最小本机用量探针（可选，下月）。

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
