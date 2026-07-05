/** @type {AudioContext | null} */
let ctx = null;
let unlockHooked = false;
let cueGeneration = 0;

/**
 * 取消已排队的倒数/预警音（加减时间或取消计时时调用）。
 */
export function cancelScheduledCues() {
  cueGeneration += 1;
}

/**
 * 解锁 Web Audio（需在用户手势后调用）。
 * @returns {boolean}
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return false;
  const Ctx = window.AudioContext || /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */ (window).webkitAudioContext;
  if (!Ctx) return false;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return true;
}

/** 首次交互时自动解锁音频，避免计时结束无声 */
export function hookAudioUnlock() {
  if (unlockHooked || typeof window === 'undefined') return () => {};
  unlockHooked = true;

  const unlock = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
    unlockHooked = false;
  };
}

/**
 * @param {number} frequency
 * @param {number} startTime
 * @param {number} duration
 * @param {number} [gain=0.26]
 */
function playTone(frequency, startTime, duration, gain = 0.26) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * 计时结束提示音。rest = 上行琶音，work = 短促双响。
 * @param {'rest' | 'work'} [mode='rest']
 */
export function playTimerChime(mode = 'rest') {
  if (!unlockAudio() || !ctx) return;

  const run = () => {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    if (mode === 'work') {
      [880, 988].forEach((freq, i) => playTone(freq, t + i * 0.32, 0.28, 0.32));
      return;
    }

    [
      [523.25, 0],
      [659.25, 0.14],
      [783.99, 0.28],
      [1046.5, 0.42]
    ].forEach(([freq, offset]) => playTone(freq, t + offset, 1.1));
  };

  if (ctx.state === 'running') {
    run();
    return;
  }

  ctx.resume().then(run).catch(() => {});
}

/** 休息最后 10 秒的预警（双音） */
export function playTenSecondWarning() {
  playScheduledCue(() => {
    if (!ctx) return;
    const t = ctx.currentTime;
    [440, 554].forEach((freq, i) => playTone(freq, t + i * 0.16, 0.16, 0.2));
  });
}

/**
 * 54321 倒数单音。1 秒音调更高、更长。
 * @param {number} second 5–1
 */
export function playCountdownTick(second) {
  playScheduledCue(() => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const isLast = second === 1;
    playTone(isLast ? 988 : 660, t, isLast ? 0.34 : 0.13, isLast ? 0.36 : 0.24);
  });
}

function playScheduledCue(fn) {
  if (!unlockAudio() || !ctx) return;
  if (ctx.state === 'running') {
    fn();
    return;
  }
  ctx.resume().then(fn).catch(() => {});
}

/**
 * 用 Web Audio 时钟预先排期休息倒数音（比 setInterval 更准，见 web.dev/audio-scheduling）。
 * @param {number} remainSec 剩余秒数
 */
export function scheduleRestCues(remainSec) {
  cueGeneration += 1;
  const gen = cueGeneration;
  if (!unlockAudio() || !ctx || remainSec <= 0) return;

  const run = () => {
    if (!ctx || ctx.state !== 'running' || gen !== cueGeneration) return;
    const base = ctx.currentTime + 0.05;

    if (remainSec > 10) {
      const at = base + (remainSec - 10);
      [440, 554].forEach((freq, i) => playTone(freq, at + i * 0.16, 0.16, 0.2));
    }

    for (let s = 5; s >= 1; s--) {
      if (remainSec < s) continue;
      const at = base + (remainSec - s);
      const isLast = s === 1;
      playTone(isLast ? 988 : 660, at, isLast ? 0.34 : 0.13, isLast ? 0.36 : 0.24);
    }
  };

  if (ctx.state === 'running') {
    run();
    return;
  }

  ctx.resume().then(run).catch(() => {});
}

/** 试听：10 秒预警 + 54321 */
export function previewRestCountdown() {
  cancelScheduledCues();
  playTenSecondWarning();
  [5, 4, 3, 2, 1].forEach((s, i) => {
    setTimeout(() => playCountdownTick(s), 600 + i * 450);
  });
}
