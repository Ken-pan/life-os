<script>
  import { page } from '$app/state'
  import Icon from '@life-os/platform-web/svelte/icon'
  import AppBrand from '@life-os/platform-web/svelte/brand'
  import { t } from '$lib/i18n/index.js'
  import { isTaskModuleRoute } from '$lib/nav.js'
  import { openTaskDrawer, taskDrawer, toast } from '$lib/ui.svelte.js'
  import ReportBugButton from '@life-os/platform-web/svelte/feedback'
  import { supabase } from '$lib/supabase.js'
  import { auth } from '$lib/auth.svelte.js'

  /** @type {{ title?: string, subtitle?: string, backHref?: string, backLabel?: string, historyBack?: boolean }} */
  let { title, subtitle, backHref, backLabel, historyBack = false } = $props()

  const pathname = $derived(page.url.pathname)
  const showListMenu = $derived(
    isTaskModuleRoute(pathname) && !historyBack && !backHref,
  )

  const showMobileSettings = $derived(
    !pathname.startsWith('/settings') && !pathname.startsWith('/auth'),
  )

  const resolvedBackLabel = $derived(backLabel ?? t('common.back'))
  const hasBack = $derived(Boolean(backHref) || historyBack)
  const hasTools = $derived(showMobileSettings)
</script>

<header
  class="appbar"
  class:appbar--back={hasBack}
  class:appbar--tools={hasTools}
  class:appbar--list-menu={showListMenu}
>
  <div class="appbar-inner">
    <div class="appbar-leading">
      {#if showListMenu}
        <button
          type="button"
          class="appbar-menu"
          aria-label={t('nav.openLists')}
          aria-expanded={taskDrawer.open}
          aria-haspopup="dialog"
          onclick={openTaskDrawer}
        >
          <Icon name="menu" size={20} strokeWidth={1.75} />
        </button>
      {:else if historyBack}
        <button
          type="button"
          class="appbar-back"
          onclick={() => history.back()}
        >
          <Icon name="chevron-left" size={16} strokeWidth={2.5} />
          <span class="appbar-back-label">{resolvedBackLabel}</span>
        </button>
      {:else if backHref}
        <a class="appbar-back" href={backHref}>
          <Icon name="chevron-left" size={16} strokeWidth={2.5} />
          <span class="appbar-back-label">{resolvedBackLabel}</span>
        </a>
      {:else}
        <AppBrand appId="planner" variant="appbar" ariaLabel={t('app.name')} />
      {/if}
    </div>

    {#if title}
      <div class="appbar-titles">
        <h1 class="page-title">{title}</h1>
        {#if subtitle}<p class="page-sub">{subtitle}</p>{/if}
      </div>
    {/if}

    <div class="appbar-trailing">
      <ReportBugButton app="planner" {supabase} user={auth.user} {toast} />
      {#if showMobileSettings}
        <a
          class="appbar-settings"
          href="/settings"
          aria-label={t('nav.settings')}
        >
          <Icon name="settings" size={20} strokeWidth={1.75} />
        </a>
      {/if}
    </div>
  </div>
</header>
