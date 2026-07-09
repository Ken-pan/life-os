import type { PositionRowView } from "./holdingsPortfolio";

/** 优先使用已构建的历史路径；缺失时回退成本→快照→追踪三点。 */
export function pricePathPoints(row: PositionRowView): number[] {
  if (Array.isArray(row.pricePath) && row.pricePath.length > 1) {
    return compressSeries(row.pricePath, 36);
  }
  const p = row.position;
  const cost = p.averageCostPerShare ?? p.marketPrice * 0.92;
  const snap = p.marketPrice;
  const live = row.livePrice;
  return [cost, snap, live].filter((n) => Number.isFinite(n) && n > 0);
}

export function normalizeSparkline(
  values: number[],
  size: { w?: number; h?: number } = {}
): { min: number; max: number; points: string; w: number; h: number } {
  if (values.length === 0) return { min: 0, max: 0, points: "", w: 0, h: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = size.w ?? 48;
  const h = size.h ?? 18;
  const pad = 2;
  const coords = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return { min, max, points: coords.join(" "), w, h };
}

function compressSeries(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values;
  const out: number[] = [values[0]];
  const middleCount = maxPoints - 2;
  const step = (values.length - 2) / Math.max(middleCount, 1);
  for (let i = 0; i < middleCount; i += 1) {
    const idx = 1 + Math.round(i * step);
    out.push(values[Math.min(values.length - 2, idx)]);
  }
  out.push(values[values.length - 1]);
  return out;
}
