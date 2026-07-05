import { todayKey, todayDayId, sessionStats, activeProgramId, displayWeight, exUnit, S } from './state.svelte.js';
import { getDay } from './programRuntime.js';
import { getProgramById } from './data/program.js';
import { deloadAdvice, sessionsSinceDeload } from './phase.js';
import { recommendNextWeight, formatProgressionLine } from './progression.js';
import { getSessionProgress } from './session.js';
import {
  muscleVolumeGap,
  recentRirStats,
  stagnantExercises,
  frequentSkips
} from './coachMetrics.js';
import { t } from './i18n/index.js';

function listSep() {
  return S.settings.locale === 'en' ? ', ' : '、';
}

/**
 * 本地 Coach Lite：纯规则引擎，不依赖外部 API。
 * 数据驱动的建议（疲劳、递进、容量、平台期）优先，
 * 静态科普提示只在没有更重要内容时补位。
 *
 * 优先级：1 = 必须现在处理 · 2 = 今天训练相关 · 3 = 趋势观察 · 5 = 补位科普
 */
export function coachBrief() {
  const tips = [];
  const stats = sessionStats();
  const deload = deloadAdvice();
  const recId = todayDayId();
  const day = getDay(recId);
  const dk = todayKey();

  if (deload.shouldDeload) {
    tips.push({
      id: 'deload',
      priority: 1,
      tone: 'warn',
      title: t('coach.deloadTitle'),
      body: t('coach.deloadBody', { reason: deload.reason })
    });
  }

  const rir = recentRirStats(7);
  if (rir && rir.sets >= 8) {
    if (rir.avgRir < 1) {
      const nearDeload = !deload.shouldDeload && sessionsSinceDeload() >= 8;
      tips.push({
        id: 'fatigue',
        priority: 2,
        tone: 'warn',
        title: t('coach.fatigueTitle'),
        body: t('coach.fatigueBody', {
          avgRir: rir.avgRir,
          failurePct: rir.failurePct,
          extra: nearDeload ? t('coach.fatigueExtra') : ''
        })
      });
    } else if (rir.avgRir >= 3.5) {
      tips.push({
        id: 'intensity-low',
        priority: 3,
        tone: 'info',
        title: t('coach.intensityLowTitle'),
        body: t('coach.intensityLowBody', { avgRir: rir.avgRir })
      });
    }
  }

  if (stats.daysSince != null && stats.daysSince >= 4) {
    tips.push({
      id: 'gap',
      priority: 2,
      tone: 'info',
      title: t('coach.gapTitle'),
      body:
        stats.daysSince >= 7
          ? t('coach.gapBodyLong', { days: stats.daysSince })
          : t('coach.gapBodyShort', { days: stats.daysSince })
    });
  }

  if (stats.week7 >= 5) {
    tips.push({
      id: 'freq-high',
      priority: 2,
      tone: 'info',
      title: t('coach.freqHighTitle'),
      body: t('coach.freqHighBody', { count: stats.week7 })
    });
  } else if (stats.week7 <= 1 && stats.total > 3 && (stats.daysSince == null || stats.daysSince < 4)) {
    const prog = getProgramById(activeProgramId());
    tips.push({
      id: 'freq-low',
      priority: 3,
      tone: 'info',
      title: t('coach.freqLowTitle'),
      body: t('coach.freqLowBody', {
        program: prog.meta.shortName || prog.meta.name,
        daysPerWeek: prog.meta.daysPerWeek
      })
    });
  }

  if (day) {
    const progress = getSessionProgress(recId, dk);
    if (progress.done > 0 && progress.done < progress.total) {
      tips.push({
        id: 'resume',
        priority: 1,
        tone: 'action',
        title: t('coach.resumeTitle'),
        body: t('coach.resumeBody', {
          day: day.cn,
          done: progress.done,
          total: progress.total,
          pct: progress.pct
        })
      });
    }

    const advices = day.ex.map((ex) => ({ ex, advice: recommendNextWeight(ex.id) }));

    const increases = advices.filter((r) => r.advice.action === 'increase' && r.advice.eligible !== false);
    if (increases.length) {
      const names = increases
        .slice(0, 2)
        .map((r) => formatProgressionLine(r.ex, r.advice))
        .join(listSep());
      tips.push({
        id: 'progression',
        priority: 2,
        tone: 'success',
        title: t('coach.progressionTitle'),
        body: t('coach.progressionBody', {
          names,
          suffix: increases.length > 2 ? t('coach.progressionSuffix') : ''
        })
      });
    }

    const deloadWeights = advices.filter(
      (r) => r.advice.action === 'decrease' && r.advice.decreaseCause === 'deload'
    );
    if (deloadWeights.length) {
      const names = deloadWeights
        .slice(0, 2)
        .map((r) => formatProgressionLine(r.ex, r.advice))
        .join(listSep());
      tips.push({
        id: 'deload-weights',
        priority: 2,
        tone: 'warn',
        title: t('coach.deloadWeightsTitle'),
        body: t('coach.deloadWeightsBody', { names })
      });
    }

    const failedWeights = advices.filter(
      (r) => r.advice.action === 'decrease' && r.advice.decreaseCause === 'failed'
    );
    if (failedWeights.length) {
      const names = failedWeights
        .slice(0, 2)
        .map((r) => formatProgressionLine(r.ex, r.advice))
        .join(listSep());
      tips.push({
        id: 'regression',
        priority: 2,
        tone: 'warn',
        title: t('coach.regressionTitle'),
        body: t('coach.regressionBody', { names })
      });
    }
  }

  const stagnant = stagnantExercises(1);
  if (stagnant.length) {
    const s = stagnant[0];
    tips.push({
      id: 'plateau',
      priority: 3,
      tone: 'info',
      title: t('coach.plateauTitle'),
      body: t('coach.plateauBody', {
        name: s.ex.name,
        sessions: s.sessions,
        weight: displayWeight(s.weight),
        unit: exUnit(s.ex),
        extra: s.alternative ? t('coach.plateauAlt', { alt: s.alternative }) : t('coach.plateauNoAlt')
      })
    });
  }

  const gap = muscleVolumeGap(7);
  if (gap) {
    tips.push({
      id: 'muscle-volume',
      priority: 3,
      tone: 'info',
      title: t('coach.volumeTitle'),
      body: t('coach.volumeBody', {
        group: gap.group,
        planned: gap.planned,
        sets: gap.sets
      })
    });
  }

  const skips = frequentSkips(21);
  if (skips.length) {
    const s = skips[0];
    tips.push({
      id: 'skip-pattern',
      priority: 3,
      tone: 'info',
      title: t('coach.skipTitle'),
      body: t('coach.skipBody', {
        name: s.ex.name,
        count: s.count,
        extra: s.alternative ? t('coach.skipAlt', { alt: s.alternative }) : t('coach.skipNoAlt')
      })
    });
  }

  if (day) {
    if (recId === 'back' || recId === 'pull_a' || recId === 'pull_b' || recId === 'upper_b') {
      tips.push({
        id: 'posture',
        priority: 5,
        tone: 'info',
        title: t('coach.postureTitle'),
        body: t('coach.postureBody')
      });
    }
    if (recId === 'arms' || recId === 'upper_a' || recId === 'upper_b') {
      tips.push({
        id: 'arms-focus',
        priority: 5,
        tone: 'info',
        title: t('coach.armsTitle'),
        body: t('coach.armsBody')
      });
    }
  }

  return tips.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

/** Summary 用：仅返回可执行建议，不复读训练日 note */
export function coachHeadline(_dayId) {
  const tips = coachBrief().filter((tip) => tip.id !== 'resume');
  return tips[0] ?? null;
}
