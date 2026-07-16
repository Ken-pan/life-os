/** @typedef {{ tab: string, href: string, label: string, icon: string }} NavItem */

/**
 * @returns {NavItem[]}
 *
 * 「概览」曾经排在第一格。它是一张静态缩略图 + 一句「打开交互平面图 →」——
 * 一个除了跳转别无功能的加载屏,却占着导航的头把交椅。删掉之后平面图就是首页
 * (「/」重定向到 /plan,见 routes/+page.js),少一次点击、少一个要理解的概念。
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
  return { tab: 'settings', href: '/settings', label: '设置', icon: 'settings' }
}

/** @returns {NavItem[]} */
export function buildNavItems() {
  return [...buildPrimaryNavItems(), buildSettingsNavItem()]
}

/** @param {string} pathname */
export function resolveNavTab(pathname) {
  // 「/」只是通往 /plan 的重定向,高亮跟着目的地走 —— 重定向那一帧不该让整条
  // 导航都没有选中项
  if (pathname === '/') return 'plan'
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
