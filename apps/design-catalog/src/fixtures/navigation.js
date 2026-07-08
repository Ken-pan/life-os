/** @type {import('@life-os/platform-web/navigation').WebNavGroup[]} */
export const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      {
        href: '/',
        label: 'Home',
        icon: 'home',
        match: (path) => path === '/',
      },
      {
        href: '/settings',
        label: 'Settings',
        icon: 'settings',
        match: (path) => path.startsWith('/settings'),
      },
    ],
  },
]
