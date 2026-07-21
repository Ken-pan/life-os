/**
 * Health Continuity adapter — single domain (Status/Focus/Trends).
 * No medical decisions; Continuity stores route pointers only.
 */
import {
  buildResumeDescriptor,
  writeDomainContinue,
} from '@life-os/platform-web/kenos-space-continuity'
import {
  installNavManifestPublisher,
  publishNavManifest,
} from '@life-os/platform-web/kenos-native-bridge'
import { sensory } from '@life-os/platform-web/kenos-sensory'

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

/** @returns {{ domainId: string, path: string, title: string, activeTab: string, canGoBack: boolean, currentEntity: string, liveState: string, unsavedDraft: boolean, summary: string }} */
export function buildHealthNavManifest() {
  const path = isBrowser()
    ? `${window.location.pathname}${window.location.search}`
    : '/'
  const pathname = isBrowser() ? window.location.pathname : '/'
  let activeTab = 'status'
  let summary = 'Status'
  if (pathname.startsWith('/focus')) {
    activeTab = 'focus'
    summary = 'Focus'
  } else if (pathname.startsWith('/trends')) {
    activeTab = 'trends'
    summary = 'Trends'
  } else if (pathname.startsWith('/settings')) {
    // Settings lives under Domain More — not a capsule slot.
    activeTab = 'more'
    summary = 'Settings'
  }
  return {
    domainId: HEALTH_SPACE_ID,
    path,
    title: 'Health',
    activeTab,
    canGoBack: isBrowser() ? window.history.length > 1 : false,
    currentEntity: '',
    liveState: activeTab === 'focus' ? 'active' : 'idle',
    unsavedDraft: false,
    summary,
  }
}

export function publishHealthNavManifest() {
  return publishNavManifest(buildHealthNavManifest())
}

export function installHealthLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      void sensory('soft')
      void resumeHealthSpace({
        version: 1,
        userId: 'anonymous',
        spaceId: HEALTH_SPACE_ID,
        route: '/focus',
        displayTitle: 'Health',
        displaySubtitle: 'Focus',
        updatedAt: new Date().toISOString(),
      })
      void publishHealthNavManifest()
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
  void publishHealthNavManifest()
  if (!window.__KENOS_HEALTH_NAV_PUBLISHER__) {
    window.__KENOS_HEALTH_NAV_PUBLISHER__ = installNavManifestPublisher(
      () => buildHealthNavManifest(),
      { intervalMs: 700 },
    )
  }
}

export function persistHealthContinue(descriptor, userId = null) {
  const d = descriptor || suspendHealthSpace({ userId })
  try {
    writeDomainContinue(HEALTH_SPACE_ID, userId, d)
  } catch {
    /* ignore */
  }
  return d
}
