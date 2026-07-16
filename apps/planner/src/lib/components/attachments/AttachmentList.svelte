<script>
  import { S } from '$lib/state.svelte.js'
  import { t } from '$lib/i18n/index.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { deleteAttachment, retryAttachmentUpload, getAttachmentUrl } from '$lib/services/attachmentService.js'

  /** @type {{ ownerType: import('$lib/types.js').AttachmentOwnerType, ownerId: string }} */
  let { ownerType, ownerId } = $props()

  const attachments = $derived(
    S.attachments.filter(a => a.ownerType === ownerType && a.ownerId === ownerId && !a.deletedAt)
  )

  let selectedImageUrl = $state(null)
  
  async function handleImageClick(att) {
    if (att.status !== 'ready') return
    const url = await getAttachmentUrl(att)
    if (url) selectedImageUrl = url
  }

  function formatSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }
</script>

{#if attachments.length > 0}
  <div class="planner-attachments-list">
    <div class="heading">{t('attachments.title', 'Attachments')}</div>
    <div class="grid">
      {#each attachments as att}
        <div class="attachment-item">
          <!-- Preview/Icon -->
          <button class="preview" onclick={() => att.kind === 'image' && handleImageClick(att)}>
            {#if att.kind === 'image'}
              <Icon name="image" size="24" />
            {:else if att.kind === 'link'}
              <Icon name="link" size="24" />
            {:else}
              <Icon name="file" size="24" />
            {/if}
            
            {#if att.status === 'uploading'}
              <div class="status-overlay">
                <Icon name="loader" class="life-os-spin" />
              </div>
            {:else if att.status === 'failed'}
              <div class="status-overlay error" title={att.errorCode}>
                <Icon name="alert-triangle" />
              </div>
            {/if}
          </button>
          
          <!-- Metadata -->
          <div class="meta">
            <div class="name" title={att.name}>{att.name}</div>
            <div class="size">
              {#if att.status === 'failed'}
                <span class="error-text">{t('attachments.failed', 'Failed')}</span>
              {:else if att.status === 'uploading'}
                <span>{t('attachments.uploading', 'Uploading...')}</span>
              {:else}
                {formatSize(att.sizeBytes)}
              {/if}
            </div>
          </div>
          
          <!-- Actions -->
          <div class="actions">
            {#if att.status === 'failed'}
              <button class="icon-btn" onclick={() => retryAttachmentUpload(att.id)} title={t('attachments.retry', 'Retry')}>
                <Icon name="refresh-cw" size="16" />
              </button>
            {/if}
            {#if att.status === 'ready'}
              <button class="icon-btn" onclick={async () => {
                const url = await getAttachmentUrl(att);
                if (url) window.open(url, '_blank');
              }} title={t('attachments.open', 'Open')}>
                <Icon name="external-link" size="16" />
              </button>
            {/if}
            <button class="icon-btn danger" onclick={() => deleteAttachment(att.id)} title={t('attachments.delete', 'Delete')}>
              <Icon name="trash-2" size="16" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if selectedImageUrl}
  <div class="lightbox" role="dialog" aria-modal="true" onclick={() => selectedImageUrl = null}>
    <button class="close-btn" onclick={() => selectedImageUrl = null} aria-label={t('common.close', 'Close')}>
      <Icon name="x" size="24" />
    </button>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <img src={selectedImageUrl} alt="Preview" onclick={(e) => e.stopPropagation()} />
  </div>
{/if}

<style>
  .planner-attachments-list {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }
  .heading {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .grid {
    display: grid;
    gap: 8px;
  }
  .attachment-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }
  .preview {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: var(--surface-1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
  }
  .preview:hover {
    background: var(--surface-3);
  }
  .status-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.5);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  .status-overlay.error {
    background: rgba(var(--danger-rgb), 0.8);
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .size {
    font-size: 12px;
    color: var(--text-tertiary);
  }
  .error-text {
    color: var(--danger-color);
  }
  .actions {
    display: flex;
    gap: 4px;
  }
  .icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover {
    background: var(--surface-1);
    color: var(--text-primary);
  }
  .icon-btn.danger:hover {
    background: var(--danger-surface);
    color: var(--danger-color);
  }
  
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0,0,0,0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .lightbox img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .close-btn:hover {
    background: rgba(255,255,255,0.2);
  }
  /* 加载自旋走 @life-os/theme 的 .life-os-spin */
</style>