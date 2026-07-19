<script>
  import { onMount } from 'svelte'
  import {
    CONTROL,
    refreshControlCenter,
    retryDemoActivity,
  } from '$lib/kenos/controlCenter.svelte.js'
  import { sortActivityNewestFirst, summarizeControlQueue, formatQueueCount } from '$lib/kenos/controlCenter.core.js'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'

  const activities = $derived(sortActivityNewestFirst(CONTROL.activities))
  const queue = $derived(summarizeControlQueue(CONTROL))
  const failureCountLabel = $derived(formatQueueCount(queue.activityFailures))

  onMount(() => {
    void refreshControlCenter()
  })

  const statusLabel = {
    succeeded: '完成',
    failed: '失败',
    queued: '已排队',
    cancelled: '已取消',
  }
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">Inbox</p>
      <h1>Activity</h1>
      <p class="control-page-intro">
        系统做过什么、哪里失败了，以及下一步如何恢复。
      </p>
    </div>
  </header>

  <nav class="inbox-subnav" aria-label="Inbox sections">
    <a href="/inbox">Captured</a>
    <a href="/approvals">Approvals</a>
    <a href="/activity" aria-current="page">Activity</a>
  </nav>

  <ReadSourceState
    state={CONTROL.sources.activity}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  <p class="control-notice">只显示安全摘要，不会复制敏感内容。</p>

  <section class="control-page-section" aria-labelledby="activity-recent-title">
    <h2
      id="activity-recent-title"
      aria-label={queue.activityAvailable ? `最近记录，失败 ${queue.activityFailures ?? 0}` : 'Activity 数量暂不可用'}
    >
      最近记录 · 失败 {failureCountLabel}
    </h2>
    {#if !queue.activityAvailable}
      <p class="control-notice" role="status">Activity 来源不可用；未将失败数显示为 0。</p>
    {:else if activities.length}
      <div class="control-list">
        {#each activities as item (item.id)}
          <article class="control-row">
            <div class="control-row-main">
              <div class="control-row-meta">
                <span
                  class="control-badge"
                  class:control-badge--failed={item.status === 'failed'}
                  class:control-badge--success={item.status === 'succeeded'}
                >{statusLabel[item.status] ?? item.status}</span>
                <span>{item.actionType}</span>
                <span>{item.ownerDomain ?? item.source}</span>
                <span>{item.occurredAt
                  ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.occurredAt))
                  : item.occurredLabel}</span>
              </div>
              <h3>{item.safeSummary ?? item.summary}</h3>
              <p class="control-row-detail">{item.resultDetail ?? item.result}</p>
              <p class="control-row-detail">执行者：{item.actor?.type ?? item.source} · 分类：{item.classification ?? 'demo'}</p>
            </div>
            {#if CONTROL.demo && item.status === 'failed' && item.retryable}
              <div class="control-row-actions">
                <button
                  class="control-button"
                  type="button"
                  onclick={() => retryDemoActivity(item.id)}
                >演练重试</button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="control-empty">
        <strong>暂无 Activity</strong>
        {CONTROL.sources.activity.status === 'empty'
          ? '真实来源当前没有 Activity。'
          : '来源不可用时不会显示硬编码 Activity；原执行边界保持不变。'}
      </div>
    {/if}
  </section>
</div>
