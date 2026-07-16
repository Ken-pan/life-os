<script>
  // 条目列表：theme .list 原语；点击行 → 编辑。
  import { t } from '$lib/i18n/index.js'

  /** @type {{ items: any[], onOpen: (item: any) => void }} */
  let { items, onOpen } = $props()

  const TYPE_LABEL = {
    note: () => t('library.typeNote'),
    link: () => t('library.typeLink'),
    clip: () => t('library.typeClip'),
  }

  function excerpt(item) {
    const src = item.body || item.url
    return src.replace(/\s+/g, ' ').slice(0, 90)
  }

  function timeLabel(ts) {
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay)
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
  }
</script>

<ul class="list">
  {#each items as item (item.id)}
    <li style="display: contents">
      <button type="button" class="list-item" onclick={() => onOpen(item)}>
        <span class="list-item__leading">
          {#if item.type === 'link'}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
          {:else if item.type === 'clip'}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /></svg>
          {:else}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          {/if}
        </span>
        <span class="list-item__body">
          <span class="list-item__title">
            {#if item.pinned}📌 {/if}{item.title || TYPE_LABEL[item.type]()}
          </span>
          {#if excerpt(item)}
            <span class="list-item__desc">{excerpt(item)}</span>
          {/if}
        </span>
        <span class="list-item__trailing">
          {#each item.tags.slice(0, 2) as tag (tag)}
            <span class="chip tag">{tag}</span>
          {/each}
          <span>{timeLabel(item.createdAt)}</span>
        </span>
      </button>
    </li>
  {/each}
</ul>
