/**
 * Kenos Domain Integration Contract — shared registry for Continuity / dock / shelf / Today.
 *
 * SSOT for domain IDs, nav manifests, launch destinations, and provider stubs.
 * Accents/glyphs reuse domainIdentity.core.js (do not fork colors here).
 *
 * Apple client mirrors IDs/paths in `clients/apple/Apps/Shared/KenosDomainRegistry.swift`.
 * When manifests change, update both; this JS module is the documented SSOT.
 *
 * Serializable only — no View instances, no screenshot blobs, no secrets.
 */

import {
  DOMAIN_IDENTITY,
  domainAccent,
  domainIcon,
  resolveDomainIdentity,
} from './domainIdentity.core.js'

/** @typedef {'native' | 'embedded_web' | 'legacy_fallback'} DomainStrategy */

/**
 * @typedef {{
 *   title: string,
 *   systemImage: string,
 *   path?: string | null,
 *   opensMore?: boolean,
 *   returnsToKenos?: boolean,
 * }} DomainDockSlot
 */

/**
 * @typedef {{
 *   domainId: string,
 *   slots: DomainDockSlot[],
 *   more?: Array<{ title: string, systemImage: string, path: string }>,
 * }} DomainNavigationManifest
 */

/**
 * @typedef {{
 *   kind: 'kenos_tab' | 'embedded_url' | 'hosted_route' | 'unavailable',
 *   tab?: string,
 *   url?: string | null,
 *   path?: string | null,
 *   domainId: string,
 *   listKey: string,
 *   reason?: string,
 * }} DomainLaunchResult
 */

/**
 * @typedef {{
 *   domainId: string,
 *   listKey: string,
 *   shellMode: 'kenos' | 'domain',
 *   routePath: string | null,
 *   resumeRoute: string | null,
 *   updatedAt: string | null,
 *   focusActive: boolean,
 * }} DomainRuntimeState
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   subtitle: string,
 *   strategy: DomainStrategy,
 *   appId: string | null,
 *   productionOrigin: string | null,
 *   devPort: number | null,
 *   homePath: string,
 *   listKey: string,
 *   accent: string,
 *   icon: string,
 *   systemImage: string,
 *   aliases: string[],
 *   integrationStatus: 'reference' | 'integrated' | 'partial' | 'legacy_fallback' | 'missing',
 *   dataOwner: string,
 *   privacy: 'normal' | 'sensitive' | 'medical_non_decision',
 *   shelfSection: 'active' | 'recent' | 'all',
 *   providers: {
 *     continue: boolean,
 *     shelf: boolean,
 *     today: boolean,
 *     inbox: boolean,
 *     assistant: boolean,
 *     quickSwitch: boolean,
 *   },
 * }} DomainDefinition
 */

/** Legacy product names → frozen domain id */
export const DOMAIN_ALIASES = Object.freeze({
  finance: 'money',
  financeos: 'money',
  'finance-os': 'money',
  knowledge: 'library',
  knowledgeos: 'library',
  'knowledge-os': 'library',
  fitness: 'training',
  fitnessos: 'training',
  planner: 'plan',
  'planner-os': 'plan',
  focus: 'health',
  status: 'health',
  paperos: 'paper',
  'paper-os': 'paper',
})

const PROVIDER_FULL = Object.freeze({
  continue: true,
  shelf: true,
  today: true,
  inbox: true,
  assistant: true,
  quickSwitch: true,
})

const PROVIDER_STUB = Object.freeze({
  continue: true,
  shelf: true,
  today: false,
  inbox: false,
  assistant: false,
  quickSwitch: true,
})

/**
 * @param {string} id
 * @param {Partial<DomainDefinition> & Pick<DomainDefinition, 'id' | 'label' | 'subtitle' | 'strategy' | 'homePath' | 'systemImage' | 'integrationStatus' | 'dataOwner'>} partial
 * @returns {DomainDefinition}
 */
