/**
 * Money (Finance OS) Space Continuity adapter.
 * Privacy: resume pointers only — no amounts / account numbers in displaySubtitle.
 */
import {
  buildResumeDescriptor,
  clearDomainContinue,
  writeDomainContinue,
} from '@life-os/platform-web/kenos-space-continuity'
import {
  installNavManifestPublisher,
  publishNavManifest,
} from '@life-os/platform-web/kenos-native-bridge'
import { sensory } from '@life-os/platform-web/kenos-sensory'

export const MONEY_SPACE_ID = 'money'
export const MONEY_ACCENT = '#3D9B6E'
export const MONEY_ICON = 'wallet'

function isBrowser() {
  return typeof window !== 'undefined'
}

/** @typedef {'drawer' | 'compose' | 'sheet'} MoneyOverlayKind */

/** Overlay registry for Domain dock hide (native reads liveState). */
const moneyOverlay = {
  /** @type {MoneyOverlayKind | null} */
  kind: null,
}

/**
 * Sync liveState to native Domain dock. Call from drawer mount/unmount.
 * @param {MoneyOverlayKind | null} kind
 */
export function setMoneyOverlay(kind) {
  moneyOverlay.kind = kind || null
  if (isBrowser()) {
    try {
      if (moneyOverlay.kind) {
        document.documentElement.dataset.kenosLiveState = moneyOverlay.kind
      } else {
        delete document.documentElement.dataset.kenosLiveState
      }
    } catch {
      /* ignore */
    }
    void publishMoneyNavManifest()
  }
}

export function clearMoneyOverlay() {
  setMoneyOverlay(null)
}

/** Overlay states that should hide the native Domain dock. */
export function resolveMoneyLiveState() {
  if (moneyOverlay.kind) return moneyOverlay.kind
  if (isBrowser()) {
    try {
      const c = new URLSearchParams(window.location.search).get('compose')
      if (c === '1' || c === 'true') return 'compose'
    } catch {
      /* ignore */
    }
  }
  return 'idle'
}

/**
 * @param {URL | Location | string} [url]
 */
export function readMoneyResumeQuery(
  url = isBrowser() ? window.location.href : '/',
) {
  try {
    const u =
      typeof url === 'string'
        ? new URL(url, 'https://local.invalid')
        : new URL(url.href)
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
  const sectionRaw =
    opts.sectionLabel ||
    (pathname.includes('transaction')
      ? 'Transactions'
      : pathname.includes('plan') || pathname.includes('forecast')
        ? 'Plan'
        : pathname.includes('account')
          ? 'Accounts'
          : 'Today')
  const section = sanitizeMoneySubtitle(sectionRaw)

  return buildResumeDescriptor({
    userId: opts.userId ?? null,
    spaceId: MONEY_SPACE_ID,
    route: route.startsWith('http') ? route : route || '/home/today',
    displayTitle: 'Money',
    displaySubtitle: section,
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

/** @returns {{ domainId: string, path: string, title: string, activeTab: string, canGoBack: boolean, currentEntity: string, liveState: string, unsavedDraft: boolean, summary: string }} */
export function buildMoneyNavManifest() {
  const path = isBrowser()
    ? `${window.location.pathname}${window.location.search}`
    : '/home/today'
  const pathname = isBrowser() ? window.location.pathname : '/home/today'
  // Align with KenosDomainRegistry Money dock: Today · History · Accounts · More
  let activeTab = 'today'
  if (pathname.startsWith('/accounts')) activeTab = 'accounts'
  else if (pathname.startsWith('/history')) activeTab = 'history'
  else if (
    pathname.startsWith('/forecast') ||
    pathname.startsWith('/plan') ||
    pathname.startsWith('/stocks') ||
    pathname.startsWith('/decision') ||
    pathname.startsWith('/review') ||
    pathname.startsWith('/settings')
  ) {
    activeTab = 'more'
  } else if (pathname.startsWith('/home')) activeTab = 'today'
  const d = suspendMoneySpace()
  return {
    domainId: MONEY_SPACE_ID,
    path,
    title: 'Money',
    activeTab,
    canGoBack: isBrowser() ? window.history.length > 1 : false,
    currentEntity: '',
    liveState: resolveMoneyLiveState(),
    unsavedDraft: false,
    // Privacy: never put amounts into native chrome cache.
    summary: sanitizeMoneySubtitle(d.displaySubtitle || 'Money'),
  }
}

export function publishMoneyNavManifest() {
  return publishNavManifest(buildMoneyNavManifest())
}

export function installMoneyLeaveGuard() {
  if (!isBrowser()) return
  window.__KENOS_LEAVE_GUARD__ = {
    probe() {
      return { dirty: false, summary: '' }
    },
    discard() {},
    compose() {
      void sensory('soft')
      // Open History insights with compose=1 → TxnEntryDrawer (记一笔).
      void resumeMoneySpace({
        version: 1,
        userId: 'anonymous',
        spaceId: MONEY_SPACE_ID,
        route: '/history/insights?compose=1',
        displayTitle: 'Money',
        displaySubtitle: 'Add transaction',
        updatedAt: new Date().toISOString(),
      })
      void publishMoneyNavManifest()
    },
  }
  window.__KENOS_DOMAIN_COMPOSE__ = () => {
    window.__KENOS_LEAVE_GUARD__?.compose?.()
  }
  void publishMoneyNavManifest()
  if (!window.__KENOS_MONEY_NAV_PUBLISHER__) {
    window.__KENOS_MONEY_NAV_PUBLISHER__ = installNavManifestPublisher(
      () => buildMoneyNavManifest(),
      { intervalMs: 700 },
    )
  }
}

/**
 * @param {ReturnType<typeof buildResumeDescriptor>} [descriptor]
 * @param {string | null} [userId]
 */
export function persistMoneyContinue(descriptor, userId = null) {
  const d = descriptor || suspendMoneySpace({ userId })
  try {
    writeDomainContinue(MONEY_SPACE_ID, userId, d)
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
      clearDomainContinue(MONEY_SPACE_ID, userId)
    } catch {
      /* ignore */
    }
  },
}
