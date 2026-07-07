import { getVisualViewportHeight } from '@life-os/theme'

/** Fitness 专用：训练/计时进行中延后云同步 */
export function shouldDeferFitnessForegroundSync(pathname, timerState) {
  if (/\/focus$/.test(pathname)) return true
  if (
    timerState.visible &&
    timerState.remain > 0 &&
    timerState.status !== 'complete'
  ) {
    return true
  }
  return false
}
