/** 全站统一的核心指标文案（经 i18n 集中维护，避免漂移）。 */

import { t } from "../i18n/translate";

export function safeToSpendLabel(): string {
  return t("metrics.safeToSpend");
}

export function safeToSpendSubtitle(): string {
  return t("metrics.safeToSpendSubtitle");
}

export function safeToSpendExplainTitle(): string {
  return t("metrics.safeToSpendExplainTitle", { label: safeToSpendLabel() });
}

export function safeToSpendAfterPurchaseLabel(): string {
  return t("metrics.safeToSpendAfterPurchase");
}

export function safeToSpendAfterPurchaseExplainTitle(): string {
  return t("metrics.safeToSpendAfterPurchaseExplainTitle", {
    label: safeToSpendAfterPurchaseLabel(),
  });
}

/** @deprecated 请在渲染中调用 safeToSpendLabel() */
export function getSafeToSpendLabelDeprecated(): string {
  return safeToSpendLabel();
}
