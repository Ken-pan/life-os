import { S, save, todayKey, daysBetween } from './state.svelte.js';

/* ═══════════════ 体重记录 ═══════════════
 * 存储：S.settings.bodyweight = [{ date:'YYYY-MM-DD', w:<lbs>, ts }]
 *   - w 恒以 lbs 存储（与动作重量一致，displayWeight 负责换算显示）
 *   - 随 settings jsonb 自动云同步；多设备按日期并集合并（见 state.mergeBodyweight）
 */

const KG_PER_LB = 0.4536;

/** 显示单位数值 → 存储用 lbs */
export function bodyweightToStorage(displayVal) {
  const n = Number(displayVal);
  if (!(n > 0)) return null;
  return S.settings.unit === 'kg' ? n / KG_PER_LB : n;
}

/**
 * 存储 lbs → 当前显示单位，保留 0.1 精度。
 * 体重需要比 displayWeight（按 0.5 磅/公斤取整，为配重设计）更细的刻度，
 * 否则 kg 用户输入 80.3 会被显示成 80.5。
 */
export function displayBodyweight(lbs) {
  const v = S.settings.unit === 'kg' ? lbs * KG_PER_LB : lbs;
  return Math.round(v * 10) / 10;
}

/** 全部体重记录（按日期升序） */
export function bodyweightLog() {
  const list = S.settings?.bodyweight;
  return Array.isArray(list) ? list : [];
}

/** 记录某天体重（默认今天）；同一天覆盖。displayVal 为当前显示单位数值 */
export function logBodyweight(displayVal, date = todayKey()) {
  const w = bodyweightToStorage(displayVal);
  if (w == null) return false;
  const rounded = Math.round(w * 10) / 10;
  const next = [
    ...bodyweightLog().filter((e) => e.date !== date),
    { date, w: rounded, ts: new Date().toISOString() }
  ].sort((a, b) => a.date.localeCompare(b.date));
  S.settings.bodyweight = next;
  save();
  return true;
}

/** 删除某天的体重记录 */
export function removeBodyweight(date) {
  S.settings.bodyweight = bodyweightLog().filter((e) => e.date !== date);
  save();
}

/** 最近一条体重记录，无则 null */
export function latestBodyweight() {
  const list = bodyweightLog();
  return list.length ? list[list.length - 1] : null;
}

/** 近 N 天的记录（升序），用于趋势图 */
export function bodyweightSeries(daysBack = 90) {
  const today = todayKey();
  return bodyweightLog().filter((e) => {
    const diff = daysBetween(e.date, today);
    return diff >= 0 && diff < daysBack;
  });
}

/**
 * 近 N 天变化：以窗口内最早一条为基准，对比最近一条。
 * 返回 display 单位的 delta（含正负）与两端记录，数据不足返回 null。
 */
export function bodyweightDelta(daysBack = 30) {
  const series = bodyweightSeries(daysBack + 1);
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const deltaLbs = last.w - first.w;
  // 从原始 lbs 差值直接换算，避免对两端各自取整后相减丢精度
  const deltaDisplay =
    S.settings.unit === 'kg'
      ? Math.round(deltaLbs * KG_PER_LB * 10) / 10
      : Math.round(deltaLbs * 10) / 10;
  return {
    from: first,
    to: last,
    days: daysBetween(first.date, last.date),
    deltaDisplay,
    deltaLbs
  };
}
