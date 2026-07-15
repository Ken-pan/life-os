import { exWeight, exUnit, displayWeight, todayKey, daysBetween, sessionStats, exEquipMode } from './state.svelte.js';
import { deloadAdvice } from './phase.js';
import { parseRepsTarget, parseTimedTarget, recentSessionsForEx, getExLog, sessionKey, getSessionExercises } from './session.js';
import { estimate1RM, equipType, EQUIP_INFO } from './tools/calculators.js';
import { S } from './state.svelte.js';
import { effectiveDone } from './logs.js';
import { findExercise, getDay } from './programRuntime.js';
import { t } from './i18n/index.js';

export function weightDelta(ex) {
  const type = exEquipMode(ex) ?? equipType(ex);
  if (type && EQUIP_INFO[type]) return EQUIP_INFO[type].step;
  if (ex.unit && /侧/.test(ex.unit)) return 2.5;
  return 5;
}

export function progressionEligible(ex) {
  if (!ex) return false;
  if (parseTimedTarget(ex.reps)) return false;
  if (ex.scheme && ex.scheme !== 'straight') return false;
  return true;
}

export function formatProgressionWeight(ex, advice) {
  if (!ex || !advice?.suggestedWeight) return null;
  const unit = exUnit(ex);
  const weight = displayWeight(advice.suggestedWeight);
  const delta = advice.delta ? displayWeight(advice.delta) : null;
  return { weight, delta, unit };
}

export function formatProgressionLine(ex, advice) {
  const f = formatProgressionWeight(ex, advice);
  if (!f) return '';
  if (advice.action === 'increase' && f.delta != null) {
    return t('progression.lineIncrease', {
      name: ex.name,
      weight: f.weight,
      delta: f.delta,
      unit: f.unit
    });
  }
  if (advice.action === 'decrease') {
    return t('progression.lineDecrease', {
      name: ex.name,
      weight: f.weight,
      unit: f.unit
    });
  }
  return '';
}

const ACTIONABLE_HOLD_KEYS = new Set(['gapHoldLong', 'gapHoldShort', 'lastFailed', 'lastGrinding', 'e1rmCap']);

export function isActionableHoldAdvice(advice) {
  if (!advice || advice.action !== 'hold' || advice.eligible === false) return false;
  if (advice.reasonKey) return ACTIONABLE_HOLD_KEYS.has(advice.reasonKey);
  return false;
}

function assessSession(ex, log) {
  const { min, max } = parseRepsTarget(ex.reps);
  const planned = ex.sets;
  const recorded = (log.sets || []).filter((s) => s && s.reps != null);
  if (!recorded.length) return null;

  const doneSets = effectiveDone(log, planned);
  const complete = recorded.length >= planned || doneSets >= planned;
  if (!complete) return null;

  const reps = recorded.map((s) => s.reps);
  const rirs = recorded.map((s) => s.rir).filter((r) => r != null);
  const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;

  return {
    complete,
    metMin: reps.every((r) => r >= min),
    topped: reps.every((r) => r >= max),
    failed: reps.some((r) => r < min),
    grinding: avgRir != null && avgRir < 1,
    avgRir,
    setCount: recorded.length
  };
}

/**
 * 建议重量必须落在该动作自己的步进格上（与 +/- 按钮、加重建议同一格）。
 * 降重走百分比（×0.9 / ×0.93）会算出任意小数，按 2.5 取整会给出杠铃根本装不出的
 * 总重 —— 双边杠铃最小片 2.5 → 总重每格 5，167.5 意味着每侧 61.25，没有 1.25 的片。
 */
function roundLoad(w, inc = 2.5) {
  const step = Number(inc) > 0 ? Number(inc) : 2.5;
  return Math.max(0, Math.round((Math.round(w / step) * step) * 100) / 100);
}

/**
 * 减载基准 = 近期实际练过的最重 与 当前工作重量 取大者。
 *
 * 不能只用当前工作重量：采纳减载后它就变成减载后的重量，下次打开弹窗又按它再减
 * 10%（200 → 180 → 160 → 145…），一路滚下去。锚到练过的最重就幂等了 —— 采纳后
 * 建议值不变，而 `suggested < cur` 不再成立，横幅自然消失。
 *
 * 窗口(8)比评估窗口(4)宽是故意的：减载周里练的那几场记的都是减载后的重量，窗口
 * 太窄会让基准跟着掉下去，减载就又触发一轮 —— 雪球换个地方接着滚。
 */
const DELOAD_BASELINE_SESSIONS = 8;

