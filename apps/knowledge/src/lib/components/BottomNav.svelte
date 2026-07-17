<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + knowledge 的 IA/active 判定。
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import { t } from '$lib/i18n/index.js'

  const isActive = (href) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  const items = $derived(
    [
      { href: '/', icon: 'inbox', label: t('nav.inbox') },
      { href: '/library', icon: 'library', label: t('nav.library') },
      { href: '/timeline', icon: 'timeline', label: t('nav.timeline') },
      { href: '/recall', icon: 'recall', label: t('nav.recall') },
      { href: '/settings', icon: 'settings', label: t('nav.settings') },
    ].map((item) => ({ ...item, active: isActive(item.href) })),
  )
</script>

<LifeOsBottomNav {items} ariaLabel={t('nav.mainAria')} navClass="bottom-nav" />
