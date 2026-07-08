<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import BrandMark from '@life-os/platform-web/svelte/brand';
  import Icon from '@life-os/platform-web/svelte/icon';
  import {
    buildSidebarNavGroups,
    buildSettingsNavItem,
    isNavChromeHidden
  } from '$lib/nav.js';

  const groups = $derived(buildSidebarNavGroups(t));
  const settingsItem = $derived(buildSettingsNavItem(t));
  const pathname = $derived(page.url.pathname);
  const hidden = $derived(isNavChromeHidden(page.url.pathname));

  /** @param {import('$lib/nav.js').NavItem} item */
  function isActive(item) {
    return item.match(pathname);
  }
</script>

{#if !hidden}
  <aside class="sidebar music-sidebar" aria-label={t('nav.mainAria')}>
    <div class="brand" aria-label={t('common.brand')}>
      <BrandMark size={28} class="brand-mark" />
      <span class="brand-copy">
        <span class="brand-name" aria-hidden="true">
          <span class="brand-name-base">MUSIC</span><span class="brand-name-accent">OS</span>
        </span>
        <span class="brand-tag">{t('app.tagline')}</span>
      </span>
    </div>

    <div class="sidebar-body">
      {#each groups as group (group.label)}
        <div class="nav-group">
          <p class="nav-group-label">{group.label}</p>
          {#each group.items as item (item.tab)}
            <a
              class="nav-item"
              class:active={isActive(item)}
              href={item.href}
              data-sveltekit-noscroll
              aria-current={isActive(item) ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} strokeWidth={1.75} />
              <span class="nav-lbl">{item.label}</span>
            </a>
          {/each}
        </div>
      {/each}
    </div>

    <a
      class="nav-item sidebar-foot-item"
      class:active={isActive(settingsItem)}
      href={settingsItem.href}
      data-sveltekit-noscroll
      aria-current={isActive(settingsItem) ? 'page' : undefined}
    >
      <Icon name={settingsItem.icon} size={18} strokeWidth={1.75} />
      <span class="nav-lbl">{settingsItem.label}</span>
    </a>
  </aside>
{/if}

<style>
  .music-sidebar .nav-group-label {
    font-size: var(--text-2xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sidebar-muted);
    padding: var(--space-3) var(--space-2-5) var(--space-1);
    margin: 0;
  }

  .music-sidebar .nav-item.active {
    position: relative;
    font-weight: 600;
    background: color-mix(in srgb, var(--sidebar-foreground) 6%, transparent);
    color: var(--sidebar-foreground);
  }

  .music-sidebar .nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 55%;
    border-radius: 0 2px 2px 0;
    background: var(--sidebar-primary);
  }
</style>
