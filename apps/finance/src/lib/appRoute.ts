export type AppTabId =
  | 'home'
  | 'accounts'
  | 'stocks'
  | 'history'
  | 'review'
  | 'forecast'
  | 'decision'
  | 'settings'

/** @deprecated 深链仍解析，写入时归一化为 home/{section} */
export type LegacyTabId = 'today' | 'overview'

export type HomeSection = 'today' | 'overview'

export type DecisionSection = 'compare' | 'saved' | 'log'

export type ReviewSection =
  | 'import'
  | 'queue'
  | 'baseline'
  | 'calibrate'
  | 'reconcile'

export type SettingsSection = 'assumptions' | 'app' | 'help'

export type AppRoute = {
  tab: AppTabId
  section?: string
}

const TABS = new Set<AppTabId>([
  'home',
  'accounts',
  'stocks',
  'history',
  'review',
  'forecast',
  'decision',
  'settings',
])

const SECTIONS: Partial<Record<AppTabId, ReadonlySet<string>>> = {
  home: new Set<HomeSection>(['today', 'overview']),
  history: new Set<string>(['insights', 'fixed', 'oneoff']),
  forecast: new Set<string>(['forecast', 'scenarios']),
  review: new Set<ReviewSection>([
    'import',
    'queue',
    'baseline',
    'calibrate',
    'reconcile',
  ]),
  decision: new Set<DecisionSection>(['compare', 'saved', 'log']),
  settings: new Set<SettingsSection>(['assumptions', 'app', 'help']),
}

const DEFAULT_SECTION: Partial<Record<AppTabId, string>> = {
  home: 'today',
  history: 'insights',
  forecast: 'forecast',
  review: 'import',
  decision: 'compare',
  settings: 'assumptions',
}

/** 非 App 路由的 pathname 前缀（静态资源、API、legacy 页） */
const NON_APP_PATH_PREFIXES = ['/api/', '/legacy', '/assets/']

function normalizeLegacyRoute(tab: string, section?: string): AppRoute | null {
  if (tab === 'today') return { tab: 'home', section: 'today' }
  if (tab === 'overview') return { tab: 'home', section: 'overview' }
  if (tab === 'settings' && section === 'accounts') return { tab: 'accounts' }
  if (tab === 'settings' && !section) {
    return { tab: 'settings', section: DEFAULT_SECTION.settings }
  }
  return null
}

function parseRouteParts(
  tabPart: string,
  sectionPart?: string,
): AppRoute | null {
  const legacy = normalizeLegacyRoute(tabPart, sectionPart)
  if (legacy) return legacy

  if (!TABS.has(tabPart as AppTabId)) return null

  const tab = tabPart as AppTabId
  const allowed = SECTIONS[tab]
  if (!sectionPart) {
    const def = DEFAULT_SECTION[tab]
    return def ? { tab, section: def } : { tab }
  }

  if (!allowed?.has(sectionPart)) return null
  return { tab, section: sectionPart }
}

/** 跨页跳转入口：兼容旧 tab id 与 settings/accounts */
export function resolveGoTabTarget(
  tab: string,
  section?: string,
): AppRoute | null {
  return parseRouteParts(tab, section)
}

/** @deprecated 仅用于 legacy hash 解析与测试 */
export function parseAppHash(hash: string): AppRoute | null {
  const raw = hash.replace(/^#\/?/, '').trim()
  if (!raw) return { tab: 'home', section: 'today' }

  const [tabPart, sectionPart, ...rest] = raw.split('/').filter(Boolean)
  if (!tabPart || rest.length > 0) return null
  return parseRouteParts(tabPart, sectionPart)
}

export function parseAppPath(pathname: string): AppRoute | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/') return { tab: 'home', section: 'today' }

  for (const prefix of NON_APP_PATH_PREFIXES) {
    if (normalized.startsWith(prefix)) return null
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return { tab: 'home', section: 'today' }
  if (parts.length > 2) return null

  const [tabPart, sectionPart] = parts
  return parseRouteParts(tabPart, sectionPart)
}

export function buildAppPath(route: AppRoute): string {
  const { tab, section } = route
  const allowed = SECTIONS[tab]
  const def = DEFAULT_SECTION[tab]

  if (tab === 'accounts') return '/accounts'

  if (section && allowed?.has(section)) {
    return `/${tab}/${section}`
  }

  if (def) return `/${tab}/${def}`
  return `/${tab}`
}

/** @deprecated 写入已改用 buildAppPath；保留供 legacy 测试 */
export function buildAppHash(route: AppRoute): string {
  const path = buildAppPath(route)
  return `#${path}`
}

export function readAppRouteFromWindow(): AppRoute {
  if (typeof window === 'undefined') return { tab: 'home', section: 'today' }

  const fromPath = parseAppPath(window.location.pathname)
  if (fromPath) return fromPath

  const fromHash = window.location.hash
    ? parseAppHash(window.location.hash)
    : null
  if (fromHash) return fromHash

  return { tab: 'home', section: 'today' }
}

/** 启动时将 `#/…` 或 `/` 归一化为 pathname 深链 */
export function migrateLegacyRouteUrl(): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const hashRoute = url.hash ? parseAppHash(url.hash) : null

  if (hashRoute) {
    url.pathname = buildAppPath(hashRoute)
    url.hash = ''
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    return
  }

  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = buildAppPath({ tab: 'home', section: 'today' })
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }
}

export function writeAppRoute(
  route: AppRoute,
  mode: 'push' | 'replace' = 'push',
) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const nextPath = buildAppPath(route)
  const href = `${nextPath}${url.search}`

  if (`${url.pathname}${url.search}` === href) return

  url.pathname = nextPath
  url.hash = ''

  if (mode === 'replace') window.history.replaceState(null, '', href)
  else window.history.pushState(null, '', href)
}

/** @deprecated 使用 writeAppRoute */
export const writeAppHash = writeAppRoute

export function defaultSectionForTab(tab: AppTabId): string | undefined {
  return DEFAULT_SECTION[tab]
}

export function isRoutableSection(tab: AppTabId, section: string): boolean {
  return SECTIONS[tab]?.has(section) ?? false
}

export function routeDepth(route: AppRoute): number {
  if (route.tab === 'accounts' || route.tab === 'stocks') return 1
  if (!route.section) return 1
  if (route.tab === 'home') return 1
  return 2
}

export function isDefaultSection(route: AppRoute): boolean {
  const def = DEFAULT_SECTION[route.tab]
  return !route.section || route.section === def
}
