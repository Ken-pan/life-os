<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { createImeGuard } from '@life-os/theme'
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

  const ime = createImeGuard()
  import { toolIcon } from '$lib/tools.js'
  import { createSpeechSession } from '$lib/localai.js'
  import { S, save } from '$lib/state.svelte.js'
  import {
    openArtifact,
    openUrl,
    openFile,
    openImage,
  } from '$lib/panel.svelte.js'
  import { IMG } from '$lib/imageProgress.svelte.js'
  import { imageUrlFromPath } from '$lib/cloud.svelte.js'

  /** @type {{ message: import('$lib/chat.svelte.js').ChatMessage, index?: number, isLast?: boolean }} */
  let { message, index = 0, isLast = false } = $props()

  let copied = $state(false)
  let editing = $state(false)
  let editText = $state('')
  let editArea = $state(null)
  let seenEditSignal = C.editSignal
  let ttsState = $state('idle') // 'idle' | 'loading' | 'playing' | 'paused'
  let ttsSession = null // createSpeechSession 句柄
  let ttsIndex = $state(0) // 当前朗读到第几句(0-based)
  let ttsTotal = $state(0) // 总句数,进度显示用
  let mdEl = $state(null) // .md 容器,逐句高亮的定位范围
  let followScroll = true // 跟读自动滚动;用户手动滚动即脱离,直到下次朗读
  let ttsAnnounce = $state('') // aria-live 播报文本

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
      if (msgs[i].role === 'user')
        return {
          index: i,
          count: msgs[i].branches?.length ?? 0,
          active: msgs[i].branch ?? 0,
        }
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
  /** 工具调用产出的图片(生图等),在正文上方以画廊展示。
      本地有 dataURL(src)就直接显示;别的设备同步来的只有云端 path,则懒加载。 */
  const genImages = $derived(
    (message.toolCalls ?? []).flatMap((tc) => {
      const n = Math.max(tc.images?.length ?? 0, tc.imagePaths?.length ?? 0)
      return Array.from({ length: n }, (_, i) => ({
        tcId: tc.id,
        i,
        src: tc.images?.[i] ?? null,
        path: tc.imagePaths?.[i] ?? null,
      }))
    }),
  )

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
      case 'ask_notes':
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
      if (
        tc.running ||
        (typeof tc.result === 'string' && tc.result.startsWith('错误'))
      )
        continue
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
    for (let i = 0; i < host.length; i++)
      h = (h * 31 + host.charCodeAt(i)) % 360
    return h
  }

  /* —— 等待/思考状态(ChatGPT 式:实时计时 + 思考流预览)—— */
  const thinkingLive = $derived(
    streamingThis &&
      !!thinkingText &&
      !parts.answer &&
      !message.toolCalls?.length,
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
    Math.max(
      1,
      Math.round((message.thinkingMs ?? message.durationMs ?? 0) / 1000),
    ),
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
      const code =
        copyBtn.closest('.md-code')?.querySelector('code')?.textContent ?? ''
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
      const code =
        previewBtn.closest('.md-code')?.querySelector('code')?.textContent ?? ''
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
    if (ime.isComposing()) return
    editing = false
    await editUserMessage(index, editText)
  }
  function onEditKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (ime.isComposing(event)) return
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
  const TTS_RATES = [1, 1.25, 1.5, 2, 0.75]
  const fmtRate = (r) => `${r}×`

  function toggleSpeak() {
    if (ttsState !== 'idle') {
      ttsSession?.stop() // 触发 onEnd → endSpeak,统一收尾
      return
    }
    ttsState = 'loading' // 等首句出声
    ttsIndex = 0
    ttsSession = createSpeechSession(ttsText(), {
      voice: S.settings.ttsVoice,
      rate: S.settings.ttsRate, // 记住的偏好速度
      onStart() {
        ttsState = 'playing'
        ttsAnnounce = t('chat.speaking')
        startFollow()
      },
      onSentence(i, sentence) {
        ttsIndex = i
        highlightSentence(sentence)
      },
      onStateChange(st) {
        ttsState = st // 'playing' | 'paused'
      },
      onEnd: endSpeak,
      onError: endSpeak,
    })
    ttsTotal = ttsSession.sentences.length
  }

  function endSpeak() {
    ttsState = 'idle'
    ttsSession = null
    ttsAnnounce = t('chat.speechEnded')
    clearHighlight()
    stopFollow()
  }

  function togglePause() {
    ttsSession?.togglePause()
  }

  function cycleRate() {
    const cur = S.settings.ttsRate
    const next = TTS_RATES[(TTS_RATES.indexOf(cur) + 1) % TTS_RATES.length]
    S.settings.ttsRate = next
    save() // 持久化 + 云同步:记住速度偏好
    ttsSession?.setRate(next)
  }

  /* —— 逐句跟读高亮(CSS Custom Highlight API,不改 DOM;不支持则静默跳过)—— */
  function clearHighlight() {
    try {
      window.CSS?.highlights?.delete('tts')
    } catch {
      /* noop */
    }
  }

  function highlightSentence(sentence) {
    if (!mdEl || !window.CSS?.highlights || typeof Highlight === 'undefined')
      return
    const range = findTextRange(mdEl, sentence)
    clearHighlight()
    if (!range) return // 该句在正文里定位不到(如原属代码块),不高亮但照常朗读
    try {
      CSS.highlights.set('tts', new Highlight(range))
    } catch {
      return
    }
    if (followScroll) scrollRangeIntoView(range)
  }

  // 在渲染后的正文里按"折叠空白后的文本"定位句子,返回 DOM Range。best-effort。
  function findTextRange(root, needle) {
    const target = (needle || '').replace(/\s+/g, ' ').trim()
    if (target.length < 2) return null
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let collapsed = ''
    const map = [] // map[i] = { node, offset } 对应折叠串第 i 个字符
    let prevSpace = true // 折叠前导空白
    let node
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue
      for (let k = 0; k < raw.length; k++) {
        if (/\s/.test(raw[k])) {
          if (prevSpace) continue
          prevSpace = true
          collapsed += ' '
        } else {
          prevSpace = false
          collapsed += raw[k]
        }
        map.push({ node, offset: k })
      }
    }
    let pos = collapsed.indexOf(target)
    if (pos === -1) {
      // 整句匹配失败(句尾标点/被删的 URL 差异),退用前缀
      const prefix = target.slice(0, 40)
      if (prefix.length >= 12) pos = collapsed.indexOf(prefix)
      if (pos === -1) return null
    }
    const startM = map[pos]
    const endM = map[Math.min(pos + target.length, map.length) - 1]
    if (!startM || !endM) return null
    try {
      const range = document.createRange()
      range.setStart(startM.node, startM.offset)
      range.setEnd(endM.node, endM.offset + 1)
      return range
    } catch {
      return null
    }
  }

  function scrollRangeIntoView(range) {
    const rect = range.getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) return
    const margin = 96
    if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
      range.startContainer.parentElement?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
    }
  }

  /* —— 跟读自动滚动:用户主动滚动(滚轮/触摸)即脱离,避免抢滚动 —— */
  function breakFollow() {
    followScroll = false
  }
  function startFollow() {
    followScroll = true
    window.addEventListener('wheel', breakFollow, { passive: true })
    window.addEventListener('touchmove', breakFollow, { passive: true })
  }
  function stopFollow() {
    window.removeEventListener('wheel', breakFollow)
    window.removeEventListener('touchmove', breakFollow)
  }

  $effect(() => () => {
    ttsSession?.stop()
    stopFollow()
    clearHighlight()
  })
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
          <button
            type="button"
            class="file-chip"
            onclick={() => openFile(file)}
          >
            <Icon
              name={file.kind === 'audio' ? 'mic' : 'file'}
              size={14}
              strokeWidth={1.75}
            />
            <span class="file-chip-name">{file.name}</span>
            <span class="file-chip-size"
              >{file.size < 1024
                ? `${file.size}B`
                : `${(file.size / 1024).toFixed(0)}KB`}</span
            >
          </button>
        {/each}
      </div>
    {/if}
    {#if editing}
      <div class="edit-box">
        <textarea
          bind:this={editArea}
          bind:value={editText}
          rows="3"
          enterkeyhint="done"
          autocomplete="off"
          autocapitalize="sentences"
          spellcheck="true"
          onkeydown={onEditKeydown}
          oncompositionstart={ime.compositionstart}
          oncompositionend={(e) => ime.compositionend(e)}
          oncompositioncancel={ime.compositioncancel}
        ></textarea>
        <div class="edit-actions">
          <button
            type="button"
            class="edit-cancel"
            onclick={() => (editing = false)}
          >
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
              <span class="tool-chevron" aria-hidden="true">
                <Icon name="chevron-down" size={12} strokeWidth={2} />
              </span>
            </summary>
            <div class="tool-body">
              {#if tc.arguments && tc.arguments !== '{}'}
                <pre class="tool-args aios-scroll">{tc.arguments}</pre>
              {/if}
              {#if tc.result}
                <pre class="tool-result aios-scroll">{tc.result.slice(
                    0,
                    1500,
                  )}{tc.result.length > 1500 ? '…' : ''}</pre>
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
                    ? t('chat.imgGenerating', {
                        step: IMG.step,
                        steps: IMG.steps,
                      })
                    : IMG.phase === 'saving'
                      ? t('chat.imgSaving')
                      : IMG.elapsed >= 15
                        ? t('chat.imgLoadingSlow')
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
        {#each genImages as img (img.tcId + ':' + img.i)}
          {#if img.src}
            <button
              type="button"
              class="gen-image-btn"
              title={t('chat.viewImage')}
              onclick={() =>
                openImage({
                  src: img.src,
                  title: t('chat.generatedImage'),
                  imageRef: {
                    conversationId: C.activeId,
                    tcId: img.tcId,
                    index: img.i,
                    cloudPath: img.path,
                    dataUrl: img.src,
                  },
                })}
            >
              <img
                src={img.src}
                alt={t('chat.generatedImage')}
                loading="lazy"
              />
            </button>
          {:else if img.path}
            {#await imageUrlFromPath(img.path) then url}
              {#if url}
                <button
                  type="button"
                  class="gen-image-btn"
                  title={t('chat.viewImage')}
                  onclick={() =>
                    openImage({ src: url, title: t('chat.generatedImage') })}
                >
                  <img
                    src={url}
                    alt={t('chat.generatedImage')}
                    loading="lazy"
                  />
                </button>
              {/if}
            {/await}
          {/if}
        {/each}
      </div>
    {/if}

    {#if parts.answer}
      <!-- 代码块复制按钮的点击委托;按钮本身可聚焦,容器无键盘语义 -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="md" bind:this={mdEl} onclick={onMdClick}>
        <!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown 全量转义,只输出白名单标签 -->
        {@html answerHtml}
      </div>
      <!-- 朗读状态给读屏用户的礼貌播报 -->
      <div class="sr-only" aria-live="polite">{ttsAnnounce}</div>
    {:else if streamingThis && !thinkingText && !message.toolCalls?.length}
      <div class="pending" role="status" aria-label={t('chat.loading')}>
        <span class="shimmer"
          >{coldStart ? t('chat.pendingCold') : t('chat.pending')}</span
        >
      </div>
    {/if}

    {#if !streamingThis && parts.answer && sources.length}
      <div class="sources">
        <span class="sources-label"
          >{t('chat.sources')}<span class="sources-count">{sources.length}</span
          ></span
        >
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
      <button
        type="button"
        class="continue-btn"
        onclick={() => continueGenerating()}
      >
        <Icon name="arrow-down" size={13} strokeWidth={2} />
        {t('chat.continueGenerating')}
      </button>
    {/if}

    {#if message.error}
      <div class="error" role="alert">
        <!-- 网关不可达且未走 Kimi 时才提示重启 LocalAI;Kimi 未配置/看图不支持用专用文案 -->
        <p>
          {#if message.error === 'kimi_not_configured' || message.error === 'not_configured'}
            {t('chat.kimiNotConfigured')}
          {:else if message.error === 'kimi_vision_unsupported' || message.error === 'vision_unsupported'}
            {t('chat.kimiVisionUnsupported')}
          {:else if C.gatewayOk === false && C.chatBackend !== 'kimi'}
            {t('chat.gatewayDown')}
          {:else}
            {t('chat.genError')}
          {/if}
        </p>
        {#if message.error !== 'kimi_not_configured' && message.error !== 'not_configured' && message.error !== 'kimi_vision_unsupported' && message.error !== 'vision_unsupported'}
          <p class="error-detail">{message.error}</p>
        {/if}
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
            <span class="branch-count"
              >{turnUser.active + 1}/{turnUser.count}</span
            >
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
            <Icon
              name={copied ? 'check' : 'copy'}
              size={14}
              strokeWidth={1.75}
            />
          </button>
          <button
            type="button"
            class:speaking={ttsState === 'playing' || ttsState === 'paused'}
            class:tts-loading={ttsState === 'loading'}
            title={ttsState === 'loading'
              ? t('chat.preparingSpeech')
              : ttsState !== 'idle'
                ? t('chat.stopSpeaking')
                : t('chat.readAloud')}
            aria-label={ttsState === 'loading'
              ? t('chat.preparingSpeech')
              : ttsState !== 'idle'
                ? t('chat.stopSpeaking')
                : t('chat.readAloud')}
            aria-pressed={ttsState !== 'idle'}
            onclick={toggleSpeak}
          >
            <Icon
              name={ttsState === 'loading'
                ? 'loader'
                : ttsState !== 'idle'
                  ? 'stop'
                  : 'speaker'}
              size={14}
              strokeWidth={1.75}
              class={ttsState === 'loading' ? 'life-os-spin' : undefined}
            />
          </button>
          {#if ttsState === 'playing' || ttsState === 'paused'}
            <button
              type="button"
              class="speaking"
              title={ttsState === 'paused'
                ? t('chat.resumeSpeaking')
                : t('chat.pauseSpeaking')}
              aria-label={ttsState === 'paused'
                ? t('chat.resumeSpeaking')
                : t('chat.pauseSpeaking')}
              onclick={togglePause}
            >
              <Icon
                name={ttsState === 'paused' ? 'play' : 'pause'}
                size={14}
                strokeWidth={1.75}
              />
            </button>
            <button
              type="button"
              class="tts-rate speaking"
              title={t('chat.playbackSpeed')}
              aria-label={`${t('chat.playbackSpeed')} ${fmtRate(S.settings.ttsRate)}`}
              onclick={cycleRate}
            >
              {fmtRate(S.settings.ttsRate)}
            </button>
            {#if ttsTotal > 1}
              <span
                class="tts-progress"
                role="progressbar"
                aria-valuemin="1"
                aria-valuemax={ttsTotal}
                aria-valuenow={ttsIndex + 1}
                aria-label={t('chat.readingProgress')}
                title={`${ttsIndex + 1} / ${ttsTotal}`}
              >
                <span
                  class="tts-progress-bar"
                  style="--p:{(ttsIndex + 1) / ttsTotal}"
                ></span>
                <span class="tts-progress-num">{ttsIndex + 1}/{ttsTotal}</span>
              </span>
            {/if}
          {/if}
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
          <span class="duration">{(message.durationMs / 1000).toFixed(1)}s</span
          >
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
    max-width: min(72%, 520px);
    background: color-mix(in srgb, var(--card) 88%, var(--bg));
    color: var(--t1);
    padding: 9px 14px;
    border-radius: 18px;
    font-size: 15px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .user-actions {
    display: flex;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease, ease);
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
    font-size: max(16px, var(--text-base, 15px));
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
    padding: 5px 10px 5px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-2);
    color: var(--t2);
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    list-style: none;
    user-select: none;
    transition:
      border-color var(--dur-fast) var(--ease-standard),
      background var(--dur-fast) var(--ease-standard),
      color var(--dur-fast) var(--ease-standard);
  }
  .tool summary::-webkit-details-marker {
    display: none;
  }
  .tool summary:hover {
    border-color: var(--border-l);
    background: var(--card);
    color: var(--t1);
  }
  .tool-icon {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--card);
    color: var(--t2);
  }
  .tool summary:hover .tool-icon {
    background: var(--card-h);
    color: var(--t1);
  }
  /* 折叠箭头:静止淡色,展开时旋转 180°(对齐 ChatGPT/Claude 的可展开工具卡) */
  .tool-chevron {
    display: inline-flex;
    color: var(--t3);
    transition: transform var(--dur-fast) var(--ease-standard);
  }
  .tool[open] > summary .tool-chevron {
    transform: rotate(180deg);
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--t3);
    font-size: var(--text-xs, 11px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sources-count {
    display: inline-grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--card);
    color: var(--t2);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0;
  }
  .sources-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .source-card {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 240px;
    padding: 6px 12px 6px 7px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
    color: var(--t2);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    transition:
      border-color var(--dur-fast) var(--ease-standard),
      background var(--dur-fast) var(--ease-standard),
      color var(--dur-fast) var(--ease-standard);
  }
  .source-card:hover {
    border-color: var(--border-l);
    background: var(--card);
    color: var(--t1);
  }
  /* favicon 式站点小图:隐私上不拉取网络 favicon,用域名首字母单字。
     配色贴合无彩色品牌——只掺一丝按域名散列的色相,既能区分来源又不喧宾夺主。 */
  .source-dot {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: 6px;
    background: color-mix(in srgb, hsl(var(--hue) 45% 50%) 16%, var(--card));
    color: var(--t1);
    font-size: 11px;
    font-weight: 650;
    line-height: 1;
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
    transition: width 600ms var(--ease-standard);
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
    padding: 0.5em 0.9em;
    border-inline-start: 3px solid var(--border-l);
    border-radius: 0 8px 8px 0;
    background: var(--bg-2);
    color: var(--t2);
  }
  .md :global(blockquote > :last-child) {
    margin-bottom: 0;
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
    transition: transform var(--dur-fast) var(--ease, ease);
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
    transition: background var(--dur-fast) var(--ease, ease);
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
    transition: opacity var(--dur-fast) var(--ease, ease);
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
  /* 等首块音频到达:图标旋转（.life-os-spin）表明「正在准备」而非卡住 */
  .actions button.tts-loading {
    color: var(--t1);
    opacity: 1;
  }
  .actions button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .row.assistant:has(.actions button.speaking) .actions,
  .row.assistant:has(.actions button.tts-loading) .actions {
    opacity: 1;
  }
  /* 变速按钮:显示当前倍率(1×/1.5×…),等宽数字免抖动 */
  .actions button.tts-rate {
    width: auto;
    padding: 0 6px;
    font-size: var(--text-xs, 11px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  /* 朗读进度:按句推进的细条 + N/总 计数,契合逐句合成架构(不伪造时间轴) */
  .actions .tts-progress {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    opacity: 1;
    cursor: default;
  }
  .actions .tts-progress-bar {
    position: relative;
    width: 28px;
    height: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--t3) 40%, transparent);
    overflow: hidden;
  }
  .actions .tts-progress-bar::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: scaleX(var(--p, 0));
    transform-origin: left;
    background: var(--accent, currentColor);
    border-radius: 2px;
    transition: transform var(--dur-base) var(--ease-standard);
  }
  .actions .tts-progress-num {
    font-size: var(--text-xs, 11px);
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }
  /* 逐句跟读高亮(CSS Custom Highlight API,不改 DOM) */
  ::highlight(tts) {
    background-color: color-mix(
      in srgb,
      var(--accent, #4a9eff) 26%,
      transparent
    );
    color: var(--t1);
  }
  /* 读屏专用:视觉隐藏但仍在无障碍树内 */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
