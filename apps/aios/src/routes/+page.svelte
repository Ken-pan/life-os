<script>
  import { onMount } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import { CONTROL, refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'
  import {
    rememberExternalResume,
    launchSpace,
    openSpaceSwitcherSheet,
  } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { listKeyForDomainHref } from '$lib/kenos/domainResume.core.js'
  import { TODAY_SPACE_SHORTCUTS, spaceListKey } from '$lib/kenos/spacesList.core.js'
  import { goto } from '$app/navigation'
  import {
    buildTodayReadModel,
    sortActivityNewestFirst,
    summarizeControlQueue,
    formatQueueCount,
  } from '$lib/kenos/controlCenter.core.js'
  import { WORK, refreshWorkSurface } from '$lib/kenos/workStore.svelte.js'
  import { capabilityEmptyCopy } from '$lib/kenos/capabilityRegistry.core.js'
  import { isProdTodayKenosOverlayEnabled, isProdWorkReadEnabled } from '$lib/kenos/prodReadFlags.core.js'

  const today = $derived(buildTodayReadModel(CONTROL.summary))
  const queue = $derived(summarizeControlQueue(CONTROL))
  const recentActivity = $derived(sortActivityNewestFirst(CONTROL.activities).slice(0, 3))
  const workCapability = $derived(CONTROL.capabilities?.byId?.['work.read'])
  const workCapabilityCopy = $derived(capabilityEmptyCopy(workCapability))
  const prodWorkReadOn = $derived(isProdWorkReadEnabled(import.meta.env) || isProdTodayKenosOverlayEnabled(import.meta.env))
  const useProdWorkCards = $derived(
    isProdTodayKenosOverlayEnabled(import.meta.env) &&
      (CONTROL.sources?.work?.status === 'ready' || CONTROL.sources?.work?.status === 'partial') &&
      (CONTROL.workCards?.length ?? 0) > 0,
  )
  const workCards = $derived(
    (useProdWorkCards ? CONTROL.workCards : WORK.projection?.cards || []).slice(0, 6),
  )
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())
  const workKindLabel = {
    active_project: '进行中项目',
    project: '项目',
    proposal: '待转 Task 提案',
    deliverable_due_soon: '即将到期交付',
    blocked_deliverable: '阻塞交付',
    recent_meeting: '最近会议',
    unresolved_decision: '未决决定',
    pending_action_proposal: '待转 Task 提案',
    stale_source_warning: '陈旧来源',
  }

  onMount(() => {
    void refreshControlCenter()
    refreshWorkSurface()
  })

  /**
   * @param {(typeof TODAY_SPACE_SHORTCUTS)[number]} space
   * @param {MouseEvent} event
   */
  function onTodaySpace(space, event) {
    event.preventDefault()
    launchSpace(
      {
        ...space,
        listKey: spaceListKey('hosted', space.id),
        external: false,
        namespace: 'hosted',
      },
      { goto },
    )
  }
</script>

