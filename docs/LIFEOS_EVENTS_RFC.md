# RFC: Life OS 跨应用事件契约（`@life-os/contracts/events`）

> **状态：Draft — 仅供评审，未接入任何 app runtime**
> **日期：** 2026-07-07 · **关联：** [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §I-P1.5
> **现状基线：** 远程 `life_events` 表 + `finance_bill_event_trigger` 已 deploy（migration `20260708000000`）；
> `packages/contracts/src/events.ts` 已有 `FinanceBillDueSchema`（**本 RFC 不修改该文件**）

## 1. 目标与范围

为跨应用事件（producer：DB outbox 触发器；consumer：各 app 客户端）定义**唯一的契约层**，
使 Planner 消费 Finance 账单事件成为第一条验证链路。

本 RFC 只产出：taxonomy、schema 草案、版本策略、兼容性分析、消费示例、风险清单。
**不包含**任何 app 代码接入、DB migration、RLS/RPC 变更。

## 2. Event Taxonomy（命名法）

```
<domain>.<subject>_<state>
   │        │        └─ 过去分词或状态名（due / paid / completed / created）
   │        └─ 业务名词（bill / task / workout / track）
   └─ 产生事件的业务域（finance / planner / fitness / music / core）
```

规则：

1. `domain` 必须等于产生方 app 的 `LIFE_OS_APP_IDS` 成员（或 `core`），消费方**不出现**在 type 里 ——
   事件描述"发生了什么"，不描述"给谁用"。
2. 全小写 + 下划线；`type` 一经发布**永不改名**（改名 = 新事件）。
3. 每个 type 对应且仅对应一个 Zod payload schema。

已注册（现状）与候选（示意，不在本 RFC 实施）：

| type                     | 状态         | producer                                       |
| ------------------------ | ------------ | ---------------------------------------------- |
| `finance.bill_due`       | ✅ 已 deploy | outbox trigger on `finance_expected_occurrences` |
| `finance.bill_paid`      | 💡 候选      | 未来：occurrence 核销时                        |
| `planner.task_completed` | 💡 候选      | 未来：任务完成回写（fitness/music 洞察用）     |
| `fitness.workout_logged` | 💡 候选      | 未来：训练完成                                 |

## 3. Zod Schema 草案

### 3.1 信封（envelope）—— 对齐 DB 行

现有 `FinanceBillDueSchema` 只覆盖 `{ type, payload }`，消费端实际读到的是**整行**。
草案新增行级 envelope（字段与 migration `20260708000000` 一一对应）：

```typescript
// 草案 — 评审通过后进 packages/contracts/src/events.ts
import { z } from 'zod'

export const LifeEventStatusSchema = z.enum(['pending', 'processed', 'failed'])

/** life_events 表行信封；payload 由各 type 的 schema 二次校验 */
export const LifeEventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
  status: LifeEventStatusSchema,
  created_at: z.string(), // timestamptz ISO
  updated_at: z.string(),
})

export type LifeEventEnvelope = z.infer<typeof LifeEventEnvelopeSchema>
```

### 3.2 两段式解析（推荐消费模式）

```typescript
/** 草案：先解析信封，再按 type 分发 payload 校验；未知 type 不报错（向前兼容） */
export function parseLifeEvent(row: unknown):
  | { ok: true; event: LifeEvent; envelope: LifeEventEnvelope }
  | { ok: false; reason: 'bad-envelope' | 'unknown-type' | 'bad-payload' } {
  const env = LifeEventEnvelopeSchema.safeParse(row)
  if (!env.success) return { ok: false, reason: 'bad-envelope' }
  const parsed = LifeEventSchema.safeParse({
    type: env.data.type,
    payload: env.data.payload,
  })
  if (!parsed.success) {
    const known = LifeEventSchema.options.some(
      (o) => o.shape.type.value === env.data.type,
    )
    return { ok: false, reason: known ? 'bad-payload' : 'unknown-type' }
  }
  return { ok: true, event: parsed.data, envelope: env.data }
}
```

要点：**未知 type 是正常情况**（老客户端遇到新事件），消费端必须跳过而非报错/标 failed。

### 3.3 `finance.bill_due` 与 outbox 的字段核对

| trigger `jsonb_build_object` | Zod 草案                        | 备注                                        |
| ---------------------------- | ------------------------------- | ------------------------------------------- |
| `occurrence_id` (uuid)       | `z.string()`                    | ✅                                          |
| `label` (text)               | `z.string()`                    | ✅                                          |
| `expected_amount` (numeric)  | `z.number()`                    | ⚠️ PostgREST 对超精度 numeric 可能返回字符串；建议草案改 `z.coerce.number()` |
| `occurrence_date` (date)     | `z.string()` `YYYY-MM-DD`       | ✅ 建议加 `.regex(/^\d{4}-\d{2}-\d{2}$/)`   |

## 4. 版本策略（Versioning）

1. **Additive-only**：已发布 type 的 payload 只允许**新增 optional 字段**；Zod 侧同步加 `.optional()`。
2. **破坏性变更 = 新 type**：字段改名/删除/语义变化 → 发布 `finance.bill_due_v2`（旧 type 继续由旧 trigger 产出直至消费端全部迁移，然后下线 trigger，表中历史行保留）。
3. **不引入 envelope 级 `schema_version` 字段**：DB 列已冻结（不碰 schema 是硬约束），版本信息编码在 type 名里，成本最低。
4. **契约测试**：`scripts/test-outbox-trigger.sh --smoke` 现在只断言事件行存在；建议追加一步——将插入产生的 `payload` 用 `FinanceBillDueSchema` 校验（Node 一行脚本），把"trigger SQL ↔ Zod"的漂移挡在 CI。

## 5. Outbox 兼容性

- 现有 trigger（`trg_finance_bill_to_event`）产出的 payload 与 3.3 核对一致，**无需改动 SQL**。
- trigger 仅 `AFTER INSERT`，状态机（`pending → processed/failed`）由消费端驱动，RLS 已允许 owner update。✅
- ⚠️ **重复事件**：若 Finance 端存在"重算预期账单 = 删除重插 occurrences"的路径，每次重插都会再产出一条
  `finance.bill_due`。消费端**必须以 `payload.occurrence_id` 幂等**（见 §6），不能以事件 `id` 幂等。

## 6. 消费示例：Finance 账单 → Planner 任务（示意代码，不实施）

```javascript
// Planner 侧（未来 PR）：登录后 / 前台恢复时拉取
import { parseLifeEvent } from '@life-os/contracts/events'

async function consumeFinanceBillEvents(supabase) {
  const { data: rows } = await supabase
    .from('life_events')
    .select('*')
    .eq('status', 'pending')
    .eq('type', 'finance.bill_due')
    .order('created_at', { ascending: true })
    .limit(50)

  for (const row of rows ?? []) {
    const result = parseLifeEvent(row)
    if (!result.ok) {
      // unknown-type：跳过留给新版本；bad-payload：标 failed 供排查
      if (result.reason === 'bad-payload') await markStatus(supabase, row.id, 'failed')
      continue
    }
    const { payload } = result.event
    // 幂等键 = occurrence_id：任务已存在则只标 processed
    await upsertPlannerTaskFromBill(payload) // dueDate = occurrence_date, title = label
    await markStatus(supabase, row.id, 'processed')
  }
}
```

失败语义：`upsert` 失败 → 保持 `pending` 下次重试；解析失败 → `failed`（人工介入）。

## 7. Non-goals

- ❌ 不做 realtime 订阅 / 推送（首版轮询：登录 + 前台恢复触发，与现有 sync 时机一致）
- ❌ 不做跨用户事件、不做 fan-out 多消费者 ack（单用户单消费即可，`status` 列已够用）
- ❌ 不做服务端 worker / Edge Function（客户端消费优先，保持零服务端组件）
- ❌ 不改 `life_events` 表结构 / RLS / trigger SQL
- ❌ 不在本 RFC 内实现任何 app 消费代码
- ❌ 不引入事件重放 / 溯源（event sourcing）语义——`life_events` 是通知信道，不是数据真源

## 8. 迁移与运行风险

| 风险                                        | 等级 | 缓解                                                            |
| ------------------------------------------- | ---- | --------------------------------------------------------------- |
| occurrences 重算导致重复事件                | 高   | 消费端以 `occurrence_id` 幂等（§6）；不可依赖事件行 `id`        |
| trigger SQL 与 Zod 漂移                     | 中   | §4.4 契约测试进 smoke 脚本                                       |
| `numeric` 精度序列化为字符串                | 中   | schema 用 `z.coerce.number()`                                   |
| 表无清理策略（processed 行堆积）            | 低   | 首版可接受；后续加"processed 且 >90 天"清理（单独 RFC）        |
| `schema.sql` 未同步 `life_events`（已知）   | 低   | roadmap I-P0 已跟踪，不在本 RFC 处理                            |
| 消费端标 processed 失败导致重复消费          | 中   | upsert 幂等本身兜底；status 更新失败只造成多余一次 upsert       |

## 9. 评审后落地顺序（建议）

1. `events.ts` 增加 envelope + `parseLifeEvent` + `z.coerce.number` 修订（小 PR，纯 contracts）
2. smoke 脚本追加 payload 契约断言
3. Planner 消费端最小实现（登录 + 前台恢复轮询，幂等 upsert）
4. 验收：Finance 插入 card_bill → Planner 出现任务 → 事件 processed

---

_Rollback：本 RFC 为纯文档，删除本文件即回滚。_
