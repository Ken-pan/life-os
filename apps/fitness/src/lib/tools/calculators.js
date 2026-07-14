/** @typedef {'strength' | 'hypertrophy' | 'endurance'} Intensity */

import { EX_BY_ID, resolveExerciseId } from '../data/exercises.js';
import { t } from '../i18n/index.js';

export const PLATES_LBS = [45, 35, 25, 10, 5, 2.5];
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_BAR_LBS = 45;
export const DEFAULT_BAR_KG = 20;
export const DEFAULT_COLLAR_LBS = 5;
export const DEFAULT_COLLAR_KG = 2.5;
export const PLATE_PRESETS = {
  lbs: [135, 185, 225, 275, 315],
  kg: [60, 80, 100, 120, 140]
};
export const QUICK_STEPS = {
  lbs: [-10, -5, 5, 10],
  kg: [-5, -2.5, 2.5, 5]
};

/** @param {'lbs' | 'kg'} unit */
export function allPlatesFor(unit) {
  return unit === 'kg' ? PLATES_KG : PLATES_LBS;
}

/** @param {'lbs' | 'kg'} unit @param {Record<number, boolean> | undefined} inv */
export function activePlatesFor(unit, inv) {
  const all = allPlatesFor(unit);
  if (!inv) return all;
  return all.filter((p) => inv[p] !== false);
}

/** @param {number[]} plates one side / single end */
export function plateSideSummary(plates) {
  const map = new Map();
  plates.forEach((p) => map.set(p, (map.get(p) || 0) + 1));
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([p, n]) => (n === 1 ? String(p) : `${n}×${p}`))
    .join(' + ');
}

/** 展开每侧装片，如 `45 + 45`（Focus 一眼视图用） */
export function plateSideExpanded(plates) {
  if (!plates?.length) return '';
  return [...plates].sort((a, b) => b - a).join(' + ');
}

/**
 * One-line collapsed summary, e.g. `225 LBS → 每侧 2×45`
 * @param {number} total
 * @param {number[]} plates
 * @param {1 | 2} [sides]
 * @param {'lbs' | 'kg'} [unit]
 */
export function plateCollapsedLine(total, plates, sides = 2, unit = 'lbs') {
  if (!total || !plates?.length) return null;
  const side = sides === 2 ? t('calc.perSide') : t('calc.singleSide');
  return t('calc.collapsedLine', {
    total,
    unit: unit.toUpperCase(),
    side,
    summary: plateSideSummary(plates)
  });
}

/**
 * 围绕当前重量生成快捷 preset（如 185 / 205 / 225 / 245）。
 * @param {number} value
 * @param {'lbs' | 'kg'} [unit]
 * @param {number} [count]
 */
export function platePresetsAround(value, unit = 'lbs', count = 4) {
  const step = unit === 'kg' ? 10 : 20;
  const snapStep = unit === 'kg' ? 2.5 : 5;
  const v = Number(value) || 0;
  const center = v > 0 ? Math.round(v / snapStep) * snapStep : unit === 'kg' ? 60 : 225;
  const half = Math.floor(count / 2);
  const presets = [];
  for (let i = -half; i < count - half; i++) {
    const p = Math.round((center + i * step) * 100) / 100;
    if (p > 0) presets.push(p);
  }
  return [...new Set(presets)].sort((a, b) => a - b);
}

/**
 * 器械设置一行摘要，如 `45 lb 杠 · 无卡箍 · 可用片 45/35/25/10/5/2.5`
 * @param {{ bar: number, unit: 'lbs' | 'kg', collar: number, denoms: number[], sides?: 1 | 2 }} cfg
 */
export function plateSettingsSummary({ bar, unit, collar, denoms, sides = 2 }) {
  const u = unit === 'kg' ? 'kg' : 'lb';
  const barPart =
    sides === 1 || Number(bar) === 0
      ? t('calc.platesOnlyPart')
      : t('calc.barPart', { n: Number(bar), u });
  const collarPart = collar > 0 ? t('calc.collarPart', { n: collar }) : t('calc.noCollar');
  const platesPart = t('calc.availablePlates', { list: denoms.join('/') });
  return t('calc.settingsSummary', { barPart, collarPart, platesPart });
}

