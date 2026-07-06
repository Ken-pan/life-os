import { toTodayDollars } from "./engine/finance";
import type { DisplayMode } from "./types";
import { getActiveLocale } from "./i18n/translate";
import { intlLocale } from "./i18n/formatLocale";
import { t } from "./i18n/translate";

const MASK = "••••";

export function money(n: number, privacy = false): string {
  if (privacy) return MASK;
  const v = Math.round(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US")}`;
}

export function signedMoney(n: number, privacy = false): string {
  if (privacy) return MASK;
  const v = Math.round(n);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US")}`;
}

/** 账本等需要对齐合计的场景：保留两位小数。 */
export function moneyPrecise(n: number, privacy = false): string {
  if (privacy) return MASK;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function signedMoneyPrecise(n: number, privacy = false): string {
  if (privacy) return MASK;
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 紧凑金额，例如 $1.2M / $640k。 */
export function moneyCompact(n: number, privacy = false): string {
  if (privacy) return MASK;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Best-effort redaction for explanatory copy generated outside direct JSX
 * formatting paths. Percentages and dates remain visible.
 */
export function redactMoneyText(text: string, privacy = false): string {
  if (!privacy) return text;
  return text
    .replace(/[$＄]\s*-?\d[\d,]*(?:\.\d+)?\s*(?:[kKmM]|万|千)?/g, MASK)
    .replace(/-?\d[\d,]*(?:\.\d+)?(?=\s*(?:美元|美金|元|\/月))/g, MASK)
    .replace(
      /((?:余额|金额|市值|成本|收入|支出|花费|首付|还款|月额|差额|结余)\s*)(-?\d[\d,]*(?:\.\d+)?(?:\s*→\s*-?\d[\d,]*(?:\.\d+)?)*)/g,
      (_match, prefix: string, values: string) =>
        `${prefix}${values.replace(/-?\d[\d,]*(?:\.\d+)?/g, MASK)}`
    );
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** 把月数转成可读时长。 */
export function monthsToHuman(months: number | null): string {
  if (months == null) return t("common.emDash");
  if (!Number.isFinite(months)) return t("format.unreachable");
  if (months <= 0) return t("format.achieved");
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return t("format.monthsOnly", { m });
  if (m === 0) return t("format.yearsOnly", { y });
  return t("format.yearsMonths", { y, m });
}

export function delayToHuman(months: number | null): string {
  if (months == null) return t("common.emDash");
  if (!Number.isFinite(months)) return t("format.delayUnreachable");
  if (months <= 0) return t("format.delayNone");
  return t("format.delayPrefix", { duration: monthsToHuman(months) });
}

/** 距今月数 → 日历年份 (用于图表 X 轴)。 */
export function monthToYearLabel(monthOffset: number): number {
  return new Date().getFullYear() + Math.floor(monthOffset / 12);
}

/** 距今月数 → 日历月标签。 */
export function monthOffsetToCalendarLabel(monthOffset: number, start = new Date()): string {
  const total = start.getFullYear() * 12 + start.getMonth() + Math.max(0, Math.round(monthOffset));
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return t("format.calendarMonth", { year, month });
}

/** 任意 ISO 日期 → 日历标签。 */
export function isoToCalendarLabel(iso?: string): string {
  if (!iso) return t("common.emDash");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return t("format.calendarDate", {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  });
}

/** 按显示口径折算：today 折算为今天购买力，future 保持名义。 */
export function adjustForDisplay(
  value: number,
  monthOffset: number,
  mode: DisplayMode,
  inflation: number
): number {
  if (mode === "future") return value;
  return toTodayDollars(value, inflation, monthOffset);
}

export function todayISO(): string {
  return new Date().toISOString();
}

export function daysSince(iso?: string): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** 存款 / 现金变动：增加为绿，减少为红。仅用于带符号的变动金额。 */
export function depositDeltaClass(delta: number): string {
  if (delta === 0) return "";
  return delta > 0 ? "text-pos" : "text-neg";
}

/** 负债余额变动：减少为绿，增加为红（delta 为负债余额的变化量，正=欠得更多）。 */
export function liabilityDeltaClass(delta: number): string {
  if (delta === 0) return "";
  return delta < 0 ? "text-pos" : "text-neg";
}

/** ISO 日期 YYYY-MM-DD → 本地化展示。 */
export function formatDateLocalized(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.slice(0, 10));
  if (!m) return iso;
  return t("format.calendarDate", {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  });
}

/** @deprecated 请使用 formatDateLocalized */
export function formatDateZh(iso: string | undefined): string | null {
  return formatDateLocalized(iso);
}

export function formatDateForIntl(iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(intlLocale(getActiveLocale()), options);
}

export function formatDateTimeForIntl(iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(intlLocale(getActiveLocale()), options);
}
