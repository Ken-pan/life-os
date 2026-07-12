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
  import { createTask } from '$lib/domain/tasks.js'
  import { uploadAttachment, createLinkAttachment } from '$lib/services/attachmentService.js'

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
  
  async function handleBugSubmit({ title: bugTitle, notes, severity, screenshot, diagnostics }) {
    let projectId = null;
    if (pathname.startsWith('/projects/')) {
      const parts = pathname.split('/');
      if (parts.length > 2 && parts[2]) {
        projectId = parts[2];
      }
    }
    
    // Create Bug Task
    const task = createTask({
      title: bugTitle,
      notes,
      priority: severity === 'high' ? 'P1' : (severity === 'low' ? 'P3' : 'P2'),
      projectId,
      tags: ['bug'],
    });
    
    // Create diagnostics log attachment
    const logContent = JSON.stringify(diagnostics, null, 2);
    const logBlob = new Blob([logContent], { type: 'application/json' });
    const logFile = new File([logBlob], 'diagnostics.json', { type: 'application/json' });
    
    await uploadAttachment('task', task.id, logFile, 'system');
    
    // Upload screenshot if provided
    if (screenshot) {
      await uploadAttachment('task', task.id, screenshot, 'bug-report');
    }
  }
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
        <AppBrand appId="planner" variant="appbar" ariaLabel={t('app.name')} />
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
      <div class="appbar-titles" class:appbar-titles--list-menu={showListMenu}>
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
        {/if}
        <h1 class="page-title">{title}</h1>
        {#if subtitle && !showListMenu}<p class="page-sub">{subtitle}</p>{/if}
      </div>
    {/if}

    <div class="appbar-trailing">
      <ReportBugButton app="planner" {supabase} user={auth.user} {toast} onSubmit={handleBugSubmit} />
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
