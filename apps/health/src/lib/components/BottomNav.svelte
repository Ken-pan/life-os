<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + HealthOS 的 IA/active 判定。
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import { t } from '$lib/i18n/index.js'

  const isActive = (href) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  const items = $derived(
    [
      { href: '/', icon: 'now', label: t('nav.now') },
      { href: '/focus', icon: 'focus', label: t('nav.focus') },
      { href: '/settings', icon: 'settings', label: t('nav.settings') },
    ].map((item) => ({ ...item, active: isActive(item.href) })),
  )
</script>

<LifeOsBottomNav {items} ariaLabel={t('nav.mainAria')} navClass="bottom-nav" />
