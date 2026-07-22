<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n/index.js'
  import { CLOUD } from '$lib/cloud.svelte.js'
  import {
    CONTROL,
    refreshControlCenter,
    resolveDemoApproval,
  } from '$lib/kenos/controlCenter.svelte.js'
  import {
    isApprovalDecideWriterEnabled,
    isApprovalWriterCohortMember,
  } from '$lib/kenos/approvalWriters.core.js'
  import { decideApprovalViaHostedKenosWriter } from '$lib/kenos/approvalWriters.host.js'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import { sensory } from '@life-os/platform-web/kenos-sensory'

  const pending = $derived(
    CONTROL.approvals.filter((item) => item.status === 'pending'),
  )
  const resolved = $derived(
    CONTROL.approvals.filter((item) => item.status !== 'pending'),
  )
  const countAvailable = $derived(
    ['ready', 'empty', 'partial', 'stale'].includes(
      CONTROL.sources.approvals.status,
    ),
  )
  const decideWriterEnabled = $derived(isApprovalDecideWriterEnabled())

  let busyId = $state(/** @type {string | null} */ (null))
  let decideError = $state('')

  /**
   * @param {{ id: string }} item
   * @param {'approved' | 'rejected'} nextStatus
   */
  /**
   * @param {'approved' | 'rejected'} nextStatus
   */
  function cueDecision(nextStatus) {
    void sensory(nextStatus === 'approved' ? 'success' : 'warn')
  }

  async function decidePending(item, nextStatus) {
    if (busyId) return
    decideError = ''
    const email = CLOUD.user?.email
    if (email && !isApprovalWriterCohortMember(email)) {
      decideError = '当前账号不在 Approval decide writer cohort 内'
      return
    }

    busyId = item.id
    try {
      await decideApprovalViaHostedKenosWriter({
        approvalId: item.id,
        nextStatus,
        decisionReason:
          nextStatus === 'approved'
            ? 'Owner Inbox decide'
            : 'Owner Inbox reject',
      })
      cueDecision(nextStatus)
      await refreshControlCenter({ force: true })
    } catch (error) {
      decideError = error?.message || '审批决定失败'
      void sensory('error')
    } finally {
      busyId = null
    }
  }

  /**
   * @param {string} id
   * @param {'approved' | 'rejected'} decision
   */
  function decideDemo(id, decision) {
    if (!resolveDemoApproval(id, decision)) return
    cueDecision(decision)
  }

  onMount(() => {
    void refreshControlCenter()
  })
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">{t('nav.inbox')}</p>
      <h1>{t('nav.approvals')}</h1>
      <p class="control-page-intro">
        先看风险、范围和影响，再确认。批准只针对当前请求。
      </p>
    </div>
  </header>

  <nav class="inbox-subnav" aria-label={t('nav.inbox')}>
    <a href="/inbox">{t('nav.inboxCaptured')}</a>
    <a href="/approvals" aria-current="page">{t('nav.approvals')}</a>
    <a href="/activity">{t('nav.activity')}</a>
  </nav>

  <ReadSourceState
    state={CONTROL.sources.approvals}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  <p class="control-notice" role="status">
    {#if CONTROL.demo}
      这是本地演练：确认/拒绝不会改动真实数据，也不会自动执行已批准的动作。
    {:else if decideWriterEnabled}
      你可以在此做出决定；已批准的动作仍不会自动执行，需另行确认执行。
    {:else}
      当前为只读：确认/拒绝仅在本地演练可用，不会写入真实数据，也不会触发 Executor 自动执行。
    {/if}
  </p>

  {#if decideError}
    <p class="control-notice" role="alert">{decideError}</p>
  {/if}

  <section
    class="control-page-section"
    aria-labelledby="approvals-pending-title"
  >
    <h2 id="approvals-pending-title">
      等待你的决定 · {countAvailable ? pending.length : '暂不可用'}
    </h2>
    {#if pending.length}
      <div class="control-list">
        {#each pending as item (item.id)}
          <article
            class="control-row kenos-anim-list-enter"
            id="approval-{item.id}"
            aria-labelledby="approval-title-{item.id}"
          >
            <div class="control-row-main">
              <div class="control-row-meta">
                <span class="control-badge control-badge--critical"
                  >{item.risk}</span
                >
                <span>{item.requestedOperation ?? item.actionType}</span>
                <span
                  >{item.requestingDomain ?? item.ownerDomain ?? item.source} → System</span
                >
                {#if item.requestedAt}<time datetime={item.requestedAt}
                    >{new Intl.DateTimeFormat('zh-CN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(item.requestedAt))}</time
                  >{/if}
              </div>
              <h3 id="approval-title-{item.id}">
                {item.safeImpactSummary ?? item.summary}
              </h3>
              {#if item.impact}
                <ul class="impact-list">
                  {#each item.impact as impact (impact)}
                    <li>{impact}</li>
                  {/each}
                </ul>
              {/if}
              <p class="control-row-detail">
                原因：{item.whyApprovalNeeded ?? '本地 UI 演练'}
              </p>
              {#if item.expiresAt}<p class="control-row-detail">
                  有效期至：<time datetime={item.expiresAt}
                    >{new Intl.DateTimeFormat('zh-CN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(item.expiresAt))}</time
                  >
                </p>{/if}
              {#if item.entityReferences?.length}<p class="control-row-detail">
                  关联 {item.entityReferences.length} 个对象。
                </p>{/if}
              {#if item.executorAvailable === false}<p
                  class="control-row-detail"
                >
                  自动执行尚未开启；此处不会改动生产数据。
                </p>{/if}
            </div>
            {#if CONTROL.demo}
              <div class="control-row-actions">
                <button
                  class="control-button"
                  type="button"
                  onclick={() => decideDemo(item.id, 'rejected')}
                  >拒绝演练</button
                >
                <button
                  class="control-button control-button--primary"
                  type="button"
                  onclick={() => decideDemo(item.id, 'approved')}
                  >确认演练</button
                >
              </div>
            {:else if decideWriterEnabled}
              <div class="control-row-actions">
                <button
                  class="control-button"
                  type="button"
                  disabled={busyId != null}
                  onclick={() => decidePending(item, 'rejected')}
                  >{busyId === item.id ? '处理中…' : '拒绝'}</button
                >
                <button
                  class="control-button control-button--primary"
                  type="button"
                  disabled={busyId != null}
                  onclick={() => decidePending(item, 'approved')}
                  >{busyId === item.id ? '处理中…' : '确认'}</button
                >
              </div>
            {:else if item.ownerDeepLink}
              <div class="control-row-actions">
                <a
                  class="control-button control-button--link"
                  href={item.ownerDeepLink}>查看请求 Domain</a
                >
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="control-empty">
        <strong>没有待批准动作</strong>
        {['offline', 'unavailable', 'permission_denied'].includes(
          CONTROL.sources.approvals.status,
        )
          ? '暂时无法读取审批列表；不会用空数量冒充「没有待办」。'
          : '当前没有等待你确认的请求。'}
      </div>
    {/if}
  </section>

  {#if resolved.length}
    <section
      class="control-page-section"
      aria-labelledby="approvals-history-title"
    >
      <h2 id="approvals-history-title">已结束或已失效 · {resolved.length}</h2>
      <div class="control-list">
        {#each resolved as item (item.id)}
          <article
            class="control-row kenos-anim-list-enter"
            id="approval-{item.id}"
          >
            <div class="control-row-main">
              <div class="control-row-meta">
                <span class="control-badge">{item.status}</span>
                <span>{item.risk}</span>
                <span>{item.requestedOperation}</span>
              </div>
              <h3>{item.safeImpactSummary}</h3>
              <p class="control-row-detail">
                {item.decisionReason ??
                  (item.status === 'expired'
                    ? '已过期，不可当作已批准。'
                    : item.status === 'superseded'
                      ? '已被新的 payload-bound Approval 取代。'
                      : '状态只读；Action 执行状态不在此推断。')}
              </p>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .impact-list {
    margin: 12px 0 0;
    padding-left: 18px;
    color: var(--t2);
    font-size: var(--text-md);
    line-height: 1.65;
  }
  .control-row h3,
  .control-row-detail {
    overflow-wrap: anywhere;
  }
</style>
