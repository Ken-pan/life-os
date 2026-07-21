/**
 * Kenos System top-level IA:
 * Leading Spaces Orb + capsule (Today · Ask · Inbox).
 * Settings is Today account chrome — not a capsule destination.
 */

export const SYSTEM_NAV_HREFS = Object.freeze({
  today: '/',
  assistant: '/assistant',
  spaces: '/spaces',
  inbox: '/inbox',
  settings: '/settings',
})

/** Paths that should highlight Spaces in the shell. */
const SPACES_ALIASES = Object.freeze(['/spaces', '/work'])

/** Paths that should highlight Inbox in the shell. */
const INBOX_ALIASES = Object.freeze(['/inbox', '/approvals', '/activity'])

/**
 * @param {string} pathname
 * @param {string} href nav item href
 */
export function isSystemNavActive(pathname, href) {
  const path = pathname || '/'
  if (href === '/') return path === '/'
  if (href === '/spaces')
    return SPACES_ALIASES.some((p) => path === p || path.startsWith(`${p}/`))
  if (href === '/inbox')
    return INBOX_ALIASES.some((p) => path === p || path.startsWith(`${p}/`))
  return path === href || path.startsWith(`${href}/`)
}

/**
 * Leading Spaces button (standalone).
 * @param {(key: string) => string} t
 */
export function systemNavSpacesItem(t) {
  return {
    href: SYSTEM_NAV_HREFS.spaces,
    // layout-grid ↔ iOS `square.grid.2x2` (KenosGlobalDock Spaces Orb)
    icon: 'layout-grid',
    label: t('nav.spaces'),
    key: 'spaces',
  }
}

/**
 * Capsule items (three) — paired with leading Spaces Orb.
 * @param {(key: string) => string} t
 */
export function systemNavCapsuleItems(t) {
  return [
    // sun ↔ iOS `sun.max` — must not collide with Spaces `layout-grid`
    {
      href: SYSTEM_NAV_HREFS.today,
      icon: 'sun',
      label: t('nav.today'),
      key: 'today',
    },
    {
      href: SYSTEM_NAV_HREFS.assistant,
      icon: 'chat',
      label: t('nav.assistant'),
      key: 'assistant',
    },
    {
      href: SYSTEM_NAV_HREFS.inbox,
      icon: 'list-todo',
      label: t('nav.inbox'),
      key: 'inbox',
    },
  ]
}

/**
 * Flat four for sidebar / tests (Spaces first).
 * @param {(key: string) => string} t i18n helper
 */
export function systemNavItems(t) {
  return [systemNavSpacesItem(t), ...systemNavCapsuleItems(t)]
}
