import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthSnapshot } from "../engine/monthly";
import type { DisplayMode } from "../types";
import { adjustForDisplay, money, moneyCompact, monthOffsetToCalendarLabel } from "../format";
import { accessibleLabel, lockedLabel } from "../copy/terminology";

export interface ForecastSplitChartProps {
  baseline: MonthSnapshot[];
  displayMode: DisplayMode;
  inflation: number;
  horizonMonths: number;
  privacy: boolean;
}

/**
 * 「能动 vs 不能动」长期构成：把基准预测里每个月的可动用资金 (accessible)
 * 与锁定资金 (locked) 堆叠展示，直观看到两者随时间的体量与占比变化。
 */
export function ForecastSplitChart(props: ForecastSplitChartProps) {
  const { baseline, displayMode, inflation, horizonMonths, privacy } = props;
  const months = Math.min(horizonMonths, baseline.length - 1);
  const step = months > 120 ? 3 : 1;

  const data: Array<Record<string, number>> = [];
  for (let m = 0; m <= months; m += step) {
    const adj = (v: number) => adjustForDisplay(v, m, displayMode, inflation);
    data.push({
      m,
      accessible: Math.max(0, adj(baseline[m].accessible)),
      locked: Math.max(0, adj(baseline[m].locked)),
    });
  }
  const ticks = buildXTicks(months, step);

  return (
    <div className="forecast-chart-wrap">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="m"
            ticks={ticks}
            tickFormatter={(m: number) => formatXAxisLabel(m, months)}
            interval={0}
            minTickGap={36}
            stroke="var(--border-strong)"
          />
          <YAxis
            width={56}
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
            labelFormatter={(m) => formatTooltipLabel(Number(m), months)}
            formatter={(value, name) => {
              const label = String(name) === "accessible" ? accessibleLabel() : lockedLabel();
              return [money(Number(value), privacy), label];
            }}
          />
          <Area
            dataKey="accessible"
            stackId="split"
            stroke="var(--baseline-line)"
            strokeWidth={2}
            fill="var(--baseline-line)"
            fillOpacity={0.28}
            isAnimationActive={false}
          />
          <Area
            dataKey="locked"
            stackId="split"
            stroke="var(--text-muted, #888)"
            strokeWidth={2}
            fill="var(--band)"
            fillOpacity={0.5}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildXTicks(months: number, step: number): number[] {
  const stride =
    months <= 12 ? 1 : months <= 24 ? 2 : months <= 60 ? 3 : months <= 120 ? 6 : 12;
  const ticks: number[] = [];
  for (let m = 0; m <= months; m += stride) ticks.push(m - (m % step));
  if (ticks[ticks.length - 1] !== months - (months % step))
    ticks.push(months - (months % step));
  return Array.from(new Set(ticks)).sort((a, b) => a - b);
}

function formatXAxisLabel(m: number, months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = d.getMonth() + 1;
  if (months <= 12) return `${mm}月`;
  if (months <= 36) return `${yy}/${mm}`;
  return `${d.getFullYear()}`;
}

function formatTooltipLabel(m: number, months: number): string {
  const cal = monthOffsetToCalendarLabel(m);
  if (months <= 12) return `${cal}（${m}个月后）`;
  if (months <= 36) return `${cal}（约 ${(m / 12).toFixed(1)} 年后）`;
  return `${cal}（约第 ${Math.round(m / 12)} 年）`;
}
