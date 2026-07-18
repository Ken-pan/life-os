<script>
  // 关联上下文：反向链接 + 语义相关；可折叠，空态也提示（把双链体验抬到核心）。
  import { backlinksOf, itemById } from '$lib/state.svelte.js'
  import { isProjectItem } from '$lib/projects.js'
  import { vaultSearch } from '$lib/knowledgeService.js'
  import { plainExcerpt } from '$lib/editor/blocks.js'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ item: any | null, onOpen: (item: any) => void, defaultOpen?: boolean }} */
  let { item, onOpen, defaultOpen = true } = $props()

  let open = $state(true)
  $effect(() => {
    item?.id
    open = defaultOpen
  })

  const backlinks = $derived(item ? backlinksOf(item) : [])
  const isProject = $derived(item ? isProjectItem(item) : false)

  let related = $state([])
  const total = $derived(backlinks.length + related.length + (isProject ? 1 : 0))

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
      .catch(() => {})
    return () => ctrl.abort()
  })
</script>

<div class="nc" class:is-open={open}>
  <button
    type="button"
    class="nc-toggle"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="nc-toggle__label">
      {t('reader.context')}
      {#if total > 0}<span class="nc-toggle__count">{total}</span>{/if}
    </span>
    <span class="nc-toggle__hint">{open ? t('reader.contextClose') : t('reader.contextOpen')}</span>
  </button>

  {#if open}
    <div class="nc-body">
      {#if isProject}
        <div class="nc-group">
          <div class="nc-divider">{t('reader.projectNote')}</div>
          <p class="nc-empty">{t('projects.nextHint')}</p>
        </div>
      {/if}

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
          <div class="nc-divider">{t('reader.related')} · {related.length}</div>
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

      {#if !backlinks.length && !related.length && !isProject}
        <p class="nc-empty">{t('reader.contextEmpty')}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .nc {
    display: grid;
    gap: var(--space-3, 12px);
    margin-top: var(--space-5, 20px);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
  }
  .nc-toggle {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
  }
  .nc-toggle:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: 6px;
  }
  .nc-toggle__label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--kn-list-title, 14px);
    font-weight: 650;
    color: var(--t1);
  }
  .nc-toggle__count {
    font-size: var(--kn-meta, 12px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    background: var(--accent-bg);
    padding: 2px 8px;
    border-radius: var(--radius-pill, 999px);
  }
  .nc-toggle__hint {
    font-size: var(--kn-meta, 12px);
    color: var(--t3);
  }
  .nc-body {
    display: grid;
    gap: var(--space-4, 16px);
    padding-top: var(--space-2, 8px);
    border-top: 1px solid var(--border);
  }
  .nc-divider {
    font-size: var(--kn-meta, 12px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--t2, var(--text-secondary));
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
    background: color-mix(in srgb, var(--t1, var(--text)) 3%, transparent);
    color: var(--t1, var(--text));
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease);
  }
  .nc-item:hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .nc-item__title {
    font-size: var(--kn-list-title, 14px);
    font-weight: 550;
  }
  .nc-item__desc {
    font-size: var(--kn-list-excerpt, 13px);
    color: var(--t3, var(--text-muted));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nc-empty {
    margin: 0;
    font-size: var(--kn-list-excerpt, 13px);
    color: var(--t3);
    line-height: 1.5;
  }
</style>
