import { browser } from '$app/environment';

/** @type {AudioContext | null} */
let audioContext = null;
/** @type {AnalyserNode | null} */
let analyser = null;
/** @type {MediaElementAudioSourceNode | null} */
let source = null;
/** @type {HTMLAudioElement | null} */
let boundElement = null;
/** @type {HTMLAudioElement | null} */
let pendingElement = null;

/** Remember the shared player element; do not route through Web Audio until context runs. */
/** @param {HTMLAudioElement} audio */
export function registerAudioElement(audio) {
  if (!browser) return;
  pendingElement = audio;
}

/**
 * Attach analyser only when AudioContext is running (avoids silent playback on iOS/desktop).
 * @returns {Promise<void>}
 */
export async function attachAnalyserWhenReady() {
  if (!browser || !pendingElement || source) return;
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioContext = new Ctx();
  }
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch {
      return;
    }
  }
  if (audioContext.state !== 'running' || boundElement === pendingElement) return;

  try {
    source = audioContext.createMediaElementSource(pendingElement);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    boundElement = pendingElement;
  } catch {
    /* element may already be bound */
  }
}

/** Resume context after user gesture (Safari autoplay policy). */
export async function resumeAudioContext() {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch {
      /* ignore */
    }
  }
}

/** @returns {AnalyserNode | null} */
export function getAnalyser() {
  return analyser;
}
