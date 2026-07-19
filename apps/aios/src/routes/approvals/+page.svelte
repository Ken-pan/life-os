<script>
  import { onMount } from 'svelte'
  import {
    CONTROL,
    refreshControlCenter,
    resolveDemoApproval,
  } from '$lib/kenos/controlCenter.svelte.js'

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

  <p class="control-notice">
    Production approval executor 保持关闭。下面的按钮仅演练 UI 状态，不调用 command handler。
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
                <span>{item.actionType}</span>
                <span>{item.requestedAt}</span>
              </div>
              <h3>{item.summary}</h3>
              <ul class="impact-list">
                {#each item.impact as impact}
                  <li>{impact}</li>
                {/each}
              </ul>
              <p class="control-row-detail">来源：{item.source}</p>
            </div>
            <div class="control-row-actions">
              <button
                class="control-button"
                type="button"
                onclick={() => resolveDemoApproval(item.id, 'rejected')}
              >拒绝</button>
              <button
                class="control-button control-button--primary"
                type="button"
                onclick={() => resolveDemoApproval(item.id, 'approved')}
              >确认演练</button>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="control-empty">
        <strong>没有待批准动作</strong>
        R2–R4 请求在接入生产 executor 前继续 fail closed。
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
