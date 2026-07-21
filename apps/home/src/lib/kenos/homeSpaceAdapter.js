/**
 * Home Continuity adapter — embedded 3D/storage canvas stays in Home app.
 */
import {
  buildResumeDescriptor,
  domainContinueStorageKey,
} from '@life-os/platform-web/kenos-space-continuity'

export const HOME_SPACE_ID = 'home'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function suspendHomeSpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/storage')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  const route = `${pathname}${search}`
  const subtitle = pathname.includes('tidy')
    ? 'Organize'
    : pathname.includes('storage')
      ? 'Rooms'
      : pathname.includes('item')
        ? 'Items'
        : 'Home'
  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: HOME_SPACE_ID,
    route: route || '/storage',
    displayTitle: 'Home',
    displaySubtitle: subtitle,
    substate: { canvas: pathname.includes('storage') || pathname === '/plan' },
  })
}

export async function resumeHomeSpace(descriptor = null) {
  if (!isBrowser()) return { ok: false, reason: 'ssr' }
  const { goto } = await import('$app/navigation')
  let route = descriptor?.route || '/storage'
  if (route.startsWith('http')) {
    try {
      const u = new URL(route)
      route = `${u.pathname}${u.search}`
    } catch {
      route = '/storage'
    }
  }
  await goto(route, { replaceState: true, noScroll: true })
  return { ok: true, route }
}

export function installHomeLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {},
  }
}

export function persistHomeContinue(descriptor, userId = null) {
  const d = descriptor || suspendHomeSpace({ userId })
  try {
    localStorage.setItem(domainContinueStorageKey('home', userId), JSON.stringify(d))
  } catch {
    /* ignore */
  }
  return d
}
