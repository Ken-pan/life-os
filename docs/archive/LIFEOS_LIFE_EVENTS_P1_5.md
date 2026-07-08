# Life OS Shared Events — I-P1.5 Plan

> **Integration Phase 1.5：** 跨 App 数据互通的 **事件层**（不合并业务表）
> 前置：**I-P0** 身份 + **I-P1** Portal 骨架
> 总路线图：[`LIFEOS_INTEGRATION_ROADMAP.md`](./LIFEOS_INTEGRATION_ROADMAP.md)

---

## 为什么需要 `life_events`

| 反模式                                            | 问题                           |
| ------------------------------------------------- | ------------------------------ |
| Planner 直接 `select * from finance_transactions` | RLS 难审计、耦合、隐私边界模糊 |
| 四 App 共用一个 jsonb 大表                        | 无法按 App 演进 schema         |
| 前端互调 REST                                     | 四部署源、无统一 BFF，运维重   |

**正模式：** 各 App 只 **发布事实**；消费者只读 `life_events` 中 `visibility = 'cross_app'` 的行。

---

## 表设计（草案）

```sql
-- 迁移建议路径：apps/finance/supabase/migrations/YYYYMMDDHHMMSS_life_os_life_events.sql

create table if not exists public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_app text not null check (source_app in ('finance', 'fitness', 'planner', 'music', 'portal')),
  event_type text not null,
  entity_id text,
  entity_type text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  visibility text not null default 'private'
    check (visibility in ('private', 'cross_app', 'ai_only')),
  created_at timestamptz not null default now()
);

create index if not exists life_events_user_occurred_idx
  on public.life_events (user_id, occurred_at desc);

create index if not exists life_events_consumer_idx
  on public.life_events (user_id, visibility, event_type, occurred_at desc);
```

### RLS（必须）

```sql
alter table public.life_events enable row level security;

-- 用户只能看自己的事件
create policy "life_events_select_own"
  on public.life_events for select
  using ((select auth.uid()) = user_id);

-- 用户只能插入自己的事件（source_app 由客户端声明，服务端 trigger 可校验）
create policy "life_events_insert_own"
  on public.life_events for insert
  with check ((select auth.uid()) = user_id);

-- 更新/删除：默认禁止客户端；如需去重用 service role 或 RPC
```

### `event_type` 注册（文档化，非 DB enum）

| source_app | event_type              | 说明                              |
| ---------- | ----------------------- | --------------------------------- |
| finance    | `bill_due`              | 账单到期提醒                      |
| finance    | `subscription_renewal`  | 订阅续费                          |
| fitness    | `workout_completed`     | 训练完成                          |
| music      | `song_liked`            | 收藏曲目                          |
| music      | `focus_session_started` | Focus 播放开始                    |
| planner    | `task_completed`        | 任务完成                          |
| planner    | `task_created`          | 任务创建（可被其他 App 触发写入） |

类型契约后续进入 `@life-os/contracts`（**C-P1+**，与 Integration 不冲突）。

---

## 发布 / 消费约定

### 发布（Producer）

```txt
App 内业务动作完成
  → insert into life_events (user_id, source_app, event_type, payload, visibility)
  → visibility 默认 private；需跨 App 时显式 cross_app
```

**原则：**

- payload 只放 **消费所需最小字段**（日期、金额、标题、id），不放 PII 冗余
- 同一业务事实避免重复：用 `(user_id, source_app, event_type, entity_id)` 去重策略（RPC 或 partial unique index）

### 消费（Consumer）

```txt
Portal / Planner 启动或定时
  → select * from life_events
     where user_id = auth.uid()
       and visibility in ('cross_app', 'ai_only')  -- ai_only 仅 AI 功能
       and occurred_at > now() - interval '7 days'
     order by occurred_at desc
     limit N
```

**Planner 示例：**

```txt
Finance bill_due → Planner 生成 task「Pay Amex」
Fitness workout_completed → Planner 勾选 habit「健身」
```

实现方式：Planner sync 后跑 **event inbox processor**（app 内模块，非 shared package 先行）。

---

## 与 I-P1 Portal 的关系

| Portal 模块         | I-P1.5 升级                                |
| ------------------- | ------------------------------------------ |
| Today Overview stub | 读 `life_events` 最近 24h 摘要             |
| Quick Actions 占位  | Finance `bill_due` → 深链 Planner 带 query |
| System health       | 可选：各 App last event 时间               |

---

## 实施任务分解

| #   | 任务                                                 | 预估 |
| --- | ---------------------------------------------------- | ---- |
| 1   | SQL 迁移 + RLS + advisors 复查                       | 2h   |
| 2   | Finance：账单/订阅到期 → `bill_due` 发布（1 条路径） | 3h   |
| 3   | Planner：inbox processor 消费 `bill_due` → task      | 4h   |
| 4   | Fitness：`workout_completed` 发布                    | 2h   |
| 5   | Portal：Today 摘要读 events                          | 2h   |
| 6   | 文档 + 验收脚本扩展                                  | 1h   |

**合计：** ~1 天（单路径 MVP）

---

## 验收标准

- [ ] Finance 产生一笔 due 事件 → Planner 出现对应任务（同 `auth.uid()`）
- [ ] 用户 A 看不到用户 B 的 `life_events`
- [ ] `visibility = 'private'` 的事件 Portal 不展示
- [ ] 删除 Planner 任务 **不** 级联删除 Finance 原始数据
- [ ] MCP `get_advisors` security 无 life_events RLS 缺失

---

## 明确不做（I-P1.5）

- 双向实时 sync（用现有各 App Dexie/sync 包）
- 全量 event sourcing 重建状态
- AI context 管道（留给 I-P2 `ai_context_snapshots`）

---

## I-P1.5 完成后 → I-P2

见 [`LIFEOS_INTEGRATION_ROADMAP.md`](./LIFEOS_INTEGRATION_ROADMAP.md) §I-P2：多场景消费、Music↔Planner Focus、预算→AI Context 等。
