import { getActiveLocale } from "../i18n/translate";
import { intlLocale } from "../i18n/formatLocale";

export function daysSince(iso?: string): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function formatDateForIntl(iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(intlLocale(getActiveLocale()), options);
}
