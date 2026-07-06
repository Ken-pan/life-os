/**
 * Life OS 导航 IA — Planner.OS
 * mobile/tablet：4 个 Primary Tab + More Sheet（与 FinanceOS 对齐）
 * desktop：完整侧栏分组
 */

/** @typedef {{ tab: string; href: string; label: string; icon: string; match: (pathname: string, search?: string) => boolean; dotColor?: string }} NavItem */
/** @typedef {{ label: string; items: NavItem[] }} NavGroup */

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildPrimaryNavItems(tr) {
  return [
    {
      tab: 'today',
      href: '/',
      label: tr('nav.today'),
      icon: 'home',
      match: (p) => p === '/',
    },
    {
      tab: 'inbox',
      href: '/inbox',
      label: tr('nav.inbox'),
      icon: 'inbox',
      match: (p) => p.startsWith('/inbox'),
    },
    {
      tab: 'upcoming',
      href: '/upcoming',
      label: tr('nav.upcoming'),
      icon: 'clock',
      match: (p) => p.startsWith('/upcoming'),
    },
    {
      tab: 'completed',
      href: '/completed',
      label: tr('nav.completed'),
      icon: 'check',
      match: (p) => p.startsWith('/completed'),
    },
  ]
}

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildBrowseNavItems(tr) {
  return [
    {
      tab: 'schedule',
      href: '/schedule',
      label: tr('nav.schedule'),
      icon: 'clock',
      match: (p, search = '') =>
        p === '/' && new URLSearchParams(search).get('view') === 'timeline',
    },
    {
      tab: 'calendar',
      href: '/calendar',
      label: tr('nav.calendar'),
      icon: 'calendar',
      match: (p) => p.startsWith('/calendar'),
    },
    {
      tab: 'search',
      href: '/search',
      label: tr('nav.search'),
      icon: 'search',
      match: (p) => p.startsWith('/search'),
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
    { label: tr('nav.groupTasks'), items: buildPrimaryNavItems(tr) },
    { label: tr('nav.groupBrowse'), items: buildBrowseNavItems(tr) },
  ]
}

/**
 * More Sheet 分组（mobile / tablet）
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 * @param {import('./types.js').TaskList[]} lists
 * @param {(list: import('./types.js').TaskList) => string} listLabelFn
 * @returns {NavGroup[]}
 */
export function buildMoreNavGroups(tr, lists, listLabelFn) {
  /** @type {NavGroup[]} */
  const groups = [
    { label: tr('nav.groupBrowse'), items: buildBrowseNavItems(tr) },
  ]

  if (lists.length) {
    groups.push({
      label: tr('nav.lists'),
      items: lists.map((list) => ({
        tab: `list-${list.id}`,
        href: `/lists/${list.id}`,
        label: listLabelFn(list),
        icon: 'list',
        dotColor: list.color,
        match: (p) => p === `/lists/${list.id}`,
      })),
    })
  }

  groups.push({
    label: tr('nav.groupAccount'),
    items: [buildSettingsNavItem(tr)],
  })

  return groups
}

/** @param {string} pathname */
export function resolvePrimaryNavTab(pathname) {
  if (pathname === '/') return 'today'
  if (pathname.startsWith('/inbox')) return 'inbox'
  if (pathname.startsWith('/upcoming')) return 'upcoming'
  if (pathname.startsWith('/completed')) return 'completed'
  if (pathname.startsWith('/calendar')) return 'calendar'
  return ''
}

/** @param {string} pathname @param {string} [search] */
export function isMoreNavActive(pathname, search = '') {
  if (
    pathname === '/' &&
    new URLSearchParams(search).get('view') === 'timeline'
  )
    return true
  if (pathname.startsWith('/search')) return true
  if (pathname.startsWith('/calendar')) return true
  if (pathname.startsWith('/lists/')) return true
  if (pathname.startsWith('/settings')) return true
  if (pathname.startsWith('/auth')) return true
  return false
}

/** @param {string} pathname @param {string} [search] */
export function isFabVisible(pathname, search = '') {
  if (pathname.startsWith('/settings')) return false
  if (pathname.startsWith('/auth')) return false
  if (pathname.startsWith('/search')) return false
  if (pathname.startsWith('/completed')) return false
  if (
    pathname === '/' &&
    new URLSearchParams(search).get('view') === 'timeline'
  )
    return false
  return true
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return pathname.startsWith('/auth')
}

/**
 * mobile 主内容区底部留白档位（按路由，避免 Sheet 打开时 FAB 卸载触发布局跳动）
 * @param {string} pathname @param {string} [search]
 * @returns {'full' | 'tabbar' | 'minimal'}
 */
export function resolveMobileChromeInset(pathname, search = '') {
  if (pathname.startsWith('/auth')) return 'minimal'
  if (
    pathname.startsWith('/settings') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/completed')
  ) {
    return 'tabbar'
  }
  if (
    pathname === '/' &&
    new URLSearchParams(search).get('view') === 'timeline'
  ) {
    return 'tabbar'
  }
  return 'full'
}
