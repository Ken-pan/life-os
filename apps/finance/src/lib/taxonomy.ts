/**
 * 正交元数据词表 — 供搜索、过滤、报表与推荐复用。
 * 见 docs/IA_TAXONOMY.md
 */
export const TAXONOMY = {
  accountType: [
    'checking',
    'savings',
    'hsa',
    'brokerage',
    'retirement',
    'property',
    'credit_card',
    'mortgage',
    'auto_loan',
    'other',
  ],
  cashflowType: ['fixed', 'oneoff', 'txn', 'transfer', 'adjustment'],
  timePerspective: ['today', 'month', 'horizon', 'scenario'],
  goalType: ['emergency', 'milestone', 'retirement', 'custom'],
  dataConfidence: ['trusted', 'review_needed', 'stale', 'inferred'],
  decisionTemplate: [
    'purchase',
    'recurring_cost',
    'rent_change',
    'travel',
    'career_break',
    'partner_contribution',
    'cash_vs_finance',
    'wait_buy_later',
  ],
} as const

export type TaxonomyGroup = keyof typeof TAXONOMY

export type TaxonomyValue<G extends TaxonomyGroup> =
  (typeof TAXONOMY)[G][number]

export function isTaxonomyValue<G extends TaxonomyGroup>(
  group: G,
  value: string,
): value is TaxonomyValue<G> {
  return (TAXONOMY[group] as readonly string[]).includes(value)
}
