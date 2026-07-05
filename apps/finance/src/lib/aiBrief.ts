// AI 简报的「事实包」与 prompt 构造 —— 全部纯函数，便于单测。
// 原则：只发送匿名的汇总数字（金额、比例、日期、代码），不发送账户名/机构/备注等身份信息。

import { safeToSpendLabel } from "../copy/metrics";
import { getActiveLocale } from "../i18n/translate";
import type { AppLocale } from "../i18n/types";

export interface TodayBriefFacts {
  date: string; // YYYY-MM-DD
  safeToSpend: number;
  savingCapacity: number;
  savingBestDay: string | null;
  budget: {
    budget: number;
    spent: number;
    todaySpend: number;
    dailyAllowance: number;
    daysLeft: number;
    pace: "under" | "on" | "over";
  };
  /** 未来 14 天内的账单（金额为负）。 */
  upcomingBills: Array<{ date: string; label: string; amount: number }>;
  pendingCount: number;
  /** 本月支出 top 类目。 */
  topCategories: Array<{ category: string; amount: number }>;
}

export interface AdvisorBriefFacts {
  date: string;
  planAmount: number;
  planCorePct: number;
  bestDay: string | null;
  holdings: Array<{
    ticker: string;
    weightPct: number;
    zone?: "buy" | "neutral" | "trim";
    trend?: "up" | "down" | "flat";
    rsi?: number | null;
  }>;
  advices: Array<{ action: string; title: string }>;
  newsTitles: Array<{ symbol: string; title: string }>;
}

