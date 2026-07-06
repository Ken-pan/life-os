/**
 * 手机横屏竖屏锁定：配合 portrait-gate.css 与 shell 内 .life-os-portrait-gate 节点。
 * @param {boolean} enabled
 */
export function syncPortraitLockEnabled(enabled) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.portraitLock = enabled ? 'on' : 'off'
}
