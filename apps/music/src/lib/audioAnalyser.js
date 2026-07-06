import { browser } from '$app/environment'

/** @type {AudioContext | null} */
let audioContext = null
/** @type {AnalyserNode | null} */
let analyser = null
/** @type {MediaElementAudioSourceNode | null} */
let sourceA = null
/** @type {MediaElementAudioSourceNode | null} */
let sourceB = null
/** @type {GainNode | null} */
let fadeA = null
/** @type {GainNode | null} */
let fadeB = null
/** @type {HTMLAudioElement | null} */
let elementA = null
/** @type {HTMLAudioElement | null} */
let elementB = null
/** @type {'a' | 'b'} */
let activeSlot = 'a'
let graphReady = false

/** @param {HTMLAudioElement} a @param {HTMLAudioElement} b */
export function registerAudioPool(a, b) {
  if (!browser) return
  elementA = a
  elementB = b
}

/** @returns {boolean} */
export function isPlaybackGraphReady() {
  return graphReady && !!audioContext && !!fadeA && !!fadeB
}

/** @param {'a' | 'b'} slot @returns {GainNode | null} */
function fadeForSlot(slot) {
  return slot === 'a' ? fadeA : fadeB
}

/**
 * Build Web Audio routing: both elements → fade gains → speakers.
 * Optional analyser tap for visualizer (does not affect output).
 * @returns {Promise<boolean>}
 */
export async function ensurePlaybackGraph() {
  if (!browser || !elementA || graphReady) return graphReady
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return false
    audioContext = new Ctx()
  }
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume()
    } catch {
      return false
    }
  }
  if (audioContext.state !== 'running') return false

  try {
    fadeA = audioContext.createGain()
    fadeB = audioContext.createGain()

    if (!sourceA) {
      sourceA = audioContext.createMediaElementSource(elementA)
      sourceA.connect(fadeA)
    }
    if (elementB && !sourceB) {
      sourceB = audioContext.createMediaElementSource(elementB)
      sourceB.connect(fadeB)
    }

    fadeA.connect(audioContext.destination)
    fadeB.connect(audioContext.destination)

    elementA.volume = 1
    if (elementB) elementB.volume = 1

    graphReady = true
    syncElementGains(activeSlot, 1, false)
    return true
  } catch {
    return false
  }
}

/**
 * Set audibility gains for active / inactive slots (user volume lives on fade nodes).
 * @param {'a' | 'b'} slot
 * @param {number} volume 0–1
 * @param {boolean} muted
 */
export function syncElementGains(slot, volume, muted) {
  activeSlot = slot
  if (!fadeA || !fadeB) return
  const v = muted ? 0 : Math.max(0, Math.min(1, volume))
  fadeA.gain.value = slot === 'a' ? v : 0
  fadeB.gain.value = slot === 'b' ? v : 0
}

/** Route visualizer emphasis to active slot when analyser is attached. */
/** @param {'a' | 'b'} slot */
export function setActiveAudioSlot(slot) {
  syncElementGains(slot, fadeForSlot(slot)?.gain.value ?? 1, false)
}

/** @deprecated Use registerAudioPool */
/** @param {HTMLAudioElement} audio */
export function registerAudioElement(audio) {
  if (!browser) return
  elementA = audio
}

/** @param {'a' | 'b'} slot @param {number} value */
export function setSlotGainImmediate(slot, value) {
  const gain = fadeForSlot(slot)?.gain
  if (!gain || !audioContext) return
  gain.cancelScheduledValues(audioContext.currentTime)
  gain.value = Math.max(0, Math.min(1, value))
}

/**
 * Equal-power crossfade on Web Audio fade gains (smoother than element.volume).
 * @param {{ outSlot: 'a' | 'b', inSlot: 'a' | 'b', ms: number, volume: number, token: number, getToken?: () => number }} opts
 * @returns {Promise<boolean>}
 */
export async function rampCrossfade(opts) {
  const { outSlot, inSlot, ms, volume, token, getToken } = opts
  if (!isPlaybackGraphReady() || !audioContext || !fadeA || !fadeB) return false

  const outGain = fadeForSlot(outSlot)?.gain
  const inGain = fadeForSlot(inSlot)?.gain
  if (!outGain || !inGain) return false

  const now = audioContext.currentTime
  const sec = Math.max(0.05, ms / 1000)
  const target = Math.max(0, Math.min(1, volume))
  const startOut = outGain.value
  const startIn = inGain.value

  outGain.cancelScheduledValues(now)
  inGain.cancelScheduledValues(now)
  outGain.setValueAtTime(startOut, now)
  inGain.setValueAtTime(startIn, now)

  /** Equal-power crossfade reduces perceived dip in the middle. */
  const curveLen = 32
  const curveOut = new Float32Array(curveLen)
  const curveIn = new Float32Array(curveLen)
  for (let i = 0; i < curveLen; i++) {
    const t = i / (curveLen - 1)
    const angle = t * Math.PI * 0.5
    curveOut[i] = startOut * Math.cos(angle)
    curveIn[i] = target * Math.sin(angle)
  }
  outGain.setValueCurveAtTime(curveOut, now, sec)
  inGain.setValueCurveAtTime(curveIn, now, sec)

  await new Promise((resolve) => setTimeout(resolve, ms + 30))
  if (getToken && getToken() !== token) return false
  return true
}

/**
 * Attach analyser tap when visualizer runs (output already routed via fade gains).
 * @returns {Promise<void>}
 */
export async function attachAnalyserWhenReady() {
  if (!browser || !elementA || analyser) return
  const ok = await ensurePlaybackGraph()
  if (!ok || !audioContext || !fadeA || !fadeB) return

  try {
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.78
    fadeA.connect(analyser)
    fadeB.connect(analyser)
  } catch {
    /* already connected */
  }
}

/** Resume context after user gesture (Safari autoplay policy). */
export async function resumeAudioContext() {
  if (!audioContext) return
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume()
    } catch {
      /* ignore */
    }
  }
}

/** @returns {AnalyserNode | null} */
export function getAnalyser() {
  return analyser
}
