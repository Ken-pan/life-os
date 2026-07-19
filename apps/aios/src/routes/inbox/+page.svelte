<script>
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { CONTROL, refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import { formatQueueCount, summarizeControlQueue } from '$lib/kenos/controlCenter.core.js'
  import { t } from '$lib/i18n/index.js'

  const openItems = $derived(CONTROL.inbox.filter((item) => item.status === 'open'))
  const queue = $derived(summarizeControlQueue(CONTROL))
  const openCountLabel = $derived(queue.inboxAvailable ? String(openItems.length) : '—')
  const hash = $derived(page.url.hash.replace('#', ''))

  onMount(() => {
    void refreshControlCenter()
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
    <a href="/inbox#capture" class:active={hash === 'capture' || hash === ''}>{t('nav.inboxCaptured')}</a>
    <a href="/inbox#review" class:active={hash === 'review'}>{t('nav.inboxNeedsReview')}</a>
    <a href="/approvals" class:active={page.url.pathname === '/approvals'}>{t('nav.approvals')}</a>
    <a href="/activity" class:active={page.url.pathname === '/activity'}>{t('nav.activity')}</a>
  </nav>

  <ReadSourceState
    state={CONTROL.sources.inbox}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  <section id="capture" class="control-page-section" aria-labelledby="inbox-capture-title">
    <h2 id="inbox-capture-title" aria-label={queue.inboxAvailable ? `已捕获 ${openItems.length}` : '已捕获数量暂不可用'}>
      {t('nav.inboxCaptured')} · {openCountLabel}
    </h2>
    {#if !queue.inboxAvailable}
      <p class="control-notice" role="status">Inbox 暂时无法更新；不会用空数量冒充「没有事项」。</p>
    {:else if openItems.length}
      <div class="control-list">
        {#each openItems as item (item.id)}
          <article class="control-row">
            <div class="control-row-main">
              <div class="control-row-meta">
                <span class="control-badge">{item.ownerDomain ?? item.source}</span>
                {#if item.receivedAt}
                  <time datetime={item.receivedAt}>
                    {Date.parse(item.receivedAt)
                      ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.receivedAt))
                      : item.receivedAt}
                  </time>
                {/if}
                {#if item.stale}<span class="control-badge control-badge--critical">陈旧</span>{/if}
              </div>
              <h3>{item.title}</h3>
              <p class="control-row-detail">{item.safeSummary ?? item.detail}</p>
            </div>
            <div class="control-row-actions">
              {#if item.deepLink}
                <a class="control-button control-button--link" href={item.deepLink} target="_blank" rel="noopener noreferrer">
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

  <section id="review" class="control-page-section" aria-labelledby="inbox-review-title">
    <h2 id="inbox-review-title">{t('nav.inboxNeedsReview')}</h2>
    <p class="control-notice" role="status">
      需要你确认的事项在 Approvals；系统活动在 Updates。数量不可用时显示为「—」，不是零。
    </p>
  </section>

  <section class="control-page-section inbox-crosslinks" aria-label="Related inbox queues">
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
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border-l);
    color: var(--t2);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    font-size: var(--text-sm);
  }
  .inbox-subnav a.active {
    color: var(--t1);
    border-color: color-mix(in srgb, var(--t1) 35%, var(--border-l));
    background: color-mix(in srgb, var(--t1) 6%, transparent);
  }
  .inbox-crosslinks {
    display: grid;
    gap: 10px;
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
