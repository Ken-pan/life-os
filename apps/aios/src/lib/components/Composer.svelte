<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import {
    C,
    sendMessage,
    stopStreaming,
    getDraft,
    setDraft,
    requestEditLastUser,
  } from '$lib/chat.svelte.js'
  import { transcribe, polishTranscript } from '$lib/localai.js'
  import { importFile, IMPORT_ACCEPT } from '$lib/fileImport.js'

  /** @type {{ autofocus?: boolean }} */
  let { autofocus = false } = $props()

  let text = $state(getDraft(C.activeId))
  let images = $state([])
  let files = $state([])
  let importing = $state(0) // 正在解析中的文件数
  let textarea = $state(null)
  let fileInput = $state(null)
  let recording = $state(false)
  let transcribing = $state(false)
  let recorder = null
  let menuOpen = $state(false)
  let menuEl = $state(null)
  let menuBtn = $state(null)
  let dragging = $state(false)
  let dragDepth = 0
  let lastActiveId = C.activeId

  /* —— 「+」能力菜单:让附件/生图/搜索等能力显性可发现(ChatGPT 式) —— */
  const menuItems = $derived([
    { key: 'files', icon: 'paperclip', title: t('chat.menuAttach'), desc: t('chat.menuAttachDesc') },
    { key: 'image', icon: 'image', title: t('chat.menuImage'), desc: t('chat.menuImageDesc'), prefix: t('chat.menuImagePrefix') },
    { key: 'search', icon: 'search', title: t('chat.menuSearch'), desc: t('chat.menuSearchDesc'), prefix: t('chat.menuSearchPrefix') },
    { key: 'notes', icon: 'notebook', title: t('chat.menuNotes'), desc: t('chat.menuNotesDesc'), prefix: t('chat.menuNotesPrefix') },
  ])

  function menuAction(item) {
    menuOpen = false
    if (item.key === 'files') {
      fileInput?.click()
      return
    }
    // 预填模板前缀(输入框已有内容时不覆盖,只聚焦)
    if (item.prefix && !text.trim()) {
      text = item.prefix
      requestAnimationFrame(autogrow)
    }
    textarea?.focus()
  }

  // 点外关闭 + Escape 关闭
  $effect(() => {
    if (!menuOpen) return
    const onDocClick = (e) => {
      if (!menuEl?.contains(e.target) && !menuBtn?.contains(e.target)) menuOpen = false
    }
    const onDocKey = (e) => {
      if (e.key === 'Escape') {
        menuOpen = false
        menuBtn?.focus()
      }
    }
    document.addEventListener('pointerdown', onDocClick, true)
    document.addEventListener('keydown', onDocKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDocClick, true)
      document.removeEventListener('keydown', onDocKey, true)
    }
  })

  const canSend = $derived(
    (text.trim().length > 0 || images.length > 0 || files.length > 0) &&
      !C.streaming &&
      importing === 0,
  )

  function autogrow() {
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }

  function onInput() {
    autogrow()
    setDraft(C.activeId, text) // 每会话草稿留存(内部去抖)
  }

  // 切换会话:把当前正在打的字存回旧会话,载入新会话的草稿
  $effect(() => {
    const id = C.activeId
    if (id === lastActiveId) return
    setDraft(lastActiveId, text)
    text = getDraft(id)
    lastActiveId = id
    requestAnimationFrame(autogrow)
  })

  /* —— 整页拖拽上传:拖文件到页面任意处即可添加(对齐 GPT/Claude)——
     只有一个 Composer 实例在场(空态 hero 或底部 dock),故 document 级监听即"全页" */
  $effect(() => {
    const isFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const onEnter = (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      dragDepth++
      dragging = true
    }
    const onOver = (e) => {
      if (isFileDrag(e)) e.preventDefault() // 必须阻止默认才允许 drop
    }
    const onLeave = (e) => {
      if (!isFileDrag(e)) return
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) dragging = false
    }
    const onDrop = async (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      dragDepth = 0
      dragging = false
      for (const file of e.dataTransfer?.files ?? []) await addAnyFile(file)
      textarea?.focus()
    }
    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragover', onOver)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('drop', onDrop)
    }
  })

  async function submit() {
    if (C.streaming) {
      stopStreaming()
      return
    }
    if (!text.trim() && !images.length && !files.length) return
    const value = text
    const attachedImages = images
    const attachedFiles = files
    text = ''
    images = []
    files = []
    setDraft(C.activeId, '') // 发送即清掉该会话草稿
    requestAnimationFrame(autogrow)
    await sendMessage(value, attachedImages, attachedFiles)
  }

  function onKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      submit()
      return
    }
    // 空输入框按 ↑:编辑上一条用户消息(ChatGPT 式快捷)
    if (
      event.key === 'ArrowUp' &&
      !text.trim() &&
      !images.length &&
      !files.length &&
      !event.isComposing &&
      requestEditLastUser()
    ) {
      event.preventDefault()
    }
  }

  /* —— 附件:图片降采样;文本文件读入内容(供模型阅读 + 侧栏查看)—— */
  async function addImageFile(file) {
    if (images.length >= 4) return
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    images = [...images, canvas.toDataURL('image/jpeg', 0.88)]
  }

  async function addAnyFile(file) {
    if (file.type.startsWith('image/')) return addImageFile(file)
    if (files.length >= 4 || file.size > 50 * 1024 * 1024) return
    importing++
    try {
      const imported = await importFile(file)
      if (!imported) return
      // 扫描版 PDF:抽不到文本 → 页面图并入图片附件走视觉模型
      if (imported.pageImages?.length) {
        images = [...images, ...imported.pageImages].slice(0, 4)
        imported.pageImages = undefined
        imported.text = '(扫描版 PDF,无文本层;页面已作为图片附上,请直接阅读图片。)'
      }
      files = [...files, imported]
    } catch (err) {
      files = [
        ...files,
        {
          name: file.name,
          size: file.size,
          text: `(解析失败:${err?.message ?? err})`,
          kind: 'text',
        },
      ]
    } finally {
      importing--
    }
  }

  async function onFilesPicked(event) {
    for (const file of event.target.files ?? []) await addAnyFile(file)
    event.target.value = ''
  }

  async function onPaste(event) {
    const pasted = [...(event.clipboardData?.items ?? [])]
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter(Boolean)
    if (pasted.length) {
      event.preventDefault()
      for (const file of pasted) await addAnyFile(file)
    }
  }

  function removeImage(index) {
    images = images.filter((_, i) => i !== index)
  }

  function removeFile(index) {
    files = files.filter((_, i) => i !== index)
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
          const result = await polishTranscript(await transcribe(blob))
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
  {#if images.length || files.length || importing > 0}
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
      {#each files as file, i (file.name + i)}
        <div class="file-pill">
          <Icon name={file.kind === 'audio' ? 'mic' : 'file'} size={14} strokeWidth={1.75} />
          <span class="file-pill-name">{file.name}</span>
          <button
            type="button"
            class="file-pill-x"
            aria-label={t('chat.removeFile')}
            onclick={() => removeFile(i)}
          >
            <Icon name="x" size={12} strokeWidth={2.5} />
          </button>
        </div>
      {/each}
      {#if importing > 0}
        <div class="file-pill importing">
          <span class="import-dot"></span>
          {t('chat.importingFile')}
        </div>
      {/if}
    </div>
  {/if}

  <div class="row">
    <button
      bind:this={menuBtn}
      type="button"
      class="aux-btn"
      class:active={menuOpen}
      title={t('chat.openMenu')}
      aria-label={t('chat.openMenu')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >
      <Icon name="plus" size={19} strokeWidth={1.9} />
    </button>
    {#if menuOpen}
      <div bind:this={menuEl} class="menu" role="menu" aria-label={t('chat.openMenu')}>
        {#each menuItems as item (item.key)}
          <button type="button" role="menuitem" class="menu-item" onclick={() => menuAction(item)}>
            <span class="menu-icon">
              <Icon name={item.icon} size={16} strokeWidth={1.8} />
            </span>
            <span class="menu-title">{item.title}</span>
            <span class="menu-desc">{item.desc}</span>
          </button>
        {/each}
      </div>
    {/if}
    <input
      bind:this={fileInput}
      type="file"
      accept={IMPORT_ACCEPT}
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
      oninput={onInput}
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

{#if dragging}
  <div class="drop-overlay" aria-hidden="true">
    <div class="drop-overlay-inner">
      <Icon name="paperclip" size={26} strokeWidth={1.6} />
      <span>{t('chat.dropToUpload')}</span>
    </div>
  </div>
{/if}

<style>
  /* —— 整页拖拽上传遮罩 —— */
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, var(--bg) 68%, transparent);
    pointer-events: none;
    animation: drop-in 120ms var(--ease, ease);
  }
  .drop-overlay-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 36px 56px;
    border: 2px dashed var(--accent);
    border-radius: 22px;
    background: var(--bg);
    color: var(--t1);
    font-size: var(--text-base, 15px);
    font-weight: 550;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  }
  .drop-overlay-inner :global(svg) {
    color: var(--accent);
  }
  @keyframes drop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .drop-overlay {
      animation: none;
    }
  }

  .composer {
    position: relative;
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

  /* —— 「+」能力菜单 —— */
  .menu {
    position: absolute;
    bottom: calc(100% + 10px);
    inset-inline-start: 0;
    z-index: 30;
    min-width: 300px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 6px;
    display: grid;
    gap: 2px;
    background: var(--bg);
    border: 1px solid var(--border-l);
    border-radius: 18px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
  }
  .menu-item {
    display: grid;
    grid-template-columns: 28px auto 1fr;
    align-items: center;
    column-gap: 10px;
    width: 100%;
    padding: 9px 12px 9px 8px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--t1);
    font: inherit;
    font-size: var(--text-sm, 14px);
    text-align: start;
    cursor: pointer;
  }
  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--card);
  }
  .menu-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--bg-2);
    color: var(--t2);
  }
  .menu-title {
    font-weight: 550;
    white-space: nowrap;
  }
  .menu-desc {
    color: var(--t3);
    font-size: var(--text-xs, 12px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .aux-btn.active {
    background: var(--card);
    color: var(--t1);
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

  .file-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    height: 34px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
    color: var(--t1);
    font-size: var(--text-sm, 13px);
  }
  .file-pill :global(svg) {
    color: var(--t3);
    flex: 0 0 auto;
  }
  .file-pill-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-pill-x {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
    flex: 0 0 auto;
  }
  .file-pill-x:hover {
    color: var(--t1);
    background: var(--card);
  }
  .file-pill.importing {
    color: var(--t3);
    gap: 8px;
    padding-inline-end: 12px;
  }
  .import-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--t3);
    animation: import-pulse 1s ease-in-out infinite;
  }
  @keyframes import-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
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
