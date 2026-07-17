<script>
  // 笔记连接区：反向链接 + 语义相关笔记（抽自旧 NoteReader）。渲染在内联文档下方；
  // 点击任一条 → onOpen(目标笔记)，由工作台切换选中。
  import { backlinksOf, itemById } from '$lib/state.svelte.js'
  import { vaultSearch } from '$lib/knowledgeService.js'
  import { plainExcerpt } from '$lib/editor/blocks.js'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ item: any | null, onOpen: (item: any) => void }} */
  let { item, onOpen } = $props()

  const backlinks = $derived(item ? backlinksOf(item) : [])

  // 语义相关（服务端混合检索）；切条目即中止上一请求。
  let related = $state([])
  $effect(() => {
    const cur = item
    related = []
    if (!cur) return
    const linked = new Set(
      [...(cur.body || '').matchAll(/\[\[([^\]]+)\]\]/g)].map((m) =>
        m[1].split('|')[0].split('#')[0].trim().toLowerCase(),
      ),
    )
    const ctrl = new AbortController()
    vaultSearch(`${cur.title}\n${(cur.body || '').slice(0, 400)}`, { k: 6, signal: ctrl.signal })
      .then((hits) => {
        related = hits
          .map((h) => itemById(h.path))
          .filter((it) => it && it.id !== cur.id && !linked.has(it.title.toLowerCase()))
          .slice(0, 4)
      })
      .catch(() => {}) // 中止 / 服务未起：静默
    return () => ctrl.abort()
  })
</script>

{#if backlinks.length || related.length}
  <div class="nc">
    {#if backlinks.length}
      <div class="nc-group">
        <div class="nc-divider">{t('reader.backlinks')} · {backlinks.length}</div>
        <ul class="nc-list">
          {#each backlinks as bl (bl.id)}
            <li>
              <button type="button" class="nc-item" onclick={() => onOpen(bl)}>
                <span class="nc-item__title">{bl.title}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if related.length}
      <div class="nc-group">
        <div class="nc-divider">✦ {t('reader.related')} · {related.length}</div>
        <ul class="nc-list">
          {#each related as rel (rel.id)}
            <li>
              <button type="button" class="nc-item" onclick={() => onOpen(rel)}>
                <span class="nc-item__title">{rel.title}</span>
                <span class="nc-item__desc">{plainExcerpt(rel.body, 80)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .nc {
    display: grid;
    gap: var(--space-4, 16px);
    margin-top: var(--space-5, 20px);
    padding-top: var(--space-4, 16px);
    border-top: 1px solid var(--border);
  }
  .nc-divider {
    font-size: var(--text-2xs, 10px);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--t3, var(--text-muted));
    margin-bottom: var(--space-2, 8px);
  }
  .nc-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-1, 4px);
  }
  .nc-item {
    display: grid;
    gap: 2px;
    width: 100%;
    text-align: start;
    padding: var(--space-2, 8px) var(--space-2-5, 10px);
    border: none;
    border-radius: var(--radius-control, 8px);
    background: transparent;
    color: var(--t1, var(--text));
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease);
  }
  .nc-item:hover {
    background: color-mix(in srgb, var(--t1, var(--text)) 6%, transparent);
  }
  .nc-item__title {
    font-size: var(--text-base, 14px);
    font-weight: 550;
  }
  .nc-item__desc {
    font-size: var(--text-sm, 12px);
    color: var(--t3, var(--text-muted));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
