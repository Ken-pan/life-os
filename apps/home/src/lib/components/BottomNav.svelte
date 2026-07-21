<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + home 的 IA/More sheet。
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet'
  import {
    buildPrimaryNavItems,
    buildMoreNavGroups,
    resolveNavTab,
    isMoreNavActive,
    isNavChromeHidden,
  } from '$lib/nav.js'
  import { lockScroll, unlockScroll } from '@life-os/theme'

  /** @type {{ hidden?: boolean }} */
  let { hidden = false } = $props()

  let moreOpen = $state(false)

  const pathname = $derived(page.url.pathname)
  const current = $derived(resolveNavTab(pathname))
  const moreActive = $derived(isMoreNavActive(pathname))
  const items = $derived(
    buildPrimaryNavItems().map((item) => ({
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: current === item.tab && !moreActive,
    })),
  )
  const moreGroups = $derived(buildMoreNavGroups())
  const navHidden = $derived(hidden || isNavChromeHidden(pathname))

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

{#if !navHidden}
  <LifeOsBottomNav
    {items}
    ariaLabel="主导航"
    labelDecor
    backgrounded={moreOpen}
    more={{
      label: '更多',
      active: moreActive,
      open: moreOpen,
      onToggle: () => {
        moreOpen = !moreOpen
      },
    }}
  />

  <MobileMoreSheet
    open={moreOpen}
    title="更多"
    groups={moreGroups}
    {pathname}
    closeLabel="关闭"
    onClose={() => {
      moreOpen = false
    }}
  />
{/if}
