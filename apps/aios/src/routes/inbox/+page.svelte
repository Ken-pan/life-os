<script>
  import { onMount } from 'svelte'
  import { CONTROL, refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'

  const openItems = $derived(CONTROL.inbox.filter((item) => item.status === 'open'))

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

  <p class="control-notice">
    Production capture adapter 保持关闭；本页当前只展示本地 beta 数据，不消费或确认生产事件。
  </p>

  <section class="control-page-section" aria-labelledby="inbox-open-title">
    <h2 id="inbox-open-title">待分类 · {openItems.length}</h2>
    {#if openItems.length}
      <div class="control-list">
        {#each openItems as item (item.id)}
          <article class="control-row">
            <div class="control-row-main">
              <div class="control-row-meta">
                <span class="control-badge">{item.source}</span>
                <span>{item.receivedAt}</span>
              </div>
              <h3>{item.title}</h3>
              <p class="control-row-detail">{item.detail}</p>
            </div>
            <div class="control-row-actions">
              <button class="control-button" type="button" disabled={!CONTROL.demo}>稍后</button>
              <button class="control-button control-button--primary" type="button" disabled={!CONTROL.demo}>
                选择 Space
              </button>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="control-empty">
        <strong>Inbox 已清空</strong>
        Capture 生产读取尚未接线；各领域现有 Inbox 保持不变。
      </div>
    {/if}
  </section>
</div>
