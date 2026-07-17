<script>
  // 薄封装：共享 LifeOsSideNav 骨架 + knowledge 的 IA/active 判定。
  import { page } from '$app/state'
  import LifeOsSideNav from '@life-os/platform-web/svelte/navigation/side-nav'
  import { t } from '$lib/i18n/index.js'

  const isActive = (href) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  const groups = $derived([
    {
      items: [
        { href: '/', icon: 'inbox', label: t('nav.inbox') },
        { href: '/library', icon: 'library', label: t('nav.library') },
        { href: '/projects', icon: 'projects', label: t('nav.projects') },
        { href: '/timeline', icon: 'timeline', label: t('nav.timeline') },
        { href: '/recall', icon: 'recall', label: t('nav.recall') },
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
