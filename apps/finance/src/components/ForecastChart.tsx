import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthSnapshot } from "../engine/monthly";
import type { DisplayMode, Goal } from "../types";
import { adjustForDisplay, moneyCompact, money, monthOffsetToCalendarLabel } from "../format";
import type { GoalMetricValue } from "../engine/metrics";
import { useLocale } from "../i18n/context";
import { intlLocale } from "../i18n/formatLocale";

export interface ForecastChartProps {
  baseline: MonthSnapshot[];
  low: MonthSnapshot[];
  high: MonthSnapshot[];
  sim?: MonthSnapshot[];
  read: GoalMetricValue;
  displayMode: DisplayMode;
  inflation: number;
  horizonMonths: number;
  privacy: boolean;
  goals?: Goal[];
}

export function ForecastChart(props: ForecastChartProps) {
  const { t, locale } = useLocale();
  const intlLoc = intlLocale(locale);
  const { baseline, low, high, sim, read, displayMode, inflation, horizonMonths, privacy } =
    props;
  const months = Math.min(horizonMonths, baseline.length - 1);
  const step = months > 120 ? 3 : 1; // 长周期降采样

  const data: Array<Record<string, number>> = [];
  for (let m = 0; m <= months; m += step) {
    const adj = (v: number) => adjustForDisplay(v, m, displayMode, inflation);
    const lo = adj(read(low[m]));
    const hi = adj(read(high[m]));
    const point: Record<string, number> = {
      m,
      baseline: adj(read(baseline[m])),
      low: lo,
      range: Math.max(0, hi - lo),
    };
    if (sim) point.sim = adj(read(sim[m]));
    data.push(point);
  }
  const ticks = buildXTicks(months, step);
  const yDomain = buildYDomain(data);

  return (
    <div className="forecast-chart-wrap">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="m"
            ticks={ticks}
            tickFormatter={(m: number) => formatXAxisLabel(m, months, intlLoc, t)}
            interval={0}
            minTickGap={36}
            stroke="var(--border-strong)"
          />
          <YAxis
            width={56}
            domain={yDomain}
            allowDataOverflow
            tickFormatter={(v: number) => (privacy ? "•" : moneyCompact(v))}
            stroke="var(--border-strong)"
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              boxShadow: "var(--shadow-elevated)",
              color: "var(--text)",
            }}
            labelFormatter={(m) => formatTooltipLabel(Number(m), months, t)}
            formatter={(value, name) => {
              const key = String(name);
              const label =
                key === "baseline"
                  ? t("forecastChart.baseline")
                  : key === "sim"
                    ? t("forecastChart.sim")
                    : key === "range"
                      ? t("forecastChart.rangeHigh")
                      : key === "low"
                        ? t("forecastChart.conservative")
                        : key;
              return [money(Number(value), privacy), label];
            }}
          />
          <Area
            dataKey="low"
            stackId="band"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            dataKey="range"
            stackId="band"
            stroke="none"
            fill="var(--band)"
            isAnimationActive={false}
          />
          <Line
            dataKey="baseline"
            stroke="var(--baseline-line)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          {sim && (
            <Line
              dataKey="sim"
              stroke="var(--sim-line)"
              strokeWidth={2.5}
              strokeDasharray="6 5"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildXTicks(months: number, step: number): number[] {
  const stride = months <= 12 ? 1 : months <= 24 ? 2 : months <= 60 ? 3 : months <= 120 ? 6 : 12;
  const ticks: number[] = [];
  for (let m = 0; m <= months; m += stride) ticks.push(m - (m % step));
  if (ticks[ticks.length - 1] !== months - (months % step)) ticks.push(months - (months % step));
  return Array.from(new Set(ticks)).sort((a, b) => a - b);
}

function formatXAxisLabel(
  m: number,
  months: number,
  intlLoc: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = d.getMonth() + 1;
  if (months <= 12) {
    if (intlLoc.startsWith("zh")) return t("forecastChart.monthShort", { month: String(mm) });
    return d.toLocaleDateString(intlLoc, { month: "short" });
  }
  if (months <= 36) return `${yy}/${mm}`;
  return `${d.getFullYear()}`;
}

function formatTooltipLabel(
  m: number,
  months: number,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const cal = monthOffsetToCalendarLabel(m);
  if (months <= 12) return t("forecastChart.tooltipMonthsLater", { cal, months: String(m) });
  if (months <= 36)
    return t("forecastChart.tooltipYearsApprox", { cal, years: (m / 12).toFixed(1) });
  return t("forecastChart.tooltipYearN", { cal, year: String(Math.round(m / 12)) });
}

function buildYDomain(data: Array<Record<string, number>>): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of data) {
    for (const key of ["baseline", "low", "sim"]) {
      const v = p[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const hi = typeof p.low === "number" && typeof p.range === "number" ? p.low + p.range : undefined;
    if (typeof hi === "number" && Number.isFinite(hi)) max = Math.max(max, hi);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const span = Math.max(1, max - min);
  const pad = span * 0.12;
  let lower = min - pad;
  let upper = max + pad;

  // 数据全为正时，避免为了“好看”把下沿压到 0。
  if (min > 0 && lower <= 0) {
    lower = min * 0.88;
  }
  // 数据全为负时，避免上沿被抬到 0。
  if (max < 0 && upper >= 0) {
    upper = max * 0.88;
  }
  // 极小跨度兜底，防止刻度拥挤。
  if (Math.abs(upper - lower) < 1) {
    upper = lower + 1;
  }
  return [lower, upper];
}