function defineDomain(partial) {
  const identity = resolveDomainIdentity(partial.id) || DOMAIN_IDENTITY[partial.id]
  const accent = identity?.accent || domainAccent(partial.id, '#5B8CFF')
  const icon = identity?.icon || domainIcon(partial.id, 'globe')
  return Object.freeze({
    appId: null,
    productionOrigin: null,
    devPort: null,
    aliases: [],
    privacy: 'normal',
    shelfSection: 'all',
    providers: PROVIDER_STUB,
    accent,
    icon,
    listKey: `hosted:${partial.id}`,
    ...partial,
    accent: partial.accent || accent,
    icon: partial.icon || icon,
    listKey: partial.listKey || `hosted:${partial.id}`,
    aliases: Object.freeze([...(partial.aliases || [])]),
    providers: Object.freeze({ ...PROVIDER_STUB, ...(partial.providers || {}) }),
  })
}

/**
 * Canonical registry — Kenos system + all Daily Beta domains.
 * @type {Readonly<Record<string, DomainDefinition>>}
 */
export const DOMAIN_REGISTRY = Object.freeze({
  kenos: defineDomain({
    id: 'kenos',
    label: 'Kenos',
    subtitle: 'Today · Assistant · Inbox',
    strategy: 'native',
    appId: 'aios',
    productionOrigin: 'https://aios.kenos.space',
    devPort: 5219,
    homePath: '/',
    listKey: 'kenos',
    accent: '#5B8CFF',
    icon: 'layout-grid',
    systemImage: 'circle.grid.2x2.fill',
    integrationStatus: 'reference',
    dataOwner: 'kenos-shell',
    providers: PROVIDER_FULL,
  }),
  plan: defineDomain({
    id: 'plan',
    label: 'Plan',
    subtitle: 'Tasks and schedule',
    strategy: 'embedded_web',
    appId: 'planner',
    productionOrigin: 'https://planner.kenos.space',
    devPort: 5188,
    homePath: '/',
    systemImage: 'checklist',
    aliases: ['planner', 'planner-os'],
    integrationStatus: 'reference',
    dataOwner: 'planner',
    providers: PROVIDER_FULL,
  }),
  training: defineDomain({
    id: 'training',
    label: 'Training',
    subtitle: 'Fitness workouts',
    strategy: 'embedded_web',
    appId: 'fitness',
    productionOrigin: 'https://fitness.kenos.space',
    devPort: 5190,
    homePath: '/',
    systemImage: 'figure.strengthtraining.traditional',
    aliases: ['fitness', 'fitnessos'],
    integrationStatus: 'reference',
    dataOwner: 'fitness',
    providers: PROVIDER_FULL,
  }),
  work: defineDomain({
    id: 'work',
    label: 'Work',
    subtitle: 'Projects and decisions',
    strategy: 'embedded_web',
    appId: 'aios',
    productionOrigin: 'https://aios.kenos.space',
    devPort: 5219,
    homePath: '/work',
    systemImage: 'briefcase',
    aliases: ['work-focus'],
    integrationStatus: 'integrated',
    dataOwner: 'aios-work',
    providers: {
      continue: true,
      shelf: true,
      today: true,
      inbox: true,
      assistant: true,
      quickSwitch: true,
    },
  }),
  money: defineDomain({
    id: 'money',
    label: 'Money',
    subtitle: 'Finance decisions',
    strategy: 'embedded_web',
    appId: 'finance',
    productionOrigin: 'https://finance.kenos.space',
    devPort: 5180,
    homePath: '/home/today',
    systemImage: 'dollarsign.circle',
    aliases: ['finance', 'financeos', 'finance-os'],
    integrationStatus: 'integrated',
    dataOwner: 'finance',
    privacy: 'sensitive',
    providers: {
      continue: true,
      shelf: true,
      today: true,
      inbox: false,
      assistant: false,
      quickSwitch: true,
    },
  }),
  library: defineDomain({
    id: 'library',
    label: 'Library',
    subtitle: 'Knowledge vault',
    strategy: 'embedded_web',
    appId: 'knowledge',
    productionOrigin: 'https://knowledge.kenos.space',
    devPort: 5879,
    homePath: '/',
    systemImage: 'books.vertical',
    aliases: ['knowledge', 'knowledgeos', 'knowledge-os'],
    accent: domainAccent('knowledge'),
    icon: domainIcon('knowledge'),
    integrationStatus: 'integrated',
    dataOwner: 'knowledge',
    providers: {
      continue: true,
      shelf: true,
      today: false,
      inbox: true,
      assistant: false,
      quickSwitch: true,
    },
  }),
  music: defineDomain({
    id: 'music',
    label: 'Music',
    subtitle: 'Library and playback',
    strategy: 'embedded_web',
    appId: 'music',
    productionOrigin: 'https://music.kenos.space',
    devPort: 5189,
    homePath: '/',
    systemImage: 'music.note',
    integrationStatus: 'integrated',
    dataOwner: 'music',
    providers: {
      continue: true,
      shelf: true,
      today: false,
      inbox: false,
      assistant: false,
      quickSwitch: true,
    },
  }),
  home: defineDomain({
    id: 'home',
    label: 'Home',
    subtitle: 'Spaces and items',
    strategy: 'embedded_web',
    appId: 'home',
    productionOrigin: 'https://home.kenos.space',
    devPort: 5196,
    homePath: '/storage',
    systemImage: 'house',
    integrationStatus: 'integrated',
    dataOwner: 'home',
    providers: {
      continue: true,
      shelf: true,
      today: false,
      inbox: false,
      assistant: false,
      quickSwitch: true,
    },
  }),
  health: defineDomain({
    id: 'health',
    label: 'Health',
    subtitle: 'Status · Focus · Trends',
    strategy: 'embedded_web',
    appId: 'health',
    productionOrigin: 'https://health.kenos.space',
    devPort: 5192,
    homePath: '/',
    systemImage: 'heart.text.square',
    aliases: ['focus', 'status'],
    accent: '#5B6CFF',
    icon: 'heart',
    integrationStatus: 'integrated',
    dataOwner: 'health',
    privacy: 'medical_non_decision',
    providers: {
      continue: true,
      shelf: true,
      today: true,
      inbox: false,
      assistant: false,
      quickSwitch: true,
    },
  }),
  paper: defineDomain({
    id: 'paper',
    label: 'Paper',
    subtitle: 'Notebooks and capture',
    strategy: 'legacy_fallback',
    appId: null,
    productionOrigin: null,
    devPort: null,
    homePath: '/spaces/paper',
    systemImage: 'pencil.and.outline',
    aliases: ['paperos', 'paper-os'],
    accent: '#8B7355',
    icon: 'pen-tool',
    integrationStatus: 'missing',
    dataOwner: 'paperos-external',
  }),
})

