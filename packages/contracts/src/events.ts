import { z } from 'zod'

/**
 * Finance 账单生成事件契约
 * 触发条件: 当预期的信用卡账单 (source_type = 'card_bill') 插入到 expected_occurrences
 */
export const FinanceBillDueSchema = z.object({
  type: z.literal('finance.bill_due'),
  payload: z.object({
    occurrence_id: z.string().describe('expected_occurrences 的主键ID'),
    label: z.string(),
    expected_amount: z.number(),
    occurrence_date: z.string().describe('YYYY-MM-DD 格式'),
  }),
})

export type FinanceBillDueEvent = z.infer<typeof FinanceBillDueSchema>

// -----------------------------------------------------------------------------
// Life Event 联合类型 (Single Source of Truth)
// -----------------------------------------------------------------------------

export const LifeEventSchema = z.discriminatedUnion('type', [
  FinanceBillDueSchema,
  // 未来其他事件可以在此处添加，例如 PlannerTaskCompletedSchema 等
])

export type LifeEvent = z.infer<typeof LifeEventSchema>
