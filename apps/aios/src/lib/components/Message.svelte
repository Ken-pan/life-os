<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { renderMarkdown, splitThinking } from '$lib/markdown.js'
  import { C, regenerate, editUserMessage } from '$lib/chat.svelte.js'
  import { toolIcon } from '$lib/tools.js'
  import { speak } from '$lib/localai.js'

  /** @type {{ message: import('$lib/chat.svelte.js').ChatMessage, index?: number, isLast?: boolean }} */
  let { message, index = 0, isLast = false } = $props()

  let copied = $state(false)
  let editing = $state(false)
  let editText = $state('')
  let speaking = $state(false)
  let ttsLoading = $state(false)
  let audio = null

  const parts = $derived(splitThinking(message.content))
  const thinkingText = $derived(
    [message.reasoning, parts.thinking].filter(Boolean).join('\n'),
  )
  const answerHtml = $derived(
    message.role === 'assistant' ? renderMarkdown(parts.answer) : '',
  )
  const streamingThis = $derived(
    C.streaming && isLast && message.role === 'assistant',
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

  /* —— 代码块复制(委托:按钮由 renderMarkdown 静态生成)—— */
  async function onMdClick(event) {
    const btn = event.target.closest?.('[data-md-copy]')
    if (!btn) return
    const code = btn.closest('.md-code')?.querySelector('code')?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(code)
      btn.textContent = '✓'
      setTimeout(() => (btn.textContent = '⧉'), 1500)
    } catch {
      /* ignore */
    }
  }

  /* —— 编辑并重发 —— */
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

  /* —— 朗读(本地 Kokoro TTS)—— */
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
      const blob = await speak(ttsText())
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
  <div class="row user">
    {#if message.images?.length}
      <div class="user-images">
        {#each message.images as src, i (i)}
          <img {src} alt={t('chat.attachedImage')} />
        {/each}
      </div>
    {/if}
    {#if editing}
      <div class="edit-box">
        <textarea bind:value={editText} rows="3" onkeydown={onEditKeydown}></textarea>
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
  <div class="row assistant">
    {#if thinkingText}
      <details class="think" open={streamingThis && !parts.answer}>
        <summary>
          <Icon name="chevron-down" size={14} strokeWidth={2} />
          {t('chat.thinking')}
        </summary>
        <div class="think-body">{thinkingText}</div>
      </details>
    {/if}

    {#if message.toolCalls?.length}
      <div class="tools">
        {#each message.toolCalls as tc (tc.id)}
          <details class="tool">
            <summary>
              <span class="tool-icon" class:running={tc.running}>
                <Icon name={toolIcon(tc.name)} size={13} strokeWidth={2} />
              </span>
              <span class="tool-name">{t(`tool.${tc.name}`)}</span>
              {#if tc.running}
                <span class="tool-status">{t('chat.toolRunning')}</span>
              {/if}
              <Icon name="chevron-down" size={12} strokeWidth={2} />
            </summary>
            <div class="tool-body">
              {#if tc.arguments && tc.arguments !== '{}'}
                <pre class="tool-args">{tc.arguments}</pre>
              {/if}
              {#if tc.result}
                <pre class="tool-result">{tc.result.slice(0, 1500)}{tc.result.length > 1500 ? '…' : ''}</pre>
              {/if}
            </div>
          </details>
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
      <div class="pending" aria-label={t('chat.loading')}>
        <span class="dot"></span>
      </div>
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
  }
  .tool-status {
    color: var(--t3);
    font-size: var(--text-xs, 11px);
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

  /* —— markdown 正文 —— */
  .md {
    color: var(--t1);
    font-size: var(--text-base, 15px);
    line-height: 1.65;
    overflow-wrap: anywhere;
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
  .md :global(.md-copy) {
    border: none;
    background: transparent;
    color: var(--t3);
    font-size: 13px;
    line-height: 1;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
  }
  .md :global(.md-copy:hover) {
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
    border: none;
    color: var(--t3);
    font-size: var(--text-sm, 13px);
  }
  .think summary {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    list-style: none;
    user-select: none;
    color: var(--t3);
  }
  .think summary::-webkit-details-marker {
    display: none;
  }
  .think summary :global(svg) {
    transition: transform var(--dur-fast, 120ms) var(--ease, ease);
    transform: rotate(-90deg);
  }
  .think[open] summary :global(svg) {
    transform: rotate(0deg);
  }
  .think-body {
    margin-top: 6px;
    padding-inline-start: 12px;
    border-inline-start: 2px solid var(--border);
    white-space: pre-wrap;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  /* —— 流式等待点 —— */
  .pending {
    padding: 6px 0;
  }
  .dot {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--t1);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(0.8);
    }
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
