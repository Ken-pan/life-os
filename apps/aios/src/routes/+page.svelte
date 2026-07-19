<script>
  import { onMount } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { CONTROL, refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'
  import {
    buildTodayReadModel,
    KENOS_SPACES,
    sortActivityNewestFirst,
    summarizeControlQueue,
  } from '$lib/kenos/controlCenter.core.js'

  const today = $derived(buildTodayReadModel(CONTROL.summary))
  const queue = $derived(summarizeControlQueue(CONTROL))
  const recentActivity = $derived(sortActivityNewestFirst(CONTROL.activities).slice(0, 3))
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())

  onMount(() => {
    void refreshControlCenter()
  })
</script>

<div class="today-page">
  <header class="today-header">
    <div>
      <p class="today-date">{dateLabel}</p>
      <h1>Today</h1>
      <p class="today-intro">状态、下一步和需要你决定的事。</p>
    </div>
    <div class="today-actions">
      {#if CONTROL.demo}
        <span class="beta-label">本地演示 · 不执行动作</span>
      {/if}
      <button
        type="button"
        class="quiet-button"
        aria-label="刷新 Today"
        disabled={CONTROL.loading}
        onclick={() => refreshControlCenter({ force: true })}
      >
        <Icon name="refresh" size={16} strokeWidth={1.75} />
        刷新
      </button>
    </div>
  </header>

  {#if CONTROL.error}
    <p class="status-line status-line--error" role="status">
      {CONTROL.error}。没有执行任何写入。
    </p>
  {:else if CONTROL.loading}
    <p class="status-line" aria-live="polite">正在汇总各 Space 的只读状态…</p>
  {:else if today.asOf}
    <p class="status-line">读模型更新时间：{today.asOf}</p>
  {/if}

  <main class="today-workspace">
    <section class="focus-section" aria-labelledby="today-focus-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">现在</p>
          <h2 id="today-focus-title">真正重要的事</h2>
        </div>
        <a href="/assistant" class="text-action">
          问 Assistant
          <Icon name="chevron-right" size={15} strokeWidth={1.75} />
        </a>
      </div>

      {#if today.priorities.length}
        <div class="priority-list">
          {#each today.priorities as item (item.id)}
            <a
              class="priority-row priority-row--{item.tone}"
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="priority-marker" aria-hidden="true"></span>
              <span class="priority-copy">
                <span class="row-eyebrow">{item.eyebrow}</span>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </span>
              <span class="row-action">{item.actionLabel}</span>
            </a>
          {/each}
        </div>
      {:else}
        <div class="empty-block">
          <p>{today.emptyReason}</p>
          <a href="/assistant">从 Assistant 开始</a>
        </div>
      {/if}
    </section>

    <section aria-labelledby="today-decisions-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">控制面</p>
          <h2 id="today-decisions-title">等待处理</h2>
        </div>
      </div>
      <div class="queue-list">
        <a href="/inbox" class="queue-row">
          <span>Inbox</span>
          <strong>{queue.inboxOpen}</strong>
          <small>Capture 与待分类输入</small>
          <Icon name="chevron-right" size={16} strokeWidth={1.75} />
        </a>
        <a href="/approvals" class="queue-row">
          <span>Approvals</span>
          <strong>{queue.approvalsOpen}</strong>
          <small>需要确认范围与影响</small>
          <Icon name="chevron-right" size={16} strokeWidth={1.75} />
        </a>
        <a href="/activity" class="queue-row">
          <span>Activity</span>
          <strong class:count-alert={queue.activityFailures > 0}>{queue.activityFailures}</strong>
          <small>失败或需要恢复的动作</small>
          <Icon name="chevron-right" size={16} strokeWidth={1.75} />
        </a>
      </div>
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
            <a href={signal.href} target="_blank" rel="noopener noreferrer" class="signal-row">
              <span class="signal-label">{signal.label}</span>
              <strong>{signal.value}</strong>
              <span>{signal.detail}</span>
              <Icon name="external" size={14} strokeWidth={1.75} />
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <section aria-labelledby="today-activity-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">可追溯</p>
          <h2 id="today-activity-title">系统已处理</h2>
        </div>
        <a href="/activity" class="text-action">查看全部</a>
      </div>
      {#if recentActivity.length}
        <div class="activity-list">
          {#each recentActivity as item (item.id)}
            <div class="activity-row">
              <span class="activity-state activity-state--{item.status}"></span>
              <div>
                <strong>{item.summary}</strong>
                <span>{item.result}</span>
              </div>
              <time>{item.occurredLabel}</time>
            </div>
          {/each}
        </div>
      {:else}
        <p class="empty-copy">这个客户端还没有可显示的 Activity。</p>
      {/if}
    </section>

    <section aria-labelledby="today-spaces-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">深入工作</p>
          <h2 id="today-spaces-title">Spaces</h2>
        </div>
      </div>
      <nav class="space-list" aria-label="Kenos Spaces">
        {#each KENOS_SPACES as space (space.id)}
          <a href={space.href} target="_blank" rel="noopener noreferrer">
            <strong>{space.label}</strong>
            <span>{space.detail}</span>
          </a>
        {/each}
      </nav>
    </section>
  </main>
</div>

<style>
  .today-page {
    width: min(100% - 32px, 1040px);
    margin-inline: auto;
    padding: clamp(28px, 5vw, 64px) 0 96px;
  }
  .today-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: clamp(28px, 5vw, 48px);
    border-bottom: 1px solid var(--border);
  }
  .today-date,
  .section-kicker {
    margin: 0 0 6px;
    color: var(--t3);
    font-size: var(--text-sm);
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    color: var(--t1);
    font-size: clamp(42px, 7vw, 72px);
    font-weight: 620;
    letter-spacing: -0.055em;
    line-height: 0.98;
  }
  .today-intro {
    margin: 14px 0 0;
    color: var(--t2);
    font-size: var(--text-xl);
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
  .quiet-button:hover,
  .text-action:hover {
    color: var(--t1);
  }
  .quiet-button:disabled {
    opacity: 0.5;
  }
  .status-line {
    margin: 14px 0 0;
  }
  .status-line--error {
    color: var(--critical);
  }
  .today-workspace {
    display: grid;
    gap: clamp(42px, 7vw, 72px);
    padding-top: clamp(42px, 7vw, 72px);
  }
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  h2 {
    margin: 0;
    color: var(--t1);
    font-size: clamp(21px, 3vw, 28px);
    font-weight: 600;
    letter-spacing: -0.025em;
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
    padding: 22px 0;
    border-bottom: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
    transition:
      opacity var(--dur-fast) var(--ease-standard),
      transform var(--dur-fast) var(--ease-standard);
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
    gap: 4px;
  }
  .priority-copy strong {
    color: var(--t1);
    font-size: clamp(19px, 3vw, 24px);
    font-weight: 590;
  }
  .priority-copy > span:last-child,
  .signal-row > span,
  .activity-row span,
  .empty-copy,
  .empty-block {
    color: var(--t3);
    font-size: var(--text-md);
  }
  .row-eyebrow {
    color: var(--t2);
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .row-action {
    color: var(--t2);
    font-size: var(--text-md);
  }
  .queue-row {
    display: grid;
    grid-template-columns: minmax(100px, 0.65fr) 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    min-height: 58px;
    border-bottom: 1px solid var(--border);
    color: var(--t1);
    text-decoration: none;
  }
  .queue-row strong {
    font-variant-numeric: tabular-nums;
    font-size: var(--text-2xl);
  }
  .queue-row small {
    color: var(--t3);
  }
  .count-alert {
    color: var(--critical);
  }
  .signal-row {
    display: grid;
    grid-template-columns: 96px minmax(180px, 0.8fr) minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    min-height: 64px;
    border-bottom: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }
  .signal-label {
    color: var(--t2) !important;
    font-weight: 600;
  }
  .signal-row strong {
    color: var(--t1);
    font-weight: 560;
  }
  .activity-row {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 16px;
    align-items: start;
    padding: 18px 0;
    border-bottom: 1px solid var(--border);
  }
  .activity-row > div {
    display: grid;
    gap: 4px;
  }
  .activity-row strong {
    color: var(--t1);
    font-weight: 560;
  }
  .activity-row time {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .activity-state {
    width: 7px;
    height: 7px;
    margin-top: 6px;
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
  .space-list a {
    display: grid;
    gap: 4px;
    padding: 16px 14px;
    border-right: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }
  .space-list a:first-child {
    padding-left: 0;
  }
  .space-list a:last-child {
    border-right: 0;
  }
  .space-list strong {
    color: var(--t1);
    font-weight: 600;
  }
  .space-list span {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .empty-block {
    padding: 20px 0;
    border-block: 1px solid var(--border);
  }
  .empty-block p {
    margin: 0 0 8px;
  }
  .empty-block a {
    color: var(--t1);
  }
  @media (max-width: 720px) {
    .today-page {
      width: min(100% - 28px, 1040px);
      padding-top: 28px;
    }
    .today-header {
      align-items: flex-start;
      flex-direction: column;
    }
    .today-actions {
      justify-content: flex-start;
    }
    .queue-row {
      grid-template-columns: minmax(0, 1fr) 34px auto;
      padding: 12px 0;
    }
    .queue-row small {
      grid-column: 1 / 3;
      grid-row: 2;
    }
    .signal-row {
      grid-template-columns: 72px minmax(0, 1fr) auto;
      padding: 14px 0;
    }
    .signal-row > span:not(.signal-label) {
      grid-column: 2 / 4;
    }
    .space-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .space-list a,
    .space-list a:first-child {
      padding: 14px 0;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .space-list a:nth-child(odd) {
      padding-right: 12px;
      border-right: 1px solid var(--border);
    }
    .space-list a:nth-child(even) {
      padding-left: 12px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .priority-row {
      transition: none;
    }
  }
</style>
