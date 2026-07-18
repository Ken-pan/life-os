/**
 * FINC.GROWTH.4 — Portal 角标计数纯逻辑。
 *
 * life_events 在 Planner 消费时即标 processed（RFC），账单任务本身可能仍未完成。
 * 角标 = 非 finance 的 pending 事件
 *       + 尚未消费的 finance.bill_due
 *       + 已消费但未完成的 finance 来源 Planner 任务
 * 这样「处理完账单任务」后角标才消减，且不会在消费瞬间双计。
 */

/**
 * @param {Array<{ type?: string } | null | undefined> | null | undefined} pendingRows
 * @param {Array<{ data?: unknown } | null | undefined> | null | undefined} taskRows
 * @returns {number}
 */
export function countPortalActionBadge(pendingRows, taskRows) {
  const pending = Array.isArray(pendingRows) ? pendingRows.filter(Boolean) : []
  let nonFinancePending = 0
  let financePending = 0
  for (const row of pending) {
    if (row.type === 'finance.bill_due') financePending += 1
    else nonFinancePending += 1
  }

  const openFinanceTasks = (Array.isArray(taskRows) ? taskRows : [])
    .map((r) => r?.data)
    .filter((t) => isOpenFinanceBillTask(t)).length

  return nonFinancePending + financePending + openFinanceTasks
}

/**
 * @param {unknown} task
 * @returns {boolean}
 */
export function isOpenFinanceBillTask(task) {
  if (!task || typeof task !== 'object') return false
  const t = /** @type {Record<string, unknown>} */ (task)
  if (t.completed === true) return false
  if (t.deletedAt != null) return false
  const meta = t.meta
  if (!meta || typeof meta !== 'object') return false
  const ref = /** @type {Record<string, unknown>} */ (meta).lifeEventRef
  if (!ref || typeof ref !== 'object') return false
  return /** @type {Record<string, unknown>} */ (ref).domain === 'finance'
}
