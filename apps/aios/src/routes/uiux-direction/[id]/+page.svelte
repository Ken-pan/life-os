<script>
  /** Visual Quality Rescue — three distinct direction prototypes (local only). */
  let { data } = $props()

  /** @type {'today' | 'spaces' | 'switcher' | 'fitness' | 'planner'} */
  let surface = $state('today')
  /** @type {'dark' | 'light'} */
  let theme = $state('dark')

  const id = $derived(data.id || 'a')
  const label = $derived(
    id === 'a' ? 'Native Content First' : id === 'b' ? 'Calm Editorial Workspace' : 'Spatial Context System',
  )

  const fixtures = {
    overdue: '1 项任务已逾期',
    overdueDetail: '另有 4 项今天到期',
    inboxOpen: 2,
    approvals: 1,
    training: 'Push Day · Bench / OHP / Fly',
    planTask: '完成 Phase 2 review',
  }
</script>

<div class="direction-root dir-{id}" data-theme={theme} data-testid="uiux-direction-{id}">
  <header class="proto-bar">
    <div class="proto-meta">
      <strong>Direction {id.toUpperCase()}</strong>
      <span>{label}</span>
    </div>
    <nav class="proto-surfaces" aria-label="Prototype surface">
      {#each ['today', 'spaces', 'switcher', 'fitness', 'planner'] as s (s)}
        <button type="button" class:on={surface === s} onclick={() => (surface = s)}>{s}</button>
      {/each}
    </nav>
    <button type="button" class="theme-toggle" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
      {theme}
    </button>
  </header>

  <main class="proto-stage">
    {#if surface === 'today'}
      <section class="surface today" aria-label="Today prototype">
        {#if id === 'c'}
          <aside class="context-rail" aria-label="Current context">
            <p class="rail-kicker">Now in</p>
            <p class="rail-space">System · Today</p>
            <p class="rail-kicker">Recent</p>
            <button type="button">Training</button>
            <button type="button">Plan</button>
            <button type="button">Work</button>
          </aside>
        {/if}
        <div class="today-main">
          <p class="kicker">Monday · Jul 20</p>
          <h1>Today</h1>
          {#if id === 'b'}
            <p class="lede">真正重要的事先处理。其余退到 Inbox 与各 Space。</p>
          {:else}
            <p class="lede">状态、下一步、需要你决定的事。</p>
          {/if}
          <div class="block priority">
            <div class="block-head">
              <h2>真正重要的事</h2>
              <a href="#assistant">Assistant</a>
            </div>
            <a class="row primary" href="#plan">
              <span class="eyebrow">需要处理</span>
              <strong>{fixtures.overdue}</strong>
              <span class="meta">{fixtures.overdueDetail}</span>
            </a>
          </div>
          <div class="block">
            <div class="block-head">
              <h2>等待处理</h2>
            </div>
            <a class="row" href="#inbox">
              <span>Inbox</span>
              <strong class="num">{fixtures.inboxOpen}</strong>
              <span class="meta">待批准 {fixtures.approvals}</span>
            </a>
          </div>
        </div>
      </section>
    {:else if surface === 'spaces'}
      <section class="surface spaces" aria-label="Spaces prototype">
        <h1>Spaces</h1>
        <p class="lede">进入领域。其他 Space 不常驻底部。</p>
        {#if id === 'c'}
          <div class="recent-shelf" aria-label="Recent spaces">
            <button type="button" class="shelf-item current">Today</button>
            <button type="button" class="shelf-item">Training</button>
            <button type="button" class="shelf-item">Plan</button>
            <button type="button" class="shelf-item">Work</button>
          </div>
        {/if}
        <div class="group">
          <h2>Focus</h2>
          <a class="row" href="#tf"><strong>Training Focus</strong><span class="meta">沉浸训练</span></a>
          <a class="row" href="#dw"><strong>Deep Work</strong><span class="meta">Work / Plan</span></a>
        </div>
        <div class="group">
          <h2>Domain</h2>
          <a class="row domain plan" href="#plan"><strong>Plan</strong><span class="meta">任务与时间</span></a>
          <a class="row domain money" href="#money"><strong>Money</strong><span class="meta">收支与决策</span></a>
          <a class="row domain training" href="#fit"><strong>Training</strong><span class="meta">训练与恢复</span></a>
        </div>
      </section>
    {:else if surface === 'switcher'}
      <section class="surface switcher" aria-label="Space switcher prototype">
        <div class="switcher-panel">
          <h1>{id === 'c' ? 'Continue' : 'Switch Space'}</h1>
          <p class="lede">保留内部状态。不增加第五个 Tab。</p>
          <div class="group">
            <h2>System</h2>
            <button type="button" class="row current"><strong>Today</strong></button>
            <button type="button" class="row"><strong>Assistant</strong></button>
            <button type="button" class="row"><strong>Inbox</strong></button>
          </div>
          <div class="group">
            <h2>Recent</h2>
            <button type="button" class="row"><strong>Training</strong><span class="meta">Push Day · mid-set</span></button>
            <button type="button" class="row"><strong>Plan</strong><span class="meta">{fixtures.planTask}</span></button>
          </div>
        </div>
      </section>
    {:else if surface === 'fitness'}
      <section class="surface fitness" aria-label="Fitness prototype">
        <p class="kicker">Training</p>
        <h1>Push Day</h1>
        <p class="lede">{fixtures.training}</p>
        <ol class="workout">
          <li><strong>Bench press</strong><span>4 × 8</span></li>
          <li class="active"><strong>Overhead press</strong><span>Set 2 of 4</span></li>
          <li><strong>Cable fly</strong><span>3 × 12</span></li>
        </ol>
        <button type="button" class="primary-btn">记录本组</button>
        {#if id !== 'a'}
          <p class="shell-hint">Kenos chrome 降低 · 可切 Plan 后恢复此组</p>
        {/if}
      </section>
    {:else}
      <section class="surface planner" aria-label="Planner prototype">
        <p class="kicker">Plan</p>
        <h1>接下来</h1>
        <ul class="tasks">
          <li class="selected">
            <strong>{fixtures.planTask}</strong>
            <span class="meta">今天 · 工作</span>
          </li>
          <li><strong>整理 Phase 2 反馈</strong><span class="meta">Inbox</span></li>
          <li><strong>更新 Training 计划</strong><span class="meta">跨域</span></li>
        </ul>
      </section>
    {/if}
  </main>
</div>

<style>
  .direction-root {
    position: fixed;
    inset: 0;
    z-index: 200;
    overflow: auto;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --canvas: #0b0b0c;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --line: color-mix(in srgb, var(--text) 12%, transparent);
    --accent: #5b8def;
    background: var(--canvas);
    color: var(--text);
  }
  .direction-root[data-theme='light'] {
    --canvas: #f6f5f2;
    --text: #141414;
    --muted: #6b6b6b;
    --line: color-mix(in srgb, var(--text) 12%, transparent);
  }

  /* —— A: Native Content First —— */
  .dir-a {
    --accent: #0a84ff;
  }
  .dir-a .proto-bar {
    background: color-mix(in srgb, var(--canvas) 80%, transparent);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--line);
  }
  .dir-a .today h1,
  .dir-a .spaces h1 {
    font-size: clamp(28px, 5vw, 34px);
    font-weight: 700;
    letter-spacing: -0.03em;
    margin: 0 0 6px;
  }
  .dir-a .lede {
    color: var(--muted);
    margin: 0 0 28px;
    font-size: 15px;
    max-width: 36rem;
  }
  .dir-a .block {
    border-top: 1px solid var(--line);
    padding: 16px 0;
  }
  .dir-a .row {
    display: grid;
    gap: 2px;
    padding: 12px 0;
    min-height: 44px;
    color: inherit;
    text-decoration: none;
  }
  .dir-a .row.primary strong {
    font-size: 17px;
  }
  .dir-a .group {
    border-top: 1px solid var(--line);
    margin-top: 8px;
  }
  .dir-a .group h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 16px 0 4px;
  }
  .dir-a .switcher-panel {
    max-width: 420px;
    margin: 0 auto;
  }
  .dir-a .fitness .workout {
    list-style: none;
    padding: 0;
    margin: 24px 0;
  }
  .dir-a .fitness .workout li {
    display: flex;
    justify-content: space-between;
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  .dir-a .fitness .workout li.active strong {
    color: var(--accent);
  }

  /* —— B: Calm Editorial Workspace —— */
  .dir-b {
    --accent: #c45c26;
    --canvas: #111110;
  }
  .dir-b[data-theme='light'] {
    --canvas: #f3efe7;
    --accent: #9a3412;
  }
  .dir-b .proto-stage {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 28px 96px;
  }
  .dir-b h1 {
    font-size: clamp(40px, 7vw, 56px);
    font-weight: 620;
    letter-spacing: -0.045em;
    line-height: 1.05;
    margin: 0 0 12px;
  }
  .dir-b .lede {
    font-size: 18px;
    line-height: 1.55;
    color: var(--muted);
    max-width: 34rem;
    margin: 0 0 40px;
  }
  .dir-b .block-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
  }
  .dir-b .block-head h2 {
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0;
  }
  .dir-b .row.primary {
    padding: 20px 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .dir-b .row.primary strong {
    font-size: 22px;
    font-weight: 600;
  }
  .dir-b .num {
    font-variant-numeric: tabular-nums;
    font-size: 28px;
    font-weight: 550;
  }
  .dir-b .group {
    margin-top: 36px;
  }
  .dir-b .domain.plan strong {
    border-bottom: 2px solid color-mix(in srgb, #3d9ed6 70%, transparent);
  }
  .dir-b .domain.money strong {
    border-bottom: 2px solid color-mix(in srgb, #5a9e6f 70%, transparent);
  }
  .dir-b .domain.training strong {
    border-bottom: 2px solid color-mix(in srgb, #e07a3d 70%, transparent);
  }

  /* —— C: Spatial Context System —— */
  .dir-c {
    --accent: #7c5cff;
  }
  .dir-c .today {
    display: grid;
    grid-template-columns: minmax(140px, 200px) 1fr;
    gap: 0;
    min-height: calc(100vh - 56px);
  }
  .dir-c .context-rail {
    border-right: 1px solid var(--line);
    padding: 24px 16px;
    background: color-mix(in srgb, var(--text) 4%, var(--canvas));
  }
  .dir-c .rail-kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 16px 0 6px;
  }
  .dir-c .rail-space {
    font-weight: 650;
    margin: 0 0 12px;
  }
  .dir-c .context-rail button {
    display: block;
    width: 100%;
    text-align: left;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--text);
    padding: 8px 10px;
    border-radius: 10px;
    cursor: pointer;
  }
  .dir-c .context-rail button:hover {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }
  .dir-c .today-main {
    padding: 28px 24px 96px;
  }
  .dir-c .recent-shelf {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 0 20px;
  }
  .dir-c .shelf-item {
    min-height: 44px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    color: var(--text);
    white-space: nowrap;
    cursor: pointer;
  }
  .dir-c .shelf-item.current {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .dir-c .switcher-panel {
    margin: 24px;
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: color-mix(in srgb, var(--text) 5%, var(--canvas));
    box-shadow: 0 24px 80px color-mix(in srgb, #000 35%, transparent);
  }
  .dir-c .row.current {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 0;
    border-radius: 12px;
    padding-inline: 10px;
  }

  /* shared chrome */
  .proto-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--canvas);
  }
  .proto-meta {
    display: grid;
    gap: 2px;
    font-size: 12px;
  }
  .proto-meta span {
    color: var(--muted);
  }
  .proto-surfaces {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .proto-surfaces button,
  .theme-toggle,
  .primary-btn {
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  .proto-surfaces button.on {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .proto-stage {
    padding: 24px 20px 96px;
  }
  .dir-a .proto-stage,
  .dir-c .today-main {
    max-width: 720px;
  }
  .kicker,
  .eyebrow {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 6px;
  }
  .meta {
    color: var(--muted);
    font-size: 13px;
  }
  .block-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
  }
  .block-head a {
    color: var(--accent);
    text-decoration: none;
    font-size: 14px;
  }
  .row {
    display: grid;
    gap: 2px;
    width: 100%;
    text-align: left;
    color: inherit;
    text-decoration: none;
    background: transparent;
    border: 0;
    padding: 12px 0;
    cursor: pointer;
    font: inherit;
  }
  .group h2 {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .primary-btn {
    background: var(--text);
    color: var(--canvas);
    border: 0;
    min-height: 44px;
    font-weight: 650;
  }
  .shell-hint {
    color: var(--muted);
    font-size: 13px;
    margin-top: 16px;
  }
  .tasks {
    list-style: none;
    padding: 0;
    margin: 24px 0;
  }
  .tasks li {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
    display: grid;
    gap: 4px;
  }
  .tasks li.selected strong {
    color: var(--accent);
  }
  @media (max-width: 720px) {
    .dir-c .today {
      grid-template-columns: 1fr;
    }
    .dir-c .context-rail {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid var(--line);
      align-items: center;
    }
    .dir-c .rail-kicker,
    .dir-c .rail-space {
      display: none;
    }
  }
</style>
