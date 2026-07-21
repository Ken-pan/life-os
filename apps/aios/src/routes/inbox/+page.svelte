<script>
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import {
    CONTROL,
    refreshControlCenter,
  } from '$lib/kenos/controlCenter.svelte.js'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import {
    formatQueueCount,
    summarizeControlQueue,
  } from '$lib/kenos/controlCenter.core.js'
  import { t } from '$lib/i18n/index.js'
  import { lifeOsReadClient } from '$lib/lifeos.js'
  import { isCaptureIngestWriterEnabled } from '$lib/kenos/captureWriters.core.js'
  import { isCaptureConvertWriterEnabled } from '$lib/kenos/captureConvertWriters.core.js'
  import { convertCaptureViaHostedKenosWriter } from '$lib/kenos/captureConvertWriters.host.js'
  import { listCaptureEnvelopes } from '$lib/kenos/captureReadSource.core.js'

  const CONVERTIBLE_STATUSES = new Set([
    'needs_review',
    'classified',
    'safely_persisted',
  ])

  const openItems = $derived(
    CONTROL.inbox.filter((item) => item.status === 'open'),
  )
  const queue = $derived(summarizeControlQueue(CONTROL))
  const openCountLabel = $derived(
    queue.inboxAvailable ? String(openItems.length) : '—',
  )
  const hash = $derived(page.url.hash.replace('#', ''))

  const captureListEnabled =
    isCaptureIngestWriterEnabled() || isCaptureConvertWriterEnabled()
  const convertEnabled = isCaptureConvertWriterEnabled()

  /** @type {Array<{ id: string, status: string, text: string, capturedAt: string | null }>} */
  let envelopes = $state([])
  let envelopesLoading = $state(false)
  let envelopesError = $state('')
  let convertingId = $state(/** @type {string | null} */ (null))
  let convertError = $state('')

  const captureEnvelopes = $derived(
    envelopes.filter((item) => item.status !== 'needs_review'),
  )
  const reviewEnvelopes = $derived(
    envelopes.filter((item) => item.status === 'needs_review'),
  )

  function formatCapturedAt(value) {
    if (!value) return null
    const ms = Date.parse(value)
    if (!Number.isFinite(ms)) return value
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms))
  }

  function canConvert(status) {
    return convertEnabled && CONVERTIBLE_STATUSES.has(status)
  }

  async function loadEnvelopes() {
    if (!captureListEnabled) return
    envelopesLoading = true
    envelopesError = ''
    try {
      envelopes = await listCaptureEnvelopes({
        client: lifeOsReadClient(),
        limit: 50,
      })
    } catch (error) {
      envelopesError = error instanceof Error ? error.message : String(error)
    } finally {
      envelopesLoading = false
    }
  }

  /**
   * @param {{ id: string, text: string, status: string }} envelope
   */
  async function convertToPlan(envelope) {
    if (!canConvert(envelope.status) || convertingId) return
    convertingId = envelope.id
    convertError = ''
    try {
      await convertCaptureViaHostedKenosWriter({
        captureId: envelope.id,
        title: envelope.text,
      })
      await loadEnvelopes()
    } catch (error) {
      convertError = error instanceof Error ? error.message : String(error)
    } finally {
      convertingId = null
    }
  }

  onMount(() => {
    void refreshControlCenter()
    if (captureListEnabled) void loadEnvelopes()
  })
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">Inbox</p>
      <h1>Inbox</h1>
      <p class="control-page-intro">
        尚未归位、尚未决定或等待你处理的事。Capture、审批与系统活动都在这里。
      </p>
    </div>
  </header>

  <nav class="inbox-subnav" aria-label="Inbox sections">
    <a href="/inbox#capture" class:active={hash === 'capture' || hash === ''}
      >{t('nav.inboxCaptured')}</a
    >
    <a href="/inbox#review" class:active={hash === 'review'}
      >{t('nav.inboxNeedsReview')}</a
    >
    <a href="/approvals" class:active={page.url.pathname === '/approvals'}
      >{t('nav.approvals')}</a
    >
    <a href="/activity" class:active={page.url.pathname === '/activity'}
      >{t('nav.activity')}</a
    >
  </nav>

  <ReadSourceState
    state={CONTROL.sources.inbox}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  {#if convertError}
    <p class="control-notice" role="alert">{convertError}</p>
  {/if}
  {#if envelopesError}
    <p class="control-notice" role="alert">{envelopesError}</p>
  {/if}

  <section
    id="capture"
    class="control-page-section kenos-anim-chrome-enter"
    aria-labelledby="inbox-capture-title"
  >
    <h2
      id="inbox-capture-title"
      aria-label={queue.inboxAvailable
        ? `已捕获 ${openItems.length}`
        : '已捕获数量暂不可用'}
    >
      {t('nav.inboxCaptured')} · {openCountLabel}
    </h2>

    {#if captureListEnabled}
      <div class="kenos-capture-block">
        <h3 class="kenos-capture-heading">
          Kenos Capture
          {#if envelopesLoading}
            <span class="control-badge">加载中</span>
          {/if}
        </h3>
        {#if captureEnvelopes.length}
          <div class="control-list">
            {#each captureEnvelopes as envelope (envelope.id)}
              <article class="control-row kenos-anim-list-enter">
                <div class="control-row-main">
                  <div class="control-row-meta">
                    <span class="control-badge">{envelope.status}</span>
                    {#if envelope.capturedAt}
                      <time datetime={envelope.capturedAt}
                        >{formatCapturedAt(envelope.capturedAt)}</time
                      >
                    {/if}
                  </div>
                  <h3>{envelope.text || '（无文本）'}</h3>
                </div>
                {#if canConvert(envelope.status)}
                  <div class="control-row-actions">
                    <button
                      class="control-button control-button--primary"
                      type="button"
                      disabled={convertingId != null}
                      onclick={() => convertToPlan(envelope)}
                    >
                      {convertingId === envelope.id ? '转换中…' : '转为 Plan'}
                    </button>
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        {:else if !envelopesLoading}
          <p class="control-row-detail">暂无已分类或已落库的 Kenos Capture。</p>
        {/if}
      </div>
    {/if}

    {#if !queue.inboxAvailable}
      <p class="control-notice" role="status">
        Inbox 暂时无法更新；不会用空数量冒充「没有事项」。
      </p>
    {:else if openItems.length}
      <div class="control-list">
        {#each openItems as item (item.id)}
          <article class="control-row kenos-anim-list-enter">
            <div class="control-row-main">
              <div class="control-row-meta">
                <span class="control-badge"
                  >{item.ownerDomain ?? item.source}</span
                >
                {#if item.receivedAt}
                  <time datetime={item.receivedAt}>
                    {Date.parse(item.receivedAt)
                      ? new Intl.DateTimeFormat('zh-CN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(item.receivedAt))
                      : item.receivedAt}
                  </time>
                {/if}
                {#if item.stale}<span
                    class="control-badge control-badge--critical">陈旧</span
                  >{/if}
              </div>
              <h3>{item.title}</h3>
              <p class="control-row-detail">
                {item.safeSummary ?? item.detail}
              </p>
            </div>
            <div class="control-row-actions">
              {#if item.deepLink}
                <a
                  class="control-button control-button--link"
                  href={item.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  打开来源
                </a>
              {:else}
                <span class="control-link-unavailable">等待归位</span>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="control-empty">
        <strong>暂无已捕获事项</strong>
        当前没有待归位内容。
      </div>
    {/if}
  </section>

  <section
    id="review"
    class="control-page-section kenos-anim-chrome-enter"
    aria-labelledby="inbox-review-title"
  >
    <h2 id="inbox-review-title">{t('nav.inboxNeedsReview')}</h2>
    {#if captureListEnabled}
      {#if reviewEnvelopes.length}
        <div class="control-list">
          {#each reviewEnvelopes as envelope (envelope.id)}
            <article class="control-row kenos-anim-list-enter">
              <div class="control-row-main">
                <div class="control-row-meta">
                  <span class="control-badge control-badge--critical"
                    >{envelope.status}</span
                  >
                  {#if envelope.capturedAt}
                    <time datetime={envelope.capturedAt}
                      >{formatCapturedAt(envelope.capturedAt)}</time
                    >
                  {/if}
                </div>
                <h3>{envelope.text || '（无文本）'}</h3>
              </div>
              {#if canConvert(envelope.status)}
                <div class="control-row-actions">
                  <button
                    class="control-button control-button--primary"
                    type="button"
                    disabled={convertingId != null}
                    onclick={() => convertToPlan(envelope)}
                  >
                    {convertingId === envelope.id ? '转换中…' : '转为 Plan'}
                  </button>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {:else if !envelopesLoading}
        <p class="control-notice" role="status">
          暂无 needs_review 的 Kenos Capture。
        </p>
      {/if}
    {:else}
      <p class="control-notice" role="status">
        需要你确认的事项在 Approvals；系统活动在
        Updates。数量不可用时显示为「—」，不是零。
      </p>
    {/if}
  </section>

  <section
    class="control-page-section inbox-crosslinks kenos-anim-chrome-enter"
    aria-label="Related inbox queues"
  >
    <a class="queue-link" href="/approvals">
      <span>{t('nav.approvals')}</span>
      <strong>{formatQueueCount(queue.approvalsOpen)}</strong>
      <small>需要你确认的范围与影响</small>
    </a>
    <a class="queue-link" href="/activity">
      <span>{t('nav.activity')}</span>
      <strong>{formatQueueCount(queue.activityFailures)}</strong>
      <small>失败或需要恢复的动作</small>
    </a>
  </section>
</div>

<style>
  .inbox-subnav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 20px 0 8px;
  }
  .inbox-subnav a {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--border-l) 90%, transparent);
    color: var(--t2);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    font-size: var(--text-sm);
    background: transparent;
  }
  .inbox-subnav a.active {
    color: var(--t1);
    border-color: color-mix(in srgb, var(--t1) 40%, var(--border-l));
    background: color-mix(in srgb, var(--t1) 10%, transparent);
    font-weight: 600;
  }
  .kenos-capture-block {
    margin-bottom: 16px;
  }
  .kenos-capture-heading {
    margin: 0 0 10px;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--t2);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .inbox-crosslinks {
    display: grid;
    gap: 10px;
  }
  /* Title owned by KenosSystemBar on native — do not re-enlarge hidden h1. */
  :global(html[data-ios-native-shell='true'] .control-page-intro) {
    font-size: 15px;
    line-height: 1.45;
    color: color-mix(in srgb, var(--t1) 68%, transparent);
    max-width: 36rem;
  }
  :global(html[data-ios-native-shell='true'] .control-page-section) {
    margin-top: 18px;
  }
  :global(html[data-ios-native-shell='true'] .inbox-subnav) {
    margin-top: 8px;
    gap: 6px;
  }
  .queue-link {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
  }
  .queue-link strong {
    grid-row: 1 / span 2;
    align-self: center;
    font-size: 1.4rem;
  }
  .queue-link small {
    grid-column: 1;
    color: var(--t3);
  }
</style>
