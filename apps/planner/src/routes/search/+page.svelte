<script>
  import { afterNavigate } from '$app/navigation';
  import AppBar from '$lib/components/AppBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectSearch, selectAllTags } from '$lib/domain/selectors.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';
  import { sortTasks } from '$lib/engine/prioritizer.js';

  const TAGS_VISIBLE = 4;

  let query = $state('');
  let tag = $state('');
  let showAllTags = $state(false);
  /** @type {HTMLInputElement | null} */
  let searchInput = $state(null);

  // 进入搜索页即聚焦输入框，移动端直接弹出键盘。
  // 用 afterNavigate 是因为 SvelteKit 导航完成后会把焦点重置到 body。
  afterNavigate(() => {
    searchInput?.focus();
  });

  const tags = $derived(selectAllTags(taskIndex()));
  const visibleTags = $derived(showAllTags ? tags : tags.slice(0, TAGS_VISIBLE));
  const hiddenTagCount = $derived(Math.max(0, tags.length - TAGS_VISIBLE));
  const tasks = $derived.by(() => {
    let list = selectSearch(taskIndex(), query);
    if (tag) list = list.filter((t) => t.tags.includes(tag));
    return sortTasks(list, 'smart');
  });
</script>

<AppBar title={t('search.title')} historyBack />

<div class="wrap search-field">
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
        <button type="button" class:on={!tag} onclick={() => (tag = '')}>{t('search.all')}</button>
        {#each visibleTags as tg (tg)}
          <button type="button" class:on={tag === tg} onclick={() => (tag = tg)}>{tg}</button>
        {/each}
      </div>
      {#if hiddenTagCount && !showAllTags}
        <button type="button" class="search-tags-more" onclick={() => (showAllTags = true)}>
          {t('search.moreTags', { count: hiddenTagCount })}
        </button>
      {/if}
    </div>
  {/if}
  <TaskGroup title={t('search.title')} {tasks} hideHeader empty={t('common.empty')} onToggle={completeTask} onEdit={editTask} />
</div>
