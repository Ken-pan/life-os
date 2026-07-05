/** 全站资产、目标与备份等术语（与 metrics.ts 的核心指标文案配合使用）。 */

import { t } from "../i18n/translate";
import { intlLocale } from "../i18n/formatLocale";
import { getActiveLocale } from "../i18n/translate";
import type {
  AccountType,
  DecisionStatus,
  ForecastMetric,
  GoalMetric,
  GoalReservePolicy,
  ScenarioStatus,
  ScenarioType,
} from "../types";
import { safeToSpendLabel } from "./metrics";

export function productName(): string {
  return t("terminology.productName");
}

export function liquidCashLabel(): string {
  return t("terminology.liquidCash");
}

export function accessibleLabel(): string {
  return t("terminology.accessible");
}

export function lockedLabel(): string {
  return t("terminology.locked");
}

export function netWorthLabel(): string {
  return t("terminology.netWorth");
}

export function inTransitCashLabel(): string {
  return t("terminology.inTransitCash");
}

export function clearedCashLabel(): string {
  return t("terminology.clearedCash");
}

export function bookBalanceLabel(): string {
  return t("terminology.bookBalance");
}

export function aprLabel(): string {
  return t("terminology.apr");
}

export function statementBalanceLabel(): string {
  return t("terminology.statementBalance");
}

export function annualFeeLabel(): string {
  return t("terminology.annualFee");
}

export function reserveAccountCheckboxLabel(): string {
  return t("terminology.reserveCheckbox");
}

export function reserveAccountTooltip(): string {
  return t("terminology.reserveTooltip", {
    liquidCash: liquidCashLabel(),
    safeToSpendQuoted: quoteSafeToSpend(),
  });
}

const SCENARIO_STATUS_KEYS: Record<ScenarioStatus, string> = {
  draft: "terminology.scenarioStatusDraft",
  saved: "terminology.scenarioStatusSaved",
  chosen: "terminology.scenarioStatusChosen",
  archived: "terminology.scenarioStatusArchived",
};

const SCENARIO_TYPE_KEYS: Record<ScenarioType, string> = {
  custom: "terminology.scenarioTypeCustom",
  purchase: "terminology.scenarioTypePurchase",
  recurring_cost: "terminology.scenarioTypeRecurringCost",
  rent_change: "terminology.scenarioTypeRentChange",
  travel: "terminology.scenarioTypeTravel",
  career_break: "terminology.scenarioTypeCareerBreak",
  partner_contribution: "terminology.scenarioTypePartnerContribution",
  cash_vs_finance: "terminology.scenarioTypeCashVsFinance",
};

const DECISION_STATUS_KEYS: Record<DecisionStatus, string> = {
  considering: "terminology.decisionConsidering",
  chosen: "terminology.decisionChosen",
  declined: "terminology.decisionDeclined",
  deferred: "terminology.decisionDeferred",
  reviewed: "terminology.decisionReviewed",
};

export function scenarioStatusLabel(status: ScenarioStatus): string {
  return t(SCENARIO_STATUS_KEYS[status] ?? status);
}

export function scenarioTypeLabel(type: ScenarioType): string {
  return t(SCENARIO_TYPE_KEYS[type] ?? type);
}

export function decisionStatusLabel(status: DecisionStatus): string {
  return t(DECISION_STATUS_KEYS[status] ?? status);
}

export function stsBreakdown() {
  return {
    lowest30d: t("terminology.stsLowest30d"),
    buffer: t("terminology.stsBuffer"),
    goalReserve: t("terminology.stsGoalReserve"),
    protectedReserve: t("terminology.stsProtectedReserve"),
    obligations30d: t("terminology.stsObligations30d"),
  } as const;
}

/** @deprecated 请使用 stsBreakdown() */
export function getStsBreakdown() {
  return stsBreakdown();
}

const ACCOUNT_TYPE_KEYS: Record<AccountType, string> = {
  checking: "terminology.accountChecking",
  savings: "terminology.accountSavings",
  hsa: "terminology.accountHsa",
  brokerage: "terminology.accountBrokerage",
  retirement: "terminology.accountRetirement",
  property: "terminology.accountProperty",
  "credit-card": "terminology.accountCreditCard",
  mortgage: "terminology.accountMortgage",
  "auto-loan": "terminology.accountAutoLoan",
  other: "terminology.accountOther",
};

export function accountTypeLabel(type: AccountType): string {
  return t(ACCOUNT_TYPE_KEYS[type] ?? type);
}

export function accountTypeOptions(): { value: AccountType; label: string }[] {
  return (Object.keys(ACCOUNT_TYPE_KEYS) as AccountType[]).map((value) => ({
    value,
    label: accountTypeLabel(value),
  }));
}

/** @deprecated 请使用 accountTypeOptions() */
export function getAccountTypeOptions() {
  return accountTypeOptions();
}

export function goalMetricOptions(): { value: GoalMetric; label: string }[] {
  return [
    { value: "accessible", label: accessibleLabel() },
    { value: "locked", label: lockedLabel() },
    { value: "net-worth", label: netWorthLabel() },
    { value: "invested", label: t("terminology.invested") },
    { value: "liquid", label: t("terminology.liquidAssets") },
  ];
}

