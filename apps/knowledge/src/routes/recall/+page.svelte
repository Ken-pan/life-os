<script>
  // 回忆：直连 local-ai 的 vault 检索服务（混合 RAG，服务端做检索/重排/生成）。
  // KnowledgeOS 相对 Obsidian 的核心差异——问自己的整个知识库，带引用溯源。
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { SearchField } from '@life-os/platform-web/svelte/form'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S, itemById } from '$lib/state.svelte.js'
  import { vaultHealth, vaultSearch, vaultAsk } from '$lib/knowledgeService.js'
  import { renderMarkdown } from '$lib/markdown.js'
  import { t } from '$lib/i18n/index.js'

  let query = $state('')
  let health = $state(undefined) // undefined=检测中, null=不可达, obj=就绪
  let answer = $state('')
  let citations = $state([])
  let searchHits = $state([])
  let busy = $state('') // '' | 'ask' | 'search'
  let error = $state('')

  onMount(async () => {
    health = await vaultHealth()
  })

  /** 检索命中 → 跳到工作台并选中该笔记（同一 Vault，path === item.id）。 */
  function openHit(hit) {
    const item = hit.path ? itemById(hit.path) : null
    if (item) goto(`/library?note=${encodeURIComponent(item.id)}`)
  }

  async function ask() {
    const q = query.trim()
    if (!q || busy) return
    busy = 'ask'
    error = ''
    answer = ''
    citations = []
    searchHits = []
    try {
      const res = await vaultAsk(q)
      answer = res.answer ?? ''
      citations = res.citations ?? []
    } catch (e) {
      error = String(e?.message ?? e)
    } finally {
      busy = ''
    }
  }

  async function justSearch() {
    const q = query.trim()
    if (!q || busy) return
    busy = 'search'
    error = ''
    answer = ''
    citations = []
    try {
      searchHits = await vaultSearch(q, { k: 12 })
    } catch (e) {
      error = String(e?.message ?? e)
    } finally {
      busy = ''
    }
  }
</script>

<div class="wrap">
  {#if health === null}
    <div class="settings-block">
      <EmptyState title={t('recall.offlineTitle')} description={t('recall.offlineDesc')} />
    </div>
  {:else}
    {#if health && typeof health === 'object'}
      <div class="index-status">
        <span class="badge badge--success">{t('recall.serviceOn')}</span>
        <span class="index-sub">
          {health.chunks?.toLocaleString?.() ?? health.chunks}
          {t('recall.chunks')} · {health.files ?? '—'}
          {t('recall.files')}{health.indexing ? ` · ${t('recall.indexing')}` : ''}
        </span>
      </div>
    {/if}

    <div class="ask-box">
      <SearchField
        value={query}
        onChange={(v) => (query = v)}
        placeholder={t('recall.placeholder')}
        clearLabel={t('common.cancel')}
      />
      <button type="button" class="btn-secondary" onclick={justSearch} disabled={Boolean(busy) || !query.trim()}>
        {busy === 'search' ? '…' : t('recall.searchOnly')}
      </button>
      <button type="button" class="btn-primary" onclick={ask} disabled={Boolean(busy) || !query.trim()}>
        {busy === 'ask' ? t('recall.thinking') : t('recall.ask')}
      </button>
    </div>

    {#if error}
      <p class="field-error" role="alert">{error}</p>
    {/if}

    {#if answer}
      <section class="card answer-card">
        <div class="answer-body">{@html renderMarkdown(answer)}</div>
      </section>
    {/if}

    {#if citations.length > 0}
      <div class="divider">{t('recall.sources')}</div>
      <ul class="list">
        {#each citations as c (c.n)}
          <li style="display: contents">
            <button type="button" class="list-item" onclick={() => openHit(c)}>
              <span class="list-item__leading"><span class="src-num">{c.n}</span></span>
              <span class="list-item__body">
                <span class="list-item__title">{c.title}</span>
                {#if c.breadcrumb}<span class="list-item__desc">{c.breadcrumb}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if searchHits.length > 0}
      <div class="divider">{t('recall.matches')} · {searchHits.length}</div>
      <ul class="list">
        {#each searchHits as hit, i (hit.path + i)}
          <li style="display: contents">
            <button type="button" class="list-item" onclick={() => openHit(hit)}>
              <span class="list-item__body">
                <span class="list-item__title">{hit.title}</span>
                <span class="list-item__desc">{hit.snippet?.replace(/\s+/g, ' ').slice(0, 100)}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if !answer && citations.length === 0 && searchHits.length === 0 && !busy}
      <div class="settings-block hint-block">
        <EmptyState title={t('recall.hintTitle')} description={t('recall.hintDesc')} />
      </div>
    {/if}
  {/if}
</div>

<style>
  .index-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block: var(--space-4, 16px) var(--space-2);
  }
  .index-sub {
    font-size: var(--text-sm);
    color: var(--t3, var(--text-muted));
    font-variant-numeric: tabular-nums;
  }
  .ask-box {
    display: flex;
    gap: var(--space-2);
    align-items: start;
    margin-block: var(--space-2, 8px) var(--space-3);
  }
  .ask-box :global(.field) {
    flex: 1;
    margin-bottom: 0;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-4, 16px);
    margin-block: var(--space-3, 12px);
  }
  .answer-card {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .answer-body {
    font-size: var(--text-md);
    line-height: 1.65;
    color: var(--t1, var(--text));
  }
  .answer-body :global(p) { margin: var(--space-2) 0; }
  .answer-body :global(strong) { color: var(--accent); }
  .answer-body :global(.md-img) {
    max-width: 100%; height: auto;
    border-radius: var(--radius-control, 8px); border: 1px solid var(--border);
  }
  .src-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-pill);
    background: var(--accent-bg, var(--accent-subtle));
    color: color-mix(in srgb, var(--accent) 72%, var(--t1, var(--text)));
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .hint-block {
    margin-top: var(--space-4);
  }
</style>
