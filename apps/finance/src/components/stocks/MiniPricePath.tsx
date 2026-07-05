import { normalizeSparkline, pricePathPoints } from "../../engine/sparkline";
import type { PositionRowView } from "../../engine/holdingsPortfolio";
import { useLocale } from "../../i18n/context";

export function SparklinePath({
  values,
  up,
  width = 48,
  height = 18,
  className,
}: {
  values: number[];
  up: boolean;
  width?: number;
  height?: number;
  className?: string;
}) {
  const { points, w, h } = normalizeSparkline(values, { w: width, h: height });
  if (!points) return null;
  return (
    <svg
      className={className ?? "mini-price-path"}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={up ? "var(--positive)" : "var(--critical)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function MiniPricePath({ row, className }: { row: PositionRowView; className?: string }) {
  const values = pricePathPoints(row);
  return (
    <SparklinePath values={values} up={row.valueDelta >= 0} className={className} />
  );
}

export function DayReturnBar({
  pct,
  className,
}: {
  pct: number | undefined;
  className?: string;
}) {
  const { t } = useLocale();
  if (pct == null || !Number.isFinite(pct)) return null;
  const cap = 5;
  const width = Math.min(Math.abs(pct), cap) / cap * 50;
  const up = pct >= 0;
  const sign = pct >= 0 ? "+" : "";
  return (
    <span
      className={className ?? "day-return-bar"}
      title={t("stocks.position.dayChangeTitle", { sign, pct: pct.toFixed(2) })}
      aria-label={t("stocks.position.dayChangeAria", { pct: pct.toFixed(2) })}
    >
      <span className="day-return-bar-track">
        <span
          className={`day-return-bar-fill${up ? " up" : " down"}`}
          style={{ width: `${width}%`, marginLeft: up ? "50%" : `${50 - width}%` }}
        />
      </span>
    </span>
  );
}
