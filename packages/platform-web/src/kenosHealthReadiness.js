/**
 * Privacy-safe Health readiness summary for Kenos Today / Assistant.
 * Never includes HRV / sleep hours / steps / kcal / raw samples — only levels + codes.
 */
import {
  deriveState,
  recommendPolicy,
  todayTrainingLedger,
  trainingRecommendation,
  DIMENSION_ORDER,
} from './kenosHealthStateEngine.js'

export const HEALTH_READINESS_VERSION = 1

const LEVELS = new Set(['good', 'ok', 'watch', 'bad', 'unknown'])
const TRAIN_CODES = new Set([
  'recover',
  'already_trained',
  'easy',
  'ok_to_train',
  'unknown',
])
const CAPACITIES = new Set(['full', 'reduced', 'low', 'unknown'])

/** @param {Record<string, string|{ level?: string }>|null|undefined} dims */
export function focusCapacityFromDims(dims) {
  const rank = { good: 0, ok: 0, unknown: 0, watch: 1, bad: 2 }
  const levelOf = (k) => {
    const v = dims?.[k]
    return typeof v === 'string' ? v : v?.level
  }
  let sev = 0
  for (const k of ['sleepDebt', 'stress', 'recovery', 'energy', 'physical']) {
    sev = Math.max(sev, rank[levelOf(k)] ?? 0)
  }
  if (sev >= 2) return 'low'
  if (sev === 1) return 'reduced'
  if (DIMENSION_ORDER.filter((k) => levelOf(k) === 'unknown').length >= 3) {
    return 'unknown'
  }
  return 'full'
}

/**
 * Strip engine output to a cross-OS-safe summary.
 * @param {{
 *   dims: Record<string, { level?: string }>,
 *   headline?: { k?: string },
 *   training?: { code?: string, trained?: boolean },
 *   policy?: { driver?: string|null, limitMinutes?: number },
 *   asOf?: string|number|Date,
 *   source?: string,
 *   dayCount?: number,
 * }} input
 */
export function buildHealthReadinessSummary(input) {
  const dimsIn = input?.dims && typeof input.dims === 'object' ? input.dims : {}
  /** @type {Record<string, string>} */
  const dims = {}
  for (const k of DIMENSION_ORDER) {
    const level = dimsIn[k]?.level
    dims[k] = LEVELS.has(level) ? level : 'unknown'
  }
  const trainCode = TRAIN_CODES.has(input?.training?.code)
    ? input.training.code
    : 'unknown'
  const capacity = focusCapacityFromDims(dims)
  const asOf =
    input?.asOf instanceof Date
      ? input.asOf.toISOString()
      : typeof input?.asOf === 'string'
        ? input.asOf
        : typeof input?.asOf === 'number'
          ? new Date(input.asOf).toISOString()
          : new Date().toISOString()

  return Object.freeze({
    version: HEALTH_READINESS_VERSION,
    asOf,
    source: typeof input?.source === 'string' ? input.source : 'unknown',
    dayCount: Number.isFinite(input?.dayCount) ? Number(input.dayCount) : 0,
    dims: Object.freeze(dims),
    headlineKey:
      typeof input?.headline?.k === 'string'
        ? input.headline.k
        : 'state.h_noData',
    focusCapacity: CAPACITIES.has(capacity) ? capacity : 'unknown',
    training: Object.freeze({
      code: trainCode,
      trained: Boolean(input?.training?.trained),
    }),
    policy: Object.freeze({
      driver:
        typeof input?.policy?.driver === 'string' ? input.policy.driver : null,
      limitMinutes: Number.isFinite(input?.policy?.limitMinutes)
        ? Number(input.policy.limitMinutes)
        : null,
    }),
  })
}

/**
 * Full pipeline: measurements → engine → privacy summary.
 * @param {{ now?: number, health?: Array, agent?: object, source?: string }} input
 */
