<script>
  // 知识库：SearchField 实时检索 + 标签 filter chips + 列表 + 编辑 sheet。
  import { SearchField } from '@life-os/platform-web/svelte/form'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S, allTags, searchItems } from '$lib/state.svelte.js'
  import ItemList from '$lib/components/ItemList.svelte'
  import ItemEditorSheet from '$lib/components/ItemEditorSheet.svelte'
  import { t } from '$lib/i18n/index.js'

  let query = $state('')
  let activeTags = $state(new Set())
  let editing = $state(null)

  const tags = $derived(allTags())
  const results = $derived.by(() => {
    // 触达响应式依赖：items 任意变化都重算
    S.items.length
    const matched = searchItems(query, activeTags)
    return [...matched].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    )
  })

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
    {#if tags.length > 0}
      <div class="chip-row" role="group" aria-label={t('library.filterAria')}>
        {#each tags as tag (tag)}
          <button
            type="button"
            class="chip"
            aria-pressed={activeTags.has(tag)}
            onclick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if results.length === 0}
    <div class="settings-block">
      <EmptyState title={t('library.emptyTitle')} description={t('library.emptyDesc')} />
    </div>
  {:else}
    <ItemList items={results} onOpen={(item) => (editing = item)} />
  {/if}
</div>

<ItemEditorSheet item={editing} onClose={() => (editing = null)} />

<style>
  .library-tools {
    display: grid;
    gap: var(--space-2-5);
    margin-block: var(--space-4, 16px);
  }
  .wrap :global(.list) {
    margin-bottom: var(--space-5, 20px);
  }
</style>
