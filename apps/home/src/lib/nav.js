/** @typedef {{ tab: string, href: string, label: string, icon: string, match?: (p: string) => boolean }} NavItem */

/**
 * @returns {NavItem[]}
 *
 * Rooms · Items · Organize · More — aligned with Kenos Domain Dock
 * (web Chinese labels kept for standalone PWA chrome).
 */
export function buildPrimaryNavItems() {
  return [
    { tab: 'plan', href: '/plan', label: '平面', icon: 'layout-grid' },
    { tab: 'storage', href: '/storage', label: '储藏', icon: 'archive' },
    { tab: 'tidy', href: '/tidy', label: '整理', icon: 'list-checks' },
  ]
}

/** @returns {NavItem} */
export function buildSettingsNavItem() {
  return {
    tab: 'settings',
    href: '/settings',
    label: '设置',
    icon: 'settings',
    match: (p) => p.startsWith('/settings') || p.startsWith('/auth'),
  }
}

/** @returns {{ label: string, items: NavItem[] }[]} */
export function buildMoreNavGroups() {
  return [
    {
      label: '账户',
      items: [buildSettingsNavItem()],
    },
  ]
}

/** @returns {NavItem[]} */
export function buildNavItems() {
  return [...buildPrimaryNavItems(), buildSettingsNavItem()]
}

/** @param {string} pathname */
export function resolveNavTab(pathname) {
  // 「/」只是通往 /plan 的重定向,高亮跟着目的地走
  if (pathname === '/') return 'plan'
  if (pathname.startsWith('/plan')) return 'plan'
  if (pathname.startsWith('/storage')) return 'storage'
  if (pathname.startsWith('/tidy')) return 'tidy'
  if (pathname.startsWith('/settings')) return 'settings'
  return ''
}

/** @param {string} pathname */
export function isMoreNavActive(pathname) {
  return pathname.startsWith('/settings') || pathname.startsWith('/auth')
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return /^\/auth(?:\/|$)/.test(pathname)
}