export function getGoalMetricOptions() {
  return goalMetricOptions();
}

export function forecastMetricLabel(metric: ForecastMetric): string {
  const map: Record<ForecastMetric, string> = {
    accessible: accessibleLabel(),
    locked: lockedLabel(),
    "net-worth": netWorthLabel(),
    invested: t("terminology.invested"),
    liquid: t("terminology.liquidAssets"),
  };
  return map[metric] ?? metric;
}

export function forecastMetricHint(metric: ForecastMetric): string {
  const hints: Record<ForecastMetric, string> = {
    accessible: t("terminology.forecastHintAccessible", {
      accessible: accessibleLabel(),
      liquidCash: liquidCashLabel(),
    }),
    locked: t("terminology.forecastHintLocked"),
    "net-worth": t("terminology.forecastHintNetWorth", {
      accessible: accessibleLabel(),
      locked: lockedLabel(),
    }),
    invested: t("terminology.forecastHintInvested"),
    liquid: t("terminology.forecastHintLiquid"),
  };
  return hints[metric] ?? "";
}

export function getForecastMetricLabels(): Record<ForecastMetric, string> {
  return {
    accessible: accessibleLabel(),
    locked: lockedLabel(),
    "net-worth": netWorthLabel(),
    invested: t("terminology.invested"),
    liquid: t("terminology.liquidAssets"),
  };
}

export function getForecastMetricHints(): Record<ForecastMetric, string> {
  return {
    accessible: forecastMetricHint("accessible"),
    locked: forecastMetricHint("locked"),
    "net-worth": forecastMetricHint("net-worth"),
    invested: forecastMetricHint("invested"),
    liquid: forecastMetricHint("liquid"),
  };
}

export function quoteSafeToSpend(): string {
  return t("terminology.safeToSpendQuoted", { label: safeToSpendLabel() });
}

export function goalReservePolicies(): Record<
  GoalReservePolicy,
  { label: string; title: string }
> {
  const q = quoteSafeToSpend();
  return {
    milestone_only: {
      label: t("terminology.goalReserveMilestoneOnly", { safeToSpend: q }),
      title: t("terminology.goalReserveMilestoneOnlyTitle", { safeToSpend: q }),
    },
    earmarked_operating_cash: {
      label: t("terminology.goalReserveEarmarked", { safeToSpend: q }),
      title: t("terminology.goalReserveEarmarkedTitle", { safeToSpend: q }),
    },
    protected_account: {
      label: t("terminology.goalReserveProtected"),
      title: t("terminology.goalReserveProtectedTitle", { safeToSpend: q }),
    },
  };
}

export function getGoalReservePolicies() {
  return goalReservePolicies();
}

export function fundingSourceLabels() {
  return {
    checking: t("terminology.accountChecking"),
    savings: t("terminology.accountSavings"),
    invested: t("terminology.fundingInvested"),
    "credit-card": t("terminology.accountCreditCard"),
  } as const;
}

export function getFundingSourceLabels() {
  return fundingSourceLabels();
}

export function baselineConfidenceLabel(key: keyof typeof BASELINE_CONFIDENCE_KEYS): string {
  return t(BASELINE_CONFIDENCE_KEYS[key]);
}

const BASELINE_CONFIDENCE_KEYS = {
  "Ready to use": "terminology.baselineReady",
  "Review recommended": "terminology.baselineReview",
  "Not ready": "terminology.baselineNotReady",
} as const;

export function getBaselineConfidenceLabels() {
  return {
    "Ready to use": baselineConfidenceLabel("Ready to use"),
    "Review recommended": baselineConfidenceLabel("Review recommended"),
    "Not ready": baselineConfidenceLabel("Not ready"),
  };
}

export function decisionConfidenceLabel(key: keyof typeof DECISION_CONFIDENCE_KEYS): string {
  return t(DECISION_CONFIDENCE_KEYS[key]);
}

const DECISION_CONFIDENCE_KEYS = {
  "Ready to compare": "terminology.decisionReady",
  "Review assumptions": "terminology.decisionReviewAssumptions",
  "Limited confidence": "terminology.decisionLimited",
} as const;

export function getDecisionConfidenceLabels() {
  return {
    "Ready to compare": decisionConfidenceLabel("Ready to compare"),
    "Review assumptions": decisionConfidenceLabel("Review assumptions"),
    "Limited confidence": decisionConfidenceLabel("Limited confidence"),
  };
}

export function backupFormatNote(): string {
  return t("terminology.backupFormatNote");
}

export function getBackupFormatNote(): string {
  return backupFormatNote();
}

export function backupRestoreDoneMessage(schemaVersion: number, restoredAt: string): string {
  return t("terminology.backupRestoreDone", {
    schemaVersion,
    restoredAt: new Date(restoredAt).toLocaleString(intlLocale(getActiveLocale())),
  });
}

export function welcomeTitle(): string {
  return t("terminology.welcomeTitle", { productName: productName() });
}
