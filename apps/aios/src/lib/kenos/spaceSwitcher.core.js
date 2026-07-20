/**
 * Kenos Space Switcher — shared resume / recent / pinned model (ContinueStore).
 * One user-scoped source of truth for Web (Apple mirrors the same contract).
 *
 * Resume shape: KenosResumeDescriptor (v1). Legacy SpaceResumeState is migrated on load.
 *
 * Does NOT open fifth top-level tab. System IA stays:
 * Today · Assistant · Spaces · Inbox
 */

import { knownDomainOrigins } from './domainResume.core.js'
import { buildSpacesList, spaceListKey } from './spacesList.core.js'
import {
  CONTINUE_MAX_RECENT,
  CONTINUE_STORAGE_KEY,
  CONTINUE_STORE_VERSION,
  buildResumeDescriptor,
  fallbackResumeToHome,
  isResumeExpired,
  listKeyForSpaceId,
  migrateLegacyResume,
  normalizeResumeDescriptor,
  resumeDescriptorToOpenUrl,
  spaceIdFromListKey,
  titleForSpaceId,
  toIso,
} from '@life-os/platform-web/kenos-space-continuity'

/** @typedef {{ listKey: string, id: string, label: string, detail?: string, href: string, external?: boolean, namespace?: string, accent?: string, icon?: string }} SpaceEntry */
/**
 * @typedef {import('@life-os/platform-web/kenos-space-continuity').buildResumeDescriptor extends Function
 *   ? ReturnType<typeof buildResumeDescriptor>
 *   : never} ResumeDescriptor
 */
/** @typedef {{ ownerId: string | null, recent: string[], pinned: string[], resume: Record<string, ResumeDescriptor>, currentListKey: string | null, version?: number }} SpaceSwitcherState */

export const SPACE_SWITCHER_STORAGE_KEY = CONTINUE_STORAGE_KEY
export const SPACE_SWITCHER_MAX_RECENT = CONTINUE_MAX_RECENT
export const SYSTEM_RETURN_LIST_KEY = 'system:today'
export { spaceIdFromListKey, listKeyForSpaceId, buildResumeDescriptor, isResumeExpired }

/**
 * Canonical catalog for switcher sections (hosted + external).
 * @param {Parameters<typeof buildSpacesList>[0]} [options]
 * @returns {SpaceEntry[]}
 */
export function buildSpaceCatalog(options) {
  return buildSpacesList(options).map((space) => ({
    ...space,
    namespace: space.external ? 'external' : 'hosted',
  }))
}

/**
 * SpaceRegistry view of the catalog (contract-aligned).
 * @param {Parameters<typeof buildSpacesList>[0]} [options]
 */
export function buildSpaceRegistry(options) {
  return buildSpaceCatalog(options).map((space) => ({
    spaceId: spaceIdFromListKey(space.listKey),
    title: space.label,
    icon: space.icon || space.id,
    accent: space.accent || 'var(--border)',
    listKey: space.listKey,
    href: space.href,
    external: Boolean(space.external),
  }))
}

/**
 * @param {Partial<SpaceSwitcherState> | null | undefined} raw
 * @param {{ now?: number, userId?: string | null }} [opts]
 * @returns {SpaceSwitcherState}
 */
export function normalizeSpaceSwitcherState(raw, { now = Date.now(), userId = null } = {}) {
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.map(String).filter(Boolean).slice(0, SPACE_SWITCHER_MAX_RECENT)
    : []
  const pinned = Array.isArray(raw?.pinned)
    ? [...new Set(raw.pinned.map(String).filter(Boolean))]
    : []
  const ownerId =
    raw?.ownerId != null
      ? String(raw.ownerId)
      : userId != null
        ? String(userId)
        : null

  /** @type {Record<string, ResumeDescriptor>} */
  const resume = {}
  if (raw?.resume && typeof raw.resume === 'object') {
    for (const [key, value] of Object.entries(raw.resume)) {
      if (!value || typeof value !== 'object') continue
      const listKey = key
      /** @type {any} */
      const v = value
      let descriptor =
        v.route != null
          ? normalizeResumeDescriptor(
              {
                ...v,
                spaceId: v.spaceId || spaceIdFromListKey(listKey),
                userId: v.userId || ownerId || 'anonymous',
              },
              { now },
            )
          : migrateLegacyResume(listKey, v, ownerId)

      if (!descriptor) continue
      // Bind owner on migrate
      if (ownerId && descriptor.userId === 'anonymous') {
        descriptor = { ...descriptor, userId: ownerId }
      }
      // Drop cross-user leaks
      if (ownerId && descriptor.userId && descriptor.userId !== ownerId) continue
      resume[listKey] = descriptor
    }
  }

  return {
    version: CONTINUE_STORE_VERSION,
    ownerId,
    recent,
    pinned,
    resume,
    currentListKey:
      raw?.currentListKey != null ? String(raw.currentListKey) : null,
  }
}