/**
 * Domain Mode capsule slots (max 4 after leading Kenos chip = 5 total).
 * Slot semantics: native shell prepends Kenos return chip; these are domain slots only.
 * @type {Readonly<Record<string, DomainNavigationManifest>>}
 */
export const DOMAIN_NAVIGATION_MANIFESTS = Object.freeze({
  plan: Object.freeze({
    domainId: 'plan',
    slots: Object.freeze([
      Object.freeze({ title: 'Tasks', systemImage: 'checklist', path: '/' }),
      Object.freeze({ title: 'Calendar', systemImage: 'calendar', path: '/calendar' }),
      Object.freeze({ title: 'Projects', systemImage: 'folder', path: '/projects' }),
      Object.freeze({ title: 'More', systemImage: 'ellipsis', opensMore: true }),
    ]),
    more: Object.freeze([
      Object.freeze({ title: 'Search', systemImage: 'magnifyingglass', path: '/search' }),
      Object.freeze({ title: 'Upcoming', systemImage: 'calendar.badge.clock', path: '/upcoming' }),
      Object.freeze({ title: 'Inbox', systemImage: 'tray', path: '/inbox' }),
      Object.freeze({ title: 'Completed', systemImage: 'checkmark.circle', path: '/completed' }),
      Object.freeze({ title: 'Insights', systemImage: 'chart.bar', path: '/insights' }),
    ]),
  }),
  training: Object.freeze({
    domainId: 'training',
    slots: Object.freeze([
      Object.freeze({ title: 'Today', systemImage: 'sun.max', path: '/' }),
      Object.freeze({
        title: 'Workout',
        systemImage: 'figure.strengthtraining.traditional',
        path: '/session',
      }),
      Object.freeze({ title: 'Library', systemImage: 'books.vertical', path: '/library' }),
      Object.freeze({ title: 'More', systemImage: 'ellipsis', opensMore: true }),
    ]),
    more: Object.freeze([
      Object.freeze({ title: 'History', systemImage: 'clock', path: '/discover/records' }),
      Object.freeze({ title: 'Program', systemImage: 'list.bullet.rectangle', path: '/program' }),
      Object.freeze({ title: 'Discover', systemImage: 'sparkles', path: '/discover' }),
      Object.freeze({ title: 'Stats', systemImage: 'chart.xyaxis.line', path: '/discover/stats' }),
      Object.freeze({
        title: 'Tools',
        systemImage: 'wrench.and.screwdriver',
        path: '/discover/tools',
      }),
    ]),
  }),
  work: Object.freeze({
    domainId: 'work',
    slots: Object.freeze([
      Object.freeze({ title: 'Today', systemImage: 'sun.max', path: '/work' }),
      Object.freeze({ title: 'Projects', systemImage: 'folder', path: '/work' }),
      Object.freeze({ title: 'Focus', systemImage: 'target', path: '/spaces/work' }),
      Object.freeze({ title: 'More', systemImage: 'ellipsis', opensMore: true }),
    ]),
    more: Object.freeze([
      Object.freeze({ title: 'Assistant', systemImage: 'bubble.left', path: '/assistant?scope=work' }),
      Object.freeze({ title: 'Inbox', systemImage: 'tray', path: '/inbox' }),
      Object.freeze({ title: 'Spaces', systemImage: 'square.grid.2x2', path: '/spaces' }),
    ]),
  }),
  money: Object.freeze({
    domainId: 'money',
    slots: Object.freeze([
      Object.freeze({ title: 'Today', systemImage: 'sun.max', path: '/home/today' }),
      Object.freeze({ title: 'Transactions', systemImage: 'list.bullet', path: '/transactions' }),
      Object.freeze({ title: 'Plan', systemImage: 'chart.pie', path: '/plan' }),
      Object.freeze({ title: 'More', systemImage: 'ellipsis', opensMore: true }),
    ]),
    more: Object.freeze([
      Object.freeze({ title: 'Accounts', systemImage: 'building.columns', path: '/accounts' }),
      Object.freeze({ title: 'Insights', systemImage: 'chart.bar', path: '/insights' }),
      Object.freeze({ title: 'Settings', systemImage: 'gearshape', path: '/settings' }),
    ]),
  }),
  library: Object.freeze({
    domainId: 'library',
    slots: Object.freeze([
      Object.freeze({ title: 'Notes', systemImage: 'note.text', path: '/' }),
      Object.freeze({ title: 'Library', systemImage: 'books.vertical', path: '/library' }),
      Object.freeze({ title: 'Capture', systemImage: 'plus.circle', path: '/inbox' }),
      Object.freeze({ title: 'Search', systemImage: 'magnifyingglass', path: '/recall' }),
    ]),
    more: Object.freeze([
      Object.freeze({ title: 'Projects', systemImage: 'folder', path: '/projects' }),
      Object.freeze({ title: 'Timeline', systemImage: 'clock', path: '/timeline' }),
      Object.freeze({ title: 'Settings', systemImage: 'gearshape', path: '/settings' }),
    ]),
  }),
  music: Object.freeze({
    domainId: 'music',
    slots: Object.freeze([
      Object.freeze({ title: 'Now Playing', systemImage: 'play.circle', path: '/' }),
      Object.freeze({ title: 'Library', systemImage: 'music.note.list', path: '/library' }),
      Object.freeze({ title: 'Discover', systemImage: 'sparkles', path: '/discover' }),
      Object.freeze({ title: 'Search', systemImage: 'magnifyingglass', path: '/search' }),
    ]),
  }),
  home: Object.freeze({
    domainId: 'home',
    slots: Object.freeze([
      Object.freeze({ title: 'Home', systemImage: 'house', path: '/' }),
      Object.freeze({ title: 'Rooms', systemImage: 'square.grid.3x3', path: '/storage' }),
      Object.freeze({ title: 'Items', systemImage: 'shippingbox', path: '/items' }),
      Object.freeze({ title: 'Organize', systemImage: 'arrow.triangle.2.circlepath', path: '/organize' }),
    ]),
  }),
  health: Object.freeze({
    domainId: 'health',
    slots: Object.freeze([
      Object.freeze({ title: 'Status', systemImage: 'heart.text.square', path: '/' }),
      Object.freeze({ title: 'Focus', systemImage: 'target', path: '/focus' }),
      Object.freeze({ title: 'Trends', systemImage: 'chart.line.uptrend.xyaxis', path: '/trends' }),
      Object.freeze({ title: 'More', systemImage: 'ellipsis', opensMore: true }),
    ]),
    more: Object.freeze([
      Object.freeze({ title: 'Settings', systemImage: 'gearshape', path: '/settings' }),
    ]),
  }),
  paper: Object.freeze({
    domainId: 'paper',
    slots: Object.freeze([
      Object.freeze({ title: 'Recent', systemImage: 'clock', path: '/spaces/paper' }),
      Object.freeze({ title: 'Notebooks', systemImage: 'books.vertical', path: '/spaces/paper' }),
      Object.freeze({ title: 'Capture', systemImage: 'plus.circle', path: '/spaces/paper' }),
      Object.freeze({ title: 'Search', systemImage: 'magnifyingglass', path: '/spaces/paper' }),
    ]),
  }),
})

