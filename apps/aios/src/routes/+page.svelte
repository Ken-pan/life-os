<script>
  import { onMount } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import {
    CONTROL,
    refreshControlCenter,
  } from '$lib/kenos/controlCenter.svelte.js'
  import {
    rememberExternalResume,
    launchSpace,
    openContinueSheet,
  } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { listKeyForDomainHref } from '$lib/kenos/domainResume.core.js'
  import {
    TODAY_SPACE_SHORTCUTS,
    spaceListKey,
  } from '$lib/kenos/spacesList.core.js'
  import { goto } from '$app/navigation'
  import {
    buildTodayReadModel,
    sortActivityNewestFirst,
    summarizeControlQueue,
    formatQueueCount,
  } from '$lib/kenos/controlCenter.core.js'
  import { WORK, refreshWorkSurface } from '$lib/kenos/workStore.svelte.js'
  import { capabilityEmptyCopy } from '$lib/kenos/capabilityRegistry.core.js'
  import {
    isProdTodayKenosOverlayEnabled,
    isProdWorkReadEnabled,
  } from '$lib/kenos/prodReadFlags.core.js'
  import { PRODUCT_COPY } from '$lib/kenos/productStates.core.js'
  import { requestNativeSpaceShelf } from '$lib/kenos/iosNativeShell.js'
  import { loadHealthReadiness } from '$lib/kenos/healthReadiness.host.js'

  function onAllSpacesClick(event) {
    if (requestNativeSpaceShelf()) {
      event.preventDefault()
    }
  }

  let healthReadiness = $state(/** @type {object|null} */ (null))

  const today = $derived(
    buildTodayReadModel(CONTROL.summary, { healthReadiness }),
  )
  const queue = $derived(summarizeControlQueue(CONTROL))
  const recentActivity = $derived(
    sortActivityNewestFirst(CONTROL.activities).slice(0, 3),
  )
  const workCapability = $derived(CONTROL.capabilities?.byId?.['work.read'])
  const workCapabilityCopy = $derived(capabilityEmptyCopy(workCapability))
  const todayNeedsSignIn = $derived(
    CONTROL.sources?.today?.status === 'permission_denied',
  )
  const prodWorkReadOn = $derived(
    isProdWorkReadEnabled(import.meta.env) ||
      isProdTodayKenosOverlayEnabled(import.meta.env),
  )
  const useProdWorkCards = $derived(
    isProdTodayKenosOverlayEnabled(import.meta.env) &&
      (CONTROL.sources?.work?.status === 'ready' ||
        CONTROL.sources?.work?.status === 'partial') &&
      (CONTROL.workCards?.length ?? 0) > 0,
  )
  const workCards = $derived(
    (useProdWorkCards ? CONTROL.workCards : WORK.projection?.cards || []).slice(
      0,
      6,
    ),
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
    const refreshHealth = () => {
      healthReadiness = loadHealthReadiness({ now: Date.now() })
    }
    refreshHealth()
    window.addEventListener('kenos-apple-health', refreshHealth)
    window.addEventListener('kenos-health-readiness', refreshHealth)
    void refreshControlCenter()
    refreshWorkSurface()
    return () => {
      window.removeEventListener('kenos-apple-health', refreshHealth)
      window.removeEventListener('kenos-health-readiness', refreshHealth)
    }
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
    <div class="today-header-main">
      <p class="today-date">{dateLabel}</p>
      <h1 class="kenos-page-title">Today</h1>
      <p class="today-intro">真正重要的事先处理。</p>
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
        <span class="quiet-button-label">刷新</span>
      </button>
    </div>
  </header>

  {#if CONTROL.error}
    <p class="status-line status-line--error" role="status">
      部分内容暂时无法更新。{CONTROL.error}
    </p>
  {:else if CONTROL.loading}
    <p class="status-line status-line--quiet" aria-live="polite">正在汇总…</p>
  {/if}

  <div class="today-sync-quiet">
    {#if !todayNeedsSignIn && CONTROL.sources?.today?.status !== 'ready'}
      <ReadSourceState
        state={CONTROL.sources.today}
        onRetry={() => refreshControlCenter({ force: true })}
      />
    {/if}
  </div>

  <main class="today-workspace">
    <div class="today-level-1">
      <section
        class="focus-section kenos-anim-chrome-enter"
        aria-labelledby="today-focus-title"
      >
        <div class="section-heading section-heading--focus">
          <h2 id="today-focus-title">现在</h2>
          <button
            type="button"
            class="text-action text-action--continue today-continue-inline"
            data-testid="kenos-today-continue"
            aria-label="Continue to a recent Space"
            onclick={openContinueSheet}
          >
            继续
            <Icon name="history" size={14} strokeWidth={1.75} />
          </button>
        </div>

        {#if CONTROL.loading && !today.priorities.length && !CONTROL.summary}
          <div
            class="priority-skeleton"
            aria-busy="true"
            aria-label={PRODUCT_COPY.todayLoading.label}
          >
            <div class="skeleton skeleton--title"></div>
            <div class="skeleton skeleton--text"></div>
            <div class="skeleton skeleton--text"></div>
          </div>
        {:else if today.priorities.length}
          <div class="priority-list">
            {#each today.priorities as item, index (item.id)}
              <a
                class={[
                  'priority-row',
                  'kenos-anim-list-enter',
                  `priority-row--${item.tone}`,
                  (index === 0 || item.tone === 'critical') &&
                    'priority-row--hero',
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
                  {#if item.detail}
                    <span class="row-detail">{item.detail}</span>
                  {/if}
                </span>
                <span class="row-action" aria-hidden="true">
                  <span class="row-action-label">{item.actionLabel}</span>
                  <Icon name="chevron-right" size={15} strokeWidth={1.75} />
                </span>
              </a>
            {/each}
          </div>
        {:else}
          <div class="empty-block" role="status">
            <p class="empty-block-title">
              {#if todayNeedsSignIn}
                {PRODUCT_COPY.todayNeedSignIn.title}
              {:else}
                {today.emptyReason || PRODUCT_COPY.todayEmptyUrgent.title}
              {/if}
            </p>
            <p class="empty-block-body">
              {todayNeedsSignIn
                ? PRODUCT_COPY.todayNeedSignIn.body
                : PRODUCT_COPY.todayEmptyUrgent.body}
            </p>
            <div class="empty-block-actions">
              {#if todayNeedsSignIn}
                <a href="/settings#cloud" class="text-action"
                  >{PRODUCT_COPY.todayNeedSignIn.actionSettings}</a
                >
                <button
                  type="button"
                  class="text-action text-action--continue"
                  aria-label="Continue to a recent Space"
                  onclick={openContinueSheet}
                >
                  {PRODUCT_COPY.todayNeedSignIn.actionContinue}
                  <Icon name="history" size={15} strokeWidth={1.75} />
                </button>
              {:else}
                <button
                  type="button"
                  class="text-action text-action--continue"
                  aria-label="Continue to a recent Space"
                  onclick={openContinueSheet}
                >
                  {PRODUCT_COPY.todayEmptyUrgent.actionContinue}
                  <Icon name="history" size={15} strokeWidth={1.75} />
                </button>
                <a href="/assistant" class="text-action text-action--quiet"
                  >{PRODUCT_COPY.todayEmptyUrgent.actionAssistant}</a
                >
              {/if}
            </div>
          </div>
        {/if}
      </section>

      <section
        class="decisions-section kenos-anim-chrome-enter"
        aria-labelledby="today-decisions-title"
      >
        <div class="section-heading section-heading--meta">
          <h2 id="today-decisions-title">需要你</h2>
        </div>
        <div class="queue-list">
          <a href="/inbox" class="queue-row kenos-anim-list-enter">
            <div class="queue-copy">
              <span class="queue-label">Inbox</span>
              <small>
                待归位 {formatQueueCount(queue.inboxOpen)} · 待批准 {formatQueueCount(
                  queue.approvalsOpen,
                )}
              </small>
            </div>
            <strong
              class="queue-count"
              aria-label={queue.inboxAvailable
                ? `${queue.inboxOpen} 条待分类`
                : 'Inbox 数量暂不可用'}
            >
              {formatQueueCount(queue.inboxOpen)}
            </strong>
            <Icon name="chevron-right" size={16} strokeWidth={1.75} />
          </a>
        </div>
      </section>
    </div>

    <div class="today-level-2">
      <section
        class="kenos-anim-chrome-enter"
        aria-labelledby="today-work-title"
      >
        <div class="section-heading section-heading--meta">
          <h2 id="today-work-title">Work</h2>
          <a href="/spaces" class="text-action" onclick={onAllSpacesClick}>
            全部
            <Icon name="chevron-right" size={15} strokeWidth={1.75} />
          </a>
        </div>
        {#if workCapabilityCopy.kind === 'unavailable' || workCapabilityCopy.kind === 'unauthorized' || workCapabilityCopy.kind === 'error'}
          <p class="empty-copy" role="status">
            {workCapabilityCopy.title}
            {#if workCapabilityCopy.kind === 'unauthorized'}
              <a class="empty-copy-action" href="/settings#cloud">去设置登录</a>
            {/if}
          </p>
        {:else if workCapabilityCopy.kind === 'empty' || (prodWorkReadOn && ['empty', 'ready', 'partial', 'stale'].includes(CONTROL.sources?.work?.status) && !workCards.length)}
          <p class="empty-copy empty-copy--quiet" role="status">
            {workCapabilityCopy.kind === 'empty'
              ? workCapabilityCopy.title
              : '暂无 Work 卡片'}
          </p>
        {:else if workCards.length}
          <div class="signal-list">
            {#each workCards as card (card.id)}
              <a
                href={card.deepLink || '/work'}
                class="signal-row kenos-anim-list-enter"
                owner={card.ownerDomain}
                data-owner-domain={card.ownerDomain}
              >
                <span class="signal-rail" aria-hidden="true"></span>
                <span class="signal-copy">
                  <span class="signal-label"
                    >{workKindLabel[card.kind] || card.kind}</span
                  >
                  <strong>{card.title}</strong>
                  <span class="signal-detail">{card.summary}</span>
                </span>
                <Icon name="chevron-right" size={14} strokeWidth={1.75} />
              </a>
            {/each}
          </div>
        {:else if WORK.status === 'unsupported' && !prodWorkReadOn}
          <p class="empty-copy empty-copy--quiet" role="status">Work 准备中</p>
        {:else}
          <p class="empty-copy empty-copy--quiet">暂无 Work 卡片</p>
        {/if}
      </section>

      {#if today.signals.length}
        <section
          class="kenos-anim-chrome-enter"
          aria-labelledby="today-signals-title"
        >
          <div class="section-heading section-heading--meta">
            <h2 id="today-signals-title">来自 Spaces</h2>
          </div>
          <div class="signal-list">
            {#each today.signals as signal (signal.id)}
              <a
                href={signal.href}
                target="_blank"
                rel="noopener noreferrer"
                class="signal-row kenos-anim-list-enter"
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
                <span class="signal-rail" aria-hidden="true"></span>
                <span class="signal-copy">
                  <span class="signal-label">{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <span class="signal-detail"
                    >{signal.detail}{signal.stale ? ' · 数据陈旧' : ''}</span
                  >
                </span>
                <Icon name="external" size={14} strokeWidth={1.75} />
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <section
        class="kenos-anim-chrome-enter"
        aria-labelledby="today-spaces-title"
      >
        <div class="section-heading section-heading--meta">
          <h2 id="today-spaces-title">Spaces</h2>
          <a href="/spaces" class="text-action" onclick={onAllSpacesClick}
            >全部</a
          >
        </div>
        <nav class="space-list" aria-label="Kenos Spaces">
          {#each TODAY_SPACE_SHORTCUTS as space (space.id)}
            <a
              class="space-shortcut kenos-anim-list-enter"
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
                  <Icon name={space.icon} size={16} strokeWidth={1.75} />
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
      <section
        class="kenos-anim-chrome-enter"
        aria-labelledby="today-activity-title"
      >
        <div
          class="section-heading section-heading--meta section-heading--quiet"
        >
          <h2 id="today-activity-title">系统已处理</h2>
          <a href="/inbox#activity" class="text-action text-action--quiet"
            >全部</a
          >
        </div>
        {#if recentActivity.length}
          <div class="activity-list">
            {#each recentActivity as item (item.id)}
              <div class="activity-row kenos-anim-list-enter">
                <span class="activity-state activity-state--{item.status}"
                ></span>
                <div>
                  <strong>{item.safeSummary ?? item.summary}</strong>
                  <span>{item.resultDetail ?? item.result}</span>
                </div>
                <time datetime={item.occurredAt}
                  >{item.occurredAt
                    ? new Intl.DateTimeFormat('zh-CN', {
                        timeStyle: 'short',
                      }).format(new Date(item.occurredAt))
                    : item.occurredLabel}</time
                >
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-copy empty-copy--quiet">
            最近没有需要展示的系统处理记录。
          </p>
        {/if}
      </section>
    </div>
  </main>
</div>

<style>
  .today-page {
    --today-level-gap: clamp(22px, 3vw, 32px);
    --today-section-gap: 18px;
    width: min(
      100% - (2 * var(--kenos-space-inline, 16px)),
      var(--kenos-content-max, 820px)
    );
    margin-inline: auto;
    padding: var(--kenos-space-page-top, 24px) 0
      var(--kenos-mobile-bottom-pad, 96px);
  }
  :global(html[data-ios-native-shell='true'] .today-page) {
    --today-level-gap: 20px;
    --today-section-gap: 14px;
    padding-top: 0;
  }
  :global(html[data-ios-native-shell='true'] .today-header) {
    padding-bottom: 2px;
    align-items: center;
  }
  :global(html[data-ios-native-shell='true'] .today-intro) {
    display: none;
  }
  /* SystemBar already owns Continue — don't duplicate in content. */
  :global(html[data-ios-native-shell='true'] .today-continue-inline) {
    display: none;
  }
  :global(html[data-ios-native-shell='true'] .quiet-button-label) {
    display: none;
  }
  :global(html[data-ios-native-shell='true'] .today-actions .quiet-button) {
    width: 32px;
    min-height: 32px;
    padding: 0;
    justify-content: center;
    opacity: 0.5;
  }
  :global(html[data-ios-native-shell='true'] .today-date) {
    color: color-mix(in srgb, var(--t1) 48%, transparent);
    font-size: 12px;
    letter-spacing: 0.03em;
    margin-bottom: 0;
    text-transform: none;
    font-weight: 500;
  }
  /* SystemBar owns "今天" — focus title becomes quiet meta. */
  :global(html[data-ios-native-shell='true'] .section-heading--focus h2) {
    color: var(--t3);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  :global(html[data-ios-native-shell='true'] .section-heading--meta h2) {
    font-size: 12px;
    font-weight: 650;
  }
  :global(html[data-ios-native-shell='true'] .empty-copy) {
    font-size: 15px;
    line-height: 1.45;
    color: color-mix(in srgb, var(--t1) 72%, transparent);
  }
  :global(html[data-ios-native-shell='true'] .queue-count) {
    font-size: 1.35rem;
    font-weight: 680;
  }
  :global(html[data-ios-native-shell='true'] .row-action-label) {
    display: none;
  }
  :global(html[data-ios-native-shell='true'] .today-workspace) {
    padding-top: 4px;
  }
  :global(html[data-ios-native-shell='true'] .today-level-1) {
    gap: 14px;
  }
  .today-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--kenos-space-md, 16px);
    padding-bottom: 16px;
    border-bottom: 0;
  }
  .today-header-main {
    min-width: 0;
  }
  @media (max-width: 899px) {
    .today-header .kenos-page-title,
    .today-header :global(.kenos-page-title) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    .today-header {
      align-items: center;
      padding-top: 0;
      padding-bottom: 8px;
    }
  }
  .today-date {
    margin: 0 0 4px;
    color: var(--t3);
    font-size: var(--kenos-type-meta, var(--text-sm));
    font-weight: 650;
    letter-spacing: var(--kenos-tracking-meta, 0.06em);
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
    margin: 6px 0 0;
    color: var(--t2);
    font-size: var(--kenos-type-secondary, var(--text-md));
    font-weight: var(--kenos-weight-body);
    line-height: 1.4;
    max-width: 28rem;
  }
  .today-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .status-line {
    margin: 2px 0 0;
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .quiet-button,
  .text-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    background: transparent;
    color: var(--t2);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
    text-decoration: none;
  }
  .quiet-button {
    color: var(--t3);
    font-size: 12px;
    opacity: 0.65;
  }
  .quiet-button:hover,
  .text-action:hover {
    color: var(--t1);
    opacity: 1;
  }
  .quiet-button:disabled {
    opacity: 0.35;
  }
  .text-action--continue {
    color: var(--t1);
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .text-action--quiet {
    color: var(--t3);
    font-size: 12px;
  }
  .status-line--quiet {
    font-size: 11px;
    opacity: 0.42;
    letter-spacing: 0.01em;
  }
  .status-line--asof {
    margin-top: 2px;
    font-size: 10px;
    opacity: 0.38;
  }
  .status-line--error {
    color: var(--critical);
    opacity: 1;
  }
  .today-sync-quiet {
    margin-top: 0;
  }
  .today-sync-quiet :global(.read-source-state) {
    margin: 2px 0 0;
    padding: 2px 0;
    border-left: 0;
    font-size: 11px;
    line-height: 1.35;
    color: var(--t3);
    opacity: 0.5;
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
    padding-top: 6px;
  }
  .today-level-1 {
    display: grid;
    gap: 16px;
  }
  .section-heading--focus {
    margin-bottom: 8px;
  }
  .today-level-2 {
    display: grid;
    gap: var(--today-section-gap);
    padding-top: 4px;
  }
  .today-level-3 {
    display: grid;
    gap: 12px;
    opacity: 0.88;
  }
  @media (min-width: 1024px) {
    .today-page {
      width: min(100% - 48px, var(--kenos-content-max-wide, 1100px));
    }
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .section-heading--quiet {
    margin-bottom: 6px;
  }
  .today-level-1 h2 {
    margin: 0;
    color: var(--t1);
    font-size: var(--kenos-type-section);
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .section-heading--meta h2 {
    margin: 0;
    color: var(--t3);
    font-size: var(--kenos-type-meta, var(--text-xs));
    font-weight: 650;
    letter-spacing: var(--kenos-tracking-meta, 0.06em);
    text-transform: uppercase;
    line-height: 1.3;
  }
  .priority-list,
  .queue-list,
  .signal-list,
  .activity-list {
    border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  }
  .priority-row {
    display: grid;
    grid-template-columns: 3px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 18px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    color: inherit;
    text-decoration: none;
    transition:
      opacity var(--dur-fast) var(--ease-standard),
      transform var(--dur-fast) var(--ease-standard);
  }
  .priority-row:not(.priority-row--hero) {
    padding: 14px 0;
    opacity: 0.9;
  }
  .priority-row:not(.priority-row--hero) .priority-copy strong {
    font-size: var(--kenos-type-list, var(--text-lg));
    font-weight: 560;
  }
  .priority-row:hover {
    transform: translateX(2px);
  }
  .priority-marker {
    align-self: stretch;
    min-height: 40px;
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
    gap: 3px;
    min-width: 0;
  }
  .priority-copy strong {
    color: var(--t1);
    font-size: clamp(18px, 2.6vw, 22px);
    font-weight: 620;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .row-detail,
  .signal-detail,
  .activity-row span,
  .empty-copy,
  .empty-block {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .row-detail {
    font-weight: 450;
    line-height: 1.4;
  }
  .empty-copy-detail {
    display: block;
    margin-top: 4px;
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .empty-copy-action {
    display: inline-flex;
    margin-top: 10px;
    min-height: 36px;
    padding: 0 11px;
    align-items: center;
    border: 1px solid var(--border-l);
    border-radius: 8px;
    color: var(--t1);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
  }
  .empty-copy--quiet {
    font-size: var(--text-sm);
    opacity: 0.85;
  }
  .row-eyebrow {
    color: var(--t3);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.8;
  }
  .row-action {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--t3);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .row-action-label {
    color: var(--t2);
  }
  .priority-row--hero .row-action-label {
    color: var(--t1);
  }
  @media (max-width: 899px) {
    .row-action-label {
      display: none;
    }
  }
  .queue-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 10px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    color: var(--t1);
    text-decoration: none;
  }
  .queue-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .queue-label {
    font-weight: 600;
    font-size: var(--kenos-type-list, var(--text-lg));
  }
  .queue-count {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: clamp(22px, 3.2vw, 28px);
    font-weight: 680;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .queue-row small {
    color: var(--t3);
    font-size: 12px;
    opacity: 0.85;
  }
  .queue-row :global(svg) {
    flex-shrink: 0;
    color: var(--t3);
  }
  .signal-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 10px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    color: inherit;
    text-decoration: none;
  }
  .signal-rail {
    width: 3px;
    align-self: stretch;
    min-height: 28px;
    border-radius: 2px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--t3) 55%, transparent);
  }
  .signal-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .signal-label {
    color: var(--t3);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .signal-row strong {
    color: var(--t1);
    font-size: var(--kenos-type-list, var(--text-lg));
    font-weight: 600;
  }
  .signal-detail {
    line-height: 1.35;
  }
  .signal-row :global(svg) {
    flex-shrink: 0;
    color: var(--t3);
  }
  .activity-row {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    padding: 9px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
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
  /* Narrow: vertical hairline list (Spaces page language) */
  .space-list {
    display: grid;
    gap: 0;
    border: 0;
  }
  .space-shortcut {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 10px 4px;
    border: 0;
    color: inherit;
    text-decoration: none;
    background: transparent;
  }
  .space-shortcut + .space-shortcut {
    border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  }
  .space-shortcut:hover {
    background: color-mix(
      in srgb,
      var(--space-accent, transparent) 7%,
      transparent
    );
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
    opacity: 0.9;
  }
  .space-shortcut-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .space-shortcut-text strong {
    color: var(--t1);
    font-size: var(--kenos-type-list, var(--text-lg));
    font-weight: 600;
  }
  .space-shortcut-text span {
    color: var(--t3);
    font-size: var(--kenos-type-meta, var(--text-sm));
  }
  @media (min-width: 900px) {
    .space-list {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      border-block: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    }
    .space-shortcut {
      align-items: flex-start;
      min-height: 0;
      padding: 14px 12px;
      border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    }
    .space-shortcut + .space-shortcut {
      border-top: 0;
    }
    .space-shortcut:first-child {
      padding-left: 0;
    }
    .space-shortcut:last-child {
      border-right: 0;
    }
    .space-shortcut-text strong {
      font-size: var(--text-md);
      font-weight: 560;
    }
    .space-shortcut-text span {
      font-size: 12px;
    }
  }
  .empty-block {
    padding: 18px 0;
    border-block: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  }
  .empty-block-title {
    margin: 0 0 6px;
    color: var(--t1);
    font-size: var(--kenos-type-section, 17px);
    font-weight: 600;
  }
  .empty-block-body {
    margin: 0 0 12px;
    color: var(--t3);
    font-size: var(--text-md);
    max-width: 36rem;
  }
  .priority-skeleton {
    display: grid;
    gap: 10px;
    padding: 14px 0;
  }
  .priority-skeleton .skeleton {
    min-height: 14px;
    border-radius: 6px;
  }
  .priority-skeleton .skeleton--title {
    min-height: 20px;
    width: 55%;
  }
  .empty-block-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  @media (max-width: 720px) {
    .today-page {
      width: min(100% - 28px, var(--kenos-content-max, 820px));
      padding-top: var(--kenos-space-page-top, 24px);
      --today-level-gap: 26px;
      --today-section-gap: 18px;
    }
    .today-header {
      flex-direction: row;
      align-items: center;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .priority-row {
      transition: none;
    }
  }
</style>
