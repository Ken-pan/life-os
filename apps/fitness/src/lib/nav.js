/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildPrimaryNavItems(tr) {
  return [
    { tab: 'today', href: '/', label: tr('nav.today'), icon: 'home' },
    {
      tab: 'program',
      href: '/program',
      label: tr('nav.program'),
      icon: 'program',
    },
    {
      tab: 'discover',
      href: '/discover',
      label: tr('nav.discover'),
      icon: 'discover',
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
  }
}

/**
 * More Sheet（Workout / History / Library / Stats / Tools / Settings）
 * @param {(key: string, params?: Record<string, unknown>) => string} tr
 */
export function buildMoreNavGroups(tr) {
  return [
    {
      label: tr('nav.groupMore'),
      items: [
        {
          tab: 'workout',
          href: '/session',
          label: tr('nav.workout'),
          icon: 'flame',
          match: (p) => p === '/session' || /\/day\/[^/]+\/focus$/.test(p),
        },
        {
          tab: 'history',
          href: '/discover/records',
          label: tr('nav.history'),
          icon: 'clipboard',
          match: (p) =>
            p.startsWith('/discover/records') || p.startsWith('/history'),
        },
        {
          tab: 'library',
          href: '/library',
          label: tr('nav.library'),
          icon: 'library',
          match: (p) => p.startsWith('/library'),
        },
        {
          tab: 'stats',
          href: '/discover/stats',
          label: tr('nav.stats'),
          icon: 'trending-up',
          match: (p) => p.startsWith('/discover/stats'),
        },
        {
          tab: 'tools',
          href: '/discover/tools',
          label: tr('nav.tools'),
          icon: 'calculator',
          match: (p) => p.startsWith('/discover/tools'),
        },
      ],
    },
    {
      label: tr('nav.groupAccount'),
      items: [buildSettingsNavItem(tr)],
    },
  ]
}

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildNavItems(tr) {
  return [...buildPrimaryNavItems(tr), buildSettingsNavItem(tr)]
}

/** @param {string} pathname */
export function resolveNavTab(pathname) {
  if (pathname === '/') return 'today'
  if (pathname === '/session' || /\/day\/[^/]+\/focus$/.test(pathname))
    return 'workout'
  if (
    pathname.startsWith('/discover/records') ||
    pathname.startsWith('/history')
  ) {
    return 'history'
  }
  if (pathname.startsWith('/program')) return 'program'
  // Day overview/summary sit with Program; focus is Workout (More).
  if (pathname.startsWith('/day') && !/\/focus$/.test(pathname))
    return 'program'
  if (pathname.startsWith('/library')) return 'library'
  if (pathname.startsWith('/discover/stats')) return 'stats'
  if (pathname.startsWith('/discover/tools')) return 'tools'
  if (pathname === '/discover' || pathname.startsWith('/discover/'))
    return 'discover'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/auth')) return ''
  return ''
}

/** @param {string} pathname */
export function isMoreNavActive(pathname) {
  if (pathname === '/session' || /\/day\/[^/]+\/focus$/.test(pathname))
    return true
  if (
    pathname.startsWith('/discover/records') ||
    pathname.startsWith('/history')
  ) {
    return true
  }
  if (pathname.startsWith('/library')) return true
  if (pathname.startsWith('/discover/tools')) return true
  if (pathname.startsWith('/discover/stats')) return true
  if (pathname.startsWith('/settings')) return true
  if (pathname.startsWith('/auth')) return true
  return false
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return /\/focus$|\/summary$|^\/auth(?:\/|$)|^\/session(?:\/|$)/.test(pathname)
}