<div class="today-page">
  <header class="today-header">
    <div>
      <p class="today-date">{dateLabel}</p>
      <h1 class="kenos-page-title">Today</h1>
      <p class="today-intro">真正重要的事先处理。其余退到 Inbox 与各 Space。</p>
    </div>
    <div class="today-actions">
      <button
        type="button"
        class="quiet-button"
        aria-label="刷新 Today"
        disabled={CONTROL.loading}
        onclick={() => refreshControlCenter({ force: true })}
      >
        <Icon name="refresh" size={14} strokeWidth={1.75} />
        刷新
      </button>
    </div>
  </header>

  {#if CONTROL.error}
    <p class="status-line status-line--error" role="status">
      部分内容暂时无法更新。{CONTROL.error}
    </p>
  {:else if CONTROL.loading}
    <p class="status-line status-line--quiet" aria-live="polite">正在汇总各 Space 状态…</p>
  {:else if today.asOf}
    <p class="status-line status-line--quiet status-line--asof" aria-hidden="true">
      {new Intl.DateTimeFormat('zh-CN', { timeStyle: 'short' }).format(new Date(today.asOf))}
    </p>
  {/if}

  <div class="today-sync-quiet">
    <ReadSourceState
      state={CONTROL.sources.today}
      onRetry={() => refreshControlCenter({ force: true })}
    />
  </div>

  <main class="today-workspace">
    <div class="today-level-1">
      <section class="focus-section" aria-labelledby="today-focus-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">现在</p>
            <h2 id="today-focus-title">真正重要的事</h2>
          </div>
          <div class="section-heading-actions">
            <button
              type="button"
              class="text-action text-action--continue"
              data-testid="kenos-today-continue"
              aria-label="Continue to a recent Space"
              onclick={openSpaceSwitcherSheet}
            >
              继续刚才的事
              <Icon name="history" size={15} strokeWidth={1.75} />
            </button>
            <a href="/assistant" class="text-action">
              问 Assistant
              <Icon name="chevron-right" size={15} strokeWidth={1.75} />
            </a>
          </div>
        </div>

        {#if today.priorities.length}
          <div class="priority-list">
            {#each today.priorities as item, index (item.id)}
              <a
                class={[
                  'priority-row',
                  `priority-row--${item.tone}`,
                  (index === 0 || item.tone === 'critical') && 'priority-row--hero',
                ]}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onclick={() => {
                  const listKey = listKeyForDomainHref(item.href)
                  if (listKey) {
                    rememberExternalResume(listKey, {
                      lastRoute: item.href,
                      filter: item.title,
                    })
                  }
                }}
              >
                <span class="priority-marker" aria-hidden="true"></span>
                <span class="priority-copy">
                  <span class="row-eyebrow">{item.eyebrow}</span>
                  <strong>{item.title}</strong>
                  <span class="row-detail">{item.detail}</span>
                </span>
                <span class="row-action">{item.actionLabel}</span>
              </a>
            {/each}
          </div>
        {:else}
          <div class="empty-block">
            <p>{today.emptyReason}</p>
            <div class="empty-block-actions">
              <button
                type="button"
                class="text-action text-action--continue"
                aria-label="Continue to a recent Space"
                onclick={openSpaceSwitcherSheet}
              >
                继续刚才的事
                <Icon name="history" size={15} strokeWidth={1.75} />
              </button>
              <a href="/assistant">从 Assistant 开始</a>
            </div>
          </div>
        {/if}
      </section>

      <section class="decisions-section" aria-labelledby="today-decisions-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">需要你</p>
            <h2 id="today-decisions-title">等待处理</h2>
          </div>
          <a href="/inbox" class="text-action">
            打开 Inbox
            <Icon name="chevron-right" size={15} strokeWidth={1.75} />
          </a>
        </div>
        <div class="queue-list">
          <a href="/inbox" class="queue-row">
            <span class="queue-label">Inbox</span>
            <strong
              class="queue-count"
              aria-label={queue.inboxAvailable ? `${queue.inboxOpen} 条待分类` : 'Inbox 数量暂不可用'}
            >
              {formatQueueCount(queue.inboxOpen)}
            </strong>
            <small>
              待归位 {formatQueueCount(queue.inboxOpen)} · 待批准 {formatQueueCount(queue.approvalsOpen)}
              · 需关注 {formatQueueCount(queue.activityFailures)}
            </small>
            <Icon name="chevron-right" size={16} strokeWidth={1.75} />
          </a>
        </div>
      </section>
    </div>

    <div class="today-level-2">
      <section aria-labelledby="today-work-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Spaces</p>
            <h2 id="today-work-title">Work</h2>
          </div>
          <a href="/spaces" class="text-action">
            全部 Spaces
            <Icon name="chevron-right" size={15} strokeWidth={1.75} />
          </a>
        </div>
        {#if workCapabilityCopy.kind === 'unavailable' || workCapabilityCopy.kind === 'unauthorized' || workCapabilityCopy.kind === 'error'}
          <p class="empty-copy" role="status">
            {workCapabilityCopy.title}
            {#if workCapabilityCopy.body}
              <span class="empty-copy-detail">{workCapabilityCopy.body}</span>
            {/if}
          </p>
        {:else if workCapabilityCopy.kind === 'empty' || (prodWorkReadOn && ['empty', 'ready', 'partial', 'stale'].includes(CONTROL.sources?.work?.status) && !workCards.length)}
          <p class="empty-copy" role="status">
            {workCapabilityCopy.kind === 'empty' ? workCapabilityCopy.title : '暂无 Work 卡片'}
            {#if workCapabilityCopy.kind === 'empty' && workCapabilityCopy.body}
              <span class="empty-copy-detail">{workCapabilityCopy.body}</span>
            {:else}
              <span class="empty-copy-detail">可从 Spaces 进入整理；这是空列表，不是读取失败。</span>
            {/if}
          </p>
        {:else if workCards.length}
          <div class="signal-list">
            {#each workCards as card (card.id)}
              <a
                href={card.deepLink || '/work'}
                class="signal-row"
                owner={card.ownerDomain}
                data-owner-domain={card.ownerDomain}
              >
                <span class="signal-label">{workKindLabel[card.kind] || card.kind}</span>
                <strong>{card.title}</strong>
                <span>{card.summary}</span>
                <Icon name="chevron-right" size={14} strokeWidth={1.75} />
              </a>
            {/each}
          </div>
        {:else if WORK.status === 'unsupported' && !prodWorkReadOn}
          <p class="empty-copy" role="status">Work 正在准备中。相关任务可先在 Plan 里管理。</p>
        {:else}
          <p class="empty-copy">暂无 Work 卡片。</p>
        {/if}
      </section>

      {#if today.signals.length}
        <section aria-labelledby="today-signals-title">
          <div class="section-heading">
            <div>
              <p class="section-kicker">状态</p>
              <h2 id="today-signals-title">来自 Spaces</h2>
            </div>
          </div>
          <div class="signal-list">
            {#each today.signals as signal (signal.id)}
              <a
                href={signal.href}
                target="_blank"
                rel="noopener noreferrer"
                class="signal-row"
                onclick={() => {
                  const listKey = listKeyForDomainHref(signal.href)
                  if (listKey) {
                    rememberExternalResume(listKey, {
                      lastRoute: signal.href,
                      filter: signal.value,
                    })
                  }
                }}
              >
                <span class="signal-label">{signal.label}</span>
                <strong>{signal.value}</strong>
                <span>{signal.detail}{signal.stale ? ' · 数据陈旧' : ''}</span>
                <Icon name="external" size={14} strokeWidth={1.75} />
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <section aria-labelledby="today-spaces-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">进入领域</p>
            <h2 id="today-spaces-title">Spaces</h2>
          </div>
          <a href="/spaces" class="text-action">全部</a>
        </div>
        <nav class="space-list" aria-label="Kenos Spaces">
          {#each TODAY_SPACE_SHORTCUTS as space (space.id)}
            <a
              class="space-shortcut"
              href={space.href}
              data-space-id={space.id}
              style:--space-accent={space.accent || 'transparent'}
              onclick={(e) => onTodaySpace(space, e)}
            >
              <span
                class="space-shortcut-rail"
                style:background={space.accent || 'var(--border)'}
                aria-hidden="true"
              ></span>
              {#if space.icon}
                <span
                  class="space-shortcut-icon"
                  style:color={space.accent
                    ? `color-mix(in srgb, ${space.accent} 78%, var(--t2))`
                    : 'var(--t2)'}
                  aria-hidden="true"
                >
                  <Icon name={space.icon} size={14} strokeWidth={1.75} />
                </span>
              {/if}
              <span class="space-shortcut-text">
                <strong>{space.label}</strong>
                <span>{space.detail}</span>
              </span>
            </a>
          {/each}
        </nav>
      </section>
    </div>

    <div class="today-level-3">
      <section aria-labelledby="today-activity-title">
        <div class="section-heading section-heading--quiet">
          <div>
            <p class="section-kicker">可追溯</p>
            <h2 id="today-activity-title">系统已处理</h2>
          </div>
          <a href="/inbox#activity" class="text-action text-action--quiet">查看全部</a>
        </div>
        {#if recentActivity.length}
          <div class="activity-list">
            {#each recentActivity as item (item.id)}
              <div class="activity-row">
                <span class="activity-state activity-state--{item.status}"></span>
                <div>
                  <strong>{item.safeSummary ?? item.summary}</strong>
                  <span>{item.resultDetail ?? item.result}</span>
                </div>
                <time datetime={item.occurredAt}>{item.occurredAt
                  ? new Intl.DateTimeFormat('zh-CN', { timeStyle: 'short' }).format(new Date(item.occurredAt))
                  : item.occurredLabel}</time>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-copy empty-copy--quiet">最近没有需要展示的系统处理记录。</p>
        {/if}
      </section>
    </div>
  </main>
</div>

<style>
  .today-page {
    --today-level-gap: clamp(40px, 5vw, 48px);
    --today-section-gap: 28px;
    width: min(100% - 32px, var(--kenos-content-max, 820px));
    margin-inline: auto;
    padding: var(--kenos-space-page-top, 24px) 0 var(--kenos-mobile-bottom-pad, 96px);
  }
  .today-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--kenos-space-md, 16px);
    padding-bottom: var(--kenos-space-xl, 32px);
    border-bottom: 1px solid var(--border);
  }
  @media (max-width: 899px) {
    /* System bar already carries the page title — avoid double "Today" / "Spaces". */
    .today-header .kenos-page-title,
    .today-header :global(.kenos-page-title) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    .today-header {
      align-items: flex-start;
      padding-top: 4px;
    }
  }
  .today-date,
  .section-kicker {
    margin: 0 0 6px;
    color: var(--t3);
    font-size: var(--kenos-type-meta, var(--text-sm));
    font-weight: 650;
    letter-spacing: var(--kenos-tracking-meta, 0.08em);
    text-transform: uppercase;
  }
  h1,
  :global(.kenos-page-title) {
    margin: 0;
    color: var(--t1);
    font-size: var(--kenos-type-page);
    font-weight: 680;
    letter-spacing: var(--kenos-tracking-page);
    line-height: var(--kenos-leading-page);
  }
  .today-intro {
    margin: var(--kenos-title-to-body, 12px) 0 0;
    color: var(--t2);
    font-size: var(--kenos-type-body);
    font-weight: var(--kenos-weight-body);
    line-height: var(--kenos-leading-body);
    max-width: 36rem;
  }
  .today-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .beta-label,
  .status-line {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .beta-label {
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .quiet-button,
  .text-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    color: var(--t2);
    font: inherit;
    font-size: var(--text-md);
    cursor: pointer;
    text-decoration: none;
  }
  .quiet-button {
    color: var(--t3);
    font-size: 12px;
    opacity: 0.72;
  }
  .quiet-button:hover,
  .text-action:hover {
    color: var(--t1);
    opacity: 1;
  }
  .quiet-button:disabled {
    opacity: 0.4;
  }
  .text-action--continue {
    color: var(--t1);
    font-weight: 600;
  }
  .text-action--quiet {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .section-heading-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .status-line {
    margin: 6px 0 0;
  }
  .status-line--quiet {
    font-size: 11px;
    opacity: 0.45;
    letter-spacing: 0.01em;
  }
  .status-line--asof {
    margin-top: 4px;
    margin-bottom: 0;
    font-size: 10px;
    opacity: 0.4;
  }
  .status-line--error {
    color: var(--critical);
    opacity: 1;
  }
  .today-sync-quiet {
    margin-top: 2px;
    margin-bottom: 0;
  }
  .today-sync-quiet :global(.read-source-state) {
    margin: 4px 0 0;
    padding: 4px 0;
    border-left: 0;
    font-size: 11px;
    line-height: 1.35;
    color: var(--t3);
    opacity: 0.55;
  }
  .today-sync-quiet :global(.read-source-state--ready),
  .today-sync-quiet :global(.read-source-state--empty) {
    border-left: 0;
  }
  .today-sync-quiet :global(.read-source-state__label) {
    color: var(--t3);
    font-weight: 500;
  }
  .today-sync-quiet :global(.read-source-state time),
  .today-sync-quiet :global(.read-source-state p) {
    display: none;
  }
  /* Errors/offline still visible but compact */
  .today-sync-quiet :global(.read-source-state--error),
  .today-sync-quiet :global(.read-source-state--offline),
  .today-sync-quiet :global(.read-source-state--permission_denied) {
    opacity: 0.95;
    padding-left: 10px;
    border-left: 2px solid var(--critical);
  }
  .today-workspace {
    display: grid;
    gap: var(--today-level-gap);
    padding-top: calc(var(--today-level-gap) * 0.65);
  }
  .today-level-1,
  .today-level-2,
  .today-level-3 {
    display: grid;
    gap: var(--today-section-gap);
  }
  .today-level-3 {
    gap: 16px;
    opacity: 0.92;
  }
  @media (min-width: 1024px) {
    .today-page {
      width: min(100% - 48px, var(--kenos-content-max-wide, 1100px));
    }
  }
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .section-heading--quiet {
    margin-bottom: 8px;
  }
  .today-level-1 h2 {
    margin: 0;
    color: var(--t1);
    font-size: calc(var(--kenos-type-section) * 1.06);
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .today-level-2 h2 {
    margin: 0;
    color: var(--t1);
    font-size: var(--kenos-type-section);
    font-weight: var(--kenos-weight-section);
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .today-level-3 h2 {
    margin: 0;
    color: var(--t2);
    font-size: calc(var(--kenos-type-section) * 0.9);
    font-weight: 560;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  .priority-list,
  .queue-list,
  .signal-list,
  .activity-list {
    border-top: 1px solid var(--border);
  }
  .priority-row {
    display: grid;
    grid-template-columns: 4px minmax(0, 1fr) auto;
    gap: 18px;
    align-items: center;
    padding: 26px 0;
    border-bottom: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
    transition:
      opacity var(--dur-fast) var(--ease-standard),
      transform var(--dur-fast) var(--ease-standard);
  }
  .priority-row:not(.priority-row--hero) {
    padding: 18px 0;
    opacity: 0.88;
  }
  .priority-row:not(.priority-row--hero) .priority-copy strong {
    font-size: clamp(17px, 2.4vw, 20px);
    font-weight: 560;
  }
  .priority-row:hover {
    transform: translateX(3px);
  }
  .priority-marker {
    align-self: stretch;
    min-height: 58px;
    border-radius: 999px;
    background: var(--t3);
  }
  .priority-row--critical .priority-marker {
    background: var(--critical);
  }
  .priority-row--attention .priority-marker {
    background: var(--accent);
  }
  .priority-copy {
    display: grid;
    gap: 5px;
  }
  .priority-row--hero .priority-copy {
    gap: 6px;
  }
  .priority-copy strong {
    color: var(--t1);
    font-size: clamp(21px, 3.2vw, 26px);
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .row-detail,
  .signal-row > span:not(.signal-label),
  .activity-row span,
  .empty-copy,
  .empty-block {
    color: var(--t3);
    font-size: var(--text-md);
  }
  .row-detail {
    font-size: var(--text-sm);
    font-weight: 450;
    line-height: 1.4;
  }
  .empty-copy-detail {
    display: block;
    margin-top: 4px;
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .empty-copy--quiet {
    font-size: var(--text-sm);
    opacity: 0.85;
  }
  .row-eyebrow {
    color: var(--t3);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.85;
  }
  .row-action {
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .priority-row--hero .row-action {
    font-size: var(--text-md);
    color: var(--t1);
  }
  .queue-row {
    display: grid;
    grid-template-columns: minmax(100px, 0.65fr) auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    min-height: 72px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    color: var(--t1);
    text-decoration: none;
  }
  .queue-label {
    font-weight: 560;
  }
  .queue-count,
  .queue-row strong {
    font-variant-numeric: tabular-nums;
    font-size: clamp(28px, 4vw, 36px);
    font-weight: 680;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .queue-row small {
    color: var(--t3);
    font-size: 12px;
    opacity: 0.8;
  }
  .count-alert {
    color: var(--critical);
  }
  .today-level-2 .signal-row {
    display: grid;
    grid-template-columns: 96px minmax(180px, 0.8fr) minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    min-height: 56px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }
  .signal-label {
    color: var(--t2) !important;
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .today-level-2 .signal-row strong {
    color: var(--t1);
    font-size: var(--text-md);
    font-weight: 560;
  }
  .activity-row {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    padding: 10px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .activity-row > div {
    display: grid;
    gap: 2px;
  }
  .activity-row strong {
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 520;
  }
  .activity-row span {
    font-size: 12px;
  }
  .activity-row time {
    color: var(--t3);
    font-size: 11px;
    opacity: 0.75;
  }
  .activity-state {
    width: 6px;
    height: 6px;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--t3);
  }
  .activity-state--succeeded {
    background: var(--positive);
  }
  .activity-state--failed {
    background: var(--critical);
  }
  .space-list {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border-block: 1px solid var(--border);
  }
  .space-shortcut {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 14px 12px;
    border-right: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }
  .space-shortcut:first-child {
    padding-left: 0;
  }
  .space-shortcut:last-child {
    border-right: 0;
  }
  .space-shortcut:hover {
    background: color-mix(in srgb, var(--space-accent, transparent) 7%, transparent);
  }
  .space-shortcut-rail {
    width: 3px;
    align-self: stretch;
    min-height: 28px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .space-shortcut-icon {
    display: inline-flex;
    flex-shrink: 0;
    margin-top: 2px;
    opacity: 0.9;
  }
  .space-shortcut-text {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .space-shortcut-text strong {
    color: var(--t1);
    font-size: var(--text-md);
    font-weight: 560;
  }
  .space-shortcut-text span {
    color: var(--t3);
    font-size: 12px;
  }
  .empty-block {
    padding: 24px 0;
    border-block: 1px solid var(--border);
  }
  .empty-block p {
    margin: 0 0 12px;
  }
  .empty-block-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .empty-block a {
    color: var(--t2);
    font-size: var(--text-md);
  }
  .shadow-section {
    padding-top: 4px;
    border-top: 1px solid var(--border);
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .shadow-section p {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .shadow-section details {
    margin-top: 12px;
  }
  .shadow-section summary {
    cursor: pointer;
    color: var(--t2);
  }
  .shadow-section ul {
    margin: 10px 0 0;
    padding-left: 18px;
  }
  @media (max-width: 720px) {
    .today-page {
      width: min(100% - 28px, var(--kenos-content-max, 820px));
      padding-top: var(--kenos-space-page-top, 24px);
      --today-level-gap: 40px;
      --today-section-gap: 24px;
    }
    .today-header {
      align-items: flex-start;
      flex-direction: column;
    }
    .today-actions {
      justify-content: flex-start;
    }
    .section-heading-actions {
      justify-content: flex-start;
    }
    .queue-row {
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 14px 0;
      min-height: 64px;
    }
    .queue-row small {
      grid-column: 1 / 3;
      grid-row: 2;
    }
    .today-level-2 .signal-row {
      grid-template-columns: 72px minmax(0, 1fr) auto;
      padding: 12px 0;
    }
    .today-level-2 .signal-row > span:not(.signal-label) {
      grid-column: 2 / 4;
    }
    .space-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .space-shortcut,
    .space-shortcut:first-child {
      padding: 14px 0;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .space-shortcut:nth-child(odd) {
      padding-right: 12px;
      border-right: 1px solid var(--border);
    }
    .space-shortcut:nth-child(even) {
      padding-left: 12px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .priority-row {
      transition: none;
    }
  }
</style>
