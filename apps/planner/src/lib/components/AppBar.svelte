<script>
  import { page } from '$app/state'
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar'
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

  const hasTools = $derived(showMobileSettings)

  async function handleBugSubmit({ title: bugTitle, notes, severity, screenshot, diagnostics }) {
    let projectId = null
    if (pathname.startsWith('/projects/')) {
      const parts = pathname.split('/')
      if (parts.length > 2 && parts[2]) {
        projectId = parts[2]
      }
    }

    // Create Bug Task (local first). Upload failures must reject so ReportBugButton
    // shows error instead of a false "submitted successfully" toast.
    const task = createTask({
      title: bugTitle,
      notes,
      priority: severity === 'high' ? 'P1' : severity === 'low' ? 'P3' : 'P2',
      projectId,
      tags: ['bug'],
    })

    const logContent = JSON.stringify(diagnostics, null, 2)
    const logBlob = new Blob([logContent], { type: 'application/json' })
    const logFile = new File([logBlob], 'diagnostics.json', { type: 'application/json' })

    await uploadAttachment('task', task.id, logFile, 'bug-report')
    if (screenshot) {
      await uploadAttachment('task', task.id, screenshot, 'bug-report')
    }
  }
</script>

<LifeOsAppBar
  {backHref}
  backLabel={backLabel ?? t('common.back')}
  onBack={historyBack ? () => history.back() : undefined}
  barClass={[hasTools && 'appbar--tools', showListMenu && 'appbar--list-menu']
    .filter(Boolean)
    .join(' ')}
>
  {#snippet leading()}
    <AppBrand appId="planner" variant="appbar" ariaLabel={t('app.name')} />
  {/snippet}

  {#snippet titles()}
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
  {/snippet}

  {#snippet trailing()}
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
  {/snippet}
</LifeOsAppBar>
