<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import MobileMoreSheet from '$lib/components/MobileMoreSheet.svelte';
  import {
    buildPrimaryNavItems,
    buildMoreNavGroups,
    resolvePrimaryNavTab,
    isMoreNavActive,
    isNavChromeHidden
  } from '$lib/nav.js';
  import { lockScroll, unlockScroll } from '@life-os/theme';

  let moreOpen = $state(false);

  const primaryItems = $derived(buildPrimaryNavItems(t));
  const moreGroups = $derived(buildMoreNavGroups(t));
  const pathname = $derived(page.url.pathname);
  const primaryTab = $derived(resolvePrimaryNavTab(pathname));
  const moreActive = $derived(isMoreNavActive(pathname));
  const hidden = $derived(isNavChromeHidden(pathname));

  $effect(() => {
    pathname;
    moreOpen = false;
  });

  $effect(() => {
    if (moreOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  });
</script>

{#if !hidden}
  <nav class="nav bottom-nav" class:is-backgrounded={moreOpen} aria-label={t('nav.mainAria')}>
    <div class="nav-inner">
      {#each primaryItems as item (item.tab)}
        <a
          class="nav-item"
          class:on={primaryTab === item.tab}
          href={item.href}
          data-sveltekit-noscroll
          aria-current={primaryTab === item.tab ? 'page' : undefined}
          aria-label={item.label}
        >
          <Icon name={item.icon} size={21} strokeWidth={1.5} />
          <span class="nav-lbl">{item.label}</span>
        </a>
      {/each}
      <button
        type="button"
        class="nav-item nav-item-more"
        class:on={moreOpen || moreActive}
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        aria-label={t('common.more')}
        onclick={() => {
          moreOpen = !moreOpen;
        }}
      >
        <Icon name="ellipsis" size={21} strokeWidth={1.5} />
        <span class="nav-lbl">{t('common.more')}</span>
      </button>
    </div>
  </nav>

  <MobileMoreSheet
    open={moreOpen}
    title={t('common.more')}
    groups={moreGroups}
    {pathname}
    onClose={() => {
      moreOpen = false;
    }}
  />
{/if}
