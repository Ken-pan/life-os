<script>
  // 收集箱：快速输入优先 + 待整理队列；统计下沉为一句摘要。
  import { goto } from '$app/navigation'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S, captureText, captureFile } from '$lib/state.svelte.js'
  import { looksUnprocessed } from '$lib/analytics.js'
  import ItemList from '$lib/components/ItemList.svelte'
  import { t } from '$lib/i18n/index.js'

  let draft = $state('')
  let dragOver = $state(false)
  let fileInput = $state(null)
  let importedCount = $state(0)

  const openNote = (item) => item && goto(`/library?note=${encodeURIComponent(item.id)}`)

  const weekAgo = () => Date.now() - 7 * 24 * 3600 * 1000
  const weekCount = $derived(S.items.filter((i) => i.createdAt > weekAgo()).length)
  const pending = $derived(
    [...S.items]
      .filter((i) => i.createdAt > weekAgo() && looksUnprocessed(i))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 12),
  )
  const recentFallback = $derived(S.items.slice(0, 10))
  const queue = $derived(pending.length ? pending : recentFallback)

  function submit() {
    if (captureText(draft)) draft = ''
  }

  function onKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  async function readFiles(files) {
    let n = 0
    for (const file of files) {
      if (!/\.(md|txt)$/i.test(file.name)) continue
      captureFile(file.name, await file.text())
      n += 1
    }
    importedCount = n
  }

  function onDrop(e) {
    e.preventDefault()
    dragOver = false
    readFiles([...(e.dataTransfer?.files ?? [])])
  }
</script>

<div class="wrap">
  {#if pending.length}
    <p class="inbox-badge-line">
      <span class="inbox-badge">{t('inbox.pendingCount', { count: pending.length })}</span>
    </p>
  {/if}

  <section class="card capture">
    <div class="field" style="margin-bottom: 0">
      <label for="capture-input">{t('inbox.captureLabel')}</label>
      <textarea
        id="capture-input"
        rows="4"
        placeholder={t('inbox.placeholder')}
        bind:value={draft}
        onkeydown={onKeydown}
      ></textarea>
    </div>
    <div class="capture-actions">
      <button
        type="button"
        class="btn-secondary"
        onclick={() => fileInput?.click()}
      >
        {t('inbox.addFile')}
      </button>
      <button type="button" class="btn-primary" onclick={submit} disabled={!draft.trim()}>
        {t('inbox.captureButton')}
      </button>
    </div>
    <p class="capture-hint">
      <span class="kbd">⌘</span><span class="kbd">↵</span>
      {t('inbox.captureHint')}
    </p>
    <p class="auto-hint">{t('inbox.autoHint')}</p>

    <button
      type="button"
      class="dropzone"
      class:dropzone--active={dragOver}
      ondragover={(e) => {
        e.preventDefault()
        dragOver = true
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={onDrop}
      onclick={() => fileInput?.click()}
    >
      <span>{t('inbox.importLabel')}</span>
      <span class="dropzone__hint">{t('inbox.importHint')}</span>
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".md,.txt"
      multiple
      hidden
      onchange={(e) => {
        readFiles([...e.currentTarget.files])
        e.currentTarget.value = ''
      }}
    />
    {#if importedCount > 0}
      <p class="field-hint">
        <span class="badge badge--success">{t('inbox.imported')} {importedCount}</span>
      </p>
    {/if}
  </section>

  <section class="pending">
    <h2 class="section-title">{pending.length ? t('inbox.pending') : t('inbox.recent')}</h2>
    {#if queue.length === 0}
      <div class="settings-block">
        <EmptyState title={t('inbox.emptyTitle')} description={t('inbox.emptyDesc')} />
      </div>
    {:else}
      <ItemList items={queue} onOpen={openNote} />
    {/if}
  </section>

  {#if S.items.length > 0}
    <p class="week-summary">{t('inbox.weekSummary', { week: weekCount, total: S.items.length })}</p>
  {/if}
</div>

<style>
  .wrap {
    display: grid;
    gap: var(--space-4, 16px);
    margin-block: var(--space-4, 16px);
  }
  .inbox-badge-line {
    margin: 0;
  }
  .inbox-badge {
    display: inline-flex;
    font-size: var(--kn-meta, 12px);
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-bg);
    padding: 4px 10px;
    border-radius: var(--radius-pill, 999px);
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-5, 20px);
    display: grid;
    gap: var(--space-3, 12px);
  }
  .capture :global(textarea) {
    font-size: var(--kn-body-size, 15px);
    line-height: var(--kn-body-leading, 1.65);
    min-height: 96px;
  }
  .capture-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
  }
  .capture-hint {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--kn-meta, 12px);
    color: var(--t3, var(--text-muted));
  }
  .auto-hint {
    margin: 0;
    font-size: var(--kn-meta, 12px);
    color: var(--t3, var(--text-muted));
  }
  .week-summary {
    margin: 0;
    font-size: var(--kn-meta, 12px);
    color: var(--t3, var(--text-muted));
    text-align: center;
  }
</style>
