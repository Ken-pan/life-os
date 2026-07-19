<script>
  import { onMount } from 'svelte'
  import { CONTROL, refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import { formatQueueCount, summarizeControlQueue } from '$lib/kenos/controlCenter.core.js'

  const openItems = $derived(CONTROL.inbox.filter((item) => item.status === 'open'))
  const queue = $derived(summarizeControlQueue(CONTROL))
  const openCountLabel = $derived(queue.inboxAvailable ? String(openItems.length) : '—')

  onMount(() => {
    void refreshControlCenter()
  })
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">Capture control</p>
      <h1>Inbox</h1>
      <p class="control-page-intro">
        外部输入先进入这里，再由用户选择归属 Space。Assistant 不替领域 Owner 写入正式对象。
      </p>
    </div>
    {#if CONTROL.demo}<span class="control-badge">本地演示</span>{/if}
  </header>

  <ReadSourceState
    state={CONTROL.sources.inbox}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  <p class="control-notice">
    只读来源为 pending life_events 与 Plan 中保留 lifeEventRef 的未完成任务；本页不会消费事件、分类或写回 Owner。
  </p>

  <section class="control-page-section" aria-labelledby="inbox-open-title">
    <h2 id="inbox-open-title" aria-label={queue.inboxAvailable ? `待分类 ${openItems.length}` : '待分类数量暂不可用'}>
      待分类 · {openCountLabel}
    </h2>
    {#if !queue.inboxAvailable}
      <p class="control-notice" role="status">Inbox 来源不可用；未将数量显示为 0。</p>
    {:else if openItems.length}
      <div class="control-list">
        {#each openItems as item (item.id)}
          <article class="control-row">
            <div class="control-row-main">
              <div class="control-row-meta">
                <span class="control-badge">{item.ownerDomain ?? item.source}</span>
                <span>{item.sourceType ?? 'local_rehearsal'}</span>
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
              <p class="control-row-detail">Owner：{item.ownerDomain ?? 'local rehearsal'} · 分类：{item.classification ?? 'demo'}</p>
            </div>
            <div class="control-row-actions">
              {#if item.deepLink}
                <a class="control-button control-button--link" href={item.deepLink} target="_blank" rel="noopener noreferrer">
                  打开 Owner
                </a>
              {:else if CONTROL.demo}
                <button class="control-button" type="button" disabled>本地演练不分类</button>
              {:else}
                <span class="control-link-unavailable">Deep link 不可用</span>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="control-empty">
        <strong>Inbox 已清空</strong>
        {CONTROL.sources.inbox.status === 'empty'
          ? '真实来源当前没有待处理项。'
          : '来源不可用时不会用演示数据冒充真实 Inbox；各领域现有 Inbox 保持不变。'}
      </div>
    {/if}
  </section>
</div>
