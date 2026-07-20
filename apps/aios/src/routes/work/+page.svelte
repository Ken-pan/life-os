<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import { CONTROL, refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'
  import { capabilityEmptyCopy } from '$lib/kenos/capabilityRegistry.core.js'
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
  import { resolveAssistantScopeLabel } from '$lib/kenos/assistantScopeLabel.core.js'
  import { enterWorkAssistantContext } from '$lib/kenos/assistantContext.svelte.js'
  import { launchSpace } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { domainDeepLink } from '$lib/kenos/domainResume.core.js'

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
  const workCapability = $derived(CONTROL.capabilities?.byId?.['work.read'])
  const workCapabilityCopy = $derived(capabilityEmptyCopy(workCapability))
  const prodProjects = $derived(CONTROL.workProjects || [])
  const prodReady = $derived(['ready', 'empty', 'partial', 'stale'].includes(CONTROL.sources.work?.status))
  const workContextTitle = $derived(prodProjects[0]?.title || projects[0]?.title || '')
  const scopeUi = $derived(
    resolveAssistantScopeLabel({
      workContext: { title: workContextTitle },
    }),
  )

  function openWorkContextAssistant() {
    enterWorkAssistantContext({
      title: workContextTitle || projects[0]?.title || prodProjects[0]?.title || '',
    })
  }

  onMount(() => {
    refreshWorkSurface({ force: true })
    void refreshControlCenter()
  })
</script>

<div class="work-page">
  <header class="work-header">
    <div>
      <p class="kicker"><a href="/spaces">Spaces</a> · Work</p>
      <h1>Work</h1>
      <p class="intro">当前目标、下一个交付、阻塞、决定，以及需要转为任务的提案。</p>
    </div>
    <div class="header-actions">
      <a class="quiet" href="/spaces">全部 Spaces</a>
      <a
        class="quiet"
        href="/assistant?scope=work"
        data-testid="work-context-assistant-entry"
        onclick={openWorkContextAssistant}
      >
        Context Assistant
      </a>
      <span class="scope-hint" data-testid="assistant-scope-chip" data-scope-kind={scopeUi.kind} title={scopeUi.label}>
        {scopeUi.label}
      </span>
      <button type="button" class="quiet" onclick={() => { refreshWorkSurface({ force: true }); void refreshControlCenter({ force: true }) }}>
        <Icon name="refresh" size={16} strokeWidth={1.75} />
        刷新
      </button>
    </div>
  </header>

  <ReadSourceState
    state={CONTROL.sources.work}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  {#if workCapabilityCopy.kind === 'unavailable' || workCapabilityCopy.kind === 'unauthorized'}
    <section class="state-panel" aria-live="polite">
      <h2>Work 正在准备中</h2>
      <p>你目前仍可以通过 Plan 管理相关任务。</p>
      <div class="state-actions">
        <a class="primary" href="/spaces">返回 Spaces</a>
        <button
          type="button"
          class="quiet"
          onclick={() =>
            launchSpace(
              {
                id: 'plan',
                label: 'Plan',
                detail: 'Upcoming',
                href: domainDeepLink('plan', '/upcoming'),
                listKey: 'hosted:plan',
                external: false,
                namespace: 'hosted',
              },
              { goto },
            )}
        >
          打开 Plan
        </button>
      </div>
    </section>
  {:else if prodReady && CONTROL.sources.work.status === 'empty' && WORK.status !== 'ready'}
    <section class="state-panel">
      <h2>还没有 Work 记录</h2>
      <p>可以从 Spaces 开始整理项目与交付；这里不是错误面板。</p>
      <a href="/spaces">返回 Spaces</a>
    </section>
  {:else if WORK.status === 'unsupported' && !prodProjects.length}
    <section class="state-panel" aria-live="polite">
      <h2>Work 暂不可用</h2>
      <p>此 Space 尚未开启。可返回 Spaces，或稍后再试。</p>
      <a href="/spaces">返回 Spaces</a>
    </section>
  {:else if WORK.status === 'empty' && !prodProjects.length}
    <section class="state-panel">
      <h2>还没有 Work 记录</h2>
      <p>创建项目、交付、会议或决定，开始整理这个 Space。</p>
    </section>
  {:else}
    {#if WORK.lastMessage}
      <p class="status-line" role="status">{WORK.lastMessage}</p>
    {/if}

    {#if prodProjects.length}
      <section aria-labelledby="work-prod-title">
        <p class="kicker">已同步的项目</p>
        <h2 id="work-prod-title">来自你的 Work Space</h2>
        <ul class="plain-list">
          {#each prodProjects as row (row.id)}
            <li>
              <strong>{row.title}</strong>
              <span>{row.safeSummary}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="hero-grid" aria-labelledby="work-focus-title">
      <div>
        <p class="kicker">当前目标</p>
        <h2 id="work-focus-title">{projects[0]?.title || prodProjects[0]?.title || '未命名项目'}</h2>
        <p>{projects[0]?.safeSummary || prodProjects[0]?.safeSummary || '暂无摘要'}</p>
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
      <h2 id="work-proposals-title">待转为任务的提案</h2>
      <p class="muted">WorkActionProposal 不是 Task。转换需明确点击；conversion flag Off 时仅本机演练，不会写入生产 Plan。</p>
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
                {ref.sourceAvailable === false ? '来源暂不可用' : '可打开'}
              </span>
              {#if ref.deepLink}
                <a href={ref.deepLink} target="_blank" rel="noopener noreferrer">打开资料</a>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">暂无关联资料。</p>
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
    color: var(--t3);
  }
  h1, h2, h3 {
    margin: 0.25rem 0;
  }
  .intro, .muted, .status-line {
    color: var(--t3);
  }
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .work-badge {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
  }
  .work-badge--warn {
    border-color: var(--warning);
  }
  .quiet, .primary {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 0.5rem;
    padding: 0.4rem 0.7rem;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
  }
  .scope-hint {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    color: var(--t2);
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .primary {
    background: var(--t1);
    color: var(--bg);
  }
  .hero-grid, .meta-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }
  .hero-grid > div, .meta-grid > div, .state-panel {
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
  }
  .state-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 16px;
    align-items: center;
  }
  .state-actions .primary {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 14px;
    border-radius: var(--kenos-radius-control, 8px);
    text-decoration: none;
    font-weight: 600;
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
    color: var(--t3);
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