export function buildHealthReadinessFromMeasurements(input = {}) {
  const now = input.now ?? Date.now()
  const health = Array.isArray(input.health) ? input.health : []
  const agent = input.agent ?? { online: false }
  const engine = deriveState({ now, health, agent })
  const ledger = todayTrainingLedger(health, now)
  const training = trainingRecommendation(engine.dims, ledger)
  const policy = recommendPolicy(engine.dims, 20)
  return buildHealthReadinessSummary({
    dims: engine.dims,
    headline: engine.headline,
    training: { code: training.code, trained: ledger.trained },
    policy,
    asOf: now,
    source: input.source || 'healthkit',
    dayCount: health.length,
  })
}

/** Reject payloads that look like they leak raw vitals. */
export function isSafeHealthReadiness(value) {
  if (!value || typeof value !== 'object') return false
  if (value.version !== HEALTH_READINESS_VERSION) return false
  if (!value.dims || typeof value.dims !== 'object') return false
  for (const k of DIMENSION_ORDER) {
    if (!LEVELS.has(value.dims[k])) return false
  }
  if (!TRAIN_CODES.has(value.training?.code)) return false
  if (!CAPACITIES.has(value.focusCapacity)) return false
  const blob = JSON.stringify(value)
  // Hard ban raw metric field names / plausible sample dumps.
  if (
    /sleepHours|restingHR|"hrv"|activeEnergyKcal|spo2|bodyMass|steps"|workoutMinutes/i.test(
      blob,
    )
  ) {
    return false
  }
  return true
}

/**
 * Resolve readiness from native injection (summary preferred, else days→derive).
 * @param {{ now?: number, agent?: object }} [opts]
 */
export function resolveInjectedHealthReadiness(opts = {}) {
  if (typeof window === 'undefined') return null
  const injected = window.__KENOS_HEALTH_READINESS__
  if (isSafeHealthReadiness(injected)) return injected

  const days = window.__KENOS_APPLE_HEALTH__?.days
  if (!Array.isArray(days) || days.length === 0) return null

  const summary = buildHealthReadinessFromMeasurements({
    now: opts.now ?? Date.now(),
    health: days,
    agent: opts.agent ?? { online: false },
    source: window.__KENOS_APPLE_HEALTH__?.source || 'healthkit',
  })
  try {
    window.__KENOS_HEALTH_READINESS__ = summary
  } catch {
    /* ignore */
  }
  return summary
}

const TRAIN_COPY = {
  recover: {
    zh: '今天宜恢复，别上高强度',
    en: 'Recover today — skip high intensity',
  },
  already_trained: { zh: '今天已训练过', en: 'Already trained today' },
  easy: { zh: '适合轻松活动', en: 'Keep training easy' },
  ok_to_train: { zh: '可以按计划训练', en: 'OK to train as planned' },
  unknown: { zh: '活动数据不足', en: 'Activity data missing' },
}

const CAPACITY_COPY = {
  full: { zh: '专注余量充足', en: 'Focus capacity full' },
  reduced: { zh: '专注宜收紧', en: 'Focus capacity reduced' },
  low: { zh: '今天宜低负荷', en: 'Keep load low today' },
  unknown: { zh: '状态数据不足', en: 'Status data missing' },
}

/**
 * Today signal row (no vitals).
 * @param {ReturnType<typeof buildHealthReadinessSummary>} summary
 * @param {{ locale?: string, href?: string }} [opts]
 */
export function healthReadinessToTodaySignal(summary, opts = {}) {
  if (!isSafeHealthReadiness(summary)) return null
  const locale = opts.locale?.startsWith('en') ? 'en' : 'zh'
  const train =
    TRAIN_COPY[summary.training.code]?.[locale] || TRAIN_COPY.unknown[locale]
  const capacity =
    CAPACITY_COPY[summary.focusCapacity]?.[locale] ||
    CAPACITY_COPY.unknown[locale]
  const worst = DIMENSION_ORDER.find((k) =>
    ['bad', 'watch'].includes(summary.dims[k]),
  )
  return {
    id: 'health',
    label: 'Health',
    value: train,
    detail: worst ? `${capacity} · ${worst}` : capacity,
    href: opts.href || 'https://health.kenos.space/',
    ownerDomain: 'health',
    source: 'kenos.health_readiness',
    freshness: 'fresh',
    lastUpdated: summary.asOf,
    available: true,
    stale: false,
    futureActionAllowed: false,
    tone:
      summary.training.code === 'recover' || summary.focusCapacity === 'low'
        ? 'attention'
        : summary.training.code === 'unknown'
          ? 'calm'
          : 'calm',
  }
}

