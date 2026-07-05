import { S, save, todayKey, daysBetween } from './state.svelte.js';
import { t } from './i18n/index.js';

const DELOAD_SESSION_THRESHOLD = 12;
const DELOAD_WEEK_THRESHOLD = 28;

export function sessionsSinceDeload() {
  const lastDeload = S.rotation.lastDeload;
  const history = S.rotation.history || [];
  if (!lastDeload) return history.length;
  return history.filter((h) => h.date > lastDeload).length;
}

export function daysSinceDeload() {
  const lastDeload = S.rotation.lastDeload;
  if (!lastDeload) return null;
  return daysBetween(lastDeload, todayKey());
}

export function deloadAdvice() {
  const sessions = sessionsSinceDeload();
  const days = daysSinceDeload();
  const lastDeload = S.rotation.lastDeload;

  if (!lastDeload && sessions >= DELOAD_SESSION_THRESHOLD) {
    return {
      shouldDeload: true,
      reason: t('phase.deloadSessions', { sessions }),
      sessions,
      days: null
    };
  }

  if (days != null && days >= DELOAD_WEEK_THRESHOLD) {
    return {
      shouldDeload: true,
      reason: t('phase.deloadWeeks', { weeks: Math.round(days / 7) }),
      sessions,
      days
    };
  }

  if (sessions >= DELOAD_SESSION_THRESHOLD) {
    return {
      shouldDeload: true,
      reason: t('phase.deloadHighLoad', { sessions }),
      sessions,
      days
    };
  }

  const remaining = DELOAD_SESSION_THRESHOLD - sessions;
  return {
    shouldDeload: false,
    reason: lastDeload
      ? t('phase.cycleProgress', {
          sessions,
          threshold: DELOAD_SESSION_THRESHOLD,
          date: lastDeload.slice(5)
        })
      : t('phase.cycleNoDeload', { sessions, threshold: DELOAD_SESSION_THRESHOLD }),
    sessions,
    days,
    remaining
  };
}

export function markDeloadDone() {
  S.rotation.lastDeload = todayKey();
  if (!S.rotation.phaseStart) S.rotation.phaseStart = todayKey();
  save();
}
