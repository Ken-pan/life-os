import { browser } from '$app/environment';

/** @type {AudioContext | null} */
let audioContext = null;
/** @type {AnalyserNode | null} */
let analyser = null;
/** @type {MediaElementAudioSourceNode | null} */
let source = null;
/** @type {HTMLAudioElement | null} */
let boundElement = null;

/** Wire Web Audio analyser to the shared <audio> element (once per element). */
/** @param {HTMLAudioElement} audio */
export function bindAudioAnalyser(audio) {
  if (!browser || boundElement === audio) return;
  try {
    audioContext?.close();
  } catch {
    /* already closed */
  }
  audioContext = new AudioContext();
  source = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.78;
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  boundElement = audio;
}

/** Resume context after user gesture (Safari autoplay policy). */
export function resumeAudioContext() {
  if (audioContext?.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

/** @returns {AnalyserNode | null} */
export function getAnalyser() {
  return analyser;
}
