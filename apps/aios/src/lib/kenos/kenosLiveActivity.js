/**
 * Kenos Focus (Deep Work / Training simulation) → Live Activity bridge.
 * Safe outside native shell. When ActivityKit is owner-gated, upserts still
 * refresh in-shell Live Accessory (`gated: true`) — not system Dynamic Island.
 */
import {
  nativeLiveActivityEnd,
  nativeLiveActivityUpsert,
} from '@life-os/platform-web/kenos-native-bridge'

/**
 * @param {{
 *   mode?: string,
 *   title?: string,
 *   status?: string,
 *   safeSummary?: string,
 * }} [focus]
 */
export function publishFocusLiveActivity(focus) {
  if (!focus) return Promise.resolve({ ok: false, skipped: true })
  const mode = String(focus.mode || 'deep_work')
  const kind = mode === 'training' ? 'training' : 'focus'
  const status = String(focus.status || 'active')
  const title = String(
    focus.title || (kind === 'training' ? 'Training' : 'Deep Work'),
  ).slice(0, 48)
  const subtitle = String(
    focus.safeSummary ||
      (status === 'paused'
        ? 'Paused'
        : status === 'temporarily_left'
          ? 'Stepped away'
          : kind === 'training'
            ? 'Training focus'
            : 'Deep Work'),
  ).slice(0, 80)
  return nativeLiveActivityUpsert({
    kind,
    title,
    subtitle,
    progress: status === 'ending' ? 1 : undefined,
  })
}

export function endFocusLiveActivity(mode) {
  const kind = String(mode || '') === 'training' ? 'training' : 'focus'
  return nativeLiveActivityEnd(kind)
}