/**
 * Empty state after logout / account switch.
 * @returns {SpaceSwitcherState}
 */
export function emptySpaceSwitcherState() {
  return normalizeSpaceSwitcherState(null)
}

/**
 * @param {SpaceSwitcherState} state
 * @param {string} listKey
 * @param {{ now?: number }} [opts]
 */
export function touchRecentSpace(state, listKey, { now = Date.now() } = {}) {
  const key = String(listKey || '').trim()
  if (!key || key === SYSTEM_RETURN_LIST_KEY || key.startsWith('system:')) {
    return {
      ...state,
      currentListKey: key || SYSTEM_RETURN_LIST_KEY,
    }
  }
  const recent = [key, ...state.recent.filter((k) => k !== key)].slice(
    0,
    SPACE_SWITCHER_MAX_RECENT,
  )
  const existing = state.resume[key]
  const nextResume = existing
    ? {
        ...state.resume,
        [key]: { ...existing, updatedAt: toIso(now) },
      }
    : state.resume
  return {
    ...state,
    recent,
    currentListKey: key,
    resume: nextResume,
  }
}

/**
 * Persist resume for a Space (user-scoped ResumeDescriptor).
 * Accepts legacy patch ({ lastRoute, filter, selectedEntityId }) or full descriptor fields.
 *
 * @param {SpaceSwitcherState} state
 * @param {string} listKey
 * @param {{
 *   lastRoute?: string,
 *   route?: string,
 *   selectedEntityId?: string | null,
 *   entityId?: string | null,
 *   filter?: string | null,
 *   displayTitle?: string,
 *   displaySubtitle?: string | null,
 *   substate?: Record<string, unknown>,
 *   now?: number,
 *   expiresAt?: string | number | null,
 * }} patch
 */
export function rememberSpaceRoute(state, listKey, patch) {
  const key = String(listKey || '').trim()
  const route = String(patch.route || patch.lastRoute || '').trim()
  if (!key || !route) return state
  const now = patch.now ?? Date.now()
  const spaceId = spaceIdFromListKey(key)
  const prev = state.resume[key]
  const entityId =
    patch.entityId !== undefined
      ? patch.entityId
      : patch.selectedEntityId !== undefined
        ? patch.selectedEntityId
        : (prev?.entityId ?? null)
  const displaySubtitle =
    patch.displaySubtitle !== undefined
      ? patch.displaySubtitle
      : patch.filter !== undefined
        ? patch.filter
        : (prev?.displaySubtitle ?? null)
  const substate = {
    ...(prev?.substate || {}),
    ...(patch.substate || {}),
  }
  // Do not coerce display `filter` copy into machine substate.filter (breaks deep links).

  const descriptor = buildResumeDescriptor({
    userId: state.ownerId,
    spaceId,
    listKey: key,
    route,
    entityId: entityId || undefined,
    displayTitle:
      patch.displayTitle || prev?.displayTitle || titleForSpaceId(spaceId),
    displaySubtitle: displaySubtitle || undefined,
    substate: Object.keys(substate).length ? substate : undefined,
    updatedAt: now,
    expiresAt: patch.expiresAt,
  })

  return {
    ...state,
    resume: {
      ...state.resume,
      [key]: descriptor,
    },
  }
}

