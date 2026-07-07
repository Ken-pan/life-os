import {
  bindAudioLeaseCleanup,
  cancelAudioLeaseCues,
  closeAudioLease,
  configureAudioLeaseDebugTag,
  getAudioLeaseContext,
  primeAudioLease,
  withAudioCuePlayback,
} from '@life-os/theme'

configureAudioLeaseDebugTag('FitnessAudio')

let cueGeneration = 0

/**
 * 取消已排队的倒数/预警音（加减时间或取消计时时调用）。
 */
export function cancelScheduledCues() {
  cueGeneration += 1
  cancelAudioLeaseCues()
}

export const primeFitnessAudio = primeAudioLease
export const closeFitnessAudio = closeAudioLease
export const bindFitnessAudioCleanup = bindAudioLeaseCleanup

/**
 * @param {number} frequency
 * @param {number} startTime
 * @param {number} duration
 * @param {number} [gain=0.26]
 */
function playTone(frequency, startTime, duration, gain = 0.26) {
  const ctx = getAudioLeaseContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gainNode = ctx.createGain()
  osc.connect(gainNode)
  gainNode.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = frequency
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

/**
 * 计时结束提示音。rest = 上行琶音，work = 短促双响。
 * @param {'rest' | 'work'} [mode='rest']
 */
export async function playTimerChime(mode = 'rest') {
  return withAudioCuePlayback(() => {
    const ctx = getAudioLeaseContext()
    if (!ctx) return 0
    const t = ctx.currentTime

    if (mode === 'work') {
      ;[880, 988].forEach((freq, i) => playTone(freq, t + i * 0.32, 0.28, 0.32))
      return 0.32 + 0.28
    }

    ;[
      [523.25, 0],
      [659.25, 0.14],
      [783.99, 0.28],
      [1046.5, 0.42],
    ].forEach(([freq, offset]) => playTone(freq, t + offset, 1.1))
    return 0.42 + 1.1
  })
}

/** 休息最后 10 秒的预警（双音） */
export async function playTenSecondWarning() {
  return withAudioCuePlayback(() => {
    const ctx = getAudioLeaseContext()
    if (!ctx) return 0
    const t = ctx.currentTime
    ;[440, 554].forEach((freq, i) => playTone(freq, t + i * 0.16, 0.16, 0.2))
    return 0.16 + 0.16
  })
}

/**
 * 54321 倒数单音。1 秒音调更高、更长。
 * @param {number} second 5–1
 */
export async function playCountdownTick(second) {
  const isLast = second === 1
  return withAudioCuePlayback(() => {
    const ctx = getAudioLeaseContext()
    if (!ctx) return 0
    const t = ctx.currentTime
    const dur = isLast ? 0.34 : 0.13
    playTone(isLast ? 988 : 660, t, dur, isLast ? 0.36 : 0.24)
    return dur
  })
}

/** 试听：10 秒预警 + 54321 */
export async function previewRestCountdown() {
  cancelScheduledCues()
  const gen = cueGeneration

  const ok = await primeAudioLease()
  if (!ok || gen !== cueGeneration) return false

  return withAudioCuePlayback(() => {
    const ctx = getAudioLeaseContext()
    if (!ctx) return 0
    const t = ctx.currentTime
    ;[440, 554].forEach((freq, i) => playTone(freq, t + i * 0.16, 0.16, 0.2))
    ;[5, 4, 3, 2, 1].forEach((s, i) => {
      const at = t + 0.6 + i * 0.45
      const isLast = s === 1
      playTone(
        isLast ? 988 : 660,
        at,
        isLast ? 0.34 : 0.13,
        isLast ? 0.36 : 0.24,
      )
    })
    return 0.6 + 4 * 0.45 + 0.34
  })
}
