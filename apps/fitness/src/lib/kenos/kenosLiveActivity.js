/**
 * Training → Kenos Live Activity bridge.
 * Outside native shell: skipped. With ActivityKit gated: shell Live Accessory
 * preview only (`gated: true`), not system Dynamic Island.
 */
import {
  nativeLiveActivityEnd,
  nativeLiveActivityUpsert,
} from '@life-os/platform-web/kenos-native-bridge'
import { getSessionProgress } from '$lib/session.js'
import { timer } from '$lib/timer.svelte.js'

let lastKey = ''
let lastAt = 0

/**
 * @param {{
 *   dayId: string,
 *   dayLabel?: string,
 *   exerciseName?: string,
 *   setIndex?: number,
 *   sets?: number,
 * }} opts
 */
export function publishTrainingLiveActivity(opts) {
  const dayId = String(opts.dayId || '')
  const progress = dayId ? getSessionProgress(dayId) : null
  const pct = progress?.total ? (progress.done || 0) / progress.total : 0
  const setIndex = opts.setIndex ?? null
  const sets = opts.sets ?? null
  const exerciseName = String(opts.exerciseName || '').slice(0, 48)
  const dayLabel = String(opts.dayLabel || dayId || 'Training').slice(0, 40)
  let subtitle = exerciseName || 'In session'
  if (setIndex != null && sets != null) {
    subtitle = `${exerciseName || 'Set'} · ${setIndex}/${sets}`
  } else if (progress?.total) {
    subtitle = `${progress.done}/${progress.total} sets`
  }
  if (Number(timer.remain) > 0) {
    subtitle = `${subtitle} · ${timer.mode === 'work' ? 'work' : 'rest'} ${Math.ceil(Number(timer.remain))}s`
  }
  const payload = {
    kind: /** @type {const} */ ('training'),
    title: dayLabel,
    subtitle,
    progress: pct,
    endsAtMs:
      Number(timer.remain) > 0
        ? Date.now() + Number(timer.remain) * 1000
        : undefined,
  }
  const key = JSON.stringify([
    payload.title,
    payload.subtitle,
    Math.round((payload.progress || 0) * 100),
    Math.round((payload.endsAtMs || 0) / 5000),
  ])
  const now = Date.now()
  if (key === lastKey && now - lastAt < 2000) {
    return Promise.resolve({ ok: true, skipped: true, deduped: true })
  }
  lastKey = key
  lastAt = now
  return nativeLiveActivityUpsert(payload)
}

export function endTrainingLiveActivity() {
  lastKey = ''
  lastAt = 0
  return nativeLiveActivityEnd('training')
}