/**
 * Upsert a full ResumeDescriptor (from domain handoff).
 * @param {SpaceSwitcherState} state
 * @param {ResumeDescriptor} descriptor
 * @param {{ listKey?: string }} [opts]
 */
export function upsertResumeDescriptor(state, descriptor, { listKey } = {}) {
  const normalized = normalizeResumeDescriptor(descriptor)
  if (!normalized) return state
  if (
    state.ownerId &&
    normalized.userId &&
    normalized.userId !== 'anonymous' &&
    normalized.userId !== state.ownerId
  ) {
    return state
  }
  const key =
    listKey ||
    listKeyForSpaceId(normalized.spaceId, 'hosted')
  let next = touchRecentSpace(state, key, {
    now: Date.parse(normalized.updatedAt) || Date.now(),
  })
  next = {
    ...next,
    resume: {
      ...next.resume,
      [key]: {
        ...normalized,
        userId: state.ownerId || normalized.userId,
      },
    },
  }
  return next
}

/**
 * @param {SpaceSwitcherState} state
 * @param {string} listKey
 * @param {boolean} [pinned]
 */
export function setPinnedSpace(state, listKey, pinned = true) {
  const key = String(listKey || '').trim()
  if (!key) return state
  const next = pinned
    ? [...new Set([...state.pinned, key])]
    : state.pinned.filter((k) => k !== key)
  return { ...state, pinned: next }
}

/**
 * Same-origin resume for external Spaces (catalog href is absolute https).
 * @param {string} catalogHref
 * @param {string} lastRoute
 */
export function isAllowedExternalResume(catalogHref, lastRoute) {
  const route = String(lastRoute || '').trim()
  const catalog = String(catalogHref || '').trim()
  if (!route || !catalog) return false
  try {
    const catalogUrl = new URL(catalog)
    const next = route.startsWith('/')
      ? new URL(route, catalogUrl.origin)
      : new URL(route)
    return next.origin === catalogUrl.origin
  } catch {
    return false
  }
}

/**
 * Absolute https resume into a known Life OS domain app.
 * @param {string} lastRoute
 * @param {string[]} [allowedOrigins]
 */
export function isKnownDomainResume(
  lastRoute,
  allowedOrigins = knownDomainOrigins(),
) {
  try {
    const next = new URL(String(lastRoute || '').trim())
    return allowedOrigins.some((origin) => next.origin === origin)
  } catch {
    return false
  }
}

/**
 * Record a navigation into a Space without clobbering known-domain https resume.
 * Visiting `/spaces/plan` (bridge) must not replace `https://planner…/upcoming`.
 *
 * @param {SpaceSwitcherState} state
 * @param {string} pathname
 * @param {SpaceEntry[]} [catalog]
 * @returns {SpaceSwitcherState}
 */
export function applySpaceVisit(
  state,
  pathname,
  catalog = buildSpaceCatalog(),
) {
  const listKey = inferSpaceListKeyFromPath(pathname, catalog)
  let next = touchRecentSpace(state, listKey)
  if (!listKey.startsWith('hosted:')) return next

  const existing = next.resume[listKey]?.route
  const visitingBridge = /^\/spaces\//.test(pathname)
  if (visitingBridge && existing && isKnownDomainResume(existing)) {
    return next
  }
  return rememberSpaceRoute(next, listKey, { lastRoute: pathname })
}

/**
 * Resolve href for opening a space (with expiry → honest home fallback).
 * @param {SpaceEntry} space
 * @param {SpaceSwitcherState} state
 * @param {{ now?: number }} [opts]
 */
export function resolveSpaceOpenHref(space, state, { now = Date.now() } = {}) {
  const resume = state.resume[space.listKey]
  if (!resume?.route) return space.href

  let descriptor = resume
  if (isResumeExpired(resume, now)) {
    descriptor = fallbackResumeToHome(resume, space.href)
  }

  const route = String(descriptor.route || '').trim()
  if (!route) return space.href

  try {
    const openUrl = resumeDescriptorToOpenUrl(descriptor, {
      origin: /^https?:\/\//i.test(space.href)
        ? new URL(space.href).origin
        : undefined,
    })
    if (openUrl.startsWith('/') && !space.external) return openUrl
    if (space.external && isAllowedExternalResume(space.href, openUrl))
      return openUrl
    if (!space.external && isKnownDomainResume(openUrl)) return openUrl
    if (route.startsWith('/') && !space.external) return route
    if (space.external && isAllowedExternalResume(space.href, route)) return route
    if (!space.external && isKnownDomainResume(route)) return route
  } catch {
    /* fall through */
  }
  return space.href
}

