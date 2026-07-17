<script>
  // 时间线：按天分组，theme .timeline 原语；节点色区分类型。
  // 「笔记」模块——纯浏览/编年，不放图表（数据洞察集中在「记忆库·概览」，见 /overview）。
  import { goto } from '$app/navigation'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S } from '$lib/state.svelte.js'
  import { plainExcerpt } from '$lib/editor/blocks.js'
  import { t } from '$lib/i18n/index.js'

  /** 统一：打开笔记 = 跳到工作台并选中。 */
  const openNote = (item) => item && goto(`/library?note=${encodeURIComponent(item.id)}`)

  const TYPE_CLASS = {
    note: '',
    link: 'timeline__item--success',
    clip: 'timeline__item--warn',
  }

  function dayKey(ts) {
    return new Date(ts).toDateString()
  }

  function dayLabel(key) {
    const d = new Date(key)
    const today = new Date()
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    if (d.toDateString() === today.toDateString()) return t('timeline.today')
    if (d.toDateString() === yesterday.toDateString()) return t('timeline.yesterday')
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function timeOf(ts) {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const groups = $derived.by(() => {
    const byDay = new Map()
    const sorted = [...S.items].sort((a, b) => b.createdAt - a.createdAt)
    for (const item of sorted) {
      const key = dayKey(item.createdAt)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(item)
    }
    return [...byDay.entries()]
  })
</script>

<div class="wrap">
  {#if S.items.length === 0}
    <div class="settings-block timeline-empty">
      <EmptyState title={t('timeline.emptyTitle')} description={t('timeline.emptyDesc')} />
    </div>
  {:else}
    {#each groups as [key, items] (key)}
      <section class="day">
        <div class="divider">{dayLabel(key)}</div>
        <ol class="timeline">
          {#each items as item (item.id)}
            <li class="timeline__item {TYPE_CLASS[item.type]}">
              <span class="timeline__time">{timeOf(item.createdAt)}</span>
              <button type="button" class="timeline-open" onclick={() => openNote(item)}>
                <span class="timeline__title">{item.title}</span>
              </button>
              {#if item.body}
                <span class="timeline__desc">{plainExcerpt(item.body, 120)}</span>
              {/if}
              {#if item.tags.length}
                <span class="chip-row timeline-tags">
                  {#each item.tags as tag (tag)}
                    <span class="chip tag">{tag}</span>
                  {/each}
                </span>
              {/if}
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  {/if}
</div>

<style>
  .day {
    margin-block: var(--space-4, 16px);
  }
  .timeline-empty {
    margin-block: var(--space-4, 16px);
  }
  .timeline-open {
    display: block;
    padding: 0;
    border: none;
    background: none;
    text-align: start;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .timeline-open:hover :global(.timeline__title) {
    color: var(--accent);
  }
  .timeline-open:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-control);
  }
  .timeline-tags {
    margin-top: var(--space-1);
  }
</style>
