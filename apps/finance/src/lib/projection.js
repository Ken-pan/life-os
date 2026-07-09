// Port of src/hooks/useProjection.ts — plain functions (no React hooks).
import { projectMonthly } from '../engine/monthly.js'
import { summarize } from '../engine/metrics.js'

/** @typedef {import('../engine/monthly.js').MonthSnapshot} MonthSnapshot */
/** @typedef {import('../engine/metrics.js').OverviewMetrics} OverviewMetrics */
/** @typedef {import('../types.js').FinanceData} FinanceData */
/** @typedef {import('../types.js').ScenarioEvent} ScenarioEvent */
/** @typedef {import('../engine/projectionAccounts.js').ProjectionAccountOptions} ProjectionOptions */

/**
 * @typedef {object} Projection
 * @property {MonthSnapshot[]} baseline
 * @property {MonthSnapshot[]} conservative
 * @property {MonthSnapshot[]} aggressive
 * @property {OverviewMetrics} summary
 */

/**
 * @param {FinanceData} data
 * @param {ProjectionOptions} [options]
 */
function buildProjectionOptions(data, options) {
  return {
    holdingsSnapshots: data.holdingsSnapshots,
    ...options,
  }
}

/**
 * @param {FinanceData} data
 * @param {ScenarioEvent[]} [extraEvents]
 * @param {ProjectionOptions} [options]
 * @param {number} [returnOverride]
 */
function projectMonthlyInput(data, extraEvents = [], options, returnOverride) {
  return {
    accounts: data.accounts,
    cashFlows: data.cashFlows,
    events: [...data.events, ...extraEvents],
    goals: data.goals,
    assumptions: data.assumptions,
    returnOverride,
    projectionAccounts: buildProjectionOptions(data, options),
  }
}

/**
 * @param {FinanceData} data
 * @param {ScenarioEvent[]} [extraEvents]
 * @param {ProjectionOptions} [options]
 * @returns {MonthSnapshot[]}
 */
export function project(data, extraEvents = [], options) {
  return projectMonthly(projectMonthlyInput(data, extraEvents, options))
}

/**
 * @param {FinanceData} data
 * @param {number} ret
 * @param {ScenarioEvent[]} [extraEvents]
 * @param {ProjectionOptions} [options]
 */
function withReturn(data, ret, extraEvents = [], options) {
  return projectMonthly(projectMonthlyInput(data, extraEvents, options, ret))
}

/**
 * @param {FinanceData} data
 * @param {ProjectionOptions} [options]
 * @returns {Projection}
 */
export function buildProjection(data, options) {
  const baseline = project(data, [], options)
  return {
    baseline,
    conservative: withReturn(data, data.assumptions.conservativeReturn, [], options),
    aggressive: withReturn(data, data.assumptions.aggressiveReturn, [], options),
    summary: summarize(baseline),
  }
}

/** Alias for callers migrating from `useProjection` / `computeProjection` naming. */
export const computeProjection = buildProjection