/**
 * Optional Today priority when readiness is clearly constrained.
 * @param {ReturnType<typeof buildHealthReadinessSummary>} summary
 * @param {{ locale?: string, href?: string }} [opts]
 */
export function healthReadinessToTodayPriority(summary, opts = {}) {
  if (!isSafeHealthReadiness(summary)) return null
  const locale = opts.locale?.startsWith('en') ? 'en' : 'zh'
  const needs =
    summary.training.code === 'recover' ||
    summary.focusCapacity === 'low' ||
    summary.dims.sleepDebt === 'bad' ||
    summary.dims.stress === 'bad'
  if (!needs) return null
  const train =
    TRAIN_COPY[summary.training.code]?.[locale] || TRAIN_COPY.recover[locale]
  return {
    id: 'health-readiness',
    tone:
      summary.focusCapacity === 'low' || summary.training.code === 'recover'
        ? 'attention'
        : 'calm',
    eyebrow: locale === 'en' ? 'Body' : '身体',
    title: train,
    detail:
      locale === 'en'
        ? 'Based on Apple Health readiness — no vitals shared here.'
        : '来自 Apple Health 准备度摘要——此处不展示生理明细。',
    href: opts.href || 'https://health.kenos.space/',
    actionLabel: locale === 'en' ? 'Open Health' : '打开 Health',
    ownerDomain: 'health',
    source: 'kenos.health_readiness',
    freshness: 'fresh',
    lastUpdated: summary.asOf,
    available: true,
    stale: false,
    futureActionAllowed: false,
  }
}

/**
 * Short Assistant / tool text — levels + codes only.
 * @param {ReturnType<typeof buildHealthReadinessSummary>} summary
 * @param {{ locale?: string }} [opts]
 */
export function formatHealthReadinessForAssistant(summary, opts = {}) {
  if (!isSafeHealthReadiness(summary)) return null
  const locale = opts.locale?.startsWith('en') ? 'en' : 'zh'
  const train = TRAIN_COPY[summary.training.code]?.[locale]
  const capacity = CAPACITY_COPY[summary.focusCapacity]?.[locale]
  const dimLine = DIMENSION_ORDER.map((k) => `${k}=${summary.dims[k]}`).join(
    ' · ',
  )
  if (locale === 'en') {
    return [
      'Health readiness (summary only — no vitals):',
      `- focusCapacity: ${summary.focusCapacity} (${capacity})`,
      `- training: ${summary.training.code} (${train}); trainedToday=${summary.training.trained}`,
      `- dims: ${dimLine}`,
      summary.policy?.driver
        ? `- focusPolicyHint: tighten when ${summary.policy.driver}`
        : '- focusPolicyHint: none',
      'Do not invent HRV/sleep hours/steps. If user needs detail, send them to Health.',
    ].join('\n')
  }
  return [
    'Health 准备度摘要(无生理明细):',
    `- focusCapacity: ${summary.focusCapacity}（${capacity}）`,
    `- training: ${summary.training.code}（${train}）；trainedToday=${summary.training.trained}`,
    `- dims: ${dimLine}`,
    summary.policy?.driver
      ? `- focusPolicyHint: 因 ${summary.policy.driver} 宜收紧窗口`
      : '- focusPolicyHint: 无',
    '禁止编造 HRV/睡眠小时/步数。用户要明细时引导打开 Health。',
  ].join('\n')
}
