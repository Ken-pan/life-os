<script>
  // 知识库：SearchField 实时检索 + 标签 filter chips + 列表 + 编辑 sheet。
  import { SearchField } from '@life-os/platform-web/svelte/form'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S, allTags, allFolders, searchItems } from '$lib/state.svelte.js'
  import ItemList from '$lib/components/ItemList.svelte'
  import ItemViewer from '$lib/components/ItemViewer.svelte'
  import { t } from '$lib/i18n/index.js'

  let query = $state('')
  let activeTags = $state(new Set())
  let activeFolder = $state('')
  let showAllTags = $state(false)
  let reading = $state(null)

  const TAG_CAP = 24
  const folders = $derived(allFolders())
  // 标签随当前文件夹收窄成上下文标签（Obsidian 式），未选文件夹则全库；再按上限折叠。
  const contextItems = $derived(
    activeFolder
      ? S.items.filter((i) => i.id.startsWith(activeFolder + '/'))
      : S.items,
  )
  const tags = $derived(allTags(contextItems))
  const visibleTags = $derived(showAllTags ? tags : tags.slice(0, TAG_CAP))
  const results = $derived.by(() => {
    // 触达响应式依赖：items 任意变化都重算
    S.items.length
    let matched = searchItems(query, activeTags)
    if (activeFolder) matched = matched.filter((i) => i.id.startsWith(activeFolder + '/'))
    return [...matched].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    )
  })

  /** 文件夹标签去数字前缀更好读：「030_Frameworks」→「Frameworks」。 */
  const folderLabel = (path) => path.replace(/^\d+[_-]?/, '')

  function toggleTag(tag) {
    const next = new Set(activeTags)
    if (next.has(tag)) next.delete(tag)
    else next.add(tag)
    activeTags = next
  }
</script>

<div class="wrap">
  <div class="library-tools">
    <SearchField
      value={query}
      onChange={(v) => (query = v)}
      placeholder={t('library.searchPlaceholder')}
      clearLabel={t('library.clearSearch')}
    />
    {#if folders.length > 0}
      <div class="chip-row" role="group" aria-label={t('library.folderAria')}>
        <button
          type="button"
          class="chip"
          aria-pressed={activeFolder === ''}
          onclick={() => (activeFolder = '')}
        >
          {t('library.allFolders')}
        </button>
        {#each folders as folder (folder.path)}
          <button
            type="button"
            class="chip"
            aria-pressed={activeFolder === folder.path}
            onclick={() => (activeFolder = activeFolder === folder.path ? '' : folder.path)}
          >
            {folderLabel(folder.path)} · {folder.count}
          </button>
        {/each}
      </div>
    {/if}
    {#if tags.length > 0}
      <div class="chip-row" role="group" aria-label={t('library.filterAria')}>
        {#each visibleTags as tag (tag)}
          <button
            type="button"
            class="chip"
            aria-pressed={activeTags.has(tag)}
            onclick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        {/each}
        {#if tags.length > TAG_CAP}
          <button
            type="button"
            class="chip tags-toggle"
            onclick={() => (showAllTags = !showAllTags)}
          >
            {showAllTags ? t('library.tagsLess') : `+${tags.length - TAG_CAP}`}
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if results.length === 0}
    <div class="settings-block">
      <EmptyState title={t('library.emptyTitle')} description={t('library.emptyDesc')} />
    </div>
  {:else}
    <ItemList items={results} onOpen={(item) => (reading = item)} />
  {/if}
</div>

<ItemViewer bind:open={reading} />

<style>
  .library-tools {
    display: grid;
    gap: var(--space-2-5);
    margin-block: var(--space-4, 16px);
  }
  .wrap :global(.list) {
    margin-bottom: var(--space-5, 20px);
  }
  .tags-toggle {
    font-family: var(--mono);
    color: var(--t3, var(--text-muted));
  }
</style>