/** 稳定指纹：djb2 哈希。金额取整以避免几分钱波动导致重新生成。 */
export function fingerprintOf(value: unknown): string {
  const s = JSON.stringify(value, (_k, v) => (typeof v === "number" ? Math.round(v) : v));
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const PACE_LABEL: Record<AppLocale, Record<TodayBriefFacts["budget"]["pace"], string>> = {
  "zh-CN": { over: "超速", under: "低于进度", on: "按进度" },
  "en-US": { over: "over pace", under: "under pace", on: "on pace" },
};

const ZONE_LABEL: Record<AppLocale, Record<NonNullable<AdvisorBriefFacts["holdings"][0]["zone"]>, string>> = {
  "zh-CN": { buy: "回调区", neutral: "中性", trim: "过热区" },
  "en-US": { buy: "pullback zone", neutral: "neutral", trim: "extended" },
};

const TREND_LABEL: Record<AppLocale, Record<NonNullable<AdvisorBriefFacts["holdings"][0]["trend"]>, string>> = {
  "zh-CN": { up: "趋势向上", down: "趋势偏弱", flat: "震荡" },
  "en-US": { up: "uptrend", down: "weak trend", flat: "range-bound" },
};

const TODAY_SYSTEM: Record<AppLocale, string> = {
  "zh-CN": [
    "你是一位务实的个人理财助手，服务一位在美国生活、以美元记账的用户。",
    "基于用户提供的当日财务数据，输出一份「今日财务简报」，严格使用以下三行格式（每行最多 45 字）：",
    "风险：（当天最需留意的现金/账单/超支风险；若无则写「无」）",
    "建议：（一条今天可执行的动作；若无则写「无」）",
    "异常：（一条值得留意的支出或数据异常；若无则写「无」）",
    "要求：简体中文；给出具体判断；不要重复罗列原始数字；不要空话；不要投资收益承诺；不要 markdown 或免责声明。",
  ].join("\n"),
  "en-US": [
    "You are a practical personal finance assistant for a US-based user tracking finances in USD.",
    "Using today's financial snapshot, output a daily brief in exactly three lines (max ~45 characters each):",
    "Risk: (top cash/bill/overspend risk today; write None if none)",
    "Suggestion: (one actionable step for today; write None if none)",
    "Anomaly: (one spending or data anomaly worth noting; write None if none)",
    "Requirements: US English; specific judgments; don't repeat raw numbers; no investment promises; no markdown or disclaimers.",
  ].join("\n"),
};

const ADVISOR_SYSTEM: Record<AppLocale, string> = {
  "zh-CN": [
    "你是一位克制的投资组合观察员，面向一位使用美元、定投为主的个人投资者。",
    "基于给定的持仓权重、日线技术信号（趋势/区间/RSI）、规则化建议和新闻标题，输出一份高度结构化的 JSON 简报。",
    "要求：把信号和新闻联系起来；对分歧信息指出不确定性；禁止预测价格或催促交易。",
    "必须严格输出符合以下 TypeScript 接口的纯 JSON，不要输出任何 Markdown 代码块标签（如 ```json）或额外文本：",
    `{
  heroConclusion: { title: string; reason: string; riskLevel: "低" | "中" | "中高" | "高"; suggestedAction: string };
  signals: Array<{ ticker: string; signal: "偏正面" | "偏负面" | "谨慎" | "动量强" | "不确定" | "中性"; reason: string; action: string }>;
  suggestedActions: Array<{ type: "执行" | "等待" | "观察"; text: string }>;
  confidenceScore: number;
}`,
  ].join("\n"),
  "en-US": [
    "You are a restrained portfolio observer for a dollar-based, mostly buy-and-hold investor.",
    "Given weights, daily technical signals (trend/zone/RSI), rule-based advice, and news headlines, output a structured JSON brief.",
    "Connect signals to news; note uncertainty when sources disagree; never predict prices or urge trades.",
    "Output pure JSON matching this TypeScript shape only — no Markdown fences or extra text:",
    `{
  heroConclusion: { title: string; reason: string; riskLevel: "low" | "medium" | "medium-high" | "high"; suggestedAction: string };
  signals: Array<{ ticker: string; signal: "positive" | "negative" | "cautious" | "strong momentum" | "uncertain" | "neutral"; reason: string; action: string }>;
  suggestedActions: Array<{ type: "act" | "wait" | "watch"; text: string }>;
  confidenceScore: number;
}`,
  ].join("\n"),
};

export function buildTodayBriefPrompt(
  facts: TodayBriefFacts,
  locale: AppLocale = getActiveLocale()
): {
  system: string;
  user: string;
  fingerprint: string;
} {
  const pace = PACE_LABEL[locale][facts.budget.pace];
  const sts = safeToSpendLabel();
  const lines: string[] =
    locale === "en-US"
      ? [
          `Date: ${facts.date} (USD)`,
          `${sts}: ${Math.round(facts.safeToSpend)}`,
          `Monthly budget ${Math.round(facts.budget.budget)}, spent ${Math.round(facts.budget.spent)} (${pace}), today ${Math.round(facts.budget.todaySpend)}, ${facts.budget.daysLeft} days left, daily allowance ${Math.round(facts.budget.dailyAllowance)}`,
          `Projected savings this month ${Math.round(facts.savingCapacity)}${
            facts.savingBestDay ? ` (best day ${facts.savingBestDay})` : ""
          }`,
        ]
      : [
          `日期：${facts.date}（货币：美元）`,
          `${sts}：${Math.round(facts.safeToSpend)}`,
          `本月预算 ${Math.round(facts.budget.budget)}，已花 ${Math.round(facts.budget.spent)}（节奏：${pace}），今日已花 ${Math.round(facts.budget.todaySpend)}，剩 ${facts.budget.daysLeft} 天、日均可花 ${Math.round(facts.budget.dailyAllowance)}`,
          `本月预计能存 ${Math.round(facts.savingCapacity)}${
            facts.savingBestDay ? `（最佳转存日 ${facts.savingBestDay}）` : ""
          }`,
        ];

  if (facts.upcomingBills.length > 0) {
    const billLine =
      locale === "en-US"
        ? `Bills in next 14 days: ${facts.upcomingBills
            .map((b) => `${b.date} ${b.label} ${Math.round(Math.abs(b.amount))}`)
            .join("; ")}`
        : `未来 14 天账单：${facts.upcomingBills
            .map((b) => `${b.date} ${b.label} ${Math.round(Math.abs(b.amount))}`)
            .join("；")}`;
    lines.push(billLine);
  }
  if (facts.pendingCount > 0) {
    lines.push(
      locale === "en-US"
        ? `${facts.pendingCount} planned cash flows awaiting confirmation`
        : `有 ${facts.pendingCount} 笔计划收支待确认`
    );
  }
  if (facts.topCategories.length > 0) {
    const catLine =
      locale === "en-US"
        ? `Top spending categories this month: ${facts.topCategories
            .map((c) => `${c.category} ${Math.round(c.amount)}`)
            .join("; ")}`
        : `本月支出前几类：${facts.topCategories
            .map((c) => `${c.category} ${Math.round(c.amount)}`)
            .join("；")}`;
    lines.push(catLine);
  }
  return {
    system: TODAY_SYSTEM[locale],
    user: lines.join("\n"),
    fingerprint: fingerprintOf(["today", locale, facts]),
  };
}

export function buildAdvisorBriefPrompt(
  facts: AdvisorBriefFacts,
  locale: AppLocale = getActiveLocale()
): {
  system: string;
  user: string;
  fingerprint: string;
} {
  const holdingsLine = facts.holdings
    .map((h) => {
      const bits = [`${h.ticker} ${h.weightPct.toFixed(1)}%`];
      if (h.zone) bits.push(ZONE_LABEL[locale][h.zone]);
      if (h.trend) bits.push(TREND_LABEL[locale][h.trend]);
      if (h.rsi != null) bits.push(`RSI${Math.round(h.rsi)}`);
      return bits.join(" ");
    })
    .join(locale === "en-US" ? "; " : "；");

  const lines: string[] =
    locale === "en-US"
      ? [
          `Date: ${facts.date}`,
          `Planned contribution this month ${Math.round(facts.planAmount)} (index core ${facts.planCorePct}%)${
            facts.bestDay ? `, best buy day ${facts.bestDay}` : ""
          }`,
          `Holdings & signals: ${holdingsLine}`,
        ]
      : [
          `日期：${facts.date}`,
          `本月计划投入 ${Math.round(facts.planAmount)}（指数核心 ${facts.planCorePct}%）${
            facts.bestDay ? `，最佳买入日 ${facts.bestDay}` : ""
          }`,
          `持仓与信号：${holdingsLine}`,
        ];

  if (facts.advices.length > 0) {
    lines.push(
      locale === "en-US"
        ? `Rule-based advice: ${facts.advices.map((a) => `[${a.action}] ${a.title}`).join("; ")}`
        : `规则化建议：${facts.advices.map((a) => `[${a.action}] ${a.title}`).join("；")}`
    );
  }
  if (facts.newsTitles.length > 0) {
    lines.push(
      locale === "en-US"
        ? `Recent headlines: ${facts.newsTitles.map((n) => `(${n.symbol}) ${n.title}`).join("; ")}`
        : `近期新闻标题：${facts.newsTitles.map((n) => `（${n.symbol}）${n.title}`).join("；")}`
    );
  }
  return {
    system: ADVISOR_SYSTEM[locale],
    user: lines.join("\n"),
    fingerprint: fingerprintOf([
      "advisor",
      locale,
      facts.date,
      facts.holdings.map((h) => [h.ticker, Math.round(h.weightPct), h.zone, h.trend]),
      facts.advices.map((a) => a.action + a.title),
      Math.round(facts.planAmount),
    ]),
  };
}