function deloadBaseline(ex, exId) {
  const top = recentSessionsForEx(exId, DELOAD_BASELINE_SESSIONS).reduce((m, s) => {
    const sets = (s.log?.sets || []).filter(Boolean);
    return sets.reduce((n, x) => Math.max(n, Number(x.weight) || 0), m);
  }, 0);
  return Math.max(exWeight(ex) || 0, top);
}

export function progressionAdvice(exId) {
  const ex = findEx(exId);
  if (!ex) {
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.unknownEx'),
      reasonKey: 'unknownEx',
      eligible: false
    };
  }

  if (!progressionEligible(ex)) {
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.notEligible'),
      reasonKey: 'notEligible',
      eligible: false
    };
  }

  const recent = recentSessionsForEx(exId, 4);
  const assessed = recent
    .map((s) => ({ ...s, a: assessSession(s.ex, s.log) }))
    .filter((s) => s.a);

  if (!assessed.length) {
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.noData'),
      reasonKey: 'noData',
      confidence: 'low',
      eligible: true
    };
  }

  if (daysBetween(assessed[0].date, todayKey()) > 21) {
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.longGap'),
      reasonKey: 'longGap',
      eligible: true
    };
  }

  if (deloadAdvice().shouldDeload) {
    const cur = exWeight(ex);
    const suggested = roundLoad(deloadBaseline(ex, exId) * 0.9, weightDelta(ex));
    if (cur > 0 && suggested < cur) {
      return {
        action: 'decrease',
        delta: suggested - cur,
        reason: t('progression.deloadDecrease'),
        reasonKey: 'deloadDecrease',
        suggestedWeight: suggested,
        decreaseCause: 'deload',
        eligible: true
      };
    }
    // 已经减到位：减载期内不能往下走(滚雪球)，也不能往上劝(刚采纳完减载就被推着
    // 加回去，等于把减载抵消掉)。停在这里，等用户点「我已减载完成」。
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.deloadHold'),
      reasonKey: 'deloadHold',
      eligible: true
    };
  }

  const { daysSince } = sessionStats();
  if (daysSince != null && daysSince >= 4) {
    const reasonKey = daysSince >= 7 ? 'gapHoldLong' : 'gapHoldShort';
    return {
      action: 'hold',
      delta: 0,
      reason: t(`progression.${reasonKey}`),
      reasonKey,
      eligible: true
    };
  }

  const last = assessed[0].a;
  const { max } = parseRepsTarget(ex.reps);

  if (last.topped && (last.avgRir == null || last.avgRir >= 1)) {
    const delta = weightDelta(ex);
    return {
      action: 'increase',
      delta,
      reason: t('progression.toppedIncrease', { max, delta: fmtDelta(ex, delta) }),
      reasonKey: 'toppedIncrease',
      suggestedWeight: exWeight(ex) + delta,
      eligible: true
    };
  }

  if (assessed.length >= 2) {
    const [a1, a2] = [assessed[0].a, assessed[1].a];

    const bothSolid =
      a1.metMin &&
      a2.metMin &&
      !a1.grinding &&
      !a2.grinding &&
      a1.avgRir != null &&
      a2.avgRir != null &&
      a1.avgRir >= 2 &&
      a2.avgRir >= 2;
    if (bothSolid) {
      const delta = weightDelta(ex);
      return {
        action: 'increase',
        delta,
        reason: t('progression.bothSolidIncrease', { delta: fmtDelta(ex, delta) }),
        reasonKey: 'bothSolidIncrease',
        suggestedWeight: exWeight(ex) + delta,
        eligible: true
      };
    }

    if (a1.failed && a2.failed) {
      const cur = exWeight(ex);
      const suggested = roundLoad(cur * 0.93, weightDelta(ex));
      if (cur > 0 && suggested < cur) {
        return {
          action: 'decrease',
          delta: suggested - cur,
          reason: t('progression.failedDecrease'),
          reasonKey: 'failedDecrease',
          suggestedWeight: suggested,
          decreaseCause: 'failed',
          eligible: true
        };
      }
    }
  }

  if (last.failed) {
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.lastFailed'),
      reasonKey: 'lastFailed',
      eligible: true
    };
  }
  if (last.grinding) {
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.lastGrinding'),
      reasonKey: 'lastGrinding',
      eligible: true
    };
  }

  return {
    action: 'hold',
    delta: 0,
    reason: t('progression.defaultRepPush', { max }),
    reasonKey: 'defaultRepPush',
    eligible: true
  };
}

function fmtDelta(ex, deltaLbs) {
  return `${displayWeight(deltaLbs)} ${exUnit(ex)}`;
}

function findEx(exId) {
  return findExercise(exId)?.ex ?? null;
}

