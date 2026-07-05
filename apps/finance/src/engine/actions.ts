// Action Inbox 规则引擎 —— OS 的灵魂：把数据转成「今天具体该做什么」。
// 原则：每条可操作、最多 3 条、中性措辞、解释计算依据、无行动时显示 on-track。

import type { FinanceData } from "../types";
import { safeToSpendLabel } from "../copy/metrics";
import { liquidCashLabel, stsBreakdown } from "../copy/terminology";
import { num } from "./finance";
import { daysSince, formatDateForIntl } from "../format";
import type { DailyOutlook } from "./daily";
import type { MonthlySavingCapacity } from "./metrics";
import { t } from "../i18n/translate";

export type ActionSeverity = "critical" | "warning" | "info" | "ok";

export interface ActionItem {
  id: string;
  title: string;
  detail: string;
  severity: ActionSeverity;
}

const RANK: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function isoToLabel(iso: string | null): string {
  if (!iso) return t("actions.soon");
  return formatDateForIntl(iso);
}

function daysUntil(iso: string, now = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Number.POSITIVE_INFINITY;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function buildActions(
  data: FinanceData,
  outlook: DailyOutlook,
  ctx: {
    safeToSpend: number;
    emergencyFloor: number;
    liquidCash: number;
    savingCapacity: MonthlySavingCapacity;
  }
): ActionItem[] {
  const items: ActionItem[] = [];
  const sts = stsBreakdown();
  const safeToSpend = safeToSpendLabel();
  const liquidCash = liquidCashLabel();

  if (outlook.recommendedTransfer > 0) {
    items.push({
      id: "buffer-shortfall",
      title: t("actions.bufferShortfallTitle", { amount: fmt(outlook.recommendedTransfer) }),
      detail: outlook.lowestDate
        ? t("actions.bufferShortfallDetail", {
            date: isoToLabel(outlook.lowestDate),
            low: fmt(outlook.lowestBalance),
            bufferLabel: sts.buffer,
            bufferAmount: fmt(outlook.buffer),
          })
        : t("actions.bufferShortfallDetailSoon", {
            low: fmt(outlook.lowestBalance),
            bufferLabel: sts.buffer,
            bufferAmount: fmt(outlook.buffer),
          }),
      severity: outlook.lowestBalance < 0 ? "critical" : "warning",
    });
  }

  for (const a of data.accounts) {
    if (a.type === "credit-card" && a.creditMode === "revolving" && num(a.balance) > 0) {
      const apr = num(a.apr);
      const monthlyInterest = (num(a.balance) * apr) / 12;
      items.push({
        id: `revolving-${a.id}`,
        title: t("actions.revolvingTitle", {
          name: a.name || t("actions.creditCardDefault"),
        }),
        detail: t("actions.revolvingDetail", {
          balance: fmt(num(a.balance)),
          apr: (apr * 100).toFixed(1),
          interest: fmt(monthlyInterest),
        }),
        severity: "critical",
      });
    }
  }

  const now = Date.now();
  for (const a of data.accounts) {
    if (!a.annualFee || !a.annualFeeDate || num(a.annualFee) <= 0) continue;
    const tms = new Date(a.annualFeeDate).getTime();
    const inDays = (tms - now) / 86_400_000;
    if (inDays >= 0 && inDays <= 45) {
      items.push({
        id: `fee-${a.id}`,
        title: t("actions.annualFeeTitle", {
          name: a.name || t("actions.cardDefault"),
          amount: fmt(num(a.annualFee)),
        }),
        detail: t("actions.annualFeeDetail", { days: String(Math.round(inDays)) }),
        severity: "info",
      });
    }
  }

  if (ctx.safeToSpend <= 0 && outlook.recommendedTransfer === 0) {
    items.push({
      id: "buffer",
      title: t("actions.tightTitle", { safeToSpend }),
      detail: t("actions.tightDetail", {
        safeToSpend,
        goalReserve: sts.goalReserve,
        liquidCash,
      }),
      severity: "warning",
    });
  }

  const stale = data.accounts.filter((a) => daysSince(a.updatedAt) > 30);
  if (stale.length > 0) {
    const oldest = Math.max(...stale.map((a) => daysSince(a.updatedAt)));
    items.push({
      id: "stale",
      title: t("actions.staleTitle", { count: String(stale.length) }),
      detail: t("actions.staleDetail", {
        days: Number.isFinite(oldest) ? String(oldest) : t("actions.staleDaysUnknown"),
      }),
      severity: "info",
    });
  }

  if (ctx.savingCapacity.capacity > 0) {
    if (
      (ctx.savingCapacity.rationale === "after-payday" ||
        ctx.savingCapacity.rationale === "timed") &&
      ctx.savingCapacity.bestDay
    ) {
      const inDays = daysUntil(ctx.savingCapacity.bestDay);
      if (inDays <= 3) {
        const urgencyText =
          inDays <= 0
            ? t("actions.urgencyToday")
            : t("actions.urgencyDays", { days: String(inDays) });
        items.push({
          id: "save-on-payday",
          title: t("actions.saveReserveTitle", {
            amount: fmt(ctx.savingCapacity.capacity),
          }),
          detail:
            ctx.savingCapacity.rationale === "after-payday"
              ? t("actions.savePaydayDetail", {
                  urgency: urgencyText,
                  date: isoToLabel(ctx.savingCapacity.bestDay),
                })
              : t("actions.saveTimedDetail", {
                  urgency: urgencyText,
                  date: isoToLabel(ctx.savingCapacity.bestDay),
                }),
          severity: inDays <= 0 ? "warning" : "info",
        });
      }
    } else if (ctx.savingCapacity.rationale === "today") {
      items.push({
        id: "save-today",
        title: t("actions.saveTodayTitle", {
          amount: fmt(ctx.savingCapacity.capacity),
        }),
        detail: t("actions.saveTodayDetail"),
        severity: "info",
      });
    }
  }

  items.sort((x, y) => RANK[x.severity] - RANK[y.severity]);
  const top = items.slice(0, 3);

  if (top.length === 0) {
    return [
      {
        id: "ok",
        title: t("actions.onTrackTitle"),
        detail: t("actions.onTrackDetail"),
        severity: "ok",
      },
    ];
  }
  return top;
}
