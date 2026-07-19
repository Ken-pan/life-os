<script>
  import { onMount } from 'svelte'
  import {
    CONTROL,
    refreshControlCenter,
    retryDemoActivity,
  } from '$lib/kenos/controlCenter.svelte.js'
  import { sortActivityNewestFirst } from '$lib/kenos/controlCenter.core.js'

  const activities = $derived(sortActivityNewestFirst(CONTROL.activities))

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
      <p class="control-page-kicker">Audit and recovery</p>
      <h1>Activity</h1>
      <p class="control-page-intro">
        系统做过什么、为什么失败、数据是否安全，以及下一步如何恢复。
      </p>
    </div>
    {#if CONTROL.demo}<span class="control-badge">本地演示</span>{/if}
  </header>

  <p class="control-notice">
    Production Activity reader 尚未批准接线；敏感 payload 不在此处复制展示。
  </p>

  <section class="control-page-section" aria-labelledby="activity-recent-title">
    <h2 id="activity-recent-title">最近记录</h2>
    {#if activities.length}
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
                <span>{item.occurredLabel}</span>
              </div>
              <h3>{item.summary}</h3>
              <p class="control-row-detail">{item.result}</p>
              <p class="control-row-detail">执行者：{item.source}</p>
            </div>
            {#if item.status === 'failed' && item.retryable}
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
        生产 Activity 仍留在原有执行边界，直到读取权限和 UI redaction 完成人工评审。
      </div>
    {/if}
  </section>
</div>
