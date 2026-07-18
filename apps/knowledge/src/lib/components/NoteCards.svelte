<script>
  // 笔记列表：密集行。标题+时间一行、摘要最多两行、最多 2 个中性标签 + overflow。
  // 选中态 = 2px 品牌 rail + 8% 品牌底 + 标题提亮。
  import Pin from '@lucide/svelte/icons/pin'
  import { plainExcerpt } from '$lib/editor/blocks.js'
  import { shortTime } from '$lib/format.js'
  import CategoryChip from '$lib/components/CategoryChip.svelte'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ items: any[], onOpen: (item: any) => void, activeId?: string | null }} */
  let { items, onOpen, activeId = null } = $props()

  const TYPE_LABEL = {
    note: () => t('library.typeNote'),
    link: () => t('library.typeLink'),
    clip: () => t('library.typeClip'),
  }

  function excerpt(item) {
    if (item.body) return plainExcerpt(item.body, 140)
    return item.url || ''
  }
</script>

<ul class="note-list">
  {#each items as item (item.id)}
    <li>
      <button type="button" class="note-row" class:is-active={item.id === activeId} onclick={() => onOpen(item)}>
        <span class="note-row__head">
          {#if item.pinned}<Pin class="note-row__pin" size={12} strokeWidth={2.4} fill="currentColor" />{/if}
          <span class="note-row__title">{item.title || TYPE_LABEL[item.type]()}</span>
          <span class="note-row__time">{shortTime(item.updatedAt || item.createdAt)}</span>
        </span>
        {#if excerpt(item)}
          <span class="note-row__excerpt">{excerpt(item)}</span>
        {/if}
        {#if item.type === 'link' || item.tags.length}
          <span class="note-row__foot">
            {#if item.type === 'link'}<span class="note-row__type">{TYPE_LABEL.link()}</span>{/if}
            {#each item.tags.slice(0, 2) as tag (tag)}
              <CategoryChip {tag} />
            {/each}
            {#if item.tags.length > 2}
              <span class="note-row__more">{t('reader.tagsMore', { count: item.tags.length - 2 })}</span>
            {/if}
          </span>
        {/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  .note-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .note-row {
    display: grid;
    gap: 5px;
    width: 100%;
    text-align: start;
    padding: 12px 14px 13px;
    border: none;
    border-inline-start: 2px solid transparent;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease);
  }
  .note-row:hover {
    background: color-mix(in srgb, var(--t1, var(--text)) 5%, transparent);
  }
  .note-row.is-active {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border-inline-start-color: var(--accent);
    border-inline-start-width: 2px;
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }
  .note-row.is-active .note-row__title {
    color: var(--t1, var(--text));
  }
  .note-row.is-active .note-row__excerpt,
  .note-row.is-active .note-row__time {
    color: var(--t3, var(--text-muted));
  }
  .note-row:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .note-row__head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .note-row :global(.note-row__pin) {
    flex: 0 0 auto;
    align-self: center;
    color: var(--accent);
  }
  .note-row__title {
    flex: 1;
    min-width: 0;
    font-size: var(--kn-list-title, var(--text-base, 14px));
    font-weight: 600;
    color: var(--t1, var(--text));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note-row__time {
    flex: 0 0 auto;
    font-size: var(--kn-meta, var(--text-xs, 12px));
    color: var(--t3, var(--text-muted));
    font-variant-numeric: tabular-nums;
  }
  .note-row__excerpt {
    font-size: var(--kn-list-excerpt, var(--text-sm, 13px));
    line-height: 1.45;
    color: var(--t2, var(--text-secondary));
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .note-row__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    margin-top: 1px;
  }
  .note-row__type {
    font-size: var(--kn-meta, 12px);
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  .note-row__more {
    font-size: var(--kn-meta, 12px);
    color: var(--t3, var(--text-muted));
    font-weight: 500;
  }
</style>