/**
 * Build switcher sections for UI.
 * Interaction order: Recent → Pinned → All → System(Today only).
 * @param {{
 *   catalog?: SpaceEntry[],
 *   state?: SpaceSwitcherState,
 *   includeSystemReturn?: boolean,
 *   now?: number,
 * }} [options]
 */
export function buildSpaceSwitcherSections({
  catalog = buildSpaceCatalog(),
  state = emptySpaceSwitcherState(),
  includeSystemReturn = true,
  now = Date.now(),
} = {}) {
  const byKey = new Map(catalog.map((s) => [s.listKey, s]))
  /** @param {string[]} keys */
  const pick = (keys) =>
    keys
      .map((k) => byKey.get(k))
      .filter(Boolean)
      .map((space) => annotateSpaceWithResume(space, state, { now }))

  const recent = pick(state.recent).slice(0, 4)
  const pinned = pick(state.pinned)
  // All Spaces = full catalog (App Library / Applications honesty).
  // Recent + Pinned stay shortcut strips; count must not shrink to "remainder".
  const all = catalog.map((space) => annotateSpaceWithResume(space, state, { now }))

  /** @type {Array<{ id: string, title: string, items: SpaceEntry[] }>} */
  const sections = []
  if (recent.length)
    sections.push({ id: 'recent', title: 'Recent', items: recent })
  if (pinned.length)
    sections.push({ id: 'pinned', title: 'Pinned', items: pinned })
  if (all.length) sections.push({ id: 'all', title: 'All Spaces', items: all })
  if (includeSystemReturn) {
    sections.push({
      id: 'system',
      title: 'System',
      items: [
        {
          listKey: SYSTEM_RETURN_LIST_KEY,
          id: 'today',
          label: 'Today',
          detail: '系统 Today',
          href: '/',
          external: false,
          namespace: 'system',
        },
      ],
    })
  }
  return sections
}

/**
 * Relative time for Continue rows (user-facing, zh-CN style).
 * @param {number | string} updatedAt
 * @param {number} [now]
 */
export function formatResumeRelativeTime(updatedAt, now = Date.now()) {
  const ts =
    typeof updatedAt === 'string'
      ? Date.parse(updatedAt)
      : Number(updatedAt) || 0
  if (!ts) return ''
  const deltaSec = Math.max(0, Math.floor((now - ts) / 1000))
  if (deltaSec < 60) return '刚刚'
  const mins = Math.floor(deltaSec / 60)
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(ts))
  } catch {
    return ''
  }
}

/**
 * Prefer resume displaySubtitle / route as secondary line for Continue semantics.
 * @param {SpaceEntry} space
 * @param {SpaceSwitcherState} state
 * @param {{ now?: number }} [opts]
 * @returns {SpaceEntry & { resumeAt?: string, accent?: string, expired?: boolean, progress?: string }}
 */
export function annotateSpaceWithResume(space, state, { now = Date.now() } = {}) {
  const resume = state.resume?.[space.listKey]
  if (!resume) return space
  const expired = isResumeExpired(resume, now)
  const resumeAt = formatResumeRelativeTime(resume.updatedAt, now)
  /** @type {SpaceEntry & { resumeAt?: string, expired?: boolean, progress?: string }} */
  let next = {
    ...space,
    resumeAt: resumeAt || undefined,
    expired: expired || undefined,
  }

  const subtitle = resume.displaySubtitle
  if (subtitle) {
    next = {
      ...next,
      detail: expired ? `${subtitle} · 将回到入口` : subtitle,
      progress: resume.substate?.progress
        ? String(resume.substate.progress)
        : undefined,
    }
    return next
  }

  const route = resume.route
  if (route && route !== space.href) {
    try {
      const url = new URL(route)
      const path = url.pathname === '/' ? url.hostname : url.pathname
      return { ...next, detail: path }
    } catch {
      return {
        ...next,
        detail: route.startsWith('/') ? route : '继续上次位置',
      }
    }
  }
  if (resume.entityId) {
    return { ...next, detail: `已选 · ${resume.entityId}` }
  }
  return next
}