export function detectPR(exId, dayId, dateK) {
  const ex = findEx(exId);
  if (!ex) return null;

  const log = getExLog(dayId, exId, ex.sets, dateK);
  const sets = (log.sets || []).filter(Boolean);
  if (!sets.length) return null;

  const currentWeight = Math.max(...sets.map((s) => s.weight || 0));
  const currentVolume = sets.reduce((a, s) => a + (s.reps || 0) * (s.weight || 0), 0);

  let bestWeight = 0;
  let bestSessionVolume = 0;
  let hasPriorHistory = false;
  const k = sessionKey(dayId, dateK);

  Object.keys(S.logs).forEach((key) => {
    if (key === k) return;
    const entry = S.logs[key][exId];
    if (!entry?.sets) return;
    const recorded = entry.sets.filter(Boolean);
    if (!recorded.length) return;
    hasPriorHistory = true;
    let sessionVolume = 0;
    recorded.forEach((s) => {
      if (s.weight > bestWeight) bestWeight = s.weight;
      sessionVolume += (s.reps || 0) * (s.weight || 0);
    });
    bestSessionVolume = Math.max(bestSessionVolume, sessionVolume);
  });

  const prs = [];
  if (hasPriorHistory && currentWeight > bestWeight && currentWeight > 0) {
    prs.push({ type: 'weight', value: currentWeight });
  }
  if (hasPriorHistory && currentVolume > bestSessionVolume && currentVolume > 0) {
    prs.push({ type: 'volume', value: currentVolume });
  }

  return prs.length ? prs : null;
}

export function recommendNextWeight(exId) {
  const ex = findEx(exId);
  if (!ex) {
    return {
      action: 'hold',
      delta: 0,
      reason: t('progression.unknownEx'),
      reasonKey: 'unknownEx',
      eligible: false
    };
  }

  const base = progressionAdvice(exId);
  if (base.eligible === false) return base;
  if (base.action === 'hold') return base;

  const result = { ...base };

  if (result.action === 'increase' && result.suggestedWeight) {
    let peakE1rm = 0;
    Object.values(S.logs).forEach((dayLog) => {
      const entry = dayLog[exId];
      if (entry?.sets) {
        entry.sets.forEach((s) => {
          if (s && s.reps && s.weight) {
            const rm = estimate1RM(s.weight, s.reps, s.rir ?? 0);
            if (rm && rm.avg > peakE1rm) peakE1rm = rm.avg;
          }
        });
      }
    });

    const targetRange = parseRepsTarget(ex.reps);
    const required = estimate1RM(result.suggestedWeight, targetRange.min, 1);

    if (required && peakE1rm > 0 && required.avg > peakE1rm * 1.02) {
      return {
        action: 'hold',
        delta: 0,
        reason: t('progression.e1rmCap'),
        reasonKey: 'e1rmCap',
        eligible: true
      };
    }
  }

  if (result.suggestedWeight) {
    result.suggestedWeight = roundLoad(result.suggestedWeight, weightDelta(ex));
  }

  return result;
}

export function dayProgressionAdvice(dayId, dateK) {
  const day = getDay(dayId);
  if (!day?.ex) return [];

  const showHoldKeys = new Set(['lastFailed', 'lastGrinding']);

  return getSessionExercises(dayId, dateK)
    .map((ex) => ({ ex, ...recommendNextWeight(ex.id) }))
    .filter(
      (a) =>
        a.eligible !== false &&
        (a.action !== 'hold' || showHoldKeys.has(a.reasonKey) || isActionableHoldAdvice(a))
    );
}

export function compareToLastSession(dayId, dateK) {
  const day = getDay(dayId);
  if (!day) return null;

  let prevDate = null;
  Object.keys(S.logs)
    .sort()
    .reverse()
    .forEach((k) => {
      const [date, did] = k.split('|');
      if (did !== dayId || date >= dateK) return;
      const any = Object.values(S.logs[k]).some((v) => effectiveDone(v, Infinity) > 0);
      if (any && !prevDate) prevDate = date;
    });

  if (!prevDate) return null;

  const cur = dayDoneSets(dayId, dateK);
  const prev = dayDoneSets(dayId, prevDate);
  return { prevDate, cur, prev, delta: cur - prev };
}

function dayDoneSets(dayId, dateK) {
  const day = getDay(dayId);
  if (!day?.ex) return 0;
  const log = S.logs[`${dateK}|${dayId}`] || {};
  let done = 0;
  Object.entries(log).forEach(([exId, entry]) => {
    const ex = findEx(exId);
    if (ex) done += effectiveDone(entry, ex.sets);
  });
  return done;
}