/** Max domain capsule slots (native Kenos chip is separate → 5 on screen). */
export const MAX_DOMAIN_DOCK_SLOTS = 4
/** Total dock chrome including Kenos return chip. */
export const MAX_DOCK_CHROME_SLOTS = 5

/**
 * Normalize any id / alias / listKey → canonical domain id.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function canonicalizeDomainId(raw) {
  if (raw == null || raw === '') return null
  let key = String(raw).trim().toLowerCase()
  if (key.startsWith('hosted:') || key.startsWith('external:')) {
    key = key.slice(key.indexOf(':') + 1).split('#')[0]
  }
  if (DOMAIN_ALIASES[key]) return DOMAIN_ALIASES[key]
  if (DOMAIN_REGISTRY[key]) return key
  // knowledge identity key still used in domainIdentity
  if (key === 'knowledge') return 'library'
  return null
}

/**
 * @param {string | null | undefined} raw
 * @returns {DomainDefinition | null}
 */
export function getDomainDefinition(raw) {
  const id = canonicalizeDomainId(raw)
  if (!id) return null
  return DOMAIN_REGISTRY[id] || null
}

/**
 * @param {string | null | undefined} raw
 * @returns {DomainNavigationManifest | null}
 */
export function getDomainNavigationManifest(raw) {
  const id = canonicalizeDomainId(raw)
  if (!id || id === 'kenos') return null
  const manifest = DOMAIN_NAVIGATION_MANIFESTS[id]
  if (!manifest) return null
  return manifest
}

