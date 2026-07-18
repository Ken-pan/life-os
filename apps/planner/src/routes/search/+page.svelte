<script>
  import { afterNavigate } from '$app/navigation'
  import PageShell from '$lib/components/PageShell.svelte'
  import TaskGroup from '$lib/components/TaskGroup.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import { selectSearch, selectAllTags } from '$lib/domain/selectors.js'
  import { searchEmptyState } from '$lib/domain/searchEmptyState.js'
  import { completeTask, editTask } from '$lib/taskUi.js'
  import { t } from '$lib/i18n/index.js'
  import { sortTasks } from '$lib/engine/prioritizer.js'
  import { visibleProjects } from '$lib/domain/projects.js'

  const TAGS_VISIBLE = 4

  let query = $state('')
  let tag = $state('')
  let projectId = $state('')
  let showAllTags = $state(false)
  /** @type {HTMLInputElement | null} */
  let searchInput = $state(null)

  // 进入搜索页即聚焦输入框，移动端直接弹出键盘。
  // 用 afterNavigate 是因为 SvelteKit 导航完成后会把焦点重置到 body。
  afterNavigate(() => {
    searchInput?.focus()
  })

  const tags = $derived(selectAllTags(taskIndex()))
  const projects = $derived(visibleProjects())
  const visibleTags = $derived(showAllTags ? tags : tags.slice(0, TAGS_VISIBLE))
  const hiddenTagCount = $derived(Math.max(0, tags.length - TAGS_VISIBLE))
  const tasks = $derived.by(() => {
    let list = selectSearch(taskIndex(), query)
    if (tag) list = list.filter((t) => t.tags.includes(tag))
    if (projectId) list = list.filter((t) => t.projectId === projectId)
    return sortTasks(list, 'smart')
  })
</script>

<PageShell title={t('search.title')} mainClass="search-field">
  {#snippet main()}
  <div class="field">
    <input
      bind:this={searchInput}
      bind:value={query}
      type="search"
      enterkeyhint="search"
      placeholder={t('search.placeholder')}
    />
  </div>
  {#if tags.length}
    <div class="search-tags">
      <div class="seg seg-scroll">
        <button type="button" class:on={!tag} onclick={() => (tag = '')}
          >{t('search.all')}</button
        >
        {#each visibleTags as tg (tg)}
          <button type="button" class:on={tag === tg} onclick={() => (tag = tg)}
            >{tg}</button
          >
        {/each}
      </div>
      {#if hiddenTagCount && !showAllTags}
        <button
          type="button"
          class="search-tags-more"
          onclick={() => (showAllTags = true)}
        >
          {t('search.moreTags', { count: hiddenTagCount })}
        </button>
      {/if}
    </div>
  {/if}
  {#if projects.length}
    <div class="search-tags">
      <div class="seg seg-scroll">
        <button type="button" class:on={!projectId} onclick={() => (projectId = '')}
          >{t('projects.all')}</button
        >
        {#each projects as project (project.id)}
          <button
            type="button"
            class:on={projectId === project.id}
            onclick={() => (projectId = project.id)}
            >{project.title}</button
          >
        {/each}
      </div>
    </div>
  {/if}
  {#if tasks.length}
    <TaskGroup
      title={t('search.title')}
      {tasks}
      hideHeader
      onToggle={completeTask}
      onEdit={editTask}
    />
  {:else}
    {@const empty = searchEmptyState({ query, tag, projectId })}
    <EmptyState
      message={t(empty.messageKey, empty.params)}
      hint={empty.hintKey ? t(empty.hintKey) : ''}
    />
  {/if}
  {/snippet}
</PageShell>
