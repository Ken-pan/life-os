/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildPrimaryNavItems(tr) {
  return [
    { tab: 'today', href: '/', label: tr('nav.today'), icon: 'home' },
    { tab: 'program', href: '/program', label: tr('nav.program'), icon: 'program' },
    { tab: 'discover', href: '/discover', label: tr('nav.discover'), icon: 'discover' }
  ];
}

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildSettingsNavItem(tr) {
  return { tab: 'settings', href: '/settings', label: tr('nav.settings'), icon: 'settings' };
}

/** @param {(key: string, params?: Record<string, unknown>) => string} tr */
export function buildNavItems(tr) {
  return [...buildPrimaryNavItems(tr), buildSettingsNavItem(tr)];
}

/** @param {string} pathname */
export function resolveNavTab(pathname) {
  if (pathname === '/') return 'today';
  if (pathname.startsWith('/program') || pathname.startsWith('/day')) return 'program';
  if (pathname.startsWith('/discover') || pathname.startsWith('/library') || pathname.startsWith('/stats')) {
    return 'discover';
  }
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/auth')) return '';
  return '';
}

/** @param {string} pathname */
export function isNavChromeHidden(pathname) {
  return /\/focus$|\/summary$|^\/auth(?:\/|$)/.test(pathname);
}
