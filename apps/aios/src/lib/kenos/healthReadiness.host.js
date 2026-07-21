/**
 * Kenos shell host for privacy-safe Health readiness.
 * Prefers injected `__KENOS_HEALTH_READINESS__` (native shell). Falls back to
 * `__KENOS_APPLE_HEALTH__.days` only when present (e.g. browser/dev) — Kenos iOS
 * no longer injects days into the shell origin.
 */
import {
  resolveInjectedHealthReadiness,
  formatHealthReadinessForAssistant,
  isSafeHealthReadiness,
} from '@life-os/platform-web/kenos-health-readiness'

/**
 * @param {{ now?: number, agent?: object }} [opts]
 */
export function loadHealthReadiness(opts = {}) {
  return resolveInjectedHealthReadiness(opts)
}

/**
 * @param {{ locale?: string, now?: number }} [opts]
 */
export function healthReadinessAssistantBlock(opts = {}) {
  const summary = loadHealthReadiness({ now: opts.now })
  if (!summary) return null
  return formatHealthReadinessForAssistant(summary, { locale: opts.locale })
}

export { isSafeHealthReadiness }
