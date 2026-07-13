<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { P, closePanel } from '$lib/panel.svelte.js'
  import { renderMarkdown, highlightCode } from '$lib/markdown.js'
  import { fetchUrl } from '$lib/tools.js'
  import { getBlob } from '$lib/fileImport.js'
  import { CLOUD, uploadConversationImage } from '$lib/cloud.svelte.js'

  let copied = $state(false)
  let readerLoading = $state(false)
  let readerError = $state('')
  let embedMode = $state(false) // url 模式:阅读模式 ⇄ 内嵌网页

  /* —— 生成图按需上传到云端 —— */
  let uploading = $state(false)
  // 该图是否已在云端(打开时带 cloudPath,或本次上传成功)
  const imageBacked = $derived(!!P.imageRef?.cloudPath)
  // 可上传:登录了 + 有本地生成图 ref + 尚未备份
  const canUpload = $derived(
    P.kind === 'image' && !!CLOUD.user && !!P.imageRef?.dataUrl && !imageBacked,
  )
  async function uploadImage() {
    if (!P.imageRef || uploading) return
    uploading = true
    try {
      const path = await uploadConversationImage(
        P.imageRef.conversationId,
        P.imageRef.tcId,
        P.imageRef.index,
        P.imageRef.dataUrl,
      )
      P.imageRef = { ...P.imageRef, cloudPath: path }
    } catch {
      /* 失败保持可重试;错误已进 CLOUD.error */
    } finally {
      uploading = false
    }
  }

  const panelIcon = $derived(
    { artifact: 'eye', code: 'code', url: 'globe', file: 'file', image: 'image' }[P.kind] ?? 'eye',
  )

  /* —— 文件类附件的富预览:PDF 原生查看器 / 音频播放器(会话内存 blob)—— */
  let blobUrl = $state('')
  $effect(() => {
    if (!P.open || P.kind !== 'file' || !P.blobId) {
      blobUrl = ''
      return
    }
    const blob = getBlob(P.blobId)
    if (!blob) {
      blobUrl = ''
      return
    }
    const url = URL.createObjectURL(blob)
    blobUrl = url
    return () => URL.revokeObjectURL(url)
  })

  const fileKind = $derived(P.kind === 'file' ? (P.fileKind ?? 'text') : null)
  const showPdf = $derived(fileKind === 'pdf' && blobUrl && P.view === 'preview')
  const showAudio = $derived(fileKind === 'audio' && blobUrl)

  /** CSV/TSV → 表格数据(简单引号感知,截 200 行 × 24 列) */
  const csvTable = $derived.by(() => {
    if (fileKind !== 'csv' || !P.text) return null
    const delimiter = P.text.includes('\t') ? '\t' : ','
    const rows = []
    for (const line of P.text.split('\n').slice(0, 200)) {
      if (!line.trim()) continue
      const cells = []
      let cur = ''
      let quoted = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"'
            i++
          } else if (ch === '"') {
            quoted = false
          } else {
            cur += ch
          }
        } else if (ch === '"') {
          quoted = true
        } else if (ch === delimiter) {
          cells.push(cur)
          cur = ''
        } else {
          cur += ch
        }
      }
      cells.push(cur)
      rows.push(cells.slice(0, 24))
    }
    return rows.length ? rows : null
  })

  const jsonPretty = $derived.by(() => {
    if (fileKind !== 'json' || !P.text) return ''
    try {
      return JSON.stringify(JSON.parse(P.text), null, 2)
    } catch {
      return ''
    }
  })

  /** artifact 预览文档(HTML 直接渲染,SVG/片段自动包壳) */
  const srcdoc = $derived.by(() => {
    if (P.kind !== 'artifact') return ''
    const code = P.code
    if (/<html[\s>]/i.test(code)) return code
    return `<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:system-ui;display:grid;place-items:center;min-height:100vh}</style><body>${code}`
  })

  const bodyHtml = $derived.by(() => {
    if (P.kind === 'url') return renderMarkdown(P.text)
    if (P.kind === 'file') {
      if (/\.(md|markdown)$/i.test(P.name)) return renderMarkdown(P.text)
      return ''
    }
    return ''
  })

  const codeHtml = $derived.by(() => {
    if (P.kind === 'artifact' || P.kind === 'code') {
      return highlightCode(P.code, P.lang)
    }
    if (P.kind === 'file' && !bodyHtml) {
      if (fileKind === 'json') return highlightCode(jsonPretty || P.text, 'json')
      const ext = P.name.split('.').pop()?.toLowerCase() ?? ''
      return highlightCode(P.text, ext)
    }
    return ''
  })

  // url 模式:没有预置正文时用阅读模式抓取
  $effect(() => {
    if (!P.open || P.kind !== 'url' || P.text || !P.url) return
    const url = P.url
    readerLoading = true
    readerError = ''
    fetchUrl(url)
      .then((text) => {
        if (P.url === url) P.text = text
      })
      .catch((err) => {
        if (P.url === url) readerError = String(err?.message ?? err)
      })
      .finally(() => {
        if (P.url === url) readerLoading = false
      })
  })

  $effect(() => {
    void P.url
    embedMode = false
  })

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(P.code || P.text)
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      /* ignore */
    }
  }

  function download() {
    const ext =
      P.kind === 'file'
        ? ''
        : { html: '.html', svg: '.svg', xml: '.xml' }[P.lang] ?? `.${P.lang || 'txt'}`
    const name = P.kind === 'file' ? P.name : `aios-artifact${ext}`
    const blob = new Blob([P.code || P.text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && P.open) closePanel()
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if P.open}
  <aside class="panel" aria-label={P.title}>
    <header class="panel-head">
      <span class="panel-title">
        <Icon name={panelIcon} size={15} strokeWidth={1.9} />
        <span class="panel-title-text">{P.title}</span>
      </span>
      <span class="panel-actions">
        {#if P.kind === 'artifact'}
          <span class="view-seg" role="group">
            <button
              type="button"
              class:on={P.view === 'preview'}
              onclick={() => (P.view = 'preview')}
            >
              {t('panel.preview')}
            </button>
            <button
              type="button"
              class:on={P.view === 'code'}
              onclick={() => (P.view = 'code')}
            >
              {t('panel.code')}
            </button>
          </span>
        {/if}
        {#if P.kind === 'url'}
          <button
            type="button"
            class="head-btn"
            class:on={embedMode}
            title={t('panel.embed')}
            aria-label={t('panel.embed')}
            aria-pressed={embedMode}
            onclick={() => (embedMode = !embedMode)}
          >
            <Icon name="globe" size={15} strokeWidth={1.9} />
          </button>
          <a
            class="head-btn"
            href={P.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t('panel.openExternal')}
            aria-label={t('panel.openExternal')}
          >
            <Icon name="external" size={15} strokeWidth={1.9} />
          </a>
        {/if}
        {#if P.kind === 'image'}
          {#if canUpload}
            <button
              type="button"
              class="head-btn"
              disabled={uploading}
              title={t('panel.uploadToCloud')}
              aria-label={t('panel.uploadToCloud')}
              onclick={uploadImage}
            >
              <Icon name={uploading ? 'refresh' : 'cloud-upload'} size={15} strokeWidth={1.9} />
            </button>
          {:else if imageBacked}
            <span class="head-btn backed" title={t('panel.cloudBacked')} aria-hidden="true">
              <Icon name="cloud-check" size={15} strokeWidth={1.9} />
            </span>
          {/if}
          <a
            class="head-btn"
            href={P.url}
            download="aios-image.webp"
            title={t('panel.download')}
            aria-label={t('panel.download')}
          >
            <Icon name="download" size={15} strokeWidth={1.9} />
          </a>
        {/if}
        {#if P.code || P.text}
          <button
            type="button"
            class="head-btn"
            title={copied ? t('chat.copied') : t('chat.copy')}
            aria-label={copied ? t('chat.copied') : t('chat.copy')}
            onclick={copyContent}
          >
            <Icon name={copied ? 'check' : 'copy'} size={15} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            class="head-btn"
            title={t('panel.download')}
            aria-label={t('panel.download')}
            onclick={download}
          >
            <Icon name="download" size={15} strokeWidth={1.9} />
          </button>
        {/if}
        <button
          type="button"
          class="head-btn"
          title={t('panel.close')}
          aria-label={t('panel.close')}
          onclick={closePanel}
        >
          <Icon name="x" size={16} strokeWidth={2} />
        </button>
      </span>
    </header>

    <div
      class="panel-body"
      class:flush={(P.kind === 'artifact' && P.view === 'preview') || showPdf}
    >
      {#if P.kind === 'image'}
        <div class="image-view">
          <img src={P.url} alt={P.title} />
        </div>
      {:else if P.kind === 'artifact' && P.view === 'preview'}
        <iframe class="frame" sandbox="allow-scripts" {srcdoc} title={P.title}></iframe>
      {:else if showPdf}
        <!-- Chrome 原生 PDF 查看器(会话内存 blob;刷新后自动降级为文本) -->
        <iframe class="frame" src={blobUrl} title={P.title}></iframe>
      {:else if showAudio}
        <div class="audio-view">
          <audio controls src={blobUrl}></audio>
          <p class="transcript-label">{t('panel.transcript')}</p>
          <p class="transcript">{P.text}</p>
        </div>
      {:else if csvTable}
        <div class="csv-wrap">
          <table>
            <thead>
              <tr>
                {#each csvTable[0] as cell, i (i)}<th>{cell}</th>{/each}
              </tr>
            </thead>
            <tbody>
              {#each csvTable.slice(1) as row, ri (ri)}
                <tr>
                  {#each row as cell, ci (ci)}<td>{cell}</td>{/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if P.kind === 'url'}
        {#if embedMode}
          <iframe
            class="frame"
            src={P.url}
            title={P.title}
            referrerpolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          ></iframe>
        {:else if readerLoading}
          <p class="panel-note">{t('panel.loading')}</p>
        {:else if readerError}
          <p class="panel-note">{t('panel.readerError')}({readerError})</p>
        {:else}
          <p class="panel-url">{P.url}</p>
          <div class="md-body">
            <!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown 全量转义 -->
            {@html bodyHtml}
          </div>
        {/if}
      {:else if bodyHtml}
        <div class="md-body">
          <!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown 全量转义 -->
          {@html bodyHtml}
        </div>
      {:else}
        <pre class="code-body"><code
            ><!-- eslint-disable-next-line svelte/no-at-html-tags — highlightCode 全量转义 -->{@html codeHtml}</code
          ></pre>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg);
    border-inline-start: 1px solid var(--border);
  }

  /* 桌面:分栏;移动:全屏覆盖 */
  @media (min-width: 840px) {
    .panel {
      flex: 0 0 min(46%, 720px);
      max-width: min(46%, 720px);
    }
  }
  @media (max-width: 839px) {
    .panel {
      position: fixed;
      inset: 0;
      z-index: var(--z-sheet, 60);
      border-inline-start: none;
      padding-top: var(--safe-top-effective, 0px);
    }
  }

  .panel-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    border-bottom: 1px solid var(--border);
  }
  .panel-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--t1);
    font-size: var(--text-sm, 13px);
    font-weight: 600;
  }
  .panel-title :global(svg) {
    color: var(--t3);
    flex: 0 0 auto;
  }
  .panel-title-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .panel-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  .head-btn {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }
  .head-btn:hover {
    background: var(--card);
    color: var(--t1);
  }
  .head-btn.on {
    background: var(--accent-bg);
    color: var(--t1);
  }

  .view-seg {
    display: inline-flex;
    background: var(--card);
    border-radius: 999px;
    padding: 2px;
    margin-inline-end: 4px;
  }
  .view-seg button {
    border: none;
    background: transparent;
    color: var(--t2);
    font-size: var(--text-xs, 12px);
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
  }
  .view-seg button.on {
    background: var(--bg);
    color: var(--t1);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px;
  }
  .panel-body.flush {
    padding: 0;
    overflow: hidden;
    display: flex;
  }

  .frame {
    width: 100%;
    height: 100%;
    flex: 1;
    border: none;
    background: #fff;
  }

  /* 生成图片查看 */
  .image-view {
    display: grid;
    place-items: center;
    min-height: 100%;
  }
  .image-view img {
    max-width: 100%;
    max-height: calc(100vh - 120px);
    border-radius: 12px;
    display: block;
  }
  .panel-body:not(.flush) .frame {
    min-height: 100%;
  }

  .panel-note {
    color: var(--t3);
    font-size: var(--text-sm, 13px);
  }
  .panel-url {
    margin: 0 0 12px;
    font-size: var(--text-xs, 11px);
    color: var(--t3);
    font-family: var(--mono, ui-monospace, monospace);
    overflow-wrap: anywhere;
  }

  /* —— 音频附件 —— */
  .audio-view {
    display: grid;
    gap: 12px;
  }
  .audio-view audio {
    width: 100%;
  }
  .transcript-label {
    margin: 0;
    font-size: var(--text-xs, 11px);
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .transcript {
    margin: 0;
    color: var(--t1);
    font-size: var(--text-base, 15px);
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* —— CSV 表格 —— */
  .csv-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .csv-wrap table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-sm, 13px);
  }
  .csv-wrap th,
  .csv-wrap td {
    text-align: start;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--t1);
  }
  .csv-wrap th {
    position: sticky;
    top: 0;
    background: var(--bg-2);
    font-weight: 600;
    color: var(--t2);
  }
  .csv-wrap tr:last-child td {
    border-bottom: none;
  }

  .code-body {
    margin: 0;
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--t1);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .code-body :global(.tok-cmt) {
    color: var(--t4);
    font-style: italic;
  }
  .code-body :global(.tok-str) {
    color: var(--t2);
  }
  .code-body :global(.tok-num) {
    color: var(--t2);
    font-weight: 600;
  }
  .code-body :global(.tok-kw) {
    color: var(--t1);
    font-weight: 700;
  }

  /* 阅读模式正文(复用 Message 的 markdown 视觉,精简) */
  .md-body {
    color: var(--t1);
    font-size: var(--text-base, 15px);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .md-body :global(p) {
    margin: 0 0 0.8em;
  }
  .md-body :global(h3),
  .md-body :global(h4) {
    margin: 1.2em 0 0.5em;
    line-height: 1.3;
  }
  .md-body :global(ul),
  .md-body :global(ol) {
    margin: 0 0 0.8em;
    padding-inline-start: 1.4em;
  }
  .md-body :global(a) {
    color: var(--t1);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .md-body :global(code) {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.86em;
    background: var(--card);
    border-radius: 5px;
    padding: 0.1em 0.35em;
  }
  .md-body :global(pre) {
    padding: 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow-x: auto;
  }
  .md-body :global(.md-code-head) {
    display: none;
  }
</style>
