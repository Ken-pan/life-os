/**
 * Kenos Space Switcher — shared resume / recent / pinned model.
 * One user-scoped source of truth for Web (Apple mirrors the same contract).
 *
 * Does NOT open fifth top-level tab. System IA stays:
 * Today · Assistant · Spaces · Inbox
 */

import { buildSpacesList, spaceListKey } from './spacesList.core.js'

/** @typedef {{ listKey: string, id: string, label: string, detail?: string, href: string, external?: boolean, namespace?: string }} SpaceEntry */
/** @typedef {{ listKey: string, lastRoute: string, selectedEntityId?: string | null, filter?: string | null, updatedAt: number }} SpaceResumeState */
/** @typedef {{ ownerId: string | null, recent: string[], pinned: string[], resume: Record<string, SpaceResumeState>, currentListKey: string | null }} SpaceSwitcherState */

export const SPACE_SWITCHER_STORAGE_KEY = 'kenos.spaceSwitcher.v1'
export const SPACE_SWITCHER_MAX_RECENT = 6
export const SYSTEM_RETURN_LIST_KEY = 'system:today'

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
 * @param {Partial<SpaceSwitcherState> | null | undefined} raw
 * @returns {SpaceSwitcherState}
 */
export function normalizeSpaceSwitcherState(raw) {
  const recent = Array.isArray(raw?.recent)
    ? raw.recent.map(String).filter(Boolean).slice(0, SPACE_SWITCHER_MAX_RECENT)
    : []
  const pinned = Array.isArray(raw?.pinned)
    ? [...new Set(raw.pinned.map(String).filter(Boolean))]
    : []
  /** @type {Record<string, SpaceResumeState>} */
  const resume = {}
  if (raw?.resume && typeof raw.resume === 'object') {
    for (const [key, value] of Object.entries(raw.resume)) {
      if (!value || typeof value !== 'object') continue
      const lastRoute = String(value.lastRoute || '').trim()
      if (!lastRoute) continue
      resume[key] = {
        listKey: key,
        lastRoute,
        selectedEntityId: value.selectedEntityId ? String(value.selectedEntityId) : null,
        filter: value.filter != null ? String(value.filter) : null,
        updatedAt: Number(value.updatedAt) || 0,
      }
    }
  }
  return {
    ownerId: raw?.ownerId != null ? String(raw.ownerId) : null,
    recent,
    pinned,
    resume,
    currentListKey: raw?.currentListKey != null ? String(raw.currentListKey) : null,
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
  return {
    ...state,
    recent,
    currentListKey: key,
    resume: {
      ...state.resume,
      [key]: {
        ...(state.resume[key] || { listKey: key, lastRoute: '', selectedEntityId: null, filter: null }),
        listKey: key,
        updatedAt: now,
        lastRoute: state.resume[key]?.lastRoute || '',
      },
    },
  }
}

/**
 * Persist last route / entity for a Space (user-scoped resume).
 * @param {SpaceSwitcherState} state
 * @param {string} listKey
 * @param {{ lastRoute: string, selectedEntityId?: string | null, filter?: string | null, now?: number }} patch
 */
export function rememberSpaceRoute(state, listKey, patch) {
  const key = String(listKey || '').trim()
  const lastRoute = String(patch.lastRoute || '').trim()
  if (!key || !lastRoute) return state
  const now = patch.now ?? Date.now()
  return {
    ...state,
    resume: {
      ...state.resume,
      [key]: {
        listKey: key,
        lastRoute,
        selectedEntityId:
          patch.selectedEntityId !== undefined
            ? patch.selectedEntityId
              ? String(patch.selectedEntityId)
              : null
            : (state.resume[key]?.selectedEntityId ?? null),
        filter:
          patch.filter !== undefined
            ? patch.filter != null
              ? String(patch.filter)
              : null
            : (state.resume[key]?.filter ?? null),
        updatedAt: now,
      },
    },
  }
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
 * Resolve href for opening a space (prefer resume route for hosted).
 * @param {SpaceEntry} space
 * @param {SpaceSwitcherState} state
 */
export function resolveSpaceOpenHref(space, state) {
  if (space.external) return space.href
  const resume = state.resume[space.listKey]
  if (resume?.lastRoute && resume.lastRoute.startsWith('/')) return resume.lastRoute
  return space.href
}

/**
 * Build switcher sections for UI.
 * @param {{
 *   catalog?: SpaceEntry[],
 *   state?: SpaceSwitcherState,
 *   includeSystemReturn?: boolean,
 * }} [options]
 */
export function buildSpaceSwitcherSections({
  catalog = buildSpaceCatalog(),
  state = emptySpaceSwitcherState(),
  includeSystemReturn = true,
} = {}) {
  const byKey = new Map(catalog.map((s) => [s.listKey, s]))
  /** @param {string[]} keys */
  const pick = (keys) =>
    keys.map((k) => byKey.get(k)).filter(Boolean)

  const recent = pick(state.recent)
  const pinned = pick(state.pinned)
  const pinnedKeys = new Set(state.pinned)
  const recentKeys = new Set(state.recent)
  const all = catalog.filter(
    (s) => !pinnedKeys.has(s.listKey) && !recentKeys.has(s.listKey),
  )

  /** @type {Array<{ id: string, title: string, items: SpaceEntry[] }>} */
  const sections = []
  if (includeSystemReturn) {
    sections.push({
      id: 'system',
      title: 'System',
      items: [
        {
          listKey: SYSTEM_RETURN_LIST_KEY,
          id: 'today',
          label: 'Today',
          detail: '返回 Kenos 系统层',
          href: '/',
          external: false,
          namespace: 'system',
        },
        {
          listKey: spaceListKey('system', 'assistant'),
          id: 'assistant',
          label: 'Assistant',
          detail: '全局助手',
          href: '/assistant',
          external: false,
          namespace: 'system',
        },
        {
          listKey: spaceListKey('system', 'spaces'),
          id: 'spaces',
          label: 'Spaces',
          detail: '领域目录',
          href: '/spaces',
          external: false,
          namespace: 'system',
        },
        {
          listKey: spaceListKey('system', 'inbox'),
          id: 'inbox',
          label: 'Inbox',
          detail: 'Approvals · Activity · Capture',
          href: '/inbox',
          external: false,
          namespace: 'system',
        },
      ],
    })
  }
  if (recent.length) sections.push({ id: 'recent', title: 'Recent', items: recent })
  if (pinned.length) sections.push({ id: 'pinned', title: 'Pinned', items: pinned })
  if (all.length) sections.push({ id: 'all', title: 'All Spaces', items: all })
  return sections
}

/**
 * Infer current Space listKey from pathname.
 * @param {string} pathname
 * @param {SpaceEntry[]} [catalog]
 */
export function inferSpaceListKeyFromPath(pathname, catalog = buildSpaceCatalog()) {
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
    if (path.startsWith('/spaces/training')) return spaceListKey('hosted', 'training')
    if (path.startsWith('/spaces/work')) return spaceListKey('hosted', 'work-focus')
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
export function saveSpaceSwitcherState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(SPACE_SWITCHER_STORAGE_KEY, JSON.stringify(normalizeSpaceSwitcherState(state)))
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
 * Bind state to an owner; clear if owner changes.
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
  if (state.ownerId && !nextOwner) {
    return emptySpaceSwitcherState()
  }
  return state
}
