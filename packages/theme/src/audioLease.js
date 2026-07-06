/** @typedef {'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'} AudioSessionType */

/** @type {AudioContext | null} */
let ctx = null
/** @type {AudioSessionType | null} */
let previousSessionType = null
/** @type {ReturnType<typeof setTimeout> | null} */
let releaseTimer = null
/** @type {string} */
let debugTag = 'AudioLease'

/**
 * @param {string} tag
 */
export function configureAudioLeaseDebugTag(tag) {
  debugTag = tag || 'AudioLease'
}

/** @returns {AudioSession | null} */
export function getAudioSession() {
  if (typeof navigator === 'undefined' || !('audioSession' in navigator))
    return null
  return /** @type {AudioSession} */ (navigator.audioSession)
}

/**
 * @param {AudioSessionType} type
 * @returns {boolean}
 */
export function safeSetAudioSessionType(type) {
  const session = getAudioSession()
  if (!session) return false
  try {
    session.type = type
    return true
  } catch {
    return false
  }
}

function rememberCurrentSessionType() {
  const session = getAudioSession()
  if (session && previousSessionType === null) {
    previousSessionType = session.type
  }
}

function restoreAudioSessionType() {
  const session = getAudioSession()
  if (!session) {
    previousSessionType = null
    return
  }
  try {
    session.type = previousSessionType ?? 'auto'
  } catch {
    /* no-op */
  }
  previousSessionType = null
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [extra]
 */
export function logAudioLeaseDebug(event, extra = {}) {
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    !import.meta.env.DEV
  )
    return
  const session = getAudioSession()
  console.info(`[${debugTag}]`, {
    event,
    audioContextState: ctx?.state ?? 'none',
    audioSessionType: session?.type ?? 'unsupported',
    visibilityState:
      typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    ...extra,
  })
}

function clearReleaseTimer() {
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer)
    releaseTimer = null
  }
}

function getAudioContextCtor() {
  if (typeof window === 'undefined') return null
  return (
    window.AudioContext ||
    /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */ (
      window
    ).webkitAudioContext ||
    null
  )
}

/** @returns {AudioContext | null} */
export function getAudioLeaseContext() {
  return ctx
}

/** @returns {AudioContext | null} */
function ensureContext() {
  const Ctx = getAudioContextCtor()
  if (!Ctx) return null
  if (!ctx || ctx.state === 'closed') {
    ctx = new Ctx()
    logAudioLeaseDebug('context:created')
  }
  return ctx
}

/**
 * @returns {Promise<boolean>}
 */
async function resumeContextIfNeeded() {
  const audioCtx = ensureContext()
  if (!audioCtx) return false
  if (audioCtx.state === 'running') return true
  if (audioCtx.state === 'closed') {
    ctx = null
    return resumeContextIfNeeded()
  }
  try {
    await audioCtx.resume()
    logAudioLeaseDebug('context:resume', { state: audioCtx.state })
    return audioCtx.state === 'running'
  } catch (err) {
    logAudioLeaseDebug('play:error', { phase: 'resume', error: String(err) })
    return false
  }
}

async function suspendContext() {
  if (!ctx || ctx.state !== 'running') return
  try {
    await ctx.suspend()
    logAudioLeaseDebug('release:suspend', { state: ctx.state })
  } catch (err) {
    logAudioLeaseDebug('play:error', { phase: 'suspend', error: String(err) })
  }
}

async function releaseAudioLease() {
  clearReleaseTimer()
  await suspendContext()
  restoreAudioSessionType()
  logAudioLeaseDebug('release')
}

/**
 * @param {number} delayMs
 */
function scheduleAudioRelease(delayMs) {
  clearReleaseTimer()
  releaseTimer = setTimeout(
    () => {
      releaseTimer = null
      void releaseAudioLease()
    },
    Math.max(0, delayMs),
  )
}

/**
 * 用户手势内调用：无声 prime，不占用 playback 会话。
 * @returns {Promise<boolean>}
 */
export async function primeAudioLease() {
  logAudioLeaseDebug('prime:start')
  rememberCurrentSessionType()

  const ok = await resumeContextIfNeeded()
  if (!ok || !ctx) {
    logAudioLeaseDebug('prime:fail')
    restoreAudioSessionType()
    return false
  }

  try {
    const gain = ctx.createGain()
    gain.gain.value = 0
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.01)
    await new Promise((resolve) => setTimeout(resolve, 30))
  } catch (err) {
    logAudioLeaseDebug('play:error', { phase: 'prime', error: String(err) })
  }

  if (ctx?.state === 'running') {
    await ctx.suspend()
  }

  restoreAudioSessionType()
  logAudioLeaseDebug('prime:done', { state: ctx?.state ?? 'none' })
  return true
}

/**
 * 短提示音：临时 transient，播完 release。
 * @param {() => number | void} playFn 返回 cue 时长（秒）
 * @returns {Promise<boolean>}
 */
export async function withAudioCuePlayback(playFn) {
  logAudioLeaseDebug('cue:start')
  rememberCurrentSessionType()
  safeSetAudioSessionType('transient')

  const ok = await resumeContextIfNeeded()
  if (!ok || !ctx) {
    logAudioLeaseDebug('cue:fail')
    restoreAudioSessionType()
    return false
  }

  let durationSec = 0
  try {
    const result = playFn()
    durationSec = typeof result === 'number' ? result : 0
  } catch (err) {
    logAudioLeaseDebug('play:error', { phase: 'cue', error: String(err) })
    await releaseAudioLease()
    return false
  }

  scheduleAudioRelease(durationSec * 1000 + 80)
  logAudioLeaseDebug('cue:end', { durationSec })
  return true
}

/** 取消待释放计时（如取消排期 cue） */
export function cancelAudioLeaseCues() {
  clearReleaseTimer()
}

/**
 * 关闭 AudioContext，释放租约。
 * @returns {Promise<void>}
 */
export async function closeAudioLease() {
  logAudioLeaseDebug('close:start')
  clearReleaseTimer()
  restoreAudioSessionType()

  if (ctx && ctx.state !== 'closed') {
    try {
      await ctx.close()
      logAudioLeaseDebug('close:done')
    } catch (err) {
      logAudioLeaseDebug('play:error', { phase: 'close', error: String(err) })
    }
  }

  ctx = null
}

/**
 * @returns {() => void}
 */
export function bindAudioLeaseCleanup() {
  if (typeof document === 'undefined') return () => {}

  const cleanup = () => {
    void closeAudioLease()
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') cleanup()
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', cleanup)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', cleanup)
  }
}
