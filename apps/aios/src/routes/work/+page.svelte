<script>
  import { onMount } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import {
    WORK,
    convertProposal,
    listWorkDecisions,
    listWorkDeliverables,
    listWorkMeetings,
    listWorkProjects,
    listWorkProposals,
    refreshWorkSurface,
  } from '$lib/kenos/workStore.svelte.js'

  const projects = $derived(listWorkProjects())
  const deliverables = $derived(listWorkDeliverables())
  const meetings = $derived(listWorkMeetings())
  const decisions = $derived(listWorkDecisions())
  const proposals = $derived(listWorkProposals())
  const nextDeliverable = $derived(
    deliverables.find((row) => ['planned', 'in_progress', 'blocked'].includes(row.status)) || null,
  )
  const blocked = $derived(deliverables.filter((row) => row.status === 'blocked'))
  const pendingProposals = $derived(proposals.filter((row) => ['draft', 'proposed', 'accepted'].includes(row.status)))

  onMount(() => {
    refreshWorkSurface({ force: true })
  })
</script>

<div class="work-page">
  <header class="work-header">
    <div>
      <p class="kicker">Work · owner domain</p>
      <h1>工作闭环</h1>
      <p class="intro">当前目标、下一个交付、阻塞、决定，以及需要转为 Plan Task 的提案。</p>
    </div>
    <div class="header-actions">
      {#if WORK.demo}
        <span class="badge">本地演示 · 非生产写入</span>
      {/if}
      {#if WORK.conversionEnabled || WORK.demo}
        <span class="badge badge--warn">Task conversion simulation</span>
      {:else}
        <span class="badge">conversion flag Off</span>
      {/if}
      <button type="button" class="quiet" onclick={() => refreshWorkSurface({ force: true })}>
        <Icon name="refresh" size={16} strokeWidth={1.75} />
        刷新
      </button>
    </div>
  </header>

  {#if WORK.status === 'unsupported'}
    <section class="state-panel" aria-live="polite">
      <h2>Work foundation 未启用</h2>
      <p>默认 Off。本地可用 <code>?kenosDemo=1</code> 或开发态预览；生产 feature flag 保持关闭。</p>
      <a href="/">返回 Today</a>
    </section>
  {:else if WORK.status === 'empty'}
    <section class="state-panel">
      <h2>还没有 Work 记录</h2>
      <p>创建 Project / Deliverable / Meeting / Decision，或用演示参数加载样例。</p>
    </section>
  {:else}
    {#if WORK.lastMessage}
      <p class="status-line" role="status">{WORK.lastMessage}</p>
    {/if}

    <section class="hero-grid" aria-labelledby="work-focus-title">
      <div>
        <p class="kicker">当前目标</p>
        <h2 id="work-focus-title">{projects[0]?.title || '未命名项目'}</h2>
        <p>{projects[0]?.safeSummary || '暂无摘要'}</p>
      </div>
      <div>
        <p class="kicker">下一个交付</p>
        <h3>{nextDeliverable?.title || '无待交付'}</h3>
        <p>{nextDeliverable?.safeSummary || '所有交付已完成或尚未创建。'}</p>
      </div>
    </section>

    <section aria-labelledby="work-blocked-title">
      <h2 id="work-blocked-title">阻塞</h2>
      {#if blocked.length}
        <ul class="plain-list">
          {#each blocked as row (row.id)}
            <li>
              <strong>{row.title}</strong>
              <span>{row.safeSummary}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">当前没有阻塞交付。</p>
      {/if}
    </section>

    <section aria-labelledby="work-decisions-title">
      <h2 id="work-decisions-title">最近决定</h2>
      {#if decisions.length}
        <ul class="plain-list">
          {#each decisions as row (row.id)}
            <li>
              <strong>{row.title}</strong>
              <span>{row.status} · {row.safeSummary}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">尚无 Work Decision。</p>
      {/if}
    </section>

    <section aria-labelledby="work-proposals-title">
      <h2 id="work-proposals-title">待转为 Plan Task 的提案</h2>
      <p class="muted">WorkActionProposal 不是 Task。转换需明确点击，且仅本地 simulation。</p>
      {#if pendingProposals.length}
        <ul class="proposal-list">
          {#each pendingProposals as row (row.id)}
            <li>
              <div>
                <strong>{row.proposedTaskTitle}</strong>
                <span>{row.safeContext}</span>
                <small>status={row.status} · risk={row.risk}</small>
              </div>
              <button
                type="button"
                class="primary"
                onclick={() => convertProposal(row.id)}
              >
                Create task
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">没有待处理提案。</p>
      {/if}
    </section>

    <section class="meta-grid" aria-label="Work 明细">
      <div>
        <h3>Projects</h3>
        <p>{projects.length}</p>
      </div>
      <div>
        <h3>Deliverables</h3>
        <p>{deliverables.length}</p>
      </div>
      <div>
        <h3>Meetings</h3>
        <p>{meetings.length}</p>
      </div>
      <div>
        <h3>Decisions</h3>
        <p>{decisions.length}</p>
      </div>
    </section>

    <section aria-labelledby="work-links-title">
      <h2 id="work-links-title">关联资料</h2>
      {#if projects[0]?.libraryRefs?.length}
        <ul class="plain-list">
          {#each projects[0].libraryRefs as ref (ref.libraryRef.id)}
            <li>
              <strong>{ref.safeTitle || 'Library entity'}</strong>
              <span>
                {ref.sourceAvailable === false ? 'unavailable/stale' : 'available'}
                · {ref.dataClassification || 'classified'}
              </span>
              {#if ref.deepLink}
                <a href={ref.deepLink} target="_blank" rel="noopener noreferrer">打开 Library</a>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">没有 Library EntityRef。</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .work-page {
    display: grid;
    gap: 1.5rem;
    padding: 1.25rem 1.25rem 5rem;
    max-width: 52rem;
  }
  .work-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .kicker {
    margin: 0;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--life-os-fg-muted, #666);
  }
  h1, h2, h3 {
    margin: 0.25rem 0;
  }
  .intro, .muted, .status-line {
    color: var(--life-os-fg-muted, #666);
  }
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .badge {
    border: 1px solid var(--life-os-border, #ddd);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
  }
  .badge--warn {
    border-color: #c47b2c;
  }
  .quiet, .primary {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--life-os-border, #ddd);
    background: transparent;
    border-radius: 0.5rem;
    padding: 0.4rem 0.7rem;
    cursor: pointer;
  }
  .primary {
    background: var(--life-os-fg, #111);
    color: var(--life-os-bg, #fff);
  }
  .hero-grid, .meta-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }
  .hero-grid > div, .meta-grid > div, .state-panel {
    border-top: 1px solid var(--life-os-border, #ddd);
    padding-top: 0.75rem;
  }
  .plain-list, .proposal-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }
  .plain-list li, .proposal-list li {
    display: grid;
    gap: 0.25rem;
  }
  .proposal-list li {
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.75rem;
  }
  .proposal-list small {
    display: block;
    color: var(--life-os-fg-muted, #666);
  }
  @media (max-width: 420px) {
    .work-header {
      flex-direction: column;
    }
    .proposal-list li {
      grid-template-columns: 1fr;
    }
  }
</style>
