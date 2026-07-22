<script>
  import { onMount } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
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
    buildTodayOverviewLine,
    buildTodayReadModel,
    resolveSpaceLiveDetail,
    selectTodayDynamicSpaces,
    sortActivityNewestFirst,
    summarizeControlQueue,
    formatQueueCountLabel,
  } from '$lib/kenos/controlCenter.core.js'
  import { t } from '$lib/i18n/index.js'
  import { WORK, refreshWorkSurface } from '$lib/kenos/workStore.svelte.js'
  import { capabilityEmptyCopy } from '$lib/kenos/capabilityRegistry.core.js'
  import {
    isProdTodayKenosOverlayEnabled,
    isProdWorkReadEnabled,
  } from '$lib/kenos/prodReadFlags.core.js'
  import { PRODUCT_COPY } from '$lib/kenos/productStates.core.js'
  import {
    productSessionLabels,
    resolveProductSessionState,
  } from '$lib/kenos/productSessionState.core.js'
  import { CLOUD, isCloudAuthorized } from '$lib/cloud.svelte.js'
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
  const session = $derived(
    resolveProductSessionState({
      cloudReady: CLOUD.ready,
      cloudUser: CLOUD.user,
      cloudAuthorized: isCloudAuthorized(),
      cloudSyncing: CLOUD.syncing,
      cloudLastSyncAt: CLOUD.lastSyncAt,
      controlLoading: CONTROL.loading,
      sources: CONTROL.sources,
    }),
  )
  const sessionLabels = $derived(productSessionLabels(session))
  const overviewLine = $derived.by(() => {
    if (
      session.crossSpaceSummaryState === 'syncing' ||
      session.crossSpaceSummaryState === 'locked' ||
      session.crossSpaceSummaryState === 'unavailable' ||
      session.crossSpaceSummaryState === 'offline' ||
      session.crossSpaceSummaryState === 'error'
    ) {
      return sessionLabels.todayOverview
    }
    // Skip the hero row's own item — the overview must aggregate what the hero
    // does NOT show (second priorities + inbox/approvals counts), not repeat it.
    return buildTodayOverviewLine({
      priorities: today.priorities.slice(1),
      signals: today.signals,
      queue,
    })
  })
  const TODAY_SPACES_PREVIEW = 4
  const WORK_CARDS_PREVIEW = 6
  const ACTIVITY_PREVIEW = 3
  const todaySpaces = $derived(
    selectTodayDynamicSpaces(TODAY_SPACE_SHORTCUTS, {
      signals: today.signals,
      workCards: CONTROL.workCards,
      limit: TODAY_SPACES_PREVIEW,
    }),
  )
  const recentActivity = $derived(
    sortActivityNewestFirst(CONTROL.activities).slice(0, 3),
  )
  const workCapability = $derived(CONTROL.capabilities?.byId?.['work.read'])
  const workCapabilityCopy = $derived(capabilityEmptyCopy(workCapability))
  const todayNeedsSignIn = $derived(session.needsSignIn)
  const showTodaySkeleton = $derived(session.showTodaySkeleton)
  const showSpacesSection = $derived(
    !todayNeedsSignIn && todaySpaces.length > 0,
  )
  const showActivitySection = $derived(
    !todayNeedsSignIn && recentActivity.length > 0,
  )
  const showSpacesAll = $derived(todaySpaces.length >= TODAY_SPACES_PREVIEW)
  const showActivityAll = $derived(recentActivity.length >= ACTIVITY_PREVIEW)
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
      WORK_CARDS_PREVIEW,
    ),
  )
  const showWorkAll = $derived(workCards.length >= WORK_CARDS_PREVIEW)
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

  /** Prefer live signal line over static catalog detail. */
  function spaceLiveDetail(space) {
    return resolveSpaceLiveDetail(space.id, {
      signals: today.signals,
      workCards: CONTROL.workCards,
      fallback: space.detail,
    })
  }
</script>

