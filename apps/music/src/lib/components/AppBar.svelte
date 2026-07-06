<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n/index.js';
  import GlobalSearch from './GlobalSearch.svelte';
  import { getPageActions } from '$lib/pageChrome.svelte.js';

  /** @type {{ title?: string, subtitle?: string, backHref?: string, backLabel?: string, hidden?: boolean, searchRef?: HTMLInputElement | null }} */
  let {
    title,
    subtitle,
    backHref,
    backLabel,
    hidden = false,
    searchRef = $bindable(null)
  } = $props();

  const resolvedBackLabel = $derived(backLabel ?? t('common.back'));
  const hasBack = $derived(Boolean(backHref));
  const actions = $derived(getPageActions());
  const hasTools = $derived(actions.length > 0);
  const onSearchPage = $derived(page.url.pathname === '/search');
  const showMobileTitle = $derived(Boolean(title) && !onSearchPage);
</script>

{#if !hidden}
  <header class="appbar music-appbar" class:appbar--back={hasBack} class:appbar--tools={hasTools}>
    <div class="appbar-inner">
      <div class="appbar-leading">
        {#if backHref}
          <a class="appbar-back" href={backHref}>
            <Icon name="chevron-left" size={16} strokeWidth={2.5} />
            <span class="appbar-back-label">{resolvedBackLabel}</span>
          </a>
        {:else}
          <div class="brand appbar-brand" aria-label={t('common.brand')}>
            <img src="/icon.svg" alt="" class="appbar-brand-mark" width="24" height="24" />
            <span class="appbar-brand-name">
              MUSIC<span class="brand-dot">.</span>OS
            </span>
          </div>
        {/if}
      </div>

      <div class="appbar-center">
        <div class="appbar-search-desktop">
          <GlobalSearch bind:inputRef={searchRef} />
        </div>
        {#if showMobileTitle}
          <div class="appbar-titles appbar-titles--mobile">
            <h1 class="page-title">{title}</h1>
            {#if subtitle}<p class="page-sub">{subtitle}</p>{/if}
          </div>
        {/if}
      </div>

      <div class="appbar-trailing">
        {#if !onSearchPage}
          <a class="appbar-search-mobile" href="/search" aria-label={t('search.title')}>
            <Icon name="search" size={20} strokeWidth={1.75} />
          </a>
        {/if}
        {#each actions as action, i (action.label + i)}
          {#if action.href}
            <a
              class={action.variant === 'primary' ? 'btn-primary appbar-action' : action.variant === 'ghost' ? 'btn-ghost appbar-action' : 'btn-secondary appbar-action'}
              href={action.href}
            >
              {#if action.icon}<Icon name={action.icon} size={16} />{/if}
              <span class="appbar-action-label">{action.label}</span>
            </a>
          {:else if action.onClick}
            <button
              type="button"
              class={action.variant === 'primary' ? 'btn-primary appbar-action' : action.variant === 'ghost' ? 'btn-ghost appbar-action' : 'btn-secondary appbar-action'}
              onclick={action.onClick}
            >
              {#if action.icon}<Icon name={action.icon} size={16} />{/if}
              <span class="appbar-action-label">{action.label}</span>
            </button>
          {/if}
        {/each}
      </div>
    </div>
  </header>
{/if}
