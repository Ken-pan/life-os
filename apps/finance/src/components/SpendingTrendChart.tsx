import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthPoint } from "../engine/transactions";
import { money, moneyCompact } from "../format";

/** 月度花销(柱) + 收入(线) 趋势图。 */
export function SpendingTrendChart({
  series,
  privacy,
}: {
  series: MonthPoint[];
  privacy: boolean;
}) {
  const data = series.map((p) => ({
    month: p.month,
    spending: Math.round(p.spending),
    income: Math.round(p.income),
  }));

  return (
    <div className="spending-chart-wrap">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => m.slice(2)}
            interval="preserveStartEnd"
            minTickGap={28}
            stroke="var(--border-strong)"
          />
          <YAxis
            width={56}
            tickFormatter={(v: number) => (privacy ? "•" : moneyCompact(v))}
            stroke="var(--border-strong)"
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              color: "var(--text)",
            }}
            labelFormatter={(m) => `${m}`}
            formatter={(value, name) => {
              const label = name === "spending" ? "花销" : "收入";
              return [money(Number(value), privacy), label];
            }}
          />
          <Bar
            dataKey="spending"
            fill="var(--accent-dim)"
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
            isAnimationActive={false}
          />
          <Line
            dataKey="income"
            stroke="var(--positive)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
