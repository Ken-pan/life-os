<script>
  // 阅读视图：渲染 markdown + [[wikilink]] 跳转 + 反向链接，取代 Obsidian 阅读态。
  // LifeOsSheet 承载（桌面居中/移动底弹）；「编辑」切到 NoteEditor（块状所见即所得）。
  import { LifeOsSheet } from '@life-os/platform-web/svelte/overlay'
  import { renderMarkdown } from '$lib/markdown.js'
  import { resolveWikilink, backlinksOf, itemById } from '$lib/state.svelte.js'
  import { vaultSearch } from '$lib/knowledgeService.js'
  import { t } from '$lib/i18n/index.js'

  /**
   * @type {{ item: any | null, onClose: () => void, onEdit: (item: any) => void,
   *   onOpen: (item: any) => void }}
   */
  let { item, onClose, onEdit, onOpen } = $props()

  const rendered = $derived(item ? renderMarkdown(item.body) : '')
  const backlinks = $derived(item ? backlinksOf(item) : [])

  // 语义相关笔记（服务端混合检索；用标题+正文头作 query，排除自身与已双链的）。
  // 切条目即中止上一请求，避免快速翻阅时堆积在途 fetch。
  let related = $state([])
  $effect(() => {
    const cur = item
    related = []
    if (!cur) return
    const linked = new Set(
      [...cur.body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) =>
        m[1].split('|')[0].split('#')[0].trim().toLowerCase(),
      ),
    )
    const ctrl = new AbortController()
    vaultSearch(`${cur.title}\n${cur.body.slice(0, 400)}`, { k: 6, signal: ctrl.signal })
      .then((hits) => {
        related = hits
          .map((h) => itemById(h.path))
          .filter((it) => it && it.id !== cur.id && !linked.has(it.title.toLowerCase()))
          .slice(0, 4)
      })
      .catch(() => {}) // 中止 / 服务未起：静默，退回纯双链体验
    return () => ctrl.abort()
  })

  const TYPE_LABEL = {
    note: () => t('library.typeNote'),
    link: () => t('library.typeLink'),
    clip: () => t('library.typeClip'),
  }

  /** 委托 body 内 [[wikilink]] 点击 → resolve → 跳到目标条目（或提示未创建）。 */
  function onBodyClick(e) {
    const a = e.target.closest('a.wikilink')
    if (!a) return
    e.preventDefault()
    const target = a.dataset.wikilink
    const found = resolveWikilink(target)
    if (found) onOpen(found)
    else a.classList.add('wikilink--missing')
  }
</script>

<LifeOsSheet open={Boolean(item)} {onClose} ariaLabel={item?.title} sheetClass="note-reader">
  {#snippet header()}
    {#if item}
      <div class="note-head">
        <span class="badge badge--accent">{TYPE_LABEL[item.type]()}</span>
        <h2 class="note-title">{item.pinned ? '📌 ' : ''}{item.title}</h2>
        {#if item.url}
          <a class="note-url" href={item.url} target="_blank" rel="noopener noreferrer">
            {item.url}
          </a>
        {/if}
        {#if item.tags.length}
          <div class="chip-row">
            {#each item.tags as tag (tag)}
              <span class="chip tag">{tag}</span>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#if item}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="note-body" onclick={onBodyClick}>
      {@html rendered}
    </div>

    {#if backlinks.length}
      <div class="note-backlinks">
        <div class="divider">{t('reader.backlinks')} · {backlinks.length}</div>
        <ul class="list">
          {#each backlinks as bl (bl.id)}
            <li style="display: contents">
              <button type="button" class="list-item" onclick={() => onOpen(bl)}>
                <span class="list-item__body">
                  <span class="list-item__title">{bl.title}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if related.length}
      <div class="note-backlinks">
        <div class="divider">✦ {t('reader.related')} · {related.length}</div>
        <ul class="list">
          {#each related as rel (rel.id)}
            <li style="display: contents">
              <button type="button" class="list-item" onclick={() => onOpen(rel)}>
                <span class="list-item__body">
                  <span class="list-item__title">{rel.title}</span>
                  <span class="list-item__desc">{rel.body.replace(/\s+/g, ' ').slice(0, 80)}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}

  {#snippet actions()}
    {#if item}
      <button type="button" class="btn-secondary" onclick={() => onEdit(item)}>
        {t('reader.edit')}
      </button>
    {/if}
  {/snippet}
</LifeOsSheet>

<style>
  .note-head {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .note-title {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 650;
    color: var(--t1, var(--text));
  }
  .note-url {
    font-size: var(--text-sm);
    color: var(--accent);
    word-break: break-all;
  }
  .note-body {
    font-size: var(--text-md);
    line-height: 1.65;
    color: var(--t1, var(--text));
  }
  .note-body :global(h1),
  .note-body :global(h2),
  .note-body :global(h3),
  .note-body :global(h4) {
    margin: var(--space-4) 0 var(--space-2);
    line-height: 1.3;
    color: var(--t1, var(--text));
  }
  .note-body :global(h1) { font-size: var(--text-xl); }
  .note-body :global(h2) { font-size: var(--text-lg); }
  .note-body :global(h3) { font-size: var(--text-md); font-weight: 650; }
  .note-body :global(p) { margin: var(--space-2) 0; }
  .note-body :global(ul),
  .note-body :global(ol) { margin: var(--space-2) 0; padding-inline-start: var(--space-5); }
  .note-body :global(li) { margin: var(--space-1) 0; }
  .note-body :global(a) { color: var(--accent); }
  .note-body :global(a.wikilink) {
    text-decoration: none;
    background: var(--accent-bg, var(--accent-subtle));
    padding: 0 4px;
    border-radius: var(--radius-control);
    color: color-mix(in srgb, var(--accent) 72%, var(--t1, var(--text)));
  }
  .note-body :global(a.wikilink--missing) {
    background: var(--feedback-danger-bg);
    color: var(--feedback-danger);
  }
  .note-body :global(blockquote) {
    margin: var(--space-3) 0;
    padding: var(--space-1) var(--space-3);
    border-inline-start: 3px solid var(--accent);
    color: var(--t2, var(--text-secondary));
  }
  .note-body :global(pre) {
    margin: var(--space-3) 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--t1, var(--text)) 5%, transparent);
    overflow-x: auto;
    font-size: var(--text-sm);
  }
  .note-body :global(code) {
    font-family: var(--mono);
    font-size: 0.92em;
  }
  .note-body :global(p code),
  .note-body :global(li code) {
    background: color-mix(in srgb, var(--t1, var(--text)) 6%, transparent);
    padding: 1px 4px;
    border-radius: 4px;
  }
  .note-body :global(hr) {
    margin: var(--space-4) 0;
    border: none;
    border-top: 1px solid var(--border);
  }
  .note-body :global(.md-task) {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-1-5);
  }
  .note-body :global(.md-task input) {
    accent-color: var(--accent);
  }
  .note-body :global(.md-table-wrap) {
    overflow-x: auto;
    margin: var(--space-3) 0;
  }
  .note-body :global(.md-table) {
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  .note-body :global(.md-table th),
  .note-body :global(.md-table td) {
    padding: var(--space-1-5) var(--space-2-5);
    border: 1px solid var(--border);
    text-align: start;
  }
  .note-body :global(.md-table th) {
    background: color-mix(in srgb, var(--t1, var(--text)) 4%, transparent);
    font-weight: 600;
  }
  .note-backlinks {
    margin-top: var(--space-4);
  }
</style>
