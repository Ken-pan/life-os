<script>
  import { page } from '$app/state'
  import AppBrand from '@life-os/platform-web/svelte/brand'
  import Icon from '@life-os/platform-web/svelte/icon'
  import {
    buildPrimaryNavItems,
    buildSettingsNavItem,
    resolveNavTab,
    isNavChromeHidden,
  } from '$lib/nav.js'

  const primaryItems = $derived(buildPrimaryNavItems())
  const settingsItem = $derived(buildSettingsNavItem())
  const current = $derived(resolveNavTab(page.url.pathname))
  const hidden = $derived(isNavChromeHidden(page.url.pathname))
</script>

{#if !hidden}
  <aside class="sidebar" aria-label="侧栏导航">
    <AppBrand appId="home" tagline="居家空间规划" ariaLabel="HOME.OS" />

    <div class="sidebar-body">
      <div class="nav-group">
        {#each primaryItems as item (item.tab)}
          <a
            class="nav-item"
            class:active={current === item.tab}
            href={item.href}
            data-sveltekit-noscroll
            aria-current={current === item.tab ? 'page' : undefined}
          >
            <Icon name={item.icon} size={18} strokeWidth={1.75} />
            <span class="nav-lbl" data-ui-decor="nav-label">{item.label}</span>
          </a>
        {/each}
      </div>
    </div>

    <a
      class="nav-item sidebar-foot-item"
      class:active={current === settingsItem.tab}
      href={settingsItem.href}
      data-sveltekit-noscroll
      aria-current={current === settingsItem.tab ? 'page' : undefined}
    >
      <Icon name={settingsItem.icon} size={18} strokeWidth={1.75} />
      <span class="nav-lbl" data-ui-decor="nav-label">{settingsItem.label}</span>
    </a>
  </aside>
{/if}
