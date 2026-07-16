<script>
  // 薄封装：共享 LifeOsSideNav 骨架 + music 的分组 IA、品牌位与激活态样式。
  import { page } from '$app/state'
  import { t } from '$lib/i18n/index.js'
  import { auth } from '$lib/auth.svelte.js'
  import AppBrandSwitcher from '@life-os/platform-web/svelte/brand/switcher'
  import LifeOsSideNav from '@life-os/platform-web/svelte/navigation/side-nav'
  import { LIFE_OS_PERSONAL_OWNER_EMAIL } from '@life-os/sync'
  import {
    buildSidebarNavGroups,
    buildSettingsNavItem,
    isNavChromeHidden,
  } from '$lib/nav.js'

  const pathname = $derived(page.url.pathname)

  /** @param {import('$lib/nav.js').NavItem} item */
  const toSkeletonItem = (item) => ({
    key: item.tab,
    href: item.href,
    icon: item.icon,
    label: item.label,
    active: item.match(pathname),
  })

  const groups = $derived(
    buildSidebarNavGroups(t).map((group) => ({
      label: group.label,
      items: group.items.map(toSkeletonItem),
    })),
  )
  const footItem = $derived(toSkeletonItem(buildSettingsNavItem(t)))
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
  sideClass="music-sidebar"
>
  {#snippet brand()}
    <AppBrandSwitcher
      appId="music"
      tagline={t('app.tagline')}
      ariaLabel={t('common.brand')}
      allowedAppIds={auth.allowedAppKeys}
      canSwitch={canSwitchApps}
    />
  {/snippet}
</LifeOsSideNav>

<style>
  :global(.music-sidebar .nav-group-label) {
    font-size: var(--text-2xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sidebar-muted);
    padding: var(--space-3) var(--space-2-5) var(--space-1);
    margin: 0;
  }

  :global(.music-sidebar .nav-item.active) {
    position: relative;
    font-weight: 600;
    background: color-mix(in srgb, var(--sidebar-foreground) 6%, transparent);
    color: var(--sidebar-foreground);
  }

  :global(.music-sidebar .nav-item.active)::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 55%;
    border-radius: 0 2px 2px 0;
    background: var(--sidebar-foreground);
  }
</style>