/**
 * 装片公式一行，如 `225 = 45 杠 + (45 + 45) × 2`
 * @param {number} total
 * @param {number} bar
 * @param {number[]} plates
 * @param {{ sides?: 1 | 2, collar?: number, unit?: 'lbs' | 'kg' }} [opts]
 */
export function plateFormulaLine(total, bar, plates, opts = {}) {
  const sides = opts.sides ?? 2;
  const collar = Number(opts.collar) || 0;
  const sideLabel = sides === 2 ? t('calc.perSide') : t('calc.singleSide');
  const summary = plateSideSummary(plates);
  const expanded = plateSideExpanded(plates);
  if (!summary) return null;
  const barPart = sides === 1 || Number(bar) === 0 ? '' : `${Number(bar)} ${t('calc.barWord')}`;
  const collarPart = collar > 0 ? `${collar} ${t('calc.collarWord')}` : '';
  const base = [barPart, collarPart].filter(Boolean).join(' + ');
  const sideExpr =
    sides === 2
      ? t('calc.sideExprDual', { expanded })
      : t('calc.sideExprSingle', { side: sideLabel, summary });
  if (base) return t('calc.formulaWithBar', { total, base, sideExpr });
  return t('calc.formulaNoBar', { total, sideExpr });
}

/* ═══════════════ 器械类型 → 重量语义 ═══════════════
   equip 决定：重量怎么理解（每只 / 总重 / 装片）、加重步进、能否凑片。
   目录 exercises.js 为每个动作显式标注 equip；未标注时按名称推断。 */

/** @typedef {'barbell'|'ezbar'|'smith'|'plateloaded'|'dumbbell'|'single'|'machine'|'cable'|'plate'|'bodyweight'} EquipType */

/** @param {EquipType} equip */
export function equipLabel(equip) {
  if (!equip || !EQUIP_INFO[equip]) return '';
  return t(`calc.equip.${equip}.label`);
}

/** @param {EquipType} equip */
export function equipHint(equip) {
  if (!equip || !EQUIP_INFO[equip]) return '';
  return t(`calc.equip.${equip}.hint`);
}

/**
 * step: 建议加重步进（LBS，dumbbell 为每只）
 * plates: 可凑片配置（sides=装片侧数；landmine/T 杠单端装片）
 * hint: 重量语义说明（重量输入 UI 展示）
 * @type {Record<EquipType, { label: string, step: number, hint: string, plates?: { sides: 1 | 2, barLbs: number, barKg: number } }>}
 */
export const EQUIP_INFO = {
  barbell: { label: '杠铃', step: 5, hint: '总重 · 含杆', plates: { sides: 2, barLbs: 45, barKg: 20 } },
  ezbar: { label: 'EZ 杠', step: 5, hint: '总重 · 含杆', plates: { sides: 2, barLbs: 25, barKg: 10 } },
  smith: { label: '史密斯', step: 5, hint: '装片总重 · 杆重可调', plates: { sides: 2, barLbs: 25, barKg: 10 } },
  plateloaded: { label: '单端装片', step: 5, hint: '装片总重 · 不含杆', plates: { sides: 1, barLbs: 0, barKg: 0 } },
  dumbbell: { label: '哑铃', step: 2.5, hint: '单只重量（每侧）' },
  single: { label: '单铃', step: 2.5, hint: '单只总重' },
  machine: { label: '器械', step: 5, hint: '配重片总重' },
  cable: { label: '绳索', step: 5, hint: '配重片总重' },
  plate: { label: '负重片', step: 5, hint: '手持负重总重' },
  bodyweight: { label: '自重', step: 5, hint: '附加负重（0 = 纯自重）' }
};

