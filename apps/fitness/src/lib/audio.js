/** @type {AudioContext | null} */
let ctx = null
let cueGeneration = 0
/** @type {ReturnType<typeof setTimeout> | null} */
let releaseTimeout = null

/**
 * 计时提示音应使用 transient 会话：叠加在其他 App 音乐之上，而非独占音频焦点。
 * @see https://w3c.github.io/audio-session/#audio-session-types
 */
function configureAudioSession() {
  if (typeof navigator === 'undefined' || !('audioSession' in navigator)) return
  try {
    /** @type {AudioSession} */ ;(navigator.audioSession).type = 'transient'
  } catch {
    /* Safari 旧版或未启用 Audio Session API */
  }
}

function getOrCreateContext() {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */ (
      window
    ).webkitAudioContext
  if (!Ctx) return null
  if (!ctx) ctx = new Ctx()
  return ctx
}

function clearReleaseTimeout() {
  if (releaseTimeout) {
    clearTimeout(releaseTimeout)
    releaseTimeout = null
  }
}

/** 提示音播完后挂起 AudioContext，把音频焦点还给 YouTube / 音乐 App */
function scheduleReleaseAfter(seconds) {
  clearReleaseTimeout()
  releaseTimeout = setTimeout(
    () => {
      releaseTimeout = null
      releaseAudio()
    },
    Math.max(0, seconds) * 1000 + 80,
  )
}

/**
 * 取消已排队的倒数/预警音（加减时间或取消计时时调用）。
 */
export function cancelScheduledCues() {
  cueGeneration += 1
}

/**
 * 挂起 AudioContext，释放系统音频会话（不打断后台音乐）。
 */
export function releaseAudio() {
  clearReleaseTimeout()
  cancelScheduledCues()
  if (ctx?.state === 'running') ctx.suspend().catch(() => {})
}

/**
 * 准备 Web Audio（需在用户手势后调用）。仅创建上下文并声明 transient 会话，不主动 resume。
 * @returns {boolean}
 */
export function unlockAudio() {
  configureAudioSession()
  return Boolean(getOrCreateContext())
}

/**
 * @returns {Promise<boolean>}
 */
async function ensureRunning() {
  if (!unlockAudio() || !ctx) return false
  configureAudioSession()
  if (ctx.state === 'running') return true
  try {
    await ctx.resume()
    return ctx.state === 'running'
  } catch {
    return false
  }
}

/**
 * @param {number} frequency
 * @param {number} startTime
 * @param {number} duration
 * @param {number} [gain=0.26]
 */
function playTone(frequency, startTime, duration, gain = 0.26) {
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
export function playTimerChime(mode = 'rest') {
  void ensureRunning().then((ok) => {
    if (!ok || !ctx) return
    const t = ctx.currentTime

    if (mode === 'work') {
      ;[880, 988].forEach((freq, i) => playTone(freq, t + i * 0.32, 0.28, 0.32))
      scheduleReleaseAfter(0.32 + 0.28)
      return
    }

    ;[
      [523.25, 0],
      [659.25, 0.14],
      [783.99, 0.28],
      [1046.5, 0.42],
    ].forEach(([freq, offset]) => playTone(freq, t + offset, 1.1))
    scheduleReleaseAfter(0.42 + 1.1)
  })
}

/** 休息最后 10 秒的预警（双音） */
export function playTenSecondWarning() {
  playScheduledCue(() => {
    if (!ctx) return
    const t = ctx.currentTime
    ;[440, 554].forEach((freq, i) => playTone(freq, t + i * 0.16, 0.16, 0.2))
  }, 0.16 + 0.16)
}

/**
 * 54321 倒数单音。1 秒音调更高、更长。
 * @param {number} second 5–1
 */
export function playCountdownTick(second) {
  const isLast = second === 1
  playScheduledCue(
    () => {
      if (!ctx) return
      const t = ctx.currentTime
      playTone(
        isLast ? 988 : 660,
        t,
        isLast ? 0.34 : 0.13,
        isLast ? 0.36 : 0.24,
      )
    },
    isLast ? 0.34 : 0.13,
  )
}

function playScheduledCue(fn, releaseAfterSec) {
  void ensureRunning().then((ok) => {
    if (!ok || !ctx) return
    fn()
    if (releaseAfterSec != null) scheduleReleaseAfter(releaseAfterSec)
  })
}

/**
 * 用 Web Audio 时钟预先排期休息倒数音（比 setInterval 更准，见 web.dev/audio-scheduling）。
 * @param {number} remainSec 剩余秒数
 */
export function scheduleRestCues(remainSec) {
  cueGeneration += 1
  const gen = cueGeneration
  if (remainSec <= 0) return

  void ensureRunning().then((ok) => {
    if (!ok || !ctx || gen !== cueGeneration) return
    clearReleaseTimeout()
    const base = ctx.currentTime + 0.05

    if (remainSec > 10) {
      const at = base + (remainSec - 10)
      ;[440, 554].forEach((freq, i) => {
        const start = at + i * 0.16
        playTone(freq, start, 0.16, 0.2)
      })
    }

    for (let s = 5; s >= 1; s--) {
      if (remainSec < s) continue
      const at = base + (remainSec - s)
      const isLast = s === 1
      const dur = isLast ? 0.34 : 0.13
      playTone(isLast ? 988 : 660, at, dur, isLast ? 0.36 : 0.24)
    }
    // 休息计时期间保持 running，结束提示音播完后再 release（见 playTimerChime）
  })
}

/** 试听：10 秒预警 + 54321 */
export function previewRestCountdown() {
  cancelScheduledCues()
  clearReleaseTimeout()
  void ensureRunning().then((ok) => {
    if (!ok || !ctx) return
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
    scheduleReleaseAfter(0.6 + 4 * 0.45 + 0.34)
  })
}
