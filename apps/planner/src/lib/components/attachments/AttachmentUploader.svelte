<script>
  import { t } from '$lib/i18n/index.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { uploadAttachment, createLinkAttachment } from '$lib/services/attachmentService.js'
  import { toast } from '$lib/ui.svelte.js'

  /** @type {{ ownerType: import('$lib/types.js').AttachmentOwnerType, ownerId: string }} */
  let { ownerType, ownerId } = $props()

  let fileInput = $state(null)
  let isDragging = $state(false)

  async function handleFiles(files) {
    if (!ownerId) {
      toast(t('attachments.error.noOwner', 'Please save first before uploading attachments'), 'error')
      return
    }
    
    for (const file of Array.from(files)) {
      try {
        await uploadAttachment(ownerType, ownerId, file, 'upload')
      } catch (e) {
        toast(e.message, 'error')
      }
    }
  }

  function onFileChange(e) {
    if (e.target.files?.length) {
      handleFiles(e.target.files)
      e.target.value = ''
    }
  }

  function onDragOver(e) {
    e.preventDefault()
    isDragging = true
  }

  function onDragLeave(e) {
    e.preventDefault()
    isDragging = false
  }

  function onDrop(e) {
    e.preventDefault()
    isDragging = false
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files)
    } else if (e.dataTransfer?.getData('text/uri-list')) {
      const url = e.dataTransfer.getData('text/uri-list')
      if (ownerId && url) {
        createLinkAttachment(ownerType, ownerId, url)
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="planner-attachment-uploader" 
  class:dragging={isDragging}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <button class="upload-btn" onclick={() => fileInput?.click()}>
    <Icon name="upload" size="16" />
    <span>{t('attachments.add', 'Add files')}</span>
  </button>
  
  <input 
    type="file" 
    bind:this={fileInput} 
    onchange={onFileChange} 
    multiple 
    style="display: none" 
  />
</div>

<style>
  .planner-attachment-uploader {
    margin-top: 8px;
    transition: all var(--dur-fast) var(--ease-standard);
    border-radius: 8px;
  }
  .planner-attachment-uploader.dragging {
    background: var(--primary-surface);
    outline: 2px dashed var(--primary-color);
    outline-offset: -2px;
  }
  .upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    background: transparent;
    border: 1px dashed var(--border-color);
    color: var(--text-secondary);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--dur-fast);
  }
  .upload-btn:hover {
    background: var(--surface-1);
    color: var(--text-primary);
    border-color: var(--text-tertiary);
  }
  .dragging .upload-btn {
    pointer-events: none;
    opacity: 0.5;
  }
</style>