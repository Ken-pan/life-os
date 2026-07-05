/**
 * 面额 → dumbbell-kit 片色映射。
 * kit 的六个片色 sprite 直径递减：blue > yellow > black > grey > green > white。
 * LBS 用显式映射：45 蓝 / 35 黄 / 25 黑 / 10 灰；5 与 2.5 为铸铁黑——
 * 复用 green / white 的小直径 sprite 加染色（tint），避免直接用 black sprite
 * 导致小片和 25 一样大。其余面额按全量面额表（allPlatesFor）从大到小对位。
 */
import { allPlatesFor } from '$lib/tools/calculators.js';

/** 片色，按 sprite 直径从大到小 */
const KEYS_BY_SIZE = ['blue', 'yellow', 'black', 'grey', 'green', 'white'];

/** 图例色块用的近似色（与 sprite 观感对应）；iron = 染色后的铸铁黑 */
export const KIT_SWATCH = {
  blue: '#3f6fce',
  yellow: '#d1a13a',
  black: '#3a3d42',
  grey: '#787f88',
  green: '#3a9e63',
  white: '#dfe2e6',
  iron: '#3a3d42'
};

/** 显式面额映射（LBS）；tint 值按底片亮度分别调过，目标观感 ≈ black sprite */
const LB_SPECS = new Map([
  [45, { key: 'blue' }],
  [35, { key: 'yellow' }],
  [25, { key: 'black' }],
  [10, { key: 'grey' }],
  [5, { key: 'green', tint: '#7e838b' }],
  [2.5, { key: 'white', tint: '#4b4f56' }]
]);

/**
 * @param {number} denom
 * @param {'lbs' | 'kg'} unit
 * @returns {{ key: string, tint?: string }}
 */
export function plateSpecFor(denom, unit) {
  if (unit !== 'kg') {
    const hit = LB_SPECS.get(denom);
    if (hit) return hit;
  }
  const denoms = [...allPlatesFor(unit)].sort((a, b) => b - a);
  const i = denoms.indexOf(denom);
  const key = KEYS_BY_SIZE[Math.min(i < 0 ? KEYS_BY_SIZE.length - 1 : i, KEYS_BY_SIZE.length - 1)];
  return { key };
}

/**
 * 凑重结果（每侧面额列表，降序）→ 渲染片规格列表（内→外）。
 * @param {number[]} plates
 * @param {'lbs' | 'kg'} unit
 */
export function plateSpecsFor(plates, unit) {
  return plates.map((p) => plateSpecFor(p, unit));
}

/** 图例/可用片圆点颜色（染色片显示铸铁黑） */
export function plateSwatch(denom, unit) {
  const s = plateSpecFor(denom, unit);
  return s.tint ? KIT_SWATCH.iron : (KIT_SWATCH[s.key] ?? KIT_SWATCH.white);
}
