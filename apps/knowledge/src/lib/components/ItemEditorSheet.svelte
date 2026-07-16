<script>
  // 条目编辑：LifeOsSheet（共享弹层行为）+ 共享表单字段。
  import { LifeOsSheet } from '@life-os/platform-web/svelte/overlay'
  import { TextField, TextareaField } from '@life-os/platform-web/svelte/form'
  import { updateItem, deleteItem, togglePin } from '$lib/state.svelte.js'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ item: any | null, onClose: () => void }} */
  let { item, onClose } = $props()

  let title = $state('')
  let body = $state('')
  let url = $state('')
  let tagsRaw = $state('')
  let confirmDelete = $state(false)

  $effect(() => {
    if (item) {
      title = item.title
      body = item.body
      url = item.url
      tagsRaw = item.tags.join(', ')
      confirmDelete = false
    }
  })

  function commit() {
    if (!item) return
    updateItem(item.id, {
      title: title.trim() || t('library.typeNote'),
      body,
      url: url.trim(),
      tags: tagsRaw
        .split(/[,，]/)
        .map((s) => s.trim().replace(/^#/, ''))
        .filter(Boolean),
    })
    onClose()
  }

  function remove() {
    if (!confirmDelete) {
      confirmDelete = true
      return
    }
    deleteItem(item.id)
    onClose()
  }
</script>

<LifeOsSheet open={Boolean(item)} title={t('library.editorTitle')} {onClose}>
  {#if item}
    <TextField
      label={t('library.fieldTitle')}
      value={title}
      onChange={(v) => (title = v)}
    />
    {#if item.type === 'link'}
      <TextField
        label={t('library.fieldUrl')}
        value={url}
        onChange={(v) => (url = v)}
        type="url"
      />
    {/if}
    <TextareaField
      label={t('library.fieldBody')}
      value={body}
      onChange={(v) => (body = v)}
      rows={6}
    />
    <TextField
      label={t('library.fieldTags')}
      value={tagsRaw}
      onChange={(v) => (tagsRaw = v)}
      placeholder="design, paper, …"
    />
  {/if}

  {#snippet actions()}
    <button type="button" class="btn-danger" onclick={remove}>
      {confirmDelete ? t('library.deleteConfirm') : t('common.delete')}
    </button>
    <button
      type="button"
      class="btn-secondary"
      onclick={() => {
        togglePin(item.id)
      }}
    >
      {item?.pinned ? t('common.unpin') : t('common.pin')}
    </button>
    <button type="button" class="btn-primary" onclick={commit}>
      {t('common.save')}
    </button>
  {/snippet}
</LifeOsSheet>
