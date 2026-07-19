<script>
  import { onMount } from 'svelte'
  import {
    CONTROL,
    refreshControlCenter,
    resolveDemoApproval,
  } from '$lib/kenos/controlCenter.svelte.js'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'

  const pending = $derived(CONTROL.approvals.filter((item) => item.status === 'pending'))

  onMount(() => {
    void refreshControlCenter()
  })
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">Policy gate</p>
      <h1>Approvals</h1>
      <p class="control-page-intro">
        先看风险、范围和影响，再确认。批准只授权当前请求，不给 Assistant 永久写权限。
      </p>
    </div>
    {#if CONTROL.demo}<span class="control-badge">本地演练 · 无写入</span>{/if}
  </header>

  <ReadSourceState
    state={CONTROL.sources.approvals}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  <p class="control-notice">
    Approval 契约已经冻结，但仓库没有已部署的 canonical Approval reader。Executor 保持关闭；仅在显式本地演练模式显示按钮。
  </p>

  <section class="control-page-section" aria-labelledby="approvals-pending-title">
    <h2 id="approvals-pending-title">等待你的决定 · {pending.length}</h2>
    {#if pending.length}
      <div class="control-list">
        {#each pending as item (item.id)}
          <article class="control-row">
            <div class="control-row-main">
              <div class="control-row-meta">
                <span class="control-badge control-badge--critical">{item.risk}</span>
                <span>{item.requestedOperation ?? item.actionType}</span>
                <span>{item.ownerDomain ?? item.source}</span>
                <span>{item.requestedAt}</span>
              </div>
              <h3>{item.safeImpactSummary ?? item.summary}</h3>
              {#if item.impact}
                <ul class="impact-list">
                  {#each item.impact as impact}
                    <li>{impact}</li>
                  {/each}
                </ul>
              {/if}
              <p class="control-row-detail">原因：{item.whyApprovalNeeded ?? '本地 UI 演练'}</p>
              <p class="control-row-detail">Executor：{item.executorAvailable ? '可用' : '不可用'}</p>
            </div>
            {#if CONTROL.demo}
              <div class="control-row-actions">
                <button
                  class="control-button"
                  type="button"
                  onclick={() => resolveDemoApproval(item.id, 'rejected')}
                >拒绝演练</button>
                <button
                  class="control-button control-button--primary"
                  type="button"
                  onclick={() => resolveDemoApproval(item.id, 'approved')}
                >确认演练</button>
              </div>
            {:else if item.deepLink}
              <div class="control-row-actions">
                <a class="control-button control-button--link" href={item.deepLink}>查看 Owner</a>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="control-empty">
        <strong>没有待批准动作</strong>
        {CONTROL.sources.approvals.status === 'unsupported'
          ? '没有 canonical read source，因此不推断、复制或伪造 Approval。R2–R4 继续 fail closed。'
          : '当前来源没有待批准动作。R2–R4 继续 fail closed。'}
      </div>
    {/if}
  </section>
</div>

<style>
  .impact-list {
    margin: 12px 0 0;
    padding-left: 18px;
    color: var(--t2);
    font-size: var(--text-md);
    line-height: 1.65;
  }
</style>
