/** @typedef {{ tab: string, href: string, label: string, icon: string }} NavItem */

/** @returns {NavItem[]} */
export function buildPrimaryNavItems() {
  return [
    { tab: 'home', href: '/', label: '概览', icon: 'home' },
    { tab: 'plan', href: '/plan', label: '平面', icon: 'layout-grid' },
    { tab: 'storage', href: '/storage', label: '储藏', icon: 'archive' },
    { tab: 'tidy', href: '/tidy', label: '整理', icon: 'list-checks' },
  ]
}

/** @returns {NavItem} */
export function buildSettingsNavItem() {
  return { tab: 'settings', href: '/settings', label: '设置', icon: 'settings' }
}

/** @returns {NavItem[]} */
export function buildNavItems() {
  return [...buildPrimaryNavItems(), buildSettingsNavItem()]
}

/** @param {string} pathname */
export function resolveNavTab(pathname) {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/plan')) return 'plan'
  if (pathname.startsWith('/storage')) return 'storage'
  if (pathname.startsWith('/tidy')) return 'tidy'
  if (pathname.startsWith('/settings')) return 'settings'
  return ''
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return /^\/auth(?:\/|$)/.test(pathname)
}