<div class="today-page">
  <header class="today-header">
    <div class="today-header-main">
      <h1 class="kenos-page-title">{t('nav.today')}</h1>
      <p class="today-date">{dateLabel}</p>
      {#if overviewLine}
        <p class="today-overview">{overviewLine}</p>
      {/if}
    </div>
    <div class="today-actions">
      <button
        type="button"
        class="quiet-button"
        aria-label="刷新今日"
        disabled={CONTROL.loading}
        onclick={() => {
          refreshControlCenter({ force: true })
          refreshWorkSurface()
        }}
      >
        <span class={['refresh-icon', CONTROL.loading && 'refresh-icon--busy']}>
          <Icon name="refresh" size={14} strokeWidth={1.75} />
        </span>
        <span class="quiet-button-label">刷新</span>
      </button>
    </div>
  </header>

  {#if CONTROL.error}
    <p class="status-line status-line--error" role="status">
      {PRODUCT_COPY.todayPartialError.title}
      <button
        type="button"
        class="text-action"
        onclick={() => refreshControlCenter({ force: true })}
      >
        {PRODUCT_COPY.todayPartialError.action}
      </button>
    </p>
  {/if}

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
            aria-label="继续最近的空间"
            onclick={openContinueSheet}
          >
            继续
            <Icon name="history" size={14} strokeWidth={1.75} />
          </button>
        </div>

        {#if showTodaySkeleton && !today.priorities.length}
          <div
            class="priority-skeleton"
            aria-busy="true"
            aria-label={PRODUCT_COPY.todayLoading.label}
          >
            <div class="skeleton skeleton--hero"></div>
            <div class="skeleton skeleton--line"></div>
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
                    item.tone !== 'calm' &&
                    'priority-row--hero',
                ]}
                href={item.href}
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
                <span
                  class={[
                    'priority-badge',
                    `priority-badge--${item.tone}`,
                    (index === 0 || item.tone === 'critical') &&
                      'priority-badge--hero',
                  ]}
                  aria-hidden="true"
                ></span>
                <span class="priority-copy">
                  <span class="row-eyebrow">{item.eyebrow}</span>
                  <strong>{item.title}</strong>
                  {#if item.detail || item.stale}
                    <span class="row-detail"
                      >{item.detail}{item.stale
                        ? `${item.detail ? ' · ' : ''}数据陈旧，刷新后确认`
                        : ''}</span
                    >
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
        <div class="section-heading">
          <h2 id="today-decisions-title">{t('nav.inbox')}</h2>
        </div>
        <div class="queue-list">
          {#if session.inboxSyncState === 'syncing'}
            <div class="queue-row queue-row--primary kenos-anim-list-enter" role="status">
              <div class="queue-copy">
                <span class="queue-label">正在同步收件箱</span>
                <small>同步完成后会显示待处理事项</small>
              </div>
            </div>
          {:else if session.inboxSyncState === 'locked' || todayNeedsSignIn}
            <!-- needsSignIn implies locked — one actionable card, never a dead status div. -->
            <a
              href="/settings#cloud"
              class="queue-row queue-row--primary kenos-anim-list-enter"
            >
              <div class="queue-copy">
                <span class="queue-label"
                  >{PRODUCT_COPY.todayInboxUnavailable.title}</span
                >
                <small>{PRODUCT_COPY.todayInboxUnavailable.detail}</small>
              </div>
              <span class="queue-action-label"
                >{PRODUCT_COPY.todayInboxUnavailable.action}</span
              >
              <Icon name="chevron-right" size={16} strokeWidth={1.75} />
            </a>
          {:else if !queue.inboxAvailable}
            <div class="queue-row queue-row--primary kenos-anim-list-enter" role="status">
              <div class="queue-copy">
                <span class="queue-label">收件箱暂不可用</span>
                <small>可稍后重试；各空间仍可独立使用</small>
              </div>
            </div>
          {:else if (queue.inboxOpen ?? 0) === 0 && (queue.approvalsOpen ?? 0) === 0}
            <a href="/inbox" class="queue-row queue-row--primary kenos-anim-list-enter">
              <div class="queue-copy">
                <span class="queue-label">{PRODUCT_COPY.todayInboxClear.title}</span>
                <small>{PRODUCT_COPY.todayInboxClear.detail}</small>
              </div>
              <span class="queue-action-label"
                >{PRODUCT_COPY.todayInboxClear.action}</span
              >
              <Icon name="chevron-right" size={16} strokeWidth={1.75} />
            </a>
          {:else}
            <a href="/inbox" class="queue-row queue-row--primary kenos-anim-list-enter">
              <div class="queue-copy">
                <span class="queue-label"
                  >{PRODUCT_COPY.todayInboxPending.title(
                    Number(queue.inboxOpen || 0) + Number(queue.approvalsOpen || 0),
                  )}</span
                >
                <small>{PRODUCT_COPY.todayInboxPending.detail}</small>
              </div>
              <strong class="queue-count">
                {formatQueueCountLabel(
                  Number(queue.inboxOpen || 0) + Number(queue.approvalsOpen || 0),
                )}
              </strong>
              <Icon name="chevron-right" size={16} strokeWidth={1.75} />
            </a>
          {/if}
        </div>
      </section>
    </div>

    <div class="today-level-2">
      {#if workCapabilityCopy.kind === 'unauthorized'}
        <section
          class="kenos-anim-chrome-enter"
          aria-labelledby="today-work-title"
        >
          <div class="section-heading section-heading--meta">
            <h2 id="today-work-title">{t('nav.work')}</h2>
          </div>
          <div class="empty-block" role="status">
            <p class="empty-block-title">{PRODUCT_COPY.lockedWork.title}</p>
            <p class="empty-block-body">{PRODUCT_COPY.lockedWork.body}</p>
            <div class="empty-block-actions">
              <a href="/settings#cloud" class="text-action"
                >{PRODUCT_COPY.lockedWork.action}</a
              >
            </div>
          </div>
        </section>
      {:else if !todayNeedsSignIn && workCards.length > 0}
      <section
        class="kenos-anim-chrome-enter"
        aria-labelledby="today-work-title"
      >
        <div class="section-heading section-heading--meta">
          <h2 id="today-work-title">{t('nav.work')}</h2>
          {#if showWorkAll}
            <!-- Work 的「全部」进 Work 全量，而非所有空间列表。 -->
            <a href="/work" class="text-action">
              全部
              <Icon name="chevron-right" size={15} strokeWidth={1.75} />
            </a>
          {/if}
        </div>
        <div class="signal-list">
          {#each workCards as card (card.id)}
            <a
              href={card.deepLink || '/work'}
              class="signal-row kenos-anim-list-enter"
              owner={card.ownerDomain}
              data-owner-domain={card.ownerDomain}
            >
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
      </section>
      {:else if !todayNeedsSignIn && workCapabilityCopy.kind === 'error'}
        <section
          class="kenos-anim-chrome-enter"
          aria-labelledby="today-work-title"
        >
          <div class="section-heading section-heading--meta">
            <h2 id="today-work-title">{t('nav.work')}</h2>
          </div>
          <p class="empty-copy" role="status">
            {PRODUCT_COPY.todayPartialError.title}
            <button
              type="button"
              class="empty-copy-action"
              onclick={() => refreshControlCenter({ force: true })}
            >
              {PRODUCT_COPY.todayPartialError.action}
            </button>
          </p>
        </section>
      {/if}

      {#if !todayNeedsSignIn && today.signals.length}
        <section
          class="kenos-anim-chrome-enter"
          aria-labelledby="today-signals-title"
        >
          <div class="section-heading section-heading--meta">
            <h2 id="today-signals-title">来自空间</h2>
          </div>
          <div class="signal-list">
            {#each today.signals as signal (signal.id)}
              <a
                href={signal.href}
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
                <span class="signal-copy">
                  <span class="signal-label">{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <span class="signal-detail"
                    >{signal.detail}{signal.stale ? ' · 数据陈旧' : ''}</span
                  >
                </span>
                <Icon name="chevron-right" size={14} strokeWidth={1.75} />
              </a>
            {/each}
          </div>
        </section>
      {/if}

      {#if showSpacesSection}
        <section
          class="kenos-anim-chrome-enter"
          aria-labelledby="today-spaces-title"
        >
          <div class="section-heading section-heading--meta">
            <h2 id="today-spaces-title">空间动态</h2>
            {#if showSpacesAll}
              <a href="/spaces" class="text-action" onclick={onAllSpacesClick}
                >全部</a
              >
            {/if}
          </div>
          <nav class="space-list" aria-label="今天有变化的空间">
            {#each todaySpaces as space (space.id)}
              <a
                class="space-shortcut kenos-anim-list-enter"
                href={space.href}
                data-space-id={space.id}
                style:--space-accent={space.accent || 'transparent'}
                onclick={(e) => onTodaySpace(space, e)}
              >
                {#if space.icon}
                  <span
                    class="space-shortcut-icon"
                    style:--space-accent={space.accent || 'var(--t3)'}
                    aria-hidden="true"
                  >
                    <Icon name={space.icon} size={16} strokeWidth={1.75} />
                  </span>
                {/if}
                <span class="space-shortcut-text">
                  <strong>{space.label}</strong>
                  <span>{spaceLiveDetail(space)}</span>
                </span>
              </a>
            {/each}
          </nav>
        </section>
      {/if}
    </div>

    {#if showActivitySection}
      <div class="today-level-3">
        <section
          class="kenos-anim-chrome-enter"
          aria-labelledby="today-activity-title"
        >
          <div
            class="section-heading section-heading--meta section-heading--quiet"
          >
            <h2 id="today-activity-title">系统已处理</h2>
            {#if showActivityAll}
              <a href="/inbox#activity" class="text-action text-action--quiet"
                >全部</a
              >
            {/if}
          </div>
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
        </section>
      </div>
    {/if}
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
    /* Scroll-end clearance lives on #main-content (dock SSOT) — don't double-pad. */
    padding-top: 0;
    padding-bottom: 0;
  }
  :global(html[data-ios-native-shell='true'] .today-header) {
    padding-bottom: 2px;
    align-items: center;
  }
  /* SystemBar already owns Continue — don't duplicate in content. */
  :global(html[data-ios-native-shell='true'] .today-continue-inline) {
    display: none;
  }
  :global(html[data-ios-native-shell='true'] .quiet-button-label) {
    display: none;
  }
  :global(html[data-ios-native-shell='true'] .today-actions .quiet-button) {
    /* 40pt 触达目标 — 32px 低于 HIG 且是唯一的刷新入口。 */
    width: 40px;
    min-height: 40px;
    padding: 0;
    justify-content: center;
    opacity: 0.5;
  }
  :global(html[data-ios-native-shell='true'] .today-date) {
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-meta, 12px);
    letter-spacing: 0.02em;
    margin: 8px 0 0;
    text-transform: none;
    font-weight: 520;
  }
  :global(html[data-ios-native-shell='true'] .today-overview) {
    margin-top: 6px;
    font-size: var(--kenos-type-secondary, 14px);
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
    gap: 10px;
  }
  :global(html[data-ios-native-shell='true'] .today-level-2) {
    gap: 14px;
  }
  :global(html[data-ios-native-shell='true'] .section-heading--meta h2) {
    color: var(--t2);
  }
  :global(html[data-ios-native-shell='true'] .row-eyebrow),
  :global(html[data-ios-native-shell='true'] .row-detail),
  :global(html[data-ios-native-shell='true'] .queue-row small),
  :global(html[data-ios-native-shell='true'] .signal-detail),
  :global(html[data-ios-native-shell='true'] .space-shortcut-text span) {
    color: var(--t2);
    opacity: 1;
  }
  :global(html[data-ios-native-shell='true'] .priority-row--hero .priority-copy strong) {
    font-size: clamp(1.2rem, 4.2vw, 1.4rem);
    font-weight: 680;
  }
  :global(html[data-ios-native-shell='true'] .queue-row) {
    min-height: 64px;
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
    margin: 10px 0 0;
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 520;
    letter-spacing: 0.01em;
    text-transform: none;
  }
  .today-overview {
    margin: 8px 0 0;
    max-width: 36rem;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-secondary, 14px);
    font-weight: 520;
    line-height: 1.45;
  }
  h1,
  :global(.kenos-page-title) {
    margin: 0;
    color: var(--t1);
    font-size: var(--kenos-type-page, var(--kenos-chrome-title-size, 24px));
    font-weight: var(--kenos-weight-page, 650);
    letter-spacing: var(--kenos-tracking-page, -0.03em);
    line-height: var(--kenos-leading-page, 1.15);
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
    /* 32px min hit area — these are small but frequent controls (继续/全部/刷新). */
    min-height: 32px;
    padding-block: 4px;
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
  .refresh-icon {
    display: inline-flex;
  }
  .refresh-icon--busy {
    animation: today-refresh-spin 0.9s linear infinite;
  }
  @keyframes today-refresh-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .refresh-icon--busy {
      animation: none;
    }
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
    padding-bottom: 4px;
    border-bottom: 0;
  }
  .section-heading--focus {
    margin-bottom: 6px;
  }
  .today-level-2 {
    display: grid;
    gap: calc(var(--today-section-gap, 20px) * 0.85);
    padding-top: 2px;
  }
  .today-level-3 {
    display: grid;
    gap: 12px;
    opacity: 0.9;
    padding-top: 2px;
    border-top: 0;
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
    color: var(--t2);
    font-size: var(--kenos-type-meta, var(--text-xs));
    font-weight: 650;
    letter-spacing: var(--kenos-tracking-meta, 0.06em);
    text-transform: uppercase;
    line-height: 1.3;
  }
  .priority-list,
  .queue-list,
  .signal-list,
  .activity-list,
  .space-list {
    background: var(--kenos-surface-group, var(--card));
    border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
    border-radius: var(--kenos-radius-group, var(--radius-lg, 12px));
    overflow: hidden;
  }
  .priority-row {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    padding: 16px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    color: inherit;
    text-decoration: none;
    transition:
      opacity var(--dur-fast) var(--ease-standard),
      transform var(--dur-fast) var(--ease-standard),
      background var(--dur-fast) var(--ease-standard);
  }
  .priority-row:last-child,
  .queue-row:last-child,
  .signal-row:last-child,
  .activity-row:last-child,
  .space-shortcut:last-child {
    border-bottom: 0;
  }
  .priority-row:not(.priority-row--hero) {
    padding: 12px 14px;
    opacity: 0.96;
  }
  .priority-row:not(.priority-row--hero) .priority-copy strong {
    font-size: var(--kenos-type-list, var(--text-lg));
    font-weight: 600;
  }
  .priority-row--hero {
    padding: 18px 14px;
  }
  .priority-row:hover {
    background: color-mix(in srgb, var(--card-h, var(--bg-2)) 70%, transparent);
  }
  /* Round 2: tone as badge, not colored vertical rail */
  .priority-badge {
    width: 8px;
    height: 8px;
    margin-top: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--t3);
  }
  .priority-badge--hero {
    width: 9px;
    height: 9px;
    margin-top: 5px;
  }
  .priority-badge--critical {
    background: var(--critical);
  }
  .priority-badge--attention {
    background: var(--accent);
  }
  .priority-badge--info,
  .priority-badge--neutral {
    background: color-mix(in srgb, var(--t1) 28%, transparent);
  }
  .priority-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .priority-copy strong {
    color: var(--t1);
    font-size: clamp(17px, 2.4vw, 20px);
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .priority-skeleton {
    display: grid;
    gap: 10px;
    padding: 8px 0 4px;
  }
  .skeleton-caption {
    margin: 0;
    color: var(--t2);
    font-size: 13px;
    font-weight: 520;
  }
  .skeleton {
    border-radius: 8px;
    background: color-mix(in srgb, var(--t1) 8%, transparent);
  }
  .skeleton--hero {
    height: 52px;
    width: 100%;
  }
  .skeleton--line {
    height: 14px;
    width: 72%;
  }
  .skeleton--line-short {
    width: 48%;
  }
  .row-detail,
  .signal-detail,
  .activity-row span,
  .empty-copy,
  .empty-block {
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-meta, 12px);
  }
  .row-detail {
    font-weight: 450;
    line-height: 1.4;
  }
  .empty-copy-detail {
    display: block;
    margin-top: 4px;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-tertiary, 0.5) * 100%),
      transparent
    );
    font-size: var(--kenos-type-meta, 12px);
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
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-meta, 12px);
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 1;
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    color: var(--t1);
    text-decoration: none;
  }
  .queue-action-label {
    color: var(--t2);
    font-size: 13px;
    font-weight: 600;
  }
  .queue-row--primary .queue-label {
    font-weight: 680;
  }
  .queue-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .queue-label {
    font-weight: 650;
    font-size: var(--kenos-type-list, var(--text-lg));
  }
  .queue-count {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: clamp(20px, 2.8vw, 26px);
    font-weight: 680;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .queue-row small {
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-secondary, 14px);
    opacity: 1;
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
    padding: 12px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    color: inherit;
    text-decoration: none;
  }
  .signal-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .signal-label {
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-weight: 600;
    font-size: var(--kenos-type-meta, 12px);
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
    padding: 12px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
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
  /* Narrow: raised vertical list (Continuity family) */
  .space-list {
    display: grid;
    gap: 0;
  }
  .space-shortcut {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 12px 14px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    color: inherit;
    text-decoration: none;
    background: transparent;
  }
  .space-shortcut:hover {
    background: color-mix(
      in srgb,
      var(--space-accent, transparent) 7%,
      var(--card-h)
    );
  }
  .space-shortcut-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--space-accent, var(--t3)) 14%, transparent);
    color: color-mix(in srgb, var(--space-accent, var(--t2)) 82%, var(--t1));
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
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-meta, 12px);
  }
  @media (min-width: 900px) {
    .space-list {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .space-shortcut {
      align-items: flex-start;
      min-height: 0;
      padding: 14px 12px;
      border-bottom: 0;
      border-right: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
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
    padding: 16px 14px;
    background: var(--kenos-surface-group, var(--card));
    border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
    border-radius: var(--kenos-radius-group, var(--radius-lg, 12px));
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
