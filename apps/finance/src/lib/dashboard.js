// Port of src/hooks/useDashboard.ts — plain functions (no React hooks).
import { timelineDailyOptions } from '../engine/daily.js'
import { buildAugmentedDailyOutlook } from '../engine/outlook.js'
import { baselineCategoryAverages } from '../engine/realityLoop.js'
import { goalReachMonth, selectSafeToSpendBreakdown } from '../engine/metrics.js'
import { buildActions } from '../engine/actions.js'
import { isMilestoneGoal } from '../engine/goals.js'
import { buildProjection } from './projection.js'

/**
 * @param {import('../engine/reconciliation.js').LiquidCashAnchors} cashAnchors
 * @param {import('../engine/timeline.js').ExpectedOccurrence[]} occurrences
 * @param {import('../types.js').Transaction[]} txns
 */
function buildDailyOpts(cashAnchors, occurrences, txns) {
  /** @type {number | undefined} */
  let dailyBurnOverride
  if (cashAnchors.hasAnchoredAccounts && txns.length > 0) {
    const byCat = baselineCategoryAverages(txns, 3)
    const monthlyActual = Object.values(byCat).reduce((s, v) => s + v, 0)
    if (monthlyActual > 0) dailyBurnOverride = monthlyActual / 30
  }
  return timelineDailyOptions({
    startLiquid: cashAnchors.hasAnchoredAccounts ? cashAnchors.totalStartLiquid : undefined,
    occurrences,
    dailyBurnOverride,
    suppressTodayBurn: cashAnchors.hasAnchoredAccounts,
  })
}

/**
 * @typedef {object} DashboardInputs
 * @property {import('../engine/reconciliation.js').LiquidCashAnchors} cashAnchors
 * @property {import('../engine/timeline.js').ExpectedOccurrence[]} occurrences
 * @property {import('../types.js').Transaction[]} txns
 */

/**
 * @param {import('../types.js').FinanceData} data
 * @param {DashboardInputs} inputs
 */
export function buildDashboard(data, { cashAnchors, occurrences, txns }) {
  const projectionOptions = cashAnchors.hasAnchoredAccounts
    ? { operatingLiquidOverride: cashAnchors.totalStartLiquid }
    : undefined

  const projection = buildProjection(data, projectionOptions)
  const today = new Date()
  const { summary, baseline } = projection

  const dailyOpts = buildDailyOpts(cashAnchors, occurrences, txns)
  const { outlook, savingCapacity } = buildAugmentedDailyOutlook(data, 35, today, dailyOpts)

  const emergencyFloor = Math.max(0, data.assumptions.emergencyReserveTarget)
  const safeToSpendBreakdown = selectSafeToSpendBreakdown({
    outlook,
    assumptions: data.assumptions,
    goals: data.goals,
  })

  const now = today
  const todayStartTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const monthEndTs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
  const cardObligations = outlook.events
    .filter(
      (e) =>
        e.kind === 'card' &&
        e.affectsBalance !== false &&
        e.ts >= todayStartTs &&
        e.ts < monthEndTs,
    )
    .reduce((s, e) => s + Math.abs(e.amount), 0)
  const netObligations30 = Math.max(0, outlook.obligations30 - outlook.inflows30)
  const safeToSpend = safeToSpendBreakdown.safeToSpend

  const milestoneGoals = data.goals.filter(isMilestoneGoal)
  const milestonePool = milestoneGoals.length > 0 ? milestoneGoals : data.goals
  /** @type {{ goal: import('../types.js').Goal, reachMonth: number | null } | null} */
  let nextMilestone = null
  for (const g of milestonePool) {
    const reachMonth = goalReachMonth(baseline, g)
    if (reachMonth == null) continue
    if (!nextMilestone || reachMonth < (nextMilestone.reachMonth ?? Infinity)) {
      nextMilestone = { goal: g, reachMonth }
    }
  }
  if (!nextMilestone && milestonePool.length > 0) {
    nextMilestone = { goal: milestonePool[0], reachMonth: null }
  }

  const derived = {
    netWorth: summary.netWorth,
    liquidCash: cashAnchors.hasAnchoredAccounts ? cashAnchors.totalStartLiquid : summary.liquidCash,
    cashAnchors,
    invested: summary.invested,
    monthlySurplus: summary.monthlySurplus,
    emergencyFloor,
    safeToSpendBreakdown,
    inflows30: outlook.inflows30,
    obligations30: outlook.obligations30,
    netObligations30,
    cardObligations,
    safeToSpend,
    savingCapacity,
    nextMilestone,
  }

  const actions = buildActions(data, outlook, {
    safeToSpend,
    emergencyFloor,
    liquidCash: derived.liquidCash,
    savingCapacity,
  })

  return { projection, outlook, derived, actions }
}

/**
 * Store-shaped helper for routes that already hold timeline/transactions stores.
 * @param {import('../types.js').FinanceData} data
 * @param {import('./timeline.svelte.js').TimelineStore} timeline
 * @param {import('./transactions.svelte.js').TransactionsStore} transactions
 */
export function computeDashboard(data, timeline, transactions) {
  return buildDashboard(data, {
    cashAnchors: timeline.cashAnchors,
    occurrences: timeline.occurrences,
    txns: transactions.txns,
  })
}
