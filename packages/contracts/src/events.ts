import { z } from 'zod'

const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Finance 账单生成事件契约
 * 触发条件: 当预期的信用卡账单 (source_type = 'card_bill') 插入到 expected_occurrences
 */
export const FinanceBillDueSchema = z.object({
  type: z.literal('finance.bill_due'),
  payload: z.object({
    occurrence_id: z.string().describe('expected_occurrences 的主键ID'),
    label: z.string(),
    expected_amount: z.coerce.number(),
    occurrence_date: dateYmd.describe('YYYY-MM-DD 格式'),
  }),
})

export type FinanceBillDueEvent = z.infer<typeof FinanceBillDueSchema>

/**
 * Fitness 完练事件契约
 * 触发条件: fitness_workout_sessions 写入/更新且 ended_at 非空
 */
export const FitnessWorkoutLoggedSchema = z.object({
  type: z.literal('fitness.workout_logged'),
  payload: z.object({
    session_id: z.string().uuid().describe('fitness_workout_sessions 主键'),
    day_id: z.string(),
    session_date: dateYmd.describe('YYYY-MM-DD 格式'),
    ended_at: z.string().optional().describe('ISO timestamptz'),
  }),
})

export type FitnessWorkoutLoggedEvent = z.infer<typeof FitnessWorkoutLoggedSchema>

/**
 * Core 任务捕获事件契约
 * producer: 任意"捕获面"(如 AIOS 助手)—— 用户口述"加个待办",经此入 Planner 收件箱。
 * 消费方 Planner 用自身 createTask 生成任务并回写整包,不直写结构化镜像表(避免被同步覆盖)。
 */
export const CoreTaskCapturedSchema = z.object({
  type: z.literal('core.task_captured'),
  payload: z.object({
    capture_id: z.string().describe('捕获方生成的唯一键,用于消费端幂等去重'),
    title: z.string().min(1),
    notes: z.string().optional(),
    due_date: dateYmd.optional().describe('YYYY-MM-DD 格式'),
    source: z.string().optional().describe('捕获来源标记,如 aios'),
  }),
})

export type CoreTaskCapturedEvent = z.infer<typeof CoreTaskCapturedSchema>

// -----------------------------------------------------------------------------
// Life Event 联合类型 (Single Source of Truth)
// -----------------------------------------------------------------------------

export const LifeEventSchema = z.discriminatedUnion('type', [
  FinanceBillDueSchema,
  FitnessWorkoutLoggedSchema,
  CoreTaskCapturedSchema,
])

export type LifeEvent = z.infer<typeof LifeEventSchema>

// -----------------------------------------------------------------------------
// Row-level envelope — 对齐 life_events 表 (migration 20260708000000)
// -----------------------------------------------------------------------------

export const LifeEventStatusSchema = z.enum(['pending', 'processed', 'failed'])

/** life_events 表行信封；payload 由各 type 的 schema 二次校验 */
export const LifeEventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
  status: LifeEventStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
})

export type LifeEventEnvelope = z.infer<typeof LifeEventEnvelopeSchema>

export type ParseLifeEventResult =
  | { ok: true; event: LifeEvent; envelope: LifeEventEnvelope }
  | { ok: false; reason: 'bad-envelope' | 'unknown-type' | 'bad-payload' }

function isKnownLifeEventType(type: string): boolean {
  return LifeEventSchema.options.some((option) => {
    const shape = option.shape as { type?: z.ZodLiteral<string> }
    return shape.type?._def?.value === type
  })
}

/** 先解析信封，再按 type 分发 payload 校验；未知 type 不报错（向前兼容） */
export function parseLifeEvent(row: unknown): ParseLifeEventResult {
  const env = LifeEventEnvelopeSchema.safeParse(row)
  if (!env.success) return { ok: false, reason: 'bad-envelope' }

  const parsed = LifeEventSchema.safeParse({
    type: env.data.type,
    payload: env.data.payload,
  })

  if (!parsed.success) {
    return {
      ok: false,
      reason: isKnownLifeEventType(env.data.type) ? 'bad-payload' : 'unknown-type',
    }
  }

  return { ok: true, event: parsed.data, envelope: env.data }
}
