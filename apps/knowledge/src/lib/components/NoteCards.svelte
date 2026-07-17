<script>
  // 笔记列表：密集行（非大卡片），高频扫描友好。标题+时间一行、单行摘要、彩色分类标签。
  // 选中态 = 左侧 3px 强调线 + 轻背景（不再整圈紫描边）。
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
    if (item.body) return plainExcerpt(item.body, 180)
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
            {#each item.tags.slice(0, 3) as tag (tag)}
              <CategoryChip {tag} />
            {/each}
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
    gap: 2px;
  }
  .note-row {
    display: grid;
    gap: 4px;
    width: 100%;
    text-align: start;
    padding: 10px 12px 11px;
    border: none;
    border-inline-start: 3px solid transparent;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease);
  }
  .note-row:hover {
    background: color-mix(in srgb, var(--t1, var(--text)) 5%, transparent);
  }
  .note-row.is-active {
    /* 饱和度降档：靠左侧强调线标识选中，背景只需极淡一层，让标题/摘要更突出 */
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border-inline-start-color: var(--accent);
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }
  .note-row:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .note-row__head {
    display: flex;
    align-items: baseline;
    gap: 6px;
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
    font-size: var(--text-base, 14px);
    font-weight: 600;
    color: var(--t1, var(--text));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note-row__time {
    flex: 0 0 auto;
    font-size: var(--text-xs, 11px);
    color: var(--t3, var(--text-muted));
    font-variant-numeric: tabular-nums;
  }
  .note-row__excerpt {
    font-size: var(--text-sm, 12px);
    line-height: 1.5;
    /* 摘要对比度提一档（secondary-muted，t2↔t3 之间）：亮屏/日光下扫描更快，但仍不压过标题 */
    color: color-mix(in srgb, var(--t2, var(--text-secondary)) 68%, var(--t3, var(--text-muted)));
    /* 最多两行：笔记多起来后两行摘要能明显提高扫描准确率 */
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
    font-size: var(--text-2xs, 10px);
    font-weight: 600;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
