/**
 * Home Organize (/tidy/go) → Live Activity bridge.
 * Owner-gated ActivityKit → in-shell Live Accessory preview until enabled.
 */
import {
  nativeLiveActivityEnd,
  nativeLiveActivityUpsert,
} from '@life-os/platform-web/kenos-native-bridge'

/**
 * @param {{ zoneLabel?: string, done?: number, total?: number }} [opts]
 */
export function publishTidyLiveActivity(opts = {}) {
  const done = Number(opts.done) || 0
  const total = Number(opts.total) || 0
  const zone = String(opts.zoneLabel || '').slice(0, 40)
  const subtitle = [zone || 'Organize', total > 0 ? `${done}/${total}` : null]
    .filter(Boolean)
    .join(' · ')
  return nativeLiveActivityUpsert({
    kind: 'tidy',
    title: 'Home',
    subtitle,
    progress: total > 0 ? Math.min(1, done / total) : undefined,
  })
}

export function endTidyLiveActivity() {
  return nativeLiveActivityEnd('tidy')
}
