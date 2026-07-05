import { useMemo } from "react";
import type { FinanceData, ScenarioEvent } from "../types";
import { projectMonthly, type MonthSnapshot } from "../engine/monthly";
import type { ProjectionAccountOptions } from "../engine/projectionAccounts";
import { summarize, type OverviewMetrics } from "../engine/metrics";

export interface Projection {
  baseline: MonthSnapshot[];
  conservative: MonthSnapshot[];
  aggressive: MonthSnapshot[];
  summary: OverviewMetrics;
}

export type ProjectionOptions = ProjectionAccountOptions;

function buildProjectionOptions(
  data: FinanceData,
  options?: ProjectionOptions
): ProjectionAccountOptions {
  return {
    holdingsSnapshots: data.holdingsSnapshots,
    ...options,
  };
}

function projectMonthlyInput(
  data: FinanceData,
  extraEvents: ScenarioEvent[] = [],
  options?: ProjectionOptions,
  returnOverride?: number
) {
  return {
    accounts: data.accounts,
    cashFlows: data.cashFlows,
    events: [...data.events, ...extraEvents],
    goals: data.goals,
    assumptions: data.assumptions,
    returnOverride,
    projectionAccounts: buildProjectionOptions(data, options),
  };
}

export function project(
  data: FinanceData,
  extraEvents: ScenarioEvent[] = [],
  options?: ProjectionOptions
): MonthSnapshot[] {
  return projectMonthly(projectMonthlyInput(data, extraEvents, options));
}

function withReturn(
  data: FinanceData,
  ret: number,
  extraEvents: ScenarioEvent[] = [],
  options?: ProjectionOptions
) {
  return projectMonthly(projectMonthlyInput(data, extraEvents, options, ret));
}

export function useProjection(data: FinanceData, options?: ProjectionOptions): Projection {
  return useMemo(() => {
    const baseline = project(data, [], options);
    return {
      baseline,
      conservative: withReturn(data, data.assumptions.conservativeReturn, [], options),
      aggressive: withReturn(data, data.assumptions.aggressiveReturn, [], options),
      summary: summarize(baseline),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.accounts,
    data.cashFlows,
    data.events,
    data.goals,
    data.assumptions,
    data.holdingsSnapshots,
    options?.operatingLiquidOverride,
  ]);
}
