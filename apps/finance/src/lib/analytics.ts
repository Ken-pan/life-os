import type { AppRoute } from './appRoute'
import {
  analyticsEventForRoute,
  analyticsPathForRoute,
  FUNNEL_EVENTS,
} from './analyticsRoutes'

export type AnalyticsEvent = {
  name: string
  ts: number
  props?: Record<string, string | number | boolean>
}

const STORAGE_KEY = 'finance_os_analytics_v1'
const MAX_EVENTS = 500

function analyticsEnabled(): boolean {
  return import.meta.env.VITE_ANALYTICS_ENABLED !== 'false'
}

function readEvents(): AnalyticsEvent[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AnalyticsEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeEvents(events: AnalyticsEvent[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)))
  } catch {
    /* quota / private mode */
  }
}

export function track(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (!analyticsEnabled()) return

  const event: AnalyticsEvent = {
    name,
    ts: Date.now(),
    ...(props && Object.keys(props).length > 0 ? { props } : {}),
  }

  if (import.meta.env.DEV) {
    console.debug('[analytics]', event)
  }

  writeEvents([...readEvents(), event])
  forwardEvent(event)
}

function forwardEvent(event: AnalyticsEvent): void {
  const hook = import.meta.env.VITE_ANALYTICS_WEBHOOK_URL
  if (!hook) return
  void fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {
    /* optional remote sink */
  })
}

export function trackNavView(route: AppRoute): void {
  track(analyticsEventForRoute(route), {
    path: analyticsPathForRoute(route),
  })
}

export function trackFunnel(
  name: (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS],
  props?: Record<string, string | number | boolean>,
): void {
  track(name, props)
}

export function getRecentAnalytics(limit = 50): AnalyticsEvent[] {
  return readEvents().slice(-limit)
}

export function exportAnalyticsJson(): string {
  return JSON.stringify(readEvents(), null, 2)
}

export function clearAnalytics(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export { FUNNEL_EVENTS } from './analyticsRoutes'

export function countAnalyticsByPrefix(prefix: string): number {
  return readEvents().filter((e) => e.name.startsWith(prefix)).length
}
