<script>
  // 薄封装：共享 LifeOsSideNav 骨架 + fitness 的 IA/active 判定与品牌位。
  import { page } from '$app/state'
  import { t } from '$lib/i18n/index.js'
  import { auth } from '$lib/auth.svelte.js'
  import AppBrandSwitcher from '@life-os/platform-web/svelte/brand/switcher'
  import LifeOsSideNav from '@life-os/platform-web/svelte/navigation/side-nav'
  import { LIFE_OS_PERSONAL_OWNER_EMAIL } from '@life-os/sync'
  import {
    buildPrimaryNavItems,
    buildMoreNavGroups,
    buildSettingsNavItem,
    resolveNavTab,
    isNavChromeHidden,
  } from '$lib/nav.js'

  const pathname = $derived(page.url.pathname)
  const current = $derived(resolveNavTab(pathname))
  const groups = $derived([
    {
      items: buildPrimaryNavItems(t).map((item) => ({
        key: item.tab,
        href: item.href,
        icon: item.icon,
        label: item.label,
        active: current === item.tab,
      })),
    },
    ...buildMoreNavGroups(t)
      .filter((g) => g.label !== t('nav.groupAccount'))
      .map((group) => ({
        label: group.label,
        items: group.items.map((item) => ({
          key: item.tab,
          href: item.href,
          icon: item.icon,
          label: item.label,
          active:
            typeof item.match === 'function'
              ? item.match(pathname)
              : current === item.tab,
        })),
      })),
  ])
  const footItem = $derived.by(() => {
    const item = buildSettingsNavItem(t)
    return {
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: current === item.tab,
    }
  })
  const hidden = $derived(isNavChromeHidden(pathname))
  const canSwitchApps = $derived(
    auth.user?.email?.toLowerCase() === LIFE_OS_PERSONAL_OWNER_EMAIL,
  )
</script>

<LifeOsSideNav
  {groups}
  {footItem}
  {hidden}
  ariaLabel={t('nav.mainAria')}
  labelDecor
>
  {#snippet brand()}
    <AppBrandSwitcher
      appId="fitness"
      tagline={t('nav.brandTag')}
      ariaLabel="FITNESS OS"
      allowedAppIds={auth.allowedAppKeys}
      canSwitch={canSwitchApps}
    />
  {/snippet}
</LifeOsSideNav>