/** 兜底：无 equip 标注的旧数据 / 自定义动作按名称推断 */
function inferEquip(ex) {
  const catalog = ex?.id ? EX_BY_ID[resolveExerciseId(ex.id)] : null;
  const name = catalog?.name || ex.name || '';
  if (ex.unit && /侧/.test(ex.unit)) return 'dumbbell';
  if (/哑铃|dumbbell/i.test(name)) return 'dumbbell';
  if (/史密斯|smith/i.test(name)) return 'smith';
  if (/EZ\s*杠/i.test(name)) return 'ezbar';
  if (/地雷管|T\s*杠|landmine/i.test(name)) return 'plateloaded';
  if (/绳索|龙门架|cable|下拉|面拉/i.test(name)) return 'cable';
  if (/器械|machine|蝴蝶|倒蹬|腿屈伸|腿弯举|夹胸器|推胸器/i.test(name)) return 'machine';
  if (/自重|俯卧撑|引体|平板支撑|双杠|山羊挺身|俄罗斯转体/i.test(name + (ex.sub || ''))) return 'bodyweight';
  if (/杠铃|barbell|硬拉|深蹲|卧推|前蹲|早安|窄握|海豹|潘德雷|耸肩|直立划船|负重臀桥|过头推举/i.test(name)) {
    return 'barbell';
  }
  return null;
}

/**
 * @param {{ equip?: string, id?: string, name?: string, unit?: string, sub?: string } | null | undefined} ex
 * @returns {EquipType | null}
 */
export function equipType(ex) {
  if (!ex) return null;
  if (ex.equip && EQUIP_INFO[ex.equip]) return /** @type {EquipType} */ (ex.equip);
  return inferEquip(ex);
}

/**
 * 同一动作可切换的加载方式（插片 ↔ 器械配重等）。
 * 仅列出训练中常见、语义明确的互换组合。
 * @type {Record<string, EquipType[]>}
 */
export const EX_EQUIP_VARIANTS = {
  c_bench: ['barbell', 'smith', 'machine'],
  c_smithbench: ['barbell', 'smith', 'machine'],
  c_machinepress: ['barbell', 'smith', 'machine'],
  c_floorpress: ['barbell', 'smith'],
  c_incbb: ['barbell', 'smith', 'machine'],
  c_incmc: ['barbell', 'smith', 'machine'],
  l_squat: ['barbell', 'smith', 'machine'],
  l_smithsquat: ['barbell', 'smith', 'machine'],
  l_hack: ['barbell', 'smith', 'machine'],
  l_press: ['barbell', 'smith', 'machine'],
  sh_ohp: ['barbell', 'machine'],
  sh_machinepress: ['barbell', 'machine'],
  b_bbrow: ['barbell', 'plateloaded', 'machine'],
  b_seal: ['barbell', 'plateloaded'],
  b_tbar: ['plateloaded', 'barbell'],
  b_meadows: ['plateloaded', 'barbell'],
  b_chestsup: ['machine', 'barbell', 'plateloaded'],
  b_row: ['cable', 'machine', 'barbell'],
  b_cablerow: ['cable', 'machine', 'barbell'],
  l_thrust: ['barbell', 'machine'],
  l_hipthrust_mc: ['barbell', 'machine'],
  c_fly: ['cable', 'machine'],
  c_pecdeck: ['cable', 'machine'],
  c_cablefly: ['cable', 'machine'],
  ar_ezcurl: ['ezbar', 'barbell'],
  ar_skull: ['ezbar', 'barbell']
};

/**
 * @param {{ id?: string } | null | undefined} ex
 * @returns {{ equip: EquipType, label: string, hint: string }[] | null}
 */
export function equipVariantsFor(ex) {
  const id = resolveExerciseId(ex?.id ?? '');
  if (!id) return null;
  const modes = EX_EQUIP_VARIANTS[id];
  if (!modes || modes.length < 2) return null;
  return modes.map((equip) => ({
    equip,
    label: equipLabel(equip),
    hint: equipHint(equip)
  }));
}

/** @param {object} ex @param {EquipType} equip @param {number} weightLbs @param {'lbs'|'kg'} [unit] */
function plateFitsExact(ex, equip, weightLbs, unit = 'lbs') {
  const cfg = plateConfigFor(ex, unit, equip);
  if (!cfg || !(weightLbs > 0)) return false;
  const denoms = unit === 'kg' ? PLATES_KG : PLATES_LBS;
  const r = plateLoading(weightLbs, cfg.defaultBar, { sides: cfg.sides, plates: denoms });
  return !r.error;
}

