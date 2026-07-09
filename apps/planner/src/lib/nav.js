/**
 * Life OS 导航 IA — Planner.OS
 *
 * 原则：今天 = 做什么；日历 = 哪天/几点做（日程与日历是同一模块）
 *
 * Mobile：任务 | 日历 | 搜索 | 更多
 *   - 「任务」Tab 始终回到今天
 *   - 智能清单 / 用户清单在任务抽屉（☰）
 * Desktop：侧栏全展开（智能清单 + 浏览 + 用户清单 + 设置）
 */

/** @typedef {import('@life-os/platform-web/navigation').WebNavItem} NavItem */
/** @typedef {import('@life-os/platform-web/navigation').WebNavGroup} NavGroup */

/** 任务模块路由（底栏「任务」高亮；可开清单抽屉） */
/** @param {string} pathname */
export function isTaskModuleRoute(pathname) {
  if (pathname === '/') return true
  if (pathname.startsWith('/inbox')) return true
  if (pathname.startsWith('/triage')) return true
  if (pathname.startsWith('/upcoming')) return true
  if (pathname.startsWith('/completed')) return true
  if (pathname.startsWith('/lists/')) return true
  return false
}

/**
 * Mobile 底栏 Primary
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 */
export function buildPrimaryNavItems(tr) {
  return [
    {
      tab: 'tasks',
      href: '/',
      label: tr('nav.tasks'),
      icon: 'check',
      match: (p) => isTaskModuleRoute(p),
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

/**
 * 智能清单（今天 / 收件箱 / 即将 / 已完成）
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 * @returns {NavItem[]}
 */
export function buildSmartListNavItems(tr) {
  return [
    {
      tab: 'today',
      href: '/',
      label: tr('nav.today'),
      icon: 'sun',
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
      tab: 'triage',
      href: '/triage',
      label: tr('nav.triage'),
      icon: 'sparkles',
      match: (p) => p.startsWith('/triage'),
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

/**
 * Desktop 浏览组：日历（含排程）+ 搜索
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 */
export function buildBrowseNavItems(tr) {
  return [
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
 * Desktop 侧栏分组（全展开）
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 * @returns {NavGroup[]}
 */
export function buildSidebarNavGroups(tr) {
  return [
    { label: tr('nav.groupSmart'), items: buildSmartListNavItems(tr) },
    { label: tr('nav.groupBrowse'), items: buildBrowseNavItems(tr) },
  ]
}

/**
 * Mobile 任务抽屉分组（智能清单 + 用户清单）
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 * @param {import('./types.js').TaskList[]} lists
 * @param {(list: import('./types.js').TaskList) => string} listLabelFn
 * @returns {NavGroup[]}
 */
export function buildTaskDrawerNavGroups(tr, lists, listLabelFn) {
  /** @type {NavGroup[]} */
  const groups = [
    { label: tr('nav.groupSmart'), items: buildSmartListNavItems(tr) },
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

  return groups
}

/**
 * More Sheet（Mobile）：用户清单 + 设置
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 * @param {import('./types.js').TaskList[]} lists
 * @param {(list: import('./types.js').TaskList) => string} listLabelFn
 * @returns {NavGroup[]}
 */
export function buildMoreNavGroups(tr, lists, listLabelFn) {
  /** @type {NavGroup[]} */
  const groups = []

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
  if (isTaskModuleRoute(pathname)) return 'tasks'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/search')) return 'search'
  return ''
}

/** @param {string} pathname @param {string} [search] */
export function isMoreNavActive(pathname, search = '') {
  void search
  if (pathname.startsWith('/settings')) return true
  if (pathname.startsWith('/auth')) return true
  return false
}

/** @typedef {'large' | 'compact' | 'none'} FabMode */

/** @param {string} pathname @param {string} [search] */
export function resolveFabMode(pathname, search = '') {
  void search
  if (pathname.startsWith('/settings')) return 'none'
  if (pathname.startsWith('/auth')) return 'none'
  if (pathname.startsWith('/search')) return 'none'
  if (pathname.startsWith('/completed')) return 'none'
  if (pathname.startsWith('/inbox')) return 'none'
  if (pathname.startsWith('/triage')) return 'none'
  if (pathname === '/') return 'large'
  if (
    pathname.startsWith('/upcoming') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/lists/')
  ) {
    return 'compact'
  }
  return 'none'
}

/** @param {string} pathname @param {string} [search] */
export function isFabVisible(pathname, search = '') {
  return resolveFabMode(pathname, search) !== 'none'
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return pathname.startsWith('/auth')
}

/**
 * mobile 主内容区底部留白档位
 * @param {string} pathname @param {string} [search]
 * @returns {'full' | 'tabbar' | 'minimal'}
 */
export function resolveMobileChromeInset(pathname, search = '') {
  void search
  if (pathname.startsWith('/auth')) return 'minimal'
  if (
    pathname.startsWith('/settings') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/completed') ||
    pathname.startsWith('/inbox')
  ) {
    return 'tabbar'
  }
  return 'full'
}
