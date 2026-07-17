<script>
  // 薄封装：共享 LifeOsSideNav 骨架 + HealthOS 的 IA/active 判定。
  import { page } from '$app/state'
  import LifeOsSideNav from '@life-os/platform-web/svelte/navigation/side-nav'
  import { t } from '$lib/i18n/index.js'

  const isActive = (href) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  const groups = $derived([
    {
      items: [
        { href: '/', icon: 'now', label: t('nav.now') },
        { href: '/focus', icon: 'focus', label: t('nav.focus') },
        { href: '/trends', icon: 'trends', label: t('nav.trends') },
      ].map((item) => ({
        ...item,
        active: isActive(item.href),
      })),
    },
  ])
  const footItem = $derived({
    href: '/settings',
    icon: 'settings',
    label: t('nav.settings'),
    active: isActive('/settings'),
  })
</script>

<LifeOsSideNav {groups} {footItem} ariaLabel={t('nav.mainAria')} />
