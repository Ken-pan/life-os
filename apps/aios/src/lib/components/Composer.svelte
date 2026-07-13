<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { C, sendMessage, stopStreaming } from '$lib/chat.svelte.js'

  /** @type {{ autofocus?: boolean }} */
  let { autofocus = false } = $props()

  let text = $state('')
  let textarea = $state(null)

  const canSend = $derived(text.trim().length > 0 && !C.streaming)

  function autogrow() {
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }

  async function submit() {
    if (C.streaming) {
      stopStreaming()
      return
    }
    if (!text.trim()) return
    const value = text
    text = ''
    requestAnimationFrame(autogrow)
    await sendMessage(value)
  }

  function onKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  $effect(() => {
    if (autofocus) textarea?.focus()
  })
</script>

<div class="composer">
  <textarea
    bind:this={textarea}
    bind:value={text}
    rows="1"
    placeholder={t('chat.placeholder')}
    aria-label={t('chat.placeholder')}
    oninput={autogrow}
    onkeydown={onKeydown}
  ></textarea>
  <button
    type="button"
    class="send-btn"
    class:stop={C.streaming}
    disabled={!canSend && !C.streaming}
    title={C.streaming ? t('chat.stop') : t('chat.send')}
    aria-label={C.streaming ? t('chat.stop') : t('chat.send')}
    onclick={submit}
  >
    {#if C.streaming}
      <Icon name="stop" size={14} strokeWidth={2.5} />
    {:else}
      <Icon name="arrow-up" size={18} strokeWidth={2.25} />
    {/if}
  </button>
</div>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2, 8px);
    width: 100%;
    padding: 10px 10px 10px 18px;
    background: var(--bg);
    border: 1px solid var(--border-l);
    border-radius: 28px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
    transition: border-color var(--dur-fast, 120ms) var(--ease, ease);
  }
  .composer:focus-within {
    border-color: var(--t3);
  }

  textarea {
    flex: 1;
    min-width: 0;
    max-height: 200px;
    border: none;
    background: transparent;
    resize: none;
    outline: none;
    color: var(--t1);
    font: inherit;
    font-size: var(--text-base, 15px);
    line-height: 1.5;
    padding: 6px 0;
  }
  textarea::placeholder {
    color: var(--t3);
  }

  .send-btn {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    cursor: pointer;
    transition:
      opacity var(--dur-fast, 120ms) var(--ease, ease),
      transform var(--dur-fast, 120ms) var(--ease, ease);
  }
  .send-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .send-btn:not(:disabled):active {
    transform: scale(0.92);
  }
</style>
