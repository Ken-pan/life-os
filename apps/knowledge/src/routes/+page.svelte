<script>
  // 收集箱：快速收集 + 文件导入 + 概览 stat + 最近条目。
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S, captureText, captureFile, allTags } from '$lib/state.svelte.js'
  import ItemList from '$lib/components/ItemList.svelte'
  import ItemViewer from '$lib/components/ItemViewer.svelte'
  import { t } from '$lib/i18n/index.js'

  let draft = $state('')
  let dragOver = $state(false)
  let fileInput = $state(null)
  let importedCount = $state(0)
  let reading = $state(null)

  const weekAgo = () => Date.now() - 7 * 24 * 3600 * 1000
  const weekCount = $derived(S.items.filter((i) => i.createdAt > weekAgo()).length)
  const tagCount = $derived(allTags().length)
  const recent = $derived(S.items.slice(0, 10))

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
  <div class="life-os-grid life-os-grid--kpi inbox-stats">
    <div class="settings-block stat stat--compact">
      <span class="stat__label">{t('inbox.statTotal')}</span>
      <span class="stat__value">{S.items.length}</span>
    </div>
    <div class="settings-block stat stat--compact">
      <span class="stat__label">{t('inbox.statWeek')}</span>
      <span class="stat__value">{weekCount}</span>
    </div>
    <div class="settings-block stat stat--compact">
      <span class="stat__label">{t('inbox.statTags')}</span>
      <span class="stat__value">{tagCount}</span>
    </div>
  </div>

  <section class="card">
    <div class="field" style="margin-bottom: 0">
      <label for="capture-input">{t('inbox.captureLabel')}</label>
      <textarea
        id="capture-input"
        rows="3"
        placeholder={t('inbox.placeholder')}
        bind:value={draft}
        onkeydown={onKeydown}
      ></textarea>
    </div>
    <div class="capture-actions">
      <span class="capture-hint">
        <span class="kbd">⌘</span><span class="kbd">↵</span>
        {t('inbox.captureHint')}
      </span>
      <button type="button" class="btn-primary" onclick={submit} disabled={!draft.trim()}>
        {t('inbox.captureButton')}
      </button>
    </div>

    <div class="divider">{t('inbox.importLabel').split('，')[0]}</div>

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

  <section class="recent">
    <h2 class="section-title">{t('inbox.recent')}</h2>
    {#if recent.length === 0}
      <div class="settings-block">
        <EmptyState title={t('inbox.emptyTitle')} description={t('inbox.emptyDesc')} />
      </div>
    {:else}
      <ItemList items={recent} onOpen={(item) => (reading = item)} />
    {/if}
  </section>
</div>

<ItemViewer bind:open={reading} />

<style>
  .inbox-stats {
    margin-block: var(--space-4, 16px);
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-5, 20px);
    margin-block: var(--space-4, 16px);
    display: grid;
    gap: var(--space-3, 12px);
  }
  .capture-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .capture-hint {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--t3, var(--text-muted));
  }
  .section-title {
    margin: 0 0 var(--space-2-5);
    font-size: var(--text-lg);
  }
  .recent {
    margin-block: var(--space-5, 20px);
  }
</style>
