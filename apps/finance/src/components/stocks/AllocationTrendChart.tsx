import type { AllocationTrendPoint } from "../../engine/holdingsPortfolio";
import type { PortfolioAllocationTarget } from "../../types";
import { useLocale } from "../../i18n/context";

const CHART_W = 560;
const CHART_H = 150;
const PAD_L = 34;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 22;

function xAt(index: number, count: number): number {
  if (count <= 1) return PAD_L;
  return PAD_L + ((CHART_W - PAD_L - PAD_R) * index) / (count - 1);
}

function yAt(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return PAD_T + (CHART_H - PAD_T - PAD_B) * (1 - clamped / 100);
}

function linePath(points: AllocationTrendPoint[], pick: (p: AllocationTrendPoint) => number): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i, points.length).toFixed(1)},${yAt(pick(p)).toFixed(1)}`)
    .join(" ");
}

function hasNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 配置趋势：个股占比与前三集中度随快照时间的变化。
 * 快照通常间隔不均，x 轴按序号等距展示并标注日期，不做时间缩放。
 */
export function AllocationTrendChart({
  points,
  target,
}: {
  points: AllocationTrendPoint[];
  target?: PortfolioAllocationTarget;
}) {
  const { t } = useLocale();

  if (points.length < 2) {
    return <p className="muted-note">{t("stocks.allocationTrend.empty")}</p>;
  }

  const gridLines = [0, 25, 50, 75, 100];
  const latest = points[points.length - 1];
  const first = points[0];
  const stockDelta = latest.stockPct - first.stockPct;
  const top3Delta = latest.top3Pct - first.top3Pct;
  const fmtDelta = (d: number) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
  const threshold = target?.driftThresholdPct ?? 5;
  const stockTarget = hasNumber(target?.stockPct) ? target.stockPct : null;
  const top3Target = hasNumber(target?.top3MaxPct) ? target.top3MaxPct : null;
  const hasStockTarget = stockTarget != null;
  const hasTop3Target = top3Target != null;
  const stockBandTop = hasStockTarget ? Math.min(100, stockTarget + threshold) : null;
  const stockBandBottom = hasStockTarget ? Math.max(0, stockTarget - threshold) : null;
  const targetSummary = [
    hasStockTarget
      ? t("stocks.allocationTrend.stockTarget", { pct: stockTarget.toFixed(0) })
      : null,
    hasTop3Target
      ? t("stocks.allocationTrend.top3Cap", { pct: top3Target.toFixed(0) })
      : null,
  ]
    .filter(Boolean)
    .join(t("stocks.allocationTrend.targetSummarySeparator"));

  return (
    <div className="allocation-trend">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="allocation-trend-svg"
        role="img"
        aria-label={t("stocks.allocationTrend.ariaLabel", {
          startStock: first.stockPct.toFixed(0),
          endStock: latest.stockPct.toFixed(0),
          startTop3: first.top3Pct.toFixed(0),
          endTop3: latest.top3Pct.toFixed(0),
          targetSummary: targetSummary ? `，${targetSummary}` : "",
        })}
      >
        {hasStockTarget && stockBandTop != null && stockBandBottom != null && (
          <g>
            <rect
              x={PAD_L}
              y={yAt(stockBandTop)}
              width={CHART_W - PAD_L - PAD_R}
              height={Math.max(1, yAt(stockBandBottom) - yAt(stockBandTop))}
              className="allocation-trend-target-band"
            />
            <line
              x1={PAD_L}
              x2={CHART_W - PAD_R}
              y1={yAt(stockTarget)}
              y2={yAt(stockTarget)}
              className="allocation-trend-target-line is-stock-target"
            />
          </g>
        )}
        {hasTop3Target && (
          <line
            x1={PAD_L}
            x2={CHART_W - PAD_R}
            y1={yAt(top3Target)}
            y2={yAt(top3Target)}
            className="allocation-trend-target-line is-top3-target"
          />
        )}
        {gridLines.map((pct) => (
          <g key={pct}>
            <line
              x1={PAD_L}
              x2={CHART_W - PAD_R}
              y1={yAt(pct)}
              y2={yAt(pct)}
              className="allocation-trend-grid"
            />
            <text x={PAD_L - 6} y={yAt(pct) + 3} className="allocation-trend-axis" textAnchor="end">
              {pct}
            </text>
          </g>
        ))}
        <path d={linePath(points, (p) => p.stockPct)} className="allocation-trend-line is-stock" />
        <path d={linePath(points, (p) => p.top3Pct)} className="allocation-trend-line is-top3" />
        {points.map((p, i) => (
          <g key={p.snapshotId}>
            <circle cx={xAt(i, points.length)} cy={yAt(p.stockPct)} r={3} className="allocation-trend-dot is-stock" />
            <circle cx={xAt(i, points.length)} cy={yAt(p.top3Pct)} r={3} className="allocation-trend-dot is-top3" />
            <text
              x={xAt(i, points.length)}
              y={CHART_H - 6}
              className="allocation-trend-axis"
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            >
              {p.dateLabel}
            </text>
          </g>
        ))}
      </svg>
      <div className="allocation-trend-legend">
        <span className="allocation-trend-key is-stock">
          {t("stocks.allocationTrend.legendStock", {
            pct: latest.stockPct.toFixed(0),
            delta: fmtDelta(stockDelta),
          })}
        </span>
        <span className="allocation-trend-key is-top3">
          {t("stocks.allocationTrend.legendTop3", {
            pct: latest.top3Pct.toFixed(0),
            delta: fmtDelta(top3Delta),
          })}
        </span>
        {hasStockTarget && (
          <span className="allocation-trend-key is-stock-target">
            {t("stocks.allocationTrend.legendStockTarget", {
              pct: stockTarget.toFixed(0),
              threshold: threshold.toFixed(0),
            })}
          </span>
        )}
        {hasTop3Target && (
          <span className="allocation-trend-key is-top3-target">
            {t("stocks.allocationTrend.legendTop3Cap", { pct: top3Target.toFixed(0) })}
          </span>
        )}
      </div>
    </div>
  );
}