/**
 * Infer current Space listKey from pathname.
 * @param {string} pathname
 * @param {SpaceEntry[]} [catalog]
 */
export function inferSpaceListKeyFromPath(
  pathname,
  catalog = buildSpaceCatalog(),
) {
  const path = pathname || '/'
  if (path === '/spaces') return spaceListKey('system', 'spaces')
  if (
    path === '/' ||
    path === '/assistant' ||
    path === '/inbox' ||
    path === '/approvals' ||
    path === '/activity' ||
    path === '/settings' ||
    path === '/history' ||
    path === '/focus'
  ) {
    return SYSTEM_RETURN_LIST_KEY
  }
  if (path === '/work' || path.startsWith('/work/')) {
    return spaceListKey('hosted', 'work')
  }
  if (path.startsWith('/spaces/')) {
    const hosted = catalog.find((s) => !s.external && s.href === path)
    if (hosted) return hosted.listKey
    if (path.startsWith('/spaces/training'))
      return spaceListKey('hosted', 'training')
    if (path.startsWith('/spaces/plan')) return spaceListKey('hosted', 'plan')
    if (path.startsWith('/spaces/money')) return spaceListKey('hosted', 'money')
    if (path.startsWith('/spaces/music')) return spaceListKey('hosted', 'music')
    if (path.startsWith('/spaces/home')) return spaceListKey('hosted', 'home')
    if (path.startsWith('/spaces/knowledge'))
      return spaceListKey('hosted', 'knowledge')
    if (path.startsWith('/spaces/work'))
      return spaceListKey('hosted', 'work-focus')
  }
  return SYSTEM_RETURN_LIST_KEY
}

/**
 * Read/write helpers for browser storage (injectable for tests).
 * @param {{ getItem?: (k: string) => string | null, setItem?: (k: string, v: string) => void, removeItem?: (k: string) => void }} [storage]
 */
export function loadSpaceSwitcherState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(SPACE_SWITCHER_STORAGE_KEY)
    if (!raw) return emptySpaceSwitcherState()
    return normalizeSpaceSwitcherState(JSON.parse(raw))
  } catch {
    return emptySpaceSwitcherState()
  }
}

/**
 * @param {SpaceSwitcherState} state
 * @param {{ setItem?: (k: string, v: string) => void }} [storage]
 */
export function saveSpaceSwitcherState(
  state,
  storage = globalThis.localStorage,
) {
  try {
    storage?.setItem?.(
      SPACE_SWITCHER_STORAGE_KEY,
      JSON.stringify(normalizeSpaceSwitcherState(state)),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {{ removeItem?: (k: string) => void }} [storage]
 */
export function clearSpaceSwitcherState(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(SPACE_SWITCHER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return emptySpaceSwitcherState()
}

/**
 * Bind state to an owner; clear only when owner **changes** to another id.
 * Auth still loading (`ownerId == null`) must not wipe an already-owned Continue store —
 * logout uses `clearSpaceSwitcherOnLogout` / `clearSpaceSwitcherState` explicitly.
 * @param {SpaceSwitcherState} state
 * @param {string | null | undefined} ownerId
 */
export function bindSpaceSwitcherOwner(state, ownerId) {
  const nextOwner = ownerId != null ? String(ownerId) : null
  if (state.ownerId && nextOwner && state.ownerId !== nextOwner) {
    return { ...emptySpaceSwitcherState(), ownerId: nextOwner }
  }
  if (!state.ownerId && nextOwner) {
    return { ...state, ownerId: nextOwner }
  }
  // Auth loading / transient null: keep disk-backed Continue (do not clear).
  if (state.ownerId && !nextOwner) {
    return state
  }
  return state
}
