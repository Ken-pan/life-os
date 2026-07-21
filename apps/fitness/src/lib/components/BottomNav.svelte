<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + fitness 的 IA/More sheet。
  import { page } from '$app/state'
  import { t } from '$lib/i18n/index.js'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet'
  import {
    buildPrimaryNavItems,
    buildMoreNavGroups,
    resolveNavTab,
    isMoreNavActive,
    isNavChromeHidden,
  } from '$lib/nav.js'
  import { isIosNativeShell } from '@life-os/platform-web/ios-native-shell'
  import { lockScroll, unlockScroll } from '@life-os/theme'

  let moreOpen = $state(false)

  const pathname = $derived(page.url.pathname)
  const current = $derived(resolveNavTab(pathname))
  const moreActive = $derived(isMoreNavActive(pathname))
  const items = $derived(
    buildPrimaryNavItems(t).map((item) => ({
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: current === item.tab && !moreActive,
    })),
  )
  const moreGroups = $derived(buildMoreNavGroups(t))
  // Kenos Domain Mode owns the only dock — hide fitness BottomNav in embedded shell.
  const hidden = $derived(isNavChromeHidden(pathname) || isIosNativeShell())

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

{#if !hidden}
  <LifeOsBottomNav
    {items}
    ariaLabel={t('nav.mainAria')}
    labelDecor
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
{/if}
