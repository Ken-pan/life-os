/**
 * Health Continuity adapter — single domain (Status/Focus/Trends).
 * No medical decisions; Continuity stores route pointers only.
 */
import {
  buildResumeDescriptor,
  domainContinueStorageKey,
} from '@life-os/platform-web/kenos-space-continuity'

export const HEALTH_SPACE_ID = 'health'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function suspendHealthSpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  const route = `${pathname}${search}`
  const subtitle = pathname.startsWith('/focus')
    ? 'Focus'
    : pathname.startsWith('/trends')
      ? 'Trends'
      : 'Status'
  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: HEALTH_SPACE_ID,
    route: route || '/',
    displayTitle: 'Health',
    displaySubtitle: subtitle,
    substate: {
      // Product rule: never emit medical decision text from Continuity.
      medicalDecision: false,
    },
  })
}

export async function resumeHealthSpace(descriptor = null) {
  if (!isBrowser()) return { ok: false, reason: 'ssr' }
  const { goto } = await import('$app/navigation')
  let route = descriptor?.route || '/'
  if (route.startsWith('http')) {
    try {
      const u = new URL(route)
      route = `${u.pathname}${u.search}`
    } catch {
      route = '/'
    }
  }
  await goto(route, { replaceState: true, noScroll: true })
  return { ok: true, route }
}

export function installHealthLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {},
  }
}

export function persistHealthContinue(descriptor, userId = null) {
  const d = descriptor || suspendHealthSpace({ userId })
  try {
    localStorage.setItem(domainContinueStorageKey('health', userId), JSON.stringify(d))
  } catch {
    /* ignore */
  }
  return d
}
