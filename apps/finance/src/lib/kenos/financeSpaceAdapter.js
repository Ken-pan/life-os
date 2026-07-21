/**
 * Money (Finance OS) Space Continuity adapter.
 * Privacy: resume pointers only — no amounts / account numbers in displaySubtitle.
 */
import {
  buildResumeDescriptor,
  domainContinueStorageKey,
} from '@life-os/platform-web/kenos-space-continuity'

export const MONEY_SPACE_ID = 'money'
export const MONEY_ACCENT = '#3D9B6E'
export const MONEY_ICON = 'wallet'

function isBrowser() {
  return typeof window !== 'undefined'
}

/**
 * @param {URL | Location | string} [url]
 */
export function readMoneyResumeQuery(url = isBrowser() ? window.location.href : '/') {
  try {
    const u = typeof url === 'string' ? new URL(url, 'https://local.invalid') : new URL(url.href)
    return {
      section: u.searchParams.get('kenosSection') || null,
      scrollAnchor: u.searchParams.get('kenosScroll') || null,
    }
  } catch {
    return { section: null, scrollAnchor: null }
  }
}

/**
 * Strip digits that look like money amounts from resume labels.
 * @param {string} text
 */
export function sanitizeMoneySubtitle(text) {
  return String(text || '')
    .replace(/[¥$€£]\s*[\d,.]+/g, '[amount]')
    .replace(/\b\d{1,3}([,.]\d{3})+([.]\d+)?\b/g, '[amount]')
    .slice(0, 200)
}

/**
 * @param {{
 *   pathname?: string,
 *   search?: string,
 *   sectionLabel?: string | null,
 *   userId?: string | null,
 * }} [opts]
 */
export function suspendMoneySpace(opts = {}) {
  const pathname =
    opts.pathname ?? (isBrowser() ? window.location.pathname : '/home/today')
  const search = opts.search ?? (isBrowser() ? window.location.search : '')
  const route = `${pathname}${search}`
  const section =
    opts.sectionLabel ||
    (pathname.includes('transaction')
      ? 'Transactions'
      : pathname.includes('plan') || pathname.includes('forecast')
        ? 'Plan'
        : pathname.includes('account')
          ? 'Accounts'
          : 'Today')

  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: MONEY_SPACE_ID,
    route: route.startsWith('http') ? route : route || '/home/today',
    displayTitle: 'Money',
    displaySubtitle: sanitizeMoneySubtitle(section),
    substate: {
      section,
      // Never persist raw balances in Continuity global state.
      privacy: 'sensitive',
    },
  })
}

/**
 * @param {ReturnType<typeof buildResumeDescriptor> | null} [descriptor]
 */
export async function resumeMoneySpace(descriptor = null) {
  if (!isBrowser()) return { ok: false, reason: 'ssr' }
  const { goto } = await import('$app/navigation')
  let route = descriptor?.route || '/home/today'
  if (route.startsWith('http')) {
    try {
      const u = new URL(route)
      route = `${u.pathname}${u.search}`
    } catch {
      route = '/home/today'
    }
  }
  await goto(route, { replaceState: true, noScroll: true })
  return { ok: true, route }
}

export function installMoneyLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      void resumeMoneySpace({
        version: 1,
        userId: 'anonymous',
        spaceId: MONEY_SPACE_ID,
        route: '/history',
        displayTitle: 'Money',
        displaySubtitle: 'Transactions',
        updatedAt: new Date().toISOString(),
      })
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
}

/**
 * @param {ReturnType<typeof buildResumeDescriptor>} [descriptor]
 * @param {string | null} [userId]
 */
export function persistMoneyContinue(descriptor, userId = null) {
  const d = descriptor || suspendMoneySpace({ userId })
  try {
    localStorage.setItem(domainContinueStorageKey('finance', userId), JSON.stringify(d))
  } catch {
    /* ignore */
  }
  return d
}

export const financeSpaceAdapter = {
  spaceId: MONEY_SPACE_ID,
  title: 'Money',
  icon: MONEY_ICON,
  accent: MONEY_ACCENT,
  async open(target) {
    if (target) await resumeMoneySpace(target)
    else if (isBrowser()) window.location.assign('/home/today')
  },
  async suspend() {
    return suspendMoneySpace()
  },
  async resume(descriptor) {
    await resumeMoneySpace(descriptor)
  },
  async getContext() {
    const d = suspendMoneySpace()
    return {
      spaceId: MONEY_SPACE_ID,
      title: 'Money',
      route: d.route,
      entityId: null,
      summary: d.displaySubtitle,
    }
  },
  async clearUserState(userId) {
    try {
      localStorage.removeItem(domainContinueStorageKey('finance', userId))
    } catch {
      /* ignore */
    }
  },
}
