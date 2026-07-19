<script>
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { startNewChat, setDraft, activeConversation } from '$lib/chat.svelte.js'

  let { open = $bindable(false) } = $props()

  let draft = $state('')
  let textareaEl = $state(/** @type {HTMLTextAreaElement | null} */ (null))

  $effect(() => {
    if (open) {
      queueMicrotask(() => textareaEl?.focus())
    }
  })

  function close() {
    open = false
  }

  function openInbox() {
    close()
    void goto('/inbox#capture')
  }

  function sendToAssistant() {
    const text = draft.trim()
    close()
    startNewChat()
    const conversation = activeConversation()
    if (text && conversation?.id) setDraft(conversation.id, text)
    draft = ''
    void goto('/assistant')
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }
</script>

{#if open}
  <div class="capture-scrim" role="presentation" onclick={close}></div>
  <div
    class="capture-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="capture-quick-title"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <header class="capture-head">
      <h2 id="capture-quick-title">{t('nav.capture')}</h2>
      <button type="button" class="icon-btn" aria-label={t('chat.cancel')} onclick={close}>
        <Icon name="x" size={18} strokeWidth={1.75} />
      </button>
    </header>
    <p class="capture-intro">{t('nav.captureIntro')}</p>
    <textarea
      bind:this={textareaEl}
      bind:value={draft}
      rows="4"
      placeholder={t('nav.capturePlaceholder')}
      aria-label={t('nav.capture')}
    ></textarea>
    <div class="capture-actions">
      <button type="button" class="secondary" onclick={openInbox}>{t('nav.captureToInbox')}</button>
      <button type="button" class="primary" onclick={sendToAssistant}>{t('nav.captureToAssistant')}</button>
    </div>
  </div>
{/if}

<style>
  .capture-scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: color-mix(in srgb, #000 35%, transparent);
  }
  .capture-sheet {
    position: fixed;
    z-index: 81;
    left: 50%;
    top: min(18vh, 140px);
    transform: translateX(-50%);
    width: min(100% - 32px, 440px);
    display: grid;
    gap: 12px;
    padding: 18px;
    border-radius: 16px;
    background: var(--bg, #fff);
    color: var(--t1);
    box-shadow: 0 24px 64px color-mix(in srgb, #000 28%, transparent);
  }
  .capture-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 650;
  }
  .capture-intro {
    margin: 0;
    color: var(--t3);
    font-size: var(--text-sm);
    line-height: 1.45;
  }
  textarea {
    width: 100%;
    resize: vertical;
    min-height: 96px;
    padding: 10px 12px;
    border: 1px solid var(--border-l);
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .capture-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .capture-actions button {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--border-l);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .capture-actions .primary {
    border-color: transparent;
    background: var(--t1);
    color: var(--bg, #fff);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
</style>
