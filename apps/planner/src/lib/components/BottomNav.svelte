<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + planner 的 IA/More sheet/编辑器抑制。
  import { page } from '$app/state'
  import { userLists } from '$lib/state.svelte.js'
  import { t, listLabel } from '$lib/i18n/index.js'
  import { taskEditor } from '$lib/ui.svelte.js'
  import {
    buildPrimaryNavItems,
    buildMoreNavGroups,
    resolvePrimaryNavTab,
    isMoreNavActive,
    isNavChromeHidden,
  } from '$lib/nav.js'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet'
  import { isIosNativeShell } from '@life-os/platform-web/ios-native-shell'

  import { lockScroll, unlockScroll } from '$lib/scrollLock.js'

  let moreOpen = $state(false)

  const pathname = $derived(page.url.pathname)
  const search = $derived(page.url.search)
  const primaryTab = $derived(resolvePrimaryNavTab(pathname))
  const moreActive = $derived(isMoreNavActive(pathname, search))
  const items = $derived(
    buildPrimaryNavItems(t).map((item) => ({
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: primaryTab === item.tab && !moreActive,
    })),
  )
  const moreGroups = $derived(buildMoreNavGroups(t, userLists(), listLabel))
  // Kenos Domain Mode owns the only dock — hide planner BottomNav in embedded shell.
  const hidden = $derived(
    taskEditor.open || isNavChromeHidden(pathname) || isIosNativeShell(),
  )

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
    navClass="bottom-nav"
    backgrounded={moreOpen}
    more={{
      label: t('common.more'),
      active: moreActive,
      open: moreOpen,
      onToggle: () => {
        moreOpen = !moreOpen
      },
    }}
  />

  <MobileMoreSheet
    open={moreOpen}
    title={t('common.more')}
    groups={moreGroups}
    {pathname}
    {search}
    closeLabel={t('common.close')}
    onClose={() => {
      moreOpen = false
    }}
  />
{/if}
