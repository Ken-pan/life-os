<script>
  import { page } from '$app/state'
  import { userLists } from '$lib/state.svelte.js'
  import { t, listLabel } from '$lib/i18n/index.js'
  import { buildSidebarNavGroups, buildSettingsNavItem } from '$lib/nav.js'
  import { openTaskEditor } from '$lib/ui.svelte.js'
  import { resolveTaskEditorDefaults } from '$lib/taskEditorDefaults.js'
  import AppBrandSwitcher from '@life-os/platform-web/svelte/brand/switcher'
  import Icon from '@life-os/platform-web/svelte/icon'

  const navGroups = $derived(buildSidebarNavGroups(t))
  const settingsLink = $derived(buildSettingsNavItem(t))
  const lists = $derived(userLists())
  const path = $derived(page.url.pathname)
  const search = $derived(page.url.search)
</script>

<aside class="sidebar" aria-label={t('nav.mainAria')}>
  <AppBrandSwitcher appId="planner" tagline={t('app.tagline')} />

  <div class="sidebar-body">
    {#each navGroups as group, index (group.label)}
      <div class="nav-group" class:nav-group-divider={index > 0}>
        <p class="nav-group-label">{group.label}</p>
        {#each group.items as link (link.href)}
          <a
            class="nav-item"
            class:active={link.match(path, search)}
            href={link.href}
            aria-current={link.match(path, search) ? 'page' : undefined}
          >
            <Icon name={link.icon} size={18} strokeWidth={1.75} />
            <span>{link.label}</span>
          </a>
        {/each}
      </div>
    {/each}

    <div class="nav-group nav-group-divider">
      <p class="nav-group-label">{t('nav.lists')}</p>
      {#each lists as list (list.id)}
        <a
          class="nav-item"
          class:active={path === `/lists/${list.id}`}
          href="/lists/{list.id}"
          aria-current={path === `/lists/${list.id}` ? 'page' : undefined}
        >
          <span class="sidebar-dot" style:background={list.color}></span>
          <span>{listLabel(list)}</span>
        </a>
      {/each}
      {#if !lists.length}
        <p class="sidebar-empty">—</p>
      {/if}
    </div>
  </div>

  <button
    type="button"
    class="nav-item sidebar-add-task"
    data-testid="desktop-add-task"
    onclick={() =>
      openTaskEditor(null, resolveTaskEditorDefaults(path, search))}
  >
    <Icon name="plus" size={18} strokeWidth={1.75} />
    <span>{t('common.addTask')}</span>
  </button>

  <a
    class="nav-item sidebar-foot-item"
    class:active={settingsLink.match(path)}
    href={settingsLink.href}
    aria-current={settingsLink.match(path) ? 'page' : undefined}
  >
    <Icon name={settingsLink.icon} size={18} strokeWidth={1.75} />
    <span>{settingsLink.label}</span>
  </a>
</aside>
