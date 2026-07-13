<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { renderMarkdown, splitThinking } from '$lib/markdown.js'
  import {
    C,
    regenerate,
    editUserMessage,
    continueGenerating,
    switchBranch,
    activeConversation,
  } from '$lib/chat.svelte.js'
  import { toolIcon } from '$lib/tools.js'
  import { speak } from '$lib/localai.js'
  import { S } from '$lib/state.svelte.js'
  import { openArtifact, openUrl, openFile, openImage } from '$lib/panel.svelte.js'
  import { IMG } from '$lib/imageProgress.svelte.js'

  /** @type {{ message: import('$lib/chat.svelte.js').ChatMessage, index?: number, isLast?: boolean }} */
  let { message, index = 0, isLast = false } = $props()

  let copied = $state(false)
  let editing = $state(false)
  let editText = $state('')
  let editArea = $state(null)
  let seenEditSignal = C.editSignal
  let speaking = $state(false)
  let ttsLoading = $state(false)
  let audio = null

  const parts = $derived(splitThinking(message.content))
  const thinkingText = $derived(
    [message.reasoning, parts.thinking].filter(Boolean).join('\n'),
  )
  const streamingThis = $derived(
    C.streaming && isLast && message.role === 'assistant',
  )
  /* —— 回答版本翻页:找到触发本轮的用户消息,读它挂着的分支(仅末轮可切换)—— */
  const turnUser = $derived.by(() => {
    if (!isLast || message.role !== 'assistant') return null
    const msgs = activeConversation()?.messages ?? []
    for (let i = index - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return { index: i, count: msgs[i].branches?.length ?? 0, active: msgs[i].branch ?? 0 }
    }
    return null
  })
  const answerHtml = $derived(
    message.role === 'assistant'
      ? renderMarkdown(parts.answer, {
          previewLabel: t('panel.preview'),
          caret: streamingThis && !!parts.answer, // 流式时结尾显示打字光标
        })
      : '',
  )
  /** 工具调用产出的图片(生图等),在正文上方以画廊展示 */
  const genImages = $derived((message.toolCalls ?? []).flatMap((tc) => tc.images ?? []))

  /* —— 工具调用的人性化呈现(对齐 Claude/ChatGPT:每步自带上下文)—— */
  function argsOf(tc) {
    try {
      return JSON.parse(tc.arguments || '{}')
    } catch {
      return {}
    }
  }
  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return String(url ?? '')
    }
  }
  /** chip 上标题旁的上下文标签:搜索词 / 域名 / 表达式等,一眼看清 AI 在做什么 */
  function toolContext(tc) {
    const a = argsOf(tc)
    switch (tc.name) {
      case 'browser_search':
      case 'web_search':
      case 'search_memory':
      case 'search_notes':
        return a.query ?? ''
      case 'open_browser_page':
      case 'fetch_url':
        return a.url ? hostOf(a.url) : ''
      case 'read_browser_page':
        return a.part === 'text'
          ? t('toolCtx.text')
          : a.part === 'links'
            ? t('toolCtx.links')
            : t('toolCtx.page')
      case 'browser_interact':
        return a.action ?? ''
      case 'read_note':
        return a.path ? a.path.split('/').pop() : ''
      case 'calculate':
        return a.expression ?? ''
      case 'generate_image':
        return a.prompt ? a.prompt.slice(0, 24) : ''
      default:
        return ''
    }
  }
  /** 研究回答的来源:本条消息真正打开过的网页(去重),渲染成来源卡片行 */
  const sources = $derived.by(() => {
    const seen = new Set()
    const out = []
    for (const tc of message.toolCalls ?? []) {
      if (tc.name !== 'open_browser_page' && tc.name !== 'fetch_url') continue
      if (tc.running || (typeof tc.result === 'string' && tc.result.startsWith('错误'))) continue
      const url = argsOf(tc).url
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push({ url, host: hostOf(url) })
    }
    return out
  })
  /** 域名 → 稳定的柔和主题色(本地生成,不发外部 favicon 请求) */
  function hostHue(host) {
    let h = 0
    for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) % 360
    return h
  }

  /* —— 等待/思考状态(ChatGPT 式:实时计时 + 思考流预览)—— */
  const thinkingLive = $derived(
    streamingThis && !!thinkingText && !parts.answer && !message.toolCalls?.length,
  )
  let thinkOpen = $state(false)
  let startTs = $state(null)
  let nowTs = $state(0)
  $effect(() => {
    if (!streamingThis) return
    if (startTs === null) {
      startTs = Date.now()
      nowTs = startTs
    }
    const id = setInterval(() => (nowTs = Date.now()), 1000)
    return () => clearInterval(id)
  })
  const elapsedS = $derived(
    startTs === null ? 0 : Math.max(0, Math.round((nowTs - startTs) / 1000)),
  )
  // 迟迟没有首个 token:多半是 llama-swap 正在冷加载模型
  const coldStart = $derived(elapsedS >= 6 && !thinkingText && !parts.answer)
  const thinkSeconds = $derived(
    Math.max(1, Math.round((message.thinkingMs ?? message.durationMs ?? 0) / 1000)),
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(parts.answer || message.content)
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      /* clipboard 权限被拒时忽略 */
    }
  }

  /* —— markdown 区域委托:代码复制 / HTML 预览 / 链接进内建阅读器 —— */
  async function onMdClick(event) {
    const copyBtn = event.target.closest?.('[data-md-copy]')
    if (copyBtn) {
      const code = copyBtn.closest('.md-code')?.querySelector('code')?.textContent ?? ''
      try {
        await navigator.clipboard.writeText(code)
        copyBtn.textContent = '✓'
        setTimeout(() => (copyBtn.textContent = '⧉'), 1500)
      } catch {
        /* ignore */
      }
      return
    }
    const previewBtn = event.target.closest?.('[data-md-preview]')
    if (previewBtn) {
      const code = previewBtn.closest('.md-code')?.querySelector('code')?.textContent ?? ''
      openArtifact({ lang: previewBtn.dataset.lang || 'html', code })
      return
    }
    // 链接:默认进内建阅读器;按住 Cmd/Ctrl 走系统新标签
    const link = event.target.closest?.('a[href^="http"]')
    if (link && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      openUrl(link.href)
    }
  }

  /* —— 编辑并重发 —— */
  // 是否本会话最后一条用户消息(响应输入框 ↑ 键的编辑请求)
  const isLastUser = $derived.by(() => {
    if (message.role !== 'user') return false
    const msgs = activeConversation()?.messages ?? []
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return i === index
    }
    return false
  })
  $effect(() => {
    const sig = C.editSignal
    if (sig === seenEditSignal) return
    seenEditSignal = sig
    if (isLastUser && !editing) startEdit()
  })
  $effect(() => {
    if (editing) editArea?.focus()
  })

  function startEdit() {
    editText = message.content
    editing = true
  }
  async function saveEdit() {
    editing = false
    await editUserMessage(index, editText)
  }
  function onEditKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      saveEdit()
    } else if (event.key === 'Escape') {
      editing = false
    }
  }

  /* —— 朗读(本地 Qwen3-TTS)—— */
  function ttsText() {
    return parts.answer
      .replaceAll(/```[\s\S]*?```/g, ` ${t('chat.codeOmitted')} `)
      .replaceAll(/`([^`]+)`/g, '$1')
      .replaceAll(/[*#>|~\-=_[\]()]{1,}/g, ' ')
      .replaceAll(/https?:\/\/\S+/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim()
  }
  async function toggleSpeak() {
    if (speaking) {
      audio?.pause()
      audio = null
      speaking = false
      return
    }
    if (ttsLoading) return
    ttsLoading = true
    try {
      const blob = await speak(ttsText(), S.settings.ttsVoice)
      const url = URL.createObjectURL(blob)
      audio = new Audio(url)
      audio.onended = audio.onerror = () => {
        URL.revokeObjectURL(url)
        speaking = false
        audio = null
      }
      speaking = true
      await audio.play()
    } catch {
      speaking = false
    } finally {
      ttsLoading = false
    }
  }

  $effect(() => () => audio?.pause())
</script>

{#if message.role === 'user'}
  <div class="row user" data-role="user">
    {#if message.images?.length}
      <div class="user-images">
        {#each message.images as src, i (i)}
          <img {src} alt={t('chat.attachedImage')} />
        {/each}
      </div>
    {/if}
    {#if message.files?.length}
      <div class="user-files">
        {#each message.files as file (file.name)}
          <button type="button" class="file-chip" onclick={() => openFile(file)}>
            <Icon name={file.kind === 'audio' ? 'mic' : 'file'} size={14} strokeWidth={1.75} />
            <span class="file-chip-name">{file.name}</span>
            <span class="file-chip-size"
              >{file.size < 1024 ? `${file.size}B` : `${(file.size / 1024).toFixed(0)}KB`}</span
            >
          </button>
        {/each}
      </div>
    {/if}
    {#if editing}
      <div class="edit-box">
        <textarea bind:this={editArea} bind:value={editText} rows="3" onkeydown={onEditKeydown}></textarea>
        <div class="edit-actions">
          <button type="button" class="edit-cancel" onclick={() => (editing = false)}>
            {t('chat.cancel')}
          </button>
          <button type="button" class="edit-save" onclick={saveEdit}>
            {t('chat.saveAndResend')}
          </button>
        </div>
      </div>
    {:else}
      {#if message.content}
        <div class="bubble">{message.content}</div>
      {/if}
      {#if !C.streaming}
        <div class="user-actions">
          <button
            type="button"
            title={t('chat.edit')}
            aria-label={t('chat.edit')}
            onclick={startEdit}
          >
            <Icon name="pencil" size={13} strokeWidth={1.75} />
          </button>
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <div class="row assistant" data-role="assistant">
    {#if thinkingText}
      <div class="think" class:open={thinkOpen}>
        <button
          type="button"
          class="think-toggle"
          title={t('chat.thinking')}
          aria-expanded={thinkOpen}
          onclick={() => (thinkOpen = !thinkOpen)}
        >
          {#if thinkingLive}
            <span class="shimmer">{t('chat.thinkingNow')}</span>
            <span class="think-timer">{elapsedS}s</span>
          {:else}
            <span>{t('chat.thoughtFor', { s: thinkSeconds })}</span>
          {/if}
          <Icon name="chevron-down" size={14} strokeWidth={2} />
        </button>
        {#if thinkOpen}
          <div class="think-body">{thinkingText}</div>
        {:else if thinkingLive}
          <!-- 流式思考预览:固定高度窗口,底部对齐,顶部渐隐 -->
          <div class="think-stream" aria-hidden="true">
            <div class="think-stream-text">{thinkingText}</div>
          </div>
        {/if}
      </div>
    {/if}

    {#if message.toolCalls?.length}
      <div class="tools">
        {#each message.toolCalls as tc (tc.id)}
          {@const ctx = toolContext(tc)}
          <details class="tool" class:running={tc.running}>
            <summary class:shimmer={tc.running}>
              <span class="tool-icon" class:running={tc.running}>
                <Icon name={toolIcon(tc.name)} size={13} strokeWidth={2} />
              </span>
              <span class="tool-name">{t(`tool.${tc.name}`)}</span>
              {#if ctx}
                <span class="tool-ctx" title={ctx}>{ctx}</span>
              {/if}
              <Icon name="chevron-down" size={12} strokeWidth={2} />
            </summary>
            <div class="tool-body">
              {#if tc.arguments && tc.arguments !== '{}'}
                <pre class="tool-args aios-scroll">{tc.arguments}</pre>
              {/if}
              {#if tc.result}
                <pre class="tool-result aios-scroll">{tc.result.slice(0, 1500)}{tc.result.length > 1500 ? '…' : ''}</pre>
              {/if}
              {#if tc.name === 'fetch_url' && tc.result && !tc.result.startsWith('错误')}
                <button
                  type="button"
                  class="tool-open"
                  onclick={() => {
                    try {
                      openUrl(JSON.parse(tc.arguments).url, tc.result)
                    } catch {
                      /* 参数异常时忽略 */
                    }
                  }}
                >
                  <Icon name="eye" size={13} strokeWidth={1.9} />
                  {t('panel.openReader')}
                </button>
              {/if}
            </div>
          </details>
          {#if tc.name === 'generate_image' && tc.running && IMG.active}
            <!-- 生图实时进度:阶段 + 步数 + 用时 + 进度条(轮询生图服务 /progress) -->
            <div class="img-progress" role="status">
              <div class="img-progress-row">
                <span class="img-progress-text shimmer">
                  {IMG.phase === 'generating' && IMG.steps
                    ? t('chat.imgGenerating', { step: IMG.step, steps: IMG.steps })
                    : IMG.phase === 'saving'
                      ? t('chat.imgSaving')
                      : t('chat.imgLoading')}
                </span>
                <span class="img-progress-time">{IMG.elapsed}s</span>
              </div>
              <div
                class="img-bar"
                class:indeterminate={IMG.phase !== 'generating' || !IMG.steps}
              >
                <div
                  class="img-bar-fill"
                  style:width={IMG.phase === 'generating' && IMG.steps
                    ? `${Math.round((IMG.step / IMG.steps) * 100)}%`
                    : '35%'}
                ></div>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    {#if genImages.length}
      <div class="gen-images">
        {#each genImages as src, i (i)}
          <button
            type="button"
            class="gen-image-btn"
            title={t('chat.viewImage')}
            onclick={() => openImage({ src, title: t('chat.generatedImage') })}
          >
            <img {src} alt={t('chat.generatedImage')} loading="lazy" />
          </button>
        {/each}
      </div>
    {/if}

    {#if parts.answer}
      <!-- 代码块复制按钮的点击委托;按钮本身可聚焦,容器无键盘语义 -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="md" onclick={onMdClick}>
        <!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown 全量转义,只输出白名单标签 -->
        {@html answerHtml}
      </div>
    {:else if streamingThis && !thinkingText && !message.toolCalls?.length}
      <div class="pending" role="status" aria-label={t('chat.loading')}>
        <span class="shimmer">{coldStart ? t('chat.pendingCold') : t('chat.pending')}</span>
      </div>
    {/if}

    {#if !streamingThis && parts.answer && sources.length}
      <div class="sources">
        <span class="sources-label">{t('chat.sources')}</span>
        <div class="sources-row">
          {#each sources as s, i (s.url)}
            <button
              type="button"
              class="source-card"
              title={s.url}
              onclick={() => openUrl(s.url)}
            >
              <span
                class="source-dot"
                style={`--hue:${hostHue(s.host)}`}
                aria-hidden="true">{s.host[0]?.toUpperCase() ?? '·'}</span
              >
              <span class="source-host">{s.host}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if !streamingThis && isLast && !message.error && message.finishReason === 'length'}
      <button type="button" class="continue-btn" onclick={() => continueGenerating()}>
        <Icon name="arrow-down" size={13} strokeWidth={2} />
        {t('chat.continueGenerating')}
      </button>
    {/if}

    {#if message.error}
      <div class="error" role="alert">
        <p>{t('chat.gatewayDown')}</p>
        <p class="error-detail">{message.error}</p>
        <button type="button" onclick={() => regenerate()}>
          <Icon name="refresh" size={13} strokeWidth={2} />
          {t('chat.retry')}
        </button>
      </div>
    {/if}

    {#if !streamingThis && (parts.answer || message.error)}
      <div class="actions">
        {#if turnUser && turnUser.count > 1}
          <div class="branch-nav" aria-label={t('chat.answerVersions')}>
            <button
              type="button"
              class="branch-arrow"
              disabled={turnUser.active === 0}
              title={t('chat.prevVersion')}
              aria-label={t('chat.prevVersion')}
              onclick={() => switchBranch(turnUser.index, -1)}
            >
              <Icon name="chevron-left" size={14} strokeWidth={2} />
            </button>
            <span class="branch-count">{turnUser.active + 1}/{turnUser.count}</span>
            <button
              type="button"
              class="branch-arrow"
              disabled={turnUser.active === turnUser.count - 1}
              title={t('chat.nextVersion')}
              aria-label={t('chat.nextVersion')}
              onclick={() => switchBranch(turnUser.index, 1)}
            >
              <Icon name="chevron-right" size={14} strokeWidth={2} />
            </button>
          </div>
        {/if}
        {#if parts.answer}
          <button
            type="button"
            title={copied ? t('chat.copied') : t('chat.copy')}
            aria-label={copied ? t('chat.copied') : t('chat.copy')}
            onclick={copy}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            class:speaking
            title={speaking ? t('chat.stopSpeaking') : t('chat.readAloud')}
            aria-label={speaking ? t('chat.stopSpeaking') : t('chat.readAloud')}
            aria-pressed={speaking}
            disabled={ttsLoading}
            onclick={toggleSpeak}
          >
            <Icon name={speaking ? 'stop' : 'speaker'} size={14} strokeWidth={1.75} />
          </button>
        {/if}
        {#if isLast && !C.streaming}
          <button
            type="button"
            title={t('chat.regenerate')}
            aria-label={t('chat.regenerate')}
            onclick={() => regenerate()}
          >
            <Icon name="refresh" size={14} strokeWidth={1.75} />
          </button>
        {/if}
        {#if message.durationMs}
          <span class="duration">{(message.durationMs / 1000).toFixed(1)}s</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .row {
    display: flex;
    flex-direction: column;
  }

  .row.user {
    align-items: flex-end;
    gap: 8px;
  }

  .user-images {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .user-images img {
    max-width: 200px;
    max-height: 200px;
    border-radius: 14px;
    border: 1px solid var(--border);
    display: block;
  }

  .user-files {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 260px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-2);
    color: var(--t1);
    font-size: var(--text-sm, 13px);
    cursor: pointer;
  }
  .file-chip:hover {
    border-color: var(--border-l);
    background: var(--card);
  }
  .file-chip :global(svg) {
    color: var(--t3);
    flex: 0 0 auto;
  }
  .file-chip-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-chip-size {
    color: var(--t4);
    font-size: var(--text-xs, 11px);
    flex: 0 0 auto;
  }

  .bubble {
    max-width: min(78%, 560px);
    background: var(--card);
    color: var(--t1);
    padding: 10px 16px;
    border-radius: 22px;
    font-size: var(--text-base, 15px);
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .user-actions {
    display: flex;
    opacity: 0;
    transition: opacity var(--dur-fast, 120ms) var(--ease, ease);
  }
  .row.user:hover .user-actions,
  .user-actions:focus-within {
    opacity: 1;
  }
  .user-actions button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
  }
  .user-actions button:hover {
    background: var(--card);
    color: var(--t1);
  }
  @media (hover: none) {
    .user-actions {
      opacity: 1;
    }
  }

  .edit-box {
    width: min(100%, 560px);
    display: grid;
    gap: 8px;
    background: var(--card);
    border-radius: 18px;
    padding: 12px;
  }
  .edit-box textarea {
    width: 100%;
    border: none;
    background: transparent;
    resize: vertical;
    outline: none;
    color: var(--t1);
    font: inherit;
    font-size: var(--text-base, 15px);
    line-height: 1.5;
    min-height: 60px;
  }
  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .edit-cancel,
  .edit-save {
    border: none;
    border-radius: 999px;
    padding: 7px 14px;
    font-size: var(--text-sm, 13px);
    cursor: pointer;
  }
  .edit-cancel {
    background: var(--bg);
    color: var(--t1);
    border: 1px solid var(--border-l);
  }
  .edit-save {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 550;
  }

  .row.assistant {
    align-items: stretch;
    gap: var(--space-2, 8px);
  }

  /* —— 工具调用卡片 —— */
  .tools {
    display: grid;
    gap: 6px;
    justify-items: start;
  }
  .tool {
    max-width: 100%;
  }
  .tool summary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px 5px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-2);
    color: var(--t2);
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .tool summary::-webkit-details-marker {
    display: none;
  }
  .tool summary:hover {
    border-color: var(--border-l);
    color: var(--t1);
  }
  .tool-icon {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--card);
    color: var(--t2);
  }
  .tool-icon.running {
    animation: tool-pulse 1s ease-in-out infinite;
  }
  @keyframes tool-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
  .tool-name {
    font-weight: 550;
    flex: none;
  }
  /* chip 上的上下文标签:搜索词 / 域名等,一眼看清 AI 在做什么 */
  .tool-ctx {
    min-width: 0;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--t3);
    font-size: var(--text-xs, 12px);
  }
  .tool-ctx::before {
    content: '·';
    margin-right: 6px;
    color: var(--t3);
  }
  .tool.running summary {
    border-color: var(--border-l);
  }
  .tool-body {
    margin-top: 6px;
    display: grid;
    gap: 6px;
    max-width: 100%;
  }
  .tool-args,
  .tool-result {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-2);
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 12px;
    line-height: 1.55;
    color: var(--t2);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 240px;
    overflow-y: auto;
  }
  .tool-result {
    color: var(--t1);
  }
  .tool-open {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--t2);
    padding: 5px 10px;
    font-size: var(--text-xs, 12px);
    cursor: pointer;
  }
  .tool-open:hover {
    color: var(--t1);
    background: var(--card);
  }

  /* —— 来源卡片行(研究回答底部,对齐 ChatGPT/Perplexity 的 sources)—— */
  .sources {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .sources-label {
    color: var(--t3);
    font-size: var(--text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sources-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .source-card {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 220px;
    padding: 5px 11px 5px 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-2);
    color: var(--t2);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s,
      color 0.12s;
  }
  .source-card:hover {
    border-color: var(--border-l);
    background: var(--card);
    color: var(--t1);
  }
  .source-dot {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: 50%;
    background: hsl(var(--hue) 55% 42%);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }
  .source-host {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* —— 生成图片 —— */
  .gen-images {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .gen-image-btn {
    display: block;
    line-height: 0;
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
    border-radius: 14px;
  }
  .gen-image-btn:hover img {
    border-color: var(--border-l);
  }
  .gen-images img {
    max-width: min(100%, 420px);
    max-height: 420px;
    border-radius: 14px;
    border: 1px solid var(--border);
    display: block;
  }

  /* —— 生图实时进度卡 —— */
  .img-progress {
    margin-top: 8px;
    width: min(100%, 420px);
    display: grid;
    gap: 7px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-2);
  }
  .img-progress-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .img-progress-text {
    font-size: var(--text-sm, 13px);
  }
  .img-progress-time {
    color: var(--t4);
    font-size: var(--text-xs, 11px);
    font-variant-numeric: tabular-nums;
  }
  .img-bar {
    position: relative;
    height: 4px;
    border-radius: 999px;
    background: var(--card);
    overflow: hidden;
  }
  .img-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent, var(--t1));
    transition: width 600ms ease;
  }
  .img-bar.indeterminate .img-bar-fill {
    animation: img-bar-slide 1.4s ease-in-out infinite;
  }
  @keyframes img-bar-slide {
    0% {
      transform: translateX(-120%);
    }
    100% {
      transform: translateX(340%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .img-bar.indeterminate .img-bar-fill {
      animation: none;
    }
  }

  /* —— markdown 正文 —— */
  .md {
    color: var(--t1);
    font-size: var(--text-base, 15px);
    line-height: 1.65;
    overflow-wrap: anywhere;
  }
  /* 流式打字光标:贴在已揭示文字末尾,闪烁提示"正在生成" */
  .md :global(.md-caret) {
    display: inline-block;
    width: 0.52em;
    height: 1.02em;
    margin-inline-start: 1px;
    transform: translateY(0.14em);
    border-radius: 1px;
    background: var(--t2);
    animation: caret-blink 1.05s steps(1, end) infinite;
  }
  @keyframes caret-blink {
    0%,
    50% {
      opacity: 1;
    }
    50.01%,
    100% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .md :global(.md-caret) {
      animation: none;
      opacity: 0.55;
    }
  }
  .md :global(p) {
    margin: 0 0 0.75em;
  }
  .md :global(> :last-child) {
    margin-bottom: 0;
  }
  .md :global(h3),
  .md :global(h4),
  .md :global(h5),
  .md :global(h6) {
    margin: 1.2em 0 0.5em;
    font-weight: 650;
    line-height: 1.3;
  }
  .md :global(h3) {
    font-size: 1.15em;
  }
  .md :global(h4) {
    font-size: 1.05em;
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 0 0 0.75em;
    padding-inline-start: 1.4em;
    display: grid;
    gap: 0.3em;
  }
  .md :global(blockquote) {
    margin: 0 0 0.75em;
    padding-inline-start: 12px;
    border-inline-start: 2px solid var(--border-l);
    color: var(--t2);
  }
  .md :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }
  .md :global(a) {
    color: var(--t1);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .md :global(code) {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.86em;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.1em 0.35em;
  }
  .md :global(.md-code) {
    margin: 0 0 0.9em;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg-2);
  }
  .md :global(.md-code-head) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 4px 14px;
    border-bottom: 1px solid var(--border);
  }
  .md :global(.md-code-lang) {
    font-size: var(--text-xs, 11px);
    color: var(--t3);
    font-family: var(--mono, ui-monospace, monospace);
  }
  .md :global(.md-code-actions) {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .md :global(.md-copy),
  .md :global(.md-preview) {
    border: none;
    background: transparent;
    color: var(--t3);
    font-size: 13px;
    line-height: 1;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
  }
  .md :global(.md-preview) {
    font-size: var(--text-xs, 12px);
    font-weight: 550;
  }
  .md :global(.md-copy:hover),
  .md :global(.md-preview:hover) {
    background: var(--card);
    color: var(--t1);
  }
  .md :global(.tok-cmt) {
    color: var(--t4);
    font-style: italic;
  }
  .md :global(.tok-str) {
    color: var(--t2);
  }
  .md :global(.tok-num) {
    color: var(--t2);
    font-weight: 600;
  }
  .md :global(.tok-kw) {
    color: var(--t1);
    font-weight: 700;
  }
  .md :global(pre) {
    margin: 0;
    padding: 12px 14px;
    overflow-x: auto;
  }
  .md :global(pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.85em;
    line-height: 1.6;
  }
  .md :global(.md-table-wrap) {
    margin: 0 0 0.9em;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .md :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.92em;
  }
  .md :global(th),
  .md :global(td) {
    text-align: start;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .md :global(th) {
    font-weight: 600;
    color: var(--t2);
    background: var(--bg-2);
  }
  .md :global(tr:last-child td) {
    border-bottom: none;
  }

  /* —— 思考块 —— */
  .think {
    color: var(--t3);
    font-size: var(--text-sm, 13px);
  }
  .think-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: transparent;
    padding: 0;
    color: var(--t3);
    font: inherit;
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    user-select: none;
  }
  .think-toggle:hover {
    color: var(--t1);
  }
  .think-toggle :global(svg) {
    transition: transform var(--dur-fast, 120ms) var(--ease, ease);
    transform: rotate(-90deg);
  }
  .think.open .think-toggle :global(svg) {
    transform: rotate(0deg);
  }
  .think-timer {
    color: var(--t4);
    font-size: var(--text-xs, 11px);
    font-variant-numeric: tabular-nums;
  }
  .think-body {
    margin-top: 6px;
    padding-inline-start: 12px;
    border-inline-start: 2px solid var(--border);
    white-space: pre-wrap;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  /* 流式思考预览:约 3 行高,内容底部对齐随流"滚动",顶部渐隐 */
  .think-stream {
    margin-top: 8px;
    max-height: 4.8em;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding-inline-start: 12px;
    border-inline-start: 2px solid var(--border);
    line-height: 1.6;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 2.2em);
    mask-image: linear-gradient(to bottom, transparent 0, #000 2.2em);
  }
  .think-stream-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* —— shimmer 状态文字(等待/思考/工具运行)—— */
  .shimmer {
    background: linear-gradient(
      90deg,
      var(--t3) 35%,
      var(--t1) 50%,
      var(--t3) 65%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: shimmer 2s linear infinite;
  }
  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .shimmer {
      animation: none;
      background: none;
      color: var(--t2);
    }
  }

  /* —— 流式等待状态行 —— */
  .pending {
    padding: 4px 0;
    font-size: var(--text-sm, 13px);
  }

  /* —— 继续生成(回复被 token 上限截断时)—— */
  .continue-btn {
    align-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-l);
    border-radius: 999px;
    background: var(--bg);
    color: var(--t1);
    padding: 6px 14px;
    font-size: var(--text-sm, 13px);
    font-weight: 550;
    cursor: pointer;
    transition: background var(--dur-fast, 120ms) var(--ease, ease);
  }
  .continue-btn:hover {
    background: var(--card);
  }
  .continue-btn :global(svg) {
    color: var(--t3);
  }

  /* —— 错误 —— */
  .error {
    display: grid;
    gap: var(--space-2, 8px);
    justify-items: start;
    padding: 12px 14px;
    border: 1px solid var(--border-l);
    border-radius: 12px;
    background: var(--bg-2);
    color: var(--t2);
    font-size: var(--text-sm, 13px);
  }
  .error p {
    margin: 0;
  }
  .error-detail {
    color: var(--t4);
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 11px;
  }
  .error button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-l);
    border-radius: 8px;
    background: var(--bg);
    color: var(--t1);
    padding: 5px 10px;
    font-size: var(--text-sm, 13px);
    cursor: pointer;
  }
  .error button:hover {
    background: var(--card);
  }

  /* —— 悬停操作 —— */
  .actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity var(--dur-fast, 120ms) var(--ease, ease);
  }
  .row.assistant:hover .actions,
  .actions:focus-within {
    opacity: 1;
  }
  .actions button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
  }
  .actions button:hover {
    background: var(--card);
    color: var(--t1);
  }

  /* —— 回答版本翻页器 —— */
  .branch-nav {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    margin-inline-end: 2px;
  }
  .branch-arrow {
    display: grid;
    place-items: center;
    width: 24px;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
  }
  .branch-arrow:hover:not(:disabled) {
    background: var(--card);
    color: var(--t1);
  }
  .branch-arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .branch-count {
    font-size: var(--text-xs, 11px);
    color: var(--t3);
    font-variant-numeric: tabular-nums;
    min-width: 24px;
    text-align: center;
  }

  .actions button.speaking {
    color: var(--t1);
    opacity: 1;
  }
  .actions button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .row.assistant:has(.actions button.speaking) .actions {
    opacity: 1;
  }

  .duration {
    align-self: center;
    margin-inline-start: 4px;
    font-size: var(--text-xs, 11px);
    color: var(--t4);
    font-variant-numeric: tabular-nums;
  }

  @media (hover: none) {
    .actions {
      opacity: 1;
    }
  }
</style>
