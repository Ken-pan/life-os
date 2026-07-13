<script>
  import { page } from '$app/state';
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar';
  import AppBrand from '@life-os/platform-web/svelte/brand';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { t } from '$lib/i18n/index.js';
  import GlobalSearch from './GlobalSearch.svelte';
  import { getPageActions } from '$lib/pageChrome.svelte.js';

  import { toast } from '$lib/ui.svelte.js';
  import ReportBugButton from '@life-os/platform-web/svelte/feedback';
  import { supabase } from '$lib/supabase.js';
  import { auth } from '$lib/auth.svelte.js';

  /** @type {{ title?: string, subtitle?: string, backHref?: string, backLabel?: string, hidden?: boolean, searchRef?: HTMLInputElement | null }} */
  let {
    title,
    subtitle,
    backHref,
    backLabel,
    hidden = false,
    searchRef = $bindable(null)
  } = $props();

  const actions = $derived(getPageActions());
  const hasTools = $derived(actions.length > 0);
  const onSearchPage = $derived(page.url.pathname === '/search');
  const showMobileTitle = $derived(Boolean(title) && !onSearchPage);
</script>

<LifeOsAppBar
  {backHref}
  backLabel={backLabel ?? t('common.back')}
  {hidden}
  barClass={hasTools ? 'music-appbar appbar--tools' : 'music-appbar'}
>
  {#snippet leading()}
    <AppBrand appId="music" variant="appbar" ariaLabel={t('common.brand')} />
  {/snippet}

  {#snippet titles()}
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
  {/snippet}

  {#snippet trailing()}
    {#if !onSearchPage}
      <a class="appbar-search-mobile" href="/search" aria-label={t('search.title')}>
        <Icon name="search" size={20} strokeWidth={1.75} />
      </a>
    {/if}
    <ReportBugButton app="music" {supabase} user={auth.user} {toast} />
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
  {/snippet}
</LifeOsAppBar>
