/**
 * Kenos System top-level IA (tranche 1):
 * Today · Assistant · Spaces · Inbox
 * Approvals/Activity nest under Inbox; Work nests under Spaces.
 */

export const SYSTEM_NAV_HREFS = Object.freeze({
  today: '/',
  assistant: '/assistant',
  spaces: '/spaces',
  inbox: '/inbox',
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
 * @param {(key: string) => string} t i18n helper
 */
export function systemNavItems(t) {
  return [
    { href: SYSTEM_NAV_HREFS.today, icon: 'dashboard', label: t('nav.today') },
    {
      href: SYSTEM_NAV_HREFS.assistant,
      icon: 'chat',
      label: t('nav.assistant'),
    },
    { href: SYSTEM_NAV_HREFS.spaces, icon: 'globe', label: t('nav.spaces') },
    { href: SYSTEM_NAV_HREFS.inbox, icon: 'list-todo', label: t('nav.inbox') },
  ]
}