/**
 * @param {object} ex
 * @param {number} weightLbs 存储单位 LBS
 * @param {EquipType[]} variants
 * @returns {EquipType | null}
 */
function inferEquipFromWeight(ex, weightLbs, variants) {
  const w = Number(weightLbs) || 0;
  if (w <= 0) return null;

  const plateVariants = variants.filter((e) => plateConfigFor(ex, 'lbs', e));
  const nonPlate = variants.filter((e) => !plateConfigFor(ex, 'lbs', e));

  const bbCfg = plateConfigFor(ex, 'lbs', 'barbell');
  if (bbCfg && w < bbCfg.defaultBar && nonPlate.length) {
    return nonPlate.includes('machine') ? 'machine' : nonPlate[0];
  }

  const exact = plateVariants.filter((e) => plateFitsExact(ex, e, w));
  if (exact.length === 1) return exact[0];

  if (nonPlate.includes('machine') && w < 95) return 'machine';
  if (w >= 135 && variants.includes('barbell')) return 'barbell';

  return null;
}

/**
 * 根据用户偏好、杆重记忆与当前重量推荐加载方式。
 * @param {object} ex
 * @param {number} weightLbs 存储单位 LBS
 * @param {{ equipModes?: Record<string, string>, barWeights?: Record<string, { u: string, v: number }> }} [prefs]
 * @returns {{ equip: EquipType | null, reason: 'saved' | 'history' | 'weight' | 'default' }}
 */
export function recommendEquipMode(ex, weightLbs, prefs = {}) {
  const id = resolveExerciseId(ex?.id ?? '');
  const variants = EX_EQUIP_VARIANTS[id];
  const fallback = equipType(ex);
  if (!variants?.length) {
    return { equip: fallback, reason: 'default' };
  }

  const saved = prefs.equipModes?.[id];
  if (saved && variants.includes(/** @type {EquipType} */ (saved))) {
    return { equip: /** @type {EquipType} */ (saved), reason: 'saved' };
  }

  const barWeights = prefs.barWeights || {};
  const historyEquips = variants.filter((e) => {
    if (!plateConfigFor(ex, 'lbs', e)) return false;
    return Boolean(barWeights[`${id}:${e}`]);
  });
  if (historyEquips.length === 1) {
    return { equip: historyEquips[0], reason: 'history' };
  }

  const inferred = inferEquipFromWeight(ex, weightLbs, variants);
  if (inferred) {
    return { equip: inferred, reason: 'weight' };
  }

  if (fallback && variants.includes(fallback)) {
    return { equip: fallback, reason: 'default' };
  }
  return { equip: variants[0], reason: 'default' };
}

/** @param {string} id @param {EquipType} equip */
export function isAllowedEquipMode(id, equip) {
  if (!equip || !EQUIP_INFO[equip]) return false;
  const resolved = resolveExerciseId(id);
  const variants = EX_EQUIP_VARIANTS[resolved];
  if (!variants) return false;
  return variants.includes(equip);
}

/**
 * @param {object | null | undefined} ex
 * @param {EquipType | null | undefined} [equipOverride]
 * @returns {EquipType | null}
 */
export function effectiveEquipType(ex, equipOverride) {
  if (!ex) return null;
  if (equipOverride && EQUIP_INFO[equipOverride]) return equipOverride;
  return equipType(ex);
}

/**
 * 可凑片配置；null = 该动作不适用杠铃片计算。
 * @param {object | null | undefined} ex
 * @param {'lbs' | 'kg'} [unit]
 * @param {EquipType | null | undefined} [equipOverride]
 */
export function plateConfigFor(ex, unit = 'lbs', equipOverride) {
  const equip = effectiveEquipType(ex, equipOverride);
  const p = equip && EQUIP_INFO[equip].plates;
  if (!p) return null;
  const kg = unit === 'kg';
  const defaultBar = kg ? p.barKg : p.barLbs;
  const barOptions =
    p.sides === 1
      ? [0]
      : kg
        ? [20, 15, 10, 0]
        : [45, 35, 25, 15, 0];
  return { equip, sides: p.sides, defaultBar, barOptions, plates: kg ? PLATES_KG : PLATES_LBS };
}

