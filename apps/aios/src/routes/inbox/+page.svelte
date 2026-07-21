<script>
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import {
    CONTROL,
    refreshControlCenter,
  } from '$lib/kenos/controlCenter.svelte.js'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import {
    formatQueueCountLabel,
    summarizeControlQueue,
  } from '$lib/kenos/controlCenter.core.js'
  import { PRODUCT_COPY } from '$lib/kenos/productStates.core.js'
  import { resolveProductSessionState } from '$lib/kenos/productSessionState.core.js'
  import { CLOUD, isCloudAuthorized } from '$lib/cloud.svelte.js'
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
  const session = $derived(
    resolveProductSessionState({
      cloudReady: CLOUD.ready,
      cloudUser: CLOUD.user,
      cloudAuthorized: isCloudAuthorized(),
      cloudSyncing: CLOUD.syncing,
      cloudLastSyncAt: CLOUD.lastSyncAt,
      controlLoading: CONTROL.loading,
      sources: CONTROL.sources,
    }),
  )
  const hash = $derived(page.url.hash.replace('#', ''))
  /** Action axis: all | confirm | filter (approve lives on /approvals). */
  const axis = $derived(
    hash === 'confirm' || hash === 'review'
      ? 'confirm'
      : hash === 'filter' || hash === 'capture'
        ? 'filter'
        : 'all',
  )

  /** Only true auth lock — never treat loading / offline as “need login”. */
  const inboxLocked = $derived(
    session.inboxSyncState === 'locked' || session.needsSignIn,
  )
  const inboxSyncing = $derived(session.inboxSyncState === 'syncing')

  const captureListEnabled =
    isCaptureIngestWriterEnabled() || isCaptureConvertWriterEnabled()
  const convertEnabled = isCaptureConvertWriterEnabled()

  /** @type {Array<{ id: string, status: string, text: string, capturedAt: string | null }>} */
  let envelopes = $state([])
  let envelopesLoading = $state(false)
  let envelopesError = $state('')
  let convertingId = $state(/** @type {string | null} */ (null))
  let convertError = $state('')

  const reviewEnvelopes = $derived(
    envelopes.filter((item) => item.status === 'needs_review'),
  )
  /** Captures that still need a decision (not silent history). */
  const actionableCaptures = $derived(
    envelopes.filter((item) =>
      CONVERTIBLE_STATUSES.has(item.status) || item.status === 'needs_review',
    ),
  )

  const pendingCount = $derived(
    queue.inboxAvailable
      ? openItems.length +
          reviewEnvelopes.length +
          (queue.approvalsOpen ?? 0)
      : null,
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

  const DOMAIN_LABEL = {
    plan: '计划',
    money: '财务',
    training: '训练',
    library: '知识库',
    knowledge: '知识库',
    home: '家',
    music: '音乐',
    work: '工作',
    health: '健康',
    system: '系统',
    assistant: '助手',
  }

  function domainLabel(value) {
    const key = String(value || '').toLowerCase()
    return DOMAIN_LABEL[key] || value || '收件箱'
  }

  function relativeTime(value) {
    if (!value) return null
    const ms = Date.parse(value)
    if (!Number.isFinite(ms)) return null
    const delta = Date.now() - ms
    if (delta < 60_000) return '刚刚'
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
    return formatCapturedAt(value)
  }

  /** Impact / consequence line for Inbox rich rows (Round 3). */
  function impactLine(item) {
    if (item?.stale) return '不处理可能继续基于过期信息行动'
    const hints = Array.isArray(item?.actionHints) ? item.actionHints : []
    if (hints.includes('open_owner')) {
      return `影响：需在${domainLabel(item.ownerDomain)}确认后才会推进`
    }
    if (item?.classification === 'sensitive') {
      return '影响：涉及敏感信息，请在对应空间核对后再决定'
    }
    return '影响：搁置后这项会继续留在待处理'
  }

  function askHref(item) {
    const title = encodeURIComponent(String(item?.title || '这项收件').slice(0, 80))
    return `/assistant?q=${title}`
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
      <h1>{t('nav.inbox')}</h1>
      {#if !inboxLocked && !inboxSyncing}
        <p class="control-page-intro">
          {pendingCount == null
            ? '等待确认或批准的事项'
            : pendingCount === 0
              ? PRODUCT_COPY.todayInboxClear.detail
              : `${formatQueueCountLabel(pendingCount)} 项等待你处理`}
        </p>
      {/if}
    </div>
  </header>

  {#if !inboxLocked}
    <nav class="inbox-subnav" aria-label={t('nav.inbox')}>
      <a href="/inbox" class:active={axis === 'all'}>{t('nav.inboxAllPending')}</a>
      <a href="/inbox#confirm" class:active={axis === 'confirm'}
        >{t('nav.inboxNeedsConfirm')}</a
      >
      <a href="/approvals" class:active={page.url.pathname === '/approvals'}
        >{t('nav.inboxNeedsApprove')}</a
      >
      <details class="inbox-more" open={axis === 'filter' || undefined}>
        <summary>{t('nav.inboxFilter')}</summary>
        <div class="inbox-more-menu">
          <a href="/inbox#filter">需归位的捕获</a>
          <a href="/activity">{t('nav.activity')}</a>
        </div>
      </details>
    </nav>
  {/if}

  {#if inboxLocked}
    <div class="inbox-locked" role="status">
      <strong>{PRODUCT_COPY.permissionDenied.title}</strong>
      <p>{PRODUCT_COPY.permissionDenied.body}</p>
      <a class="control-button control-button--primary control-button--link" href="/settings#cloud"
        >{PRODUCT_COPY.permissionDenied.action}</a
      >
    </div>
  {:else if inboxSyncing}
    <p class="control-notice" role="status">正在同步收件箱…</p>
  {:else}
    <ReadSourceState
      state={CONTROL.sources.inbox}
      onRetry={() => refreshControlCenter({ force: true })}
    />
  {/if}

  {#if convertError}
    <p class="control-notice" role="alert">{convertError}</p>
  {/if}
  {#if envelopesError}
    <p class="control-notice" role="alert">{envelopesError}</p>
  {/if}

  {#if !inboxLocked && (axis === 'all' || axis === 'confirm')}
    <section
      class="control-page-section kenos-anim-chrome-enter"
      aria-labelledby="inbox-action-title"
    >
      <h2 id="inbox-action-title">
        {axis === 'confirm' ? t('nav.inboxNeedsConfirm') : t('nav.inboxAllPending')}
      </h2>

      {#if axis === 'all' || axis === 'confirm'}
        {#if captureListEnabled && reviewEnvelopes.length}
          <div class="control-list">
            {#each reviewEnvelopes as envelope (envelope.id)}
              <article class="control-row kenos-anim-list-enter">
                <div class="control-row-main">
                  <div class="control-row-meta">
                    <span class="control-row-source">捕获</span>
                    {#if envelope.capturedAt}
                      <time datetime={envelope.capturedAt}
                        >{relativeTime(envelope.capturedAt) ||
                          formatCapturedAt(envelope.capturedAt)}</time
                      >
                    {/if}
                  </div>
                  <h3>{envelope.text || '未命名捕获'}</h3>
                  <p class="control-row-why">需要你确认意图后才能安全归位</p>
                  <p class="control-row-impact">
                    影响：未确认前不会写入计划或其他空间
                  </p>
                  <p class="control-row-detail">来源 · Kenos 捕获</p>
                </div>
                <div class="control-row-actions">
                  {#if canConvert(envelope.status)}
                    <button
                      class="control-button control-button--primary"
                      type="button"
                      disabled={convertingId != null}
                      onclick={() => convertToPlan(envelope)}
                    >
                      {convertingId === envelope.id ? '处理中…' : '转为计划任务'}
                    </button>
                  {:else}
                    <a
                      class="control-button control-button--primary control-button--link"
                      href={askHref({ title: envelope.text })}
                      >确认意图</a
                    >
                  {/if}
                  <a
                    class="control-button control-button--secondary"
                    href={askHref({ title: envelope.text })}>问助手</a
                  >
                </div>
              </article>
            {/each}
          </div>
        {/if}

        {#if axis === 'all' && openItems.length}
          <div class="control-list" class:control-list--spaced={reviewEnvelopes.length > 0}>
            {#each openItems as item (item.id)}
              <article class="control-row kenos-anim-list-enter">
                <div class="control-row-main">
                  <div class="control-row-meta">
                    <span class="control-row-source"
                      >{domainLabel(item.ownerDomain ?? item.source)}</span
                    >
                    {#if item.receivedAt}
                      <time datetime={item.receivedAt}>
                        {relativeTime(item.receivedAt) ||
                          (Date.parse(item.receivedAt)
                            ? new Intl.DateTimeFormat('zh-CN', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(item.receivedAt))
                            : item.receivedAt)}
                      </time>
                    {/if}
                    {#if item.stale}<span class="control-badge control-badge--critical"
                        >需确认</span
                      >{/if}
                  </div>
                  <h3>{item.title || '未命名事项'}</h3>
                  <p class="control-row-why">
                    {item.stale
                      ? '数据偏旧，需要你确认是否仍有效'
                      : item.safeSummary || item.detail || '等待你决定如何归位'}
                  </p>
                  <p class="control-row-impact">{impactLine(item)}</p>
                </div>
                <div class="control-row-actions">
                  {#if item.deepLink}
                    <a
                      class="control-button control-button--primary control-button--link"
                      href={item.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.actionHints?.includes('open_owner')
                        ? '查看详情'
                        : '处理'}
                    </a>
                  {:else}
                    <a
                      class="control-button control-button--primary control-button--link"
                      href={askHref(item)}>确认归位</a
                    >
                  {/if}
                  <a
                    class="control-button control-button--secondary"
                    href={askHref(item)}>问助手</a
                  >
                </div>
              </article>
            {/each}
          </div>
        {/if}

        {#if axis === 'all'}
          <div class="inbox-crosslinks">
            <a class="queue-link" href="/approvals">
              <span>{t('nav.inboxNeedsApprove')}</span>
              <strong>{formatQueueCountLabel(queue.approvalsOpen)}</strong>
              <small>需要你确认范围与影响</small>
            </a>
          </div>
        {/if}

        {#if !reviewEnvelopes.length && !(axis === 'all' && openItems.length) && !envelopesLoading}
          <div class="control-empty">
            <strong>{PRODUCT_COPY.todayInboxClear.title}</strong>
            {PRODUCT_COPY.todayInboxClear.detail}
          </div>
        {/if}
      {/if}
    </section>
  {/if}

  {#if !inboxLocked && axis === 'filter'}
    <section
      id="filter"
      class="control-page-section kenos-anim-chrome-enter"
      aria-labelledby="inbox-filter-title"
    >
      <h2 id="inbox-filter-title">需归位的捕获</h2>
      {#if captureListEnabled}
        {#if actionableCaptures.length}
          <div class="control-list">
            {#each actionableCaptures as envelope (envelope.id)}
              <article class="control-row kenos-anim-list-enter">
                <div class="control-row-main">
                  <div class="control-row-meta">
                    <span class="control-row-source">捕获</span>
                    {#if envelope.capturedAt}
                      <time datetime={envelope.capturedAt}
                        >{formatCapturedAt(envelope.capturedAt)}</time
                      >
                    {/if}
                  </div>
                  <h3>{envelope.text || '未命名捕获'}</h3>
                  <p class="control-row-why">
                    {envelope.status === 'needs_review'
                      ? '需要你确认意图后才能安全归位'
                      : envelope.status === 'safely_persisted'
                        ? '已保存，可转为计划任务'
                        : '已捕获，等待归位'}
                  </p>
                </div>
                <div class="control-row-actions">
                  {#if canConvert(envelope.status)}
                    <button
                      class="control-button control-button--primary"
                      type="button"
                      disabled={convertingId != null}
                      onclick={() => convertToPlan(envelope)}
                    >
                      {convertingId === envelope.id ? '处理中…' : '转为计划任务'}
                    </button>
                  {/if}
                  <a class="control-button control-button--secondary" href="/assistant"
                    >问助手</a
                  >
                </div>
              </article>
            {/each}
          </div>
        {:else if !envelopesLoading}
          <p class="control-notice" role="status">没有需要归位的捕获。</p>
        {/if}
      {:else}
        <p class="control-notice" role="status">
          捕获历史可在「动态」中查看。收件箱只保留需要你处理的事项。
        </p>
      {/if}
      <div class="inbox-crosslinks">
        <a class="queue-link" href="/activity">
          <span>{t('nav.activity')}</span>
          <strong>{formatQueueCountLabel(queue.activityFailures)}</strong>
          <small>失败或需要恢复的动作</small>
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  .inbox-subnav {
    margin: 16px 0 4px;
    align-items: stretch;
  }
  .inbox-subnav a {
    min-height: 44px;
    padding: 0 12px;
    border-radius: 0;
    border: 0;
    color: var(--t2);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    font-size: var(--text-sm);
    background: transparent;
  }
  .inbox-subnav a.active {
    color: var(--t1);
    border-bottom: 2px solid var(--t1);
    background: transparent;
    font-weight: 620;
  }
  .inbox-more {
    position: relative;
    margin-left: auto;
  }
  .inbox-more summary {
    list-style: none;
    min-height: 44px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-meta, 12px);
    font-weight: 560;
    cursor: pointer;
  }
  .inbox-more summary::-webkit-details-marker {
    display: none;
  }
  .inbox-more-menu {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 5;
    min-width: 8rem;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card, var(--bg));
    box-shadow: 0 8px 24px color-mix(in srgb, #000 12%, transparent);
  }
  .inbox-more-menu a {
    width: 100%;
    border-bottom: 0 !important;
    border-radius: 8px;
    font-size: 13px;
  }
  .inbox-more-menu a:hover {
    background: color-mix(in srgb, var(--t1) 6%, transparent);
  }
  .inbox-locked {
    margin-top: 16px;
    padding: 16px 14px;
    border-radius: var(--kenos-radius-group, 12px);
    background: var(--kenos-surface-group, var(--card));
    border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
    display: grid;
    gap: 8px;
  }
  .inbox-locked strong {
    color: var(--t1);
    font-size: 1.05rem;
  }
  .inbox-locked p {
    margin: 0;
    color: var(--t2);
    font-size: 15px;
    line-height: 1.45;
  }
  .control-list--spaced {
    margin-top: 12px;
  }
  .inbox-crosslinks {
    display: grid;
    gap: 10px;
    margin-top: 16px;
  }
  :global(html[data-ios-native-shell='true'] .control-page-intro) {
    font-size: 15px;
    line-height: 1.45;
    color: var(--t2);
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
    background: var(--kenos-surface-group, var(--card));
  }
  .queue-link strong {
    grid-row: 1 / span 2;
    align-self: center;
    font-size: 1.25rem;
  }
  .queue-link small {
    color: var(--t2);
    font-size: 13px;
  }
</style>
