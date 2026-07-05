<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import Icon from '$lib/components/Icon.svelte';
  import {
    buildPrimaryNavItems,
    buildSettingsNavItem,
    resolveNavTab,
    isNavChromeHidden
  } from '$lib/nav.js';

  const primaryItems = $derived(buildPrimaryNavItems(t));
  const settingsItem = $derived(buildSettingsNavItem(t));
  const current = $derived(resolveNavTab(page.url.pathname));
  const hidden = $derived(isNavChromeHidden(page.url.pathname));
</script>

{#if !hidden}
<aside class="sidebar" aria-label={t('nav.mainAria')}>
  <div class="brand" aria-label="FITNESS OS">
    <img src="/icon.svg" alt="" class="brand-mark" width="28" height="28" />
    <span class="brand-copy">
      <span class="brand-name" aria-hidden="true">
        <span class="brand-name-base">FITNESS</span><span class="brand-name-accent">OS</span>
      </span>
      <span class="brand-tag" data-ui-decor="nav-label">{t('nav.brandTag')}</span>
    </span>
  </div>

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