/** 是否适用杠铃片凑重（含 EZ 杠 / 史密斯 / 单端装片） */
export function isBarbellExercise(ex, equipOverride) {
  return plateConfigFor(ex, 'lbs', equipOverride) != null;
}

function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

/**
 * @param {number} weight lbs
 * @param {number} reps
 * @param {number} [rir=0]
 */
export function estimate1RM(weight, reps, rir = 0) {
  const w = Number(weight);
  const r = Number(reps) + Number(rir);
  if (!w || !r || r < 1 || r > 15) return null;
  const epley = w * (1 + r / 30);
  const brzycki = w * (36 / (37 - r));
  return {
    epley: roundHalf(epley),
    brzycki: roundHalf(brzycki),
    avg: roundHalf((epley + brzycki) / 2)
  };
}

/**
 * 热身坡道：从（接近）空杆逐级升到工作重量，减少健身房心算。
 * 方案 40% × 8 → 60% × 5 → 80% × 3（经典 ramp），四舍五入到可加载增量。
 * 低于杆重的档并到空杆；等于/超过工作重量的档丢弃；相邻重复档去重。
 * @param {number} workWeight 工作组总重（与 unit 一致）
 * @param {number} barWeight 杆重（同单位）
 * @param {{ unit?: 'lbs' | 'kg' }} [opts]
 * @returns {{ pct: number, weight: number, reps: number }[]}
 */
export function warmupRamp(workWeight, barWeight = DEFAULT_BAR_LBS, opts = {}) {
  const w = Number(workWeight);
  const bar = Number(barWeight) || 0;
  const inc = opts.unit === 'kg' ? 2.5 : 5; // 最小可加载总增量(每侧最小片×2)
  // 工作重量至少要比杆重高出两级增量，否则没有热身空间
  if (!(w > bar + inc * 2)) return [];
  const scheme = [
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.8, reps: 3 }
  ];
  const steps = [];
  let prev = null;
  for (const s of scheme) {
    let weight = Math.round((w * s.pct) / inc) * inc;
    if (weight < bar) weight = bar;
    if (weight >= w) continue;
    if (weight === prev) continue;
    steps.push({ pct: Math.round(s.pct * 100), weight, reps: s.reps });
    prev = weight;
  }
  return steps;
}

/**
 * 目标重量 → 每侧杠铃片组合（贪心）。
 * @param {number} targetWeight 总重（与 plates 同单位）
 * @param {number} [barWeight]
 * @param {{ sides?: 1 | 2, plates?: number[] }} [opts] sides=1 表示单端装片（地雷管/T 杠）
 */
export function plateLoading(targetWeight, barWeight = DEFAULT_BAR_LBS, opts = {}) {
  const sides = opts.sides ?? 2;
  const denoms = opts.plates ?? PLATES_LBS;
  const collar = Number(opts.collar) || 0;
  const target = Number(targetWeight);
  const bar = (Number(barWeight) || 0) + collar;
  if (!target || target <= bar) {
    return {
      error: bar > 0 ? t('calc.targetAboveBar') : t('calc.enterTarget'),
      plates: [],
      verify: null
    };
  }
  let perSide = (target - bar) / sides;
  const plates = [];
  for (const p of denoms) {
    while (perSide >= p - 0.01) {
      plates.push(p);
      perSide = Math.round((perSide - p) * 100) / 100;
    }
  }
  if (perSide > 0.01) {
    return {
      error: t('calc.shortBy', {
        rem: perSide,
        perSide: sides === 2 ? t('calc.perSideSuffix') : ''
      }),
      plates,
      verify: null
    };
  }
  const verify = bar + plates.reduce((a, p) => a + p, 0) * sides;
  return { error: null, plates, verify };
}

/**
 * 无法精确凑齐时，推荐最近下沿 / 上沿可凑重量。
 * @param {number} targetWeight
 * @param {number} [barWeight]
 * @param {{ sides?: 1 | 2, plates?: number[], collar?: number }} [opts]
 */
