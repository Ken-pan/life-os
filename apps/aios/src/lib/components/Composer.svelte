<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { C, sendMessage, stopStreaming } from '$lib/chat.svelte.js'
  import { transcribe } from '$lib/localai.js'

  /** @type {{ autofocus?: boolean }} */
  let { autofocus = false } = $props()

  let text = $state('')
  let images = $state([])
  let textarea = $state(null)
  let fileInput = $state(null)
  let recording = $state(false)
  let transcribing = $state(false)
  let recorder = null

  const canSend = $derived((text.trim().length > 0 || images.length > 0) && !C.streaming)

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
    if (!text.trim() && !images.length) return
    const value = text
    const attached = images
    text = ''
    images = []
    requestAnimationFrame(autogrow)
    await sendMessage(value, attached)
  }

  function onKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  /* —— 图片附件:降采样到长边 1568,JPEG 压缩,dataURL —— */
  async function addImageFile(file) {
    if (!file.type.startsWith('image/') || images.length >= 4) return
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    images = [...images, canvas.toDataURL('image/jpeg', 0.88)]
  }

  async function onFilesPicked(event) {
    for (const file of event.target.files ?? []) await addImageFile(file)
    event.target.value = ''
  }

  async function onPaste(event) {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter(Boolean)
    if (files.length) {
      event.preventDefault()
      for (const file of files) await addImageFile(file)
    }
  }

  function removeImage(index) {
    images = images.filter((_, i) => i !== index)
  }

  /* —— 语音输入:MediaRecorder → 本地 Qwen3-ASR 转写 —— */
  async function toggleRecording() {
    if (recording) {
      recorder?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks = []
      recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        recording = false
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        recorder = null
        if (blob.size < 1000) return
        transcribing = true
        try {
          const result = await transcribe(blob)
          if (result) {
            text = text ? `${text} ${result}` : result
            requestAnimationFrame(autogrow)
            textarea?.focus()
          }
        } catch {
          /* 转写失败静默,不打断输入 */
        } finally {
          transcribing = false
        }
      }
      recorder.start()
      recording = true
    } catch {
      recording = false
    }
  }

  $effect(() => {
    if (autofocus) textarea?.focus()
  })
</script>

<div class="composer" class:recording>
  {#if images.length}
    <div class="attachments">
      {#each images as src, i (i)}
        <div class="thumb">
          <img {src} alt={t('chat.attachedImage')} />
          <button
            type="button"
            class="thumb-x"
            aria-label={t('chat.removeImage')}
            onclick={() => removeImage(i)}
          >
            <Icon name="x" size={12} strokeWidth={2.5} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="row">
    <button
      type="button"
      class="aux-btn"
      title={t('chat.attachImage')}
      aria-label={t('chat.attachImage')}
      onclick={() => fileInput?.click()}
    >
      <Icon name="paperclip" size={18} strokeWidth={1.9} />
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      multiple
      hidden
      onchange={onFilesPicked}
    />

    <textarea
      bind:this={textarea}
      bind:value={text}
      rows="1"
      placeholder={recording
        ? t('chat.listening')
        : transcribing
          ? t('chat.transcribing')
          : t('chat.placeholder')}
      aria-label={t('chat.placeholder')}
      oninput={autogrow}
      onkeydown={onKeydown}
      onpaste={onPaste}
    ></textarea>

    <button
      type="button"
      class="aux-btn mic"
      class:active={recording}
      title={recording ? t('chat.stopRecording') : t('chat.voiceInput')}
      aria-label={recording ? t('chat.stopRecording') : t('chat.voiceInput')}
      aria-pressed={recording}
      disabled={transcribing}
      onclick={toggleRecording}
    >
      <Icon name="mic" size={18} strokeWidth={1.9} />
    </button>

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
</div>

<style>
  .composer {
    display: grid;
    gap: 8px;
    width: 100%;
    padding: 10px;
    background: var(--bg);
    border: 1px solid var(--border-l);
    border-radius: 28px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
    transition: border-color var(--dur-fast, 120ms) var(--ease, ease);
  }
  .composer:focus-within {
    border-color: var(--t3);
  }
  .composer.recording {
    border-color: var(--t1);
  }

  .row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }

  .attachments {
    display: flex;
    gap: 8px;
    padding: 2px 4px 0;
    flex-wrap: wrap;
  }
  .thumb {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb-x {
    position: absolute;
    top: 3px;
    right: 3px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    cursor: pointer;
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
    padding: 8px 2px;
  }
  textarea::placeholder {
    color: var(--t3);
  }

  .aux-btn {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }
  .aux-btn:hover {
    background: var(--card);
    color: var(--t1);
  }
  .aux-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .aux-btn.mic.active {
    background: var(--accent);
    color: var(--on-accent);
    animation: mic-pulse 1.2s ease-in-out infinite;
  }
  @keyframes mic-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
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
