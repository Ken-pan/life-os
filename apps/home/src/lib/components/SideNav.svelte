<script>
  // 薄封装：共享 LifeOsSideNav 骨架 + home 的 IA/active 判定与品牌位。
  import { page } from '$app/state'
  import { auth } from '$lib/auth.svelte.js'
  import AppBrandSwitcher from '@life-os/platform-web/svelte/brand/switcher'
  import LifeOsSideNav from '@life-os/platform-web/svelte/navigation/side-nav'
  import { LIFE_OS_PERSONAL_OWNER_EMAIL } from '@life-os/sync'
  import {
    buildPrimaryNavItems,
    buildSettingsNavItem,
    resolveNavTab,
    isNavChromeHidden,
  } from '$lib/nav.js'

  const current = $derived(resolveNavTab(page.url.pathname))
  const groups = $derived([
    {
      items: buildPrimaryNavItems().map((item) => ({
        key: item.tab,
        href: item.href,
        icon: item.icon,
        label: item.label,
        active: current === item.tab,
      })),
    },
  ])
  const footItem = $derived.by(() => {
    const item = buildSettingsNavItem()
    return {
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: current === item.tab,
    }
  })
  const hidden = $derived(isNavChromeHidden(page.url.pathname))
  const canSwitchApps = $derived(
    auth.user?.email?.toLowerCase() === LIFE_OS_PERSONAL_OWNER_EMAIL,
  )
</script>

<LifeOsSideNav {groups} {footItem} {hidden} ariaLabel="侧栏导航" labelDecor>
  {#snippet brand()}
    <AppBrandSwitcher
      appId="home"
      tagline="居家空间规划"
      ariaLabel="Kenos Home"
      allowedAppIds={auth.allowedAppKeys}
      canSwitch={canSwitchApps}
    />
  {/snippet}
</LifeOsSideNav>
