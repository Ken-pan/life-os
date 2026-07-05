<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import LogoMark from './LogoMark.svelte';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ title?: string, subtitle?: string, backHref?: string, backLabel?: string, historyBack?: boolean }} */
  let { title, subtitle, backHref, backLabel, historyBack = false } = $props();

  const showMobileSearch = $derived(
    !page.url.pathname.startsWith('/search') &&
      !page.url.pathname.startsWith('/auth') &&
      !page.url.pathname.startsWith('/settings')
  );

  const showMobileSettings = $derived(
    !page.url.pathname.startsWith('/settings') &&
      !page.url.pathname.startsWith('/auth') &&
      (page.url.pathname === '/' ||
        page.url.pathname.startsWith('/inbox') ||
        page.url.pathname.startsWith('/upcoming') ||
        page.url.pathname.startsWith('/calendar'))
  );

  const resolvedBackLabel = $derived(backLabel ?? t('common.back'));
  const hasBack = $derived(Boolean(backHref) || historyBack);
  const hasTools = $derived(showMobileSearch || showMobileSettings);
</script>

<header class="appbar" class:appbar--back={hasBack} class:appbar--tools={hasTools}>
  <div class="appbar-inner">
    <div class="appbar-leading">
      {#if historyBack}
        <button type="button" class="appbar-back" onclick={() => history.back()}>
          <Icon name="chevron-left" size={16} strokeWidth={2.5} />
          <span class="appbar-back-label">{resolvedBackLabel}</span>
        </button>
      {:else if backHref}
        <a class="appbar-back" href={backHref}>
          <Icon name="chevron-left" size={16} strokeWidth={2.5} />
          <span class="appbar-back-label">{resolvedBackLabel}</span>
        </a>
      {:else}
        <div class="brand appbar-brand" aria-label={t('app.name')}>
          <LogoMark size={24} class="appbar-brand-mark" />
          <span class="appbar-brand-copy">
            <span class="appbar-brand-name">
              PLANNER<span class="brand-dot">.</span>OS
            </span>
          </span>
        </div>
      {/if}
    </div>

    {#if title}
      <div class="appbar-titles">
        <h1 class="page-title">{title}</h1>
        {#if subtitle}<p class="page-sub">{subtitle}</p>{/if}
      </div>
    {/if}

    <div class="appbar-trailing">
      {#if showMobileSettings}
        <a class="appbar-settings" href="/settings" aria-label={t('nav.settings')}>
          <Icon name="settings" size={20} strokeWidth={1.75} />
        </a>
      {/if}
      {#if showMobileSearch}
        <a class="appbar-search" href="/search" aria-label={t('nav.search')}>
          <Icon name="search" size={20} strokeWidth={1.75} />
        </a>
      {/if}
    </div>
  </div>
</header>