/**
 * Validate manifest slot budget (domain slots ≤ 4; Kenos chip is external).
 * @param {DomainNavigationManifest | null | undefined} manifest
 */
export function assertManifestSlotBudget(manifest) {
  if (!manifest) return { ok: false, reason: 'missing' }
  const n = manifest.slots?.length ?? 0
  if (n < 1) return { ok: false, reason: 'empty' }
  if (n > MAX_DOMAIN_DOCK_SLOTS) return { ok: false, reason: 'too_many', count: n }
  const totalChrome = n + 1 // + Kenos return chip
  if (totalChrome > MAX_DOCK_CHROME_SLOTS) {
    return { ok: false, reason: 'chrome_overflow', count: totalChrome }
  }
  return { ok: true, count: n, chrome: totalChrome }
}

/**
 * Build a serializable launch result (no Views).
 * @param {string} domainId
 * @param {{
 *   localDailyBeta?: boolean,
 *   host?: string,
 *   resumeRoute?: string | null,
 * }} [opts]
 * @returns {DomainLaunchResult}
 */
export function buildDomainLaunchResult(domainId, opts = {}) {
  const def = getDomainDefinition(domainId)
  if (!def) {
    return {
      kind: 'unavailable',
      domainId: String(domainId || ''),
      listKey: `hosted:${domainId}`,
      reason: 'unknown_domain',
    }
  }
  if (def.id === 'kenos') {
    return {
      kind: 'kenos_tab',
      tab: 'today',
      domainId: 'kenos',
      listKey: 'kenos',
    }
  }
  if (def.integrationStatus === 'missing' || def.strategy === 'legacy_fallback') {
    if (!def.productionOrigin && def.homePath.startsWith('/')) {
      return {
        kind: 'hosted_route',
        path: def.homePath,
        domainId: def.id,
        listKey: def.listKey,
        reason: def.integrationStatus === 'missing' ? 'app_missing' : 'legacy_fallback',
      }
    }
    return {
      kind: 'unavailable',
      domainId: def.id,
      listKey: def.listKey,
      reason: 'missing_origin',
    }
  }

  const host = opts.host || '127.0.0.1'
  const path = opts.resumeRoute || def.homePath
  let url = def.productionOrigin
  if (opts.localDailyBeta && def.devPort) {
    url = `http://${host}:${def.devPort}`
  }
  if (!url) {
    return {
      kind: 'hosted_route',
      path,
      domainId: def.id,
      listKey: def.listKey,
    }
  }
  try {
    const u = new URL(path.startsWith('http') ? path : path, url.endsWith('/') ? url : `${url}/`)
    // Prefer absolute origin + path
    const abs = path.startsWith('http')
      ? path
      : `${url.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
    return {
      kind: 'embedded_url',
      url: abs,
      path: u.pathname + u.search,
      domainId: def.id,
      listKey: def.listKey,
    }
  } catch {
    return {
      kind: 'embedded_url',
      url: `${url}${path.startsWith('/') ? path : `/${path}`}`,
      path,
      domainId: def.id,
      listKey: def.listKey,
    }
  }
}

/**
 * Empty runtime state factory.
 * @param {string} domainId
 * @returns {DomainRuntimeState}
 */
export function createDomainRuntimeState(domainId) {
  const id = canonicalizeDomainId(domainId) || String(domainId || 'unknown')
  const def = getDomainDefinition(id)
  return {
    domainId: id,
    listKey: def?.listKey || `hosted:${id}`,
    shellMode: 'kenos',
    routePath: null,
    resumeRoute: null,
    updatedAt: null,
    focusActive: false,
  }
}

/**
 * Resolve domain id from Continuity URL (host/port/path heuristics).
 * @param {string | URL | null | undefined} url
 * @returns {string | null}
 */
export function domainIdFromContinuityUrl(url) {
  if (!url) return null
  try {
    const u = typeof url === 'string' ? new URL(url) : url
    const host = (u.hostname || '').toLowerCase()
    const port = u.port ? Number(u.port) : null
    const path = u.pathname || '/'

    for (const def of Object.values(DOMAIN_REGISTRY)) {
      if (def.id === 'kenos') continue
      if (def.devPort && port === def.devPort) {
        if (def.id === 'work' || def.appId === 'aios') {
          if (path.startsWith('/work') || path.startsWith('/spaces/work')) return 'work'
          continue
        }
        return def.id
      }
      if (def.productionOrigin) {
        try {
          const originHost = new URL(def.productionOrigin).hostname
          if (host === originHost || host.includes(def.id)) return def.id
          if (def.aliases.some((a) => host.includes(a))) return def.id
        } catch {
          /* ignore */
        }
      }
    }
    if (path.startsWith('/work') || path.startsWith('/spaces/work')) return 'work'
    if (host.includes('planner') || port === 5188) return 'plan'
    if (host.includes('fitness') || port === 5190) return 'training'
    if (host.includes('finance') || port === 5180) return 'money'
    if (host.includes('music') || port === 5189) return 'music'
    if (host.includes('home') || port === 5196) return 'home'
    if (host.includes('knowledge') || port === 5879) return 'library'
    if (host.includes('health') || port === 5192) return 'health'
    return null
  } catch {
    return null
  }
}

/** Catalog entries for Space Shelf (excludes kenos system home). */
export function listShelfDomainDefinitions() {
  return Object.values(DOMAIN_REGISTRY).filter((d) => d.id !== 'kenos')
}

/** Integration domains in Owner Gate order. */
export const INTEGRATION_DOMAIN_ORDER = Object.freeze([
  'work',
  'money',
  'library',
  'music',
  'home',
  'health',
  'paper',
])

/**
 * Continue descriptor adapter stub — domains fill via space adapters.
 * @param {string} domainId
 * @param {{ route?: string, displaySubtitle?: string, entityId?: string | null }} [partial]
 */
export function buildContinueDescriptorStub(domainId, partial = {}) {
  const def = getDomainDefinition(domainId)
  if (!def) return null
  return {
    version: 1,
    userId: 'anonymous',
    spaceId: def.id,
    route: partial.route || def.homePath,
    entityId: partial.entityId || undefined,
    displayTitle: def.label,
    displaySubtitle: partial.displaySubtitle || def.subtitle,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Today summary provider stub (L1/L2/L3 filled by aggregators later).
 * @param {string} domainId
 */
export function buildTodaySummaryStub(domainId) {
  const def = getDomainDefinition(domainId)
  if (!def || !def.providers.today) return null
  return {
    domainId: def.id,
    level: 'L3',
    title: def.label,
    lines: [],
    privacy: def.privacy,
  }
}

/**
 * Inbox source stub — single Inbox, no second inbox product.
 * @param {string} domainId
 */
export function buildInboxSourceStub(domainId) {
  const def = getDomainDefinition(domainId)
  if (!def || !def.providers.inbox) return null
  return {
    domainId: def.id,
    sourceId: `${def.id}.inbox`,
    items: [],
  }
}

/**
 * Assistant handoff stub.
 * @param {string} domainId
 * @param {{ scope?: string }} [opts]
 */
export function buildAssistantHandoffStub(domainId, opts = {}) {
  const def = getDomainDefinition(domainId)
  if (!def || !def.providers.assistant) return null
  return {
    domainId: def.id,
    scope: opts.scope || def.id,
    contextTitle: def.label,
  }
}

/**
 * Quick Switch search provider stub.
 * @param {string} query
 * @param {{ domainIds?: string[] }} [opts]
 */
export function searchQuickSwitchStub(query, opts = {}) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  const ids = opts.domainIds || listShelfDomainDefinitions().map((d) => d.id)
  if (!q) {
    return ids.map((id) => {
      const d = DOMAIN_REGISTRY[id]
      return { domainId: id, title: d.label, subtitle: d.subtitle, listKey: d.listKey }
    })
  }
  return ids
    .map((id) => DOMAIN_REGISTRY[id])
    .filter(
      (d) =>
        d &&
        (d.label.toLowerCase().includes(q) ||
          d.subtitle.toLowerCase().includes(q) ||
          d.aliases.some((a) => a.includes(q)) ||
          d.id.includes(q)),
    )
    .map((d) => ({
      domainId: d.id,
      title: d.label,
      subtitle: d.subtitle,
      listKey: d.listKey,
    }))
}

/**
 * Space Shelf projection card (serializable).
 * @param {string} domainId
 * @param {{ isCurrent?: boolean, subtitle?: string, relativeTime?: string | null }} [opts]
 */
export function projectShelfCard(domainId, opts = {}) {
  const def = getDomainDefinition(domainId)
  if (!def) return null
  return {
    id: def.id,
    title: def.label,
    subtitle: opts.subtitle || def.subtitle,
    relativeTime: opts.relativeTime ?? null,
    isCurrent: Boolean(opts.isCurrent),
    listKey: def.listKey === 'kenos' ? 'kenos' : def.id,
    systemImage: def.systemImage,
    isKenos: def.id === 'kenos',
    accent: def.accent,
  }
}