export function plateLoadingNearest(targetWeight, barWeight = DEFAULT_BAR_LBS, opts = {}) {
  const sides = opts.sides ?? 2;
  const denoms = opts.plates ?? PLATES_LBS;
  const collar = Number(opts.collar) || 0;
  const bar = (Number(barWeight) || 0) + collar;
  const target = Number(targetWeight);
  if (!target || target <= bar) return { under: null, over: null, exact: false };

  const current = plateLoading(target, barWeight, { sides, plates: denoms, collar });
  if (!current.error && current.verify != null) {
    return { under: current.verify, over: current.verify, exact: true };
  }

  const under = platesTotal(current.plates, bar, sides);
  const minInc = Math.min(...denoms) * sides;
  let over = null;
  for (let w = under + minInc; w <= under + minInc * 48; w = Math.round((w + minInc) * 100) / 100) {
    const r = plateLoading(w, barWeight, { sides, plates: denoms, collar });
    if (!r.error && r.verify != null && r.verify >= target - 0.01) {
      over = r.verify;
      break;
    }
  }
  return { under: under > bar ? under : null, over, exact: false };
}

/** 反向：由已装片算总重。plates 为单侧（或单端）片列表。 */
export function platesTotal(plates, barWeight = 0, sides = 2) {
  const sum = (plates || []).reduce((a, p) => a + (Number(p) || 0), 0);
  return Math.round(((Number(barWeight) || 0) + sum * sides) * 100) / 100;
}

/** @param {number[]} plates one side */
export function plateSummary(plates) {
  const map = new Map();
  plates.forEach((p) => map.set(p, (map.get(p) || 0) + 1));
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([p, n]) => `${p}×${n}`)
    .join(' + ');
}

/** Compact one-line summary for tight UI, e.g. `10 + 5 + 2.5 /侧` */
export function plateSummaryCompact(plates) {
  const map = new Map();
  plates.forEach((p) => map.set(p, (map.get(p) || 0) + 1));
  const parts = [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([p, n]) => (n === 1 ? String(p) : `${p}×${n}`));
  return `${parts.join(' + ')}${t('calc.perSideSuffix')}`;
}

/** @param {string | undefined} repsTarget e.g. "6–8" */
export function intensityFromReps(repsTarget) {
  const nums = String(repsTarget || '').match(/\d+/g);
  if (!nums?.length) return /** @type {Intensity} */ ('hypertrophy');
  const min = Number(nums[0]);
  if (min <= 5) return 'strength';
  if (min <= 12) return 'hypertrophy';
  return 'endurance';
}

/** @param {Intensity} intensity */
export function restSuggestion(intensity) {
  const map = {
    strength: {
      sec: 180,
      label: t('calc.restStrength'),
      range: t('calc.restStrengthRange')
    },
    hypertrophy: {
      sec: 90,
      label: t('calc.restHypertrophy'),
      range: t('calc.restHypertrophyRange')
    },
    endurance: {
      sec: 45,
      label: t('calc.restEndurance'),
      range: t('calc.restEnduranceRange')
    }
  };
  return map[intensity] ?? map.hypertrophy;
}

/**
 * @param {number} sets
 * @param {number} reps
 * @param {number} [weight]
 */
export function volumeTotal(sets, reps, weight) {
  const s = Number(sets);
  const r = Number(reps);
  const w = Number(weight);
  if (!s || !r) return null;
  return { reps: s * r, volume: w ? Math.round(s * r * w) : null };
}

/**
 * @param {number} kg
 * @param {number} cm
 */
export function calcBMI(kg, cm) {
  const k = Number(kg);
  const h = Number(cm);
  if (!k || !h) return null;
  const m = h / 100;
  const bmi = k / (m * m);
  let label = '';
  if (bmi < 18.5) label = t('calc.bmiUnder');
  else if (bmi < 24) label = t('calc.bmiNormal');
  else if (bmi < 28) label = t('calc.bmiOver');
  else label = t('calc.bmiObese');
  return { bmi: Math.round(bmi * 10) / 10, label };
}
