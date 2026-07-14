/**
 * Life OS 导航 IA — MUSIC.OS
 * mobile/tablet：4 个 Primary Tab + More Sheet（与 Planner/Finance 对齐）
 * desktop：完整侧栏分组
 *
 * Contracts mirror: @life-os/contracts/nav NavItemModel / NavGroupModel
 * Web routing: @life-os/platform-web/navigation WebNavItem / WebNavGroup
 */

/** @typedef {import('@life-os/contracts/nav').NavItemModel} NavItemModel */
/** @typedef {import('@life-os/contracts/nav').NavGroupModel} NavGroupModel */
/** @typedef {import('@life-os/platform-web/navigation').WebNavItem} NavItem */
/** @typedef {import('@life-os/platform-web/navigation').WebNavGroup} NavGroup */

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildPrimaryNavItems(tr) {
  return [
    {
      tab: 'home',
      href: '/',
      label: tr('nav.home'),
      icon: 'home',
      match: (p) => p === '/',
    },
    {
      tab: 'search',
      href: '/search',
      label: tr('nav.search'),
      icon: 'search',
      match: (p) => p.startsWith('/search'),
    },
    {
      tab: 'library',
      href: '/library',
      label: tr('nav.library'),
      icon: 'library',
      // /import 有独立导航项（More 组），不在此归入 library，避免侧栏双高亮
      match: (p) => p.startsWith('/library'),
    },
    {
      tab: 'playlists',
      href: '/playlists',
      label: tr('nav.playlists'),
      icon: 'list',
      // /liked 有独立导航项（More 组），不在此归入 playlists，避免侧栏双高亮
      match: (p) => p.startsWith('/playlists'),
    },
  ]
}

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildMoreNavItems(tr) {
  return [
    {
      tab: 'browse',
      href: '/browse',
      label: tr('nav.browse'),
      icon: 'discover',
      match: (p) =>
        p.startsWith('/browse') ||
        p.startsWith('/album') ||
        p.startsWith('/artist'),
    },
    {
      tab: 'liked',
      href: '/liked',
      label: tr('nav.liked'),
      icon: 'heart',
      match: (p) => p.startsWith('/liked'),
    },
    {
      tab: 'import',
      href: '/import',
      label: tr('nav.import'),
      icon: 'upload',
      match: (p) => p.startsWith('/import'),
    },
  ]
}

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildSettingsNavItem(tr) {
  return {
    tab: 'settings',
    href: '/settings',
    label: tr('nav.settings'),
    icon: 'settings',
    match: (p) => p.startsWith('/settings') || p.startsWith('/auth'),
  }
}

/**
 * 侧栏分组（desktop）
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 * @returns {NavGroup[]}
 */
export function buildSidebarNavGroups(tr) {
  return [
    { label: tr('nav.groupMain'), items: buildPrimaryNavItems(tr) },
    { label: tr('nav.groupMore'), items: buildMoreNavItems(tr) },
  ]
}

/**
 * More Sheet 分组（mobile / tablet）
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 * @returns {NavGroup[]}
 */
export function buildMoreNavGroups(tr) {
  return [
    { label: tr('nav.groupQuick'), items: buildMoreNavItems(tr) },
    { label: tr('nav.groupAccount'), items: [buildSettingsNavItem(tr)] },
  ]
}

/** @param {string} pathname */
export function resolvePrimaryNavTab(pathname) {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/search')) return 'search'
  if (pathname.startsWith('/library')) return 'library'
  if (pathname.startsWith('/playlists')) return 'playlists'
  // /import、/liked 属 More 组（与 /browse 一致）：底栏只点亮「更多」，不点亮 primary tab
  return ''
}

/** @param {string} pathname */
export function resolveNavTab(pathname) {
  const primary = resolvePrimaryNavTab(pathname)
  if (primary) return primary
  if (
    pathname.startsWith('/browse') ||
    pathname.startsWith('/album') ||
    pathname.startsWith('/artist')
  )
    return 'browse'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'home'
}

/** @param {string} pathname */
export function isMoreNavActive(pathname) {
  if (
    pathname.startsWith('/browse') ||
    pathname.startsWith('/album') ||
    pathname.startsWith('/artist')
  )
    return true
  if (pathname.startsWith('/liked')) return true
  if (pathname.startsWith('/import')) return true
  if (pathname.startsWith('/settings')) return true
  if (pathname.startsWith('/auth')) return true
  return false
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return pathname.startsWith('/now-playing')
}

/** @param {string} pathname */
export function isMiniPlayerHidden(pathname) {
  return pathname.startsWith('/now-playing')
}

const NOW_PLAYING_RETURN_KEY = 'music:now-playing-return'

/** @param {string} from */
export function markNowPlayingReturn(from) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(NOW_PLAYING_RETURN_KEY, from || '/')
}

/** @param {string} [fallback='/'] */
export function consumeNowPlayingReturn(fallback = '/') {
  if (typeof sessionStorage === 'undefined') return fallback
  const value = sessionStorage.getItem(NOW_PLAYING_RETURN_KEY) ?? fallback
  sessionStorage.removeItem(NOW_PLAYING_RETURN_KEY)
  return value
}

/** @returns {string | null} */
export function peekNowPlayingReturn() {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(NOW_PLAYING_RETURN_KEY)
}

/** @param {string} from */
export function ensureNowPlayingReturn(from) {
  if (peekNowPlayingReturn()) return
  markNowPlayingReturn(from)
}

/** @param {string} pathname */
export function resolvePageBack(pathname) {
  if (pathname.startsWith('/album/') || pathname.startsWith('/artist/'))
    return '/browse'
  if (pathname.startsWith('/playlists/')) return '/playlists'
  if (pathname === '/import') return '/library'
  if (pathname === '/speed-dial') return '/'
  if (pathname === '/liked') return '/playlists'
  if (pathname === '/auth') return '/settings'
  return null
}

/** @param {string} pathname @param {(k: string) => string} tr */
export function resolvePageTitle(pathname, tr) {
  if (pathname === '/') return tr('home.title')
  if (pathname === '/speed-dial') return tr('home.speedDial')
  if (pathname === '/library') return tr('library.title')
  if (pathname === '/browse') return tr('browse.title')
  if (pathname === '/playlists') return tr('playlists.title')
  if (pathname === '/search') return tr('search.title')
  if (pathname === '/liked') return tr('liked.title')
  if (pathname === '/import') return tr('import.title')
  if (pathname === '/now-playing') return tr('nowPlaying.title')
  if (pathname === '/settings') return tr('settings.title')
  if (pathname === '/auth') return tr('auth.title')
  if (pathname.startsWith('/album/')) return tr('album.title')
  if (pathname.startsWith('/artist/')) return tr('artist.title')
  if (pathname.startsWith('/playlists/')) return tr('playlist.title')
  return tr('app.name')
}

/** Wide-layout routes use full content width on desktop. */
/** @param {string} pathname */
export function isWideContentRoute(pathname) {
  return (
    pathname === '/' ||
    pathname === '/speed-dial' ||
    pathname === '/library' ||
    pathname.startsWith('/browse') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/album') ||
    pathname.startsWith('/artist') ||
    pathname.startsWith('/playlists')
  )
}
