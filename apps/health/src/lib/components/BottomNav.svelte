<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + HealthOS 的 IA/More sheet。
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet'
  import { t } from '$lib/i18n/index.js'
  import { lockScroll, unlockScroll } from '@life-os/theme'

  let moreOpen = $state(false)

  const pathname = $derived(page.url.pathname)
  const isActive = (href) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)
  const moreActive = $derived(pathname.startsWith('/settings'))

  const items = $derived(
    [
      { href: '/', icon: 'now', label: t('nav.status'), key: 'status' },
      { href: '/focus', icon: 'focus', label: t('nav.focus'), key: 'focus' },
      {
        href: '/trends',
        icon: 'trends',
        label: t('nav.trends'),
        key: 'trends',
      },
    ].map((item) => ({
      ...item,
      active: isActive(item.href) && !moreActive,
    })),
  )

  const moreGroups = $derived([
    {
      label: t('nav.groupAccount'),
      items: [
        {
          tab: 'settings',
          href: '/settings',
          icon: 'settings',
          label: t('nav.settings'),
          match: (p) => p.startsWith('/settings'),
        },
      ],
    },
  ])

  $effect(() => {
    pathname
    moreOpen = false
  })

  $effect(() => {
    if (moreOpen) {
      lockScroll()
      return () => unlockScroll()
    }
  })
</script>

<LifeOsBottomNav
  {items}
  ariaLabel={t('nav.mainAria')}
  navClass="bottom-nav"
  backgrounded={moreOpen}
  more={{
    label: t('nav.more'),
    active: moreActive,
    open: moreOpen,
    onToggle: () => {
      moreOpen = !moreOpen
    },
  }}
/>

<MobileMoreSheet
  open={moreOpen}
  title={t('nav.more')}
  groups={moreGroups}
  {pathname}
  closeLabel={t('common.close')}
  onClose={() => {
    moreOpen = false
  }}
/>
