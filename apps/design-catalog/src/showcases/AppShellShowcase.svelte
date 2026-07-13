<script>
  import LifeOsAppShell from '@life-os/platform-web/svelte/app-shell'

  let navigationKey = $state('shell-demo-1')
  let showChrome = $state(true)
  let simulateSafeArea = $state(false)

  function advanceRoute() {
    navigationKey = navigationKey === 'shell-demo-1' ? 'shell-demo-2' : 'shell-demo-1'
  }
</script>

<section
  class="shell-showcase"
  class:shell-showcase--safe-area={simulateSafeArea}
  data-testid="showcase-app-shell"
>
  <LifeOsAppShell
    {navigationKey}
    focusOnNavigate="main"
    mainLabel="Shell fixture content"
    skipLinkLabel="Skip to fixture content"
    testIdPrefix="catalog-app-shell"
  >
    {#snippet header()}
      {#if showChrome}
        <header class="appbar shell-demo-header">
          <div class="shell-demo-header__inner">
            <strong>Platform shell fixture</strong>
            <div class="shell-demo-controls">
              <button type="button" onclick={advanceRoute}>Simulate route</button>
              <button type="button" onclick={() => (showChrome = false)}>
                Empty optional regions
              </button>
              <button
                type="button"
                aria-pressed={simulateSafeArea}
                onclick={() => (simulateSafeArea = !simulateSafeArea)}
              >
                Safe area
              </button>
            </div>
          </div>
        </header>
      {/if}
    {/snippet}

    {#snippet navigation(projection)}
      {#if showChrome && projection === 'desktop'}
        <aside class="sidebar shell-demo-sidebar" aria-label="Fixture navigation">
          <strong>Life OS</strong>
          <a class="nav-item active" href="#shell-demo-start">Overview</a>
          <a class="nav-item" href="#shell-demo-end">Final content</a>
        </aside>
      {:else if showChrome}
        <nav class="nav shell-demo-bottom-nav" aria-label="Fixture navigation">
          <div class="nav-inner">
            <a class="nav-item on" href="#shell-demo-start">Overview</a>
            <a class="nav-item" href="#shell-demo-end">Final</a>
          </div>
        </nav>
      {/if}
    {/snippet}

    {#snippet main()}
      <div id="shell-demo-start" class="shell-demo-content">
        <p class="shell-demo-eyebrow">Single scroll root</p>
        <h1>Composable app chrome without app-specific flags</h1>
        <p>
          The app owns these words and navigation items. The shared shell owns
          their responsive placement, viewport, landmarks, and insets.
        </p>
        <label class="shell-demo-focus-guard">
          Route-focus guard
          <input
            aria-label="Route-focus guard input"
            placeholder="Typing keeps focus here"
            oninput={advanceRoute}
          />
        </label>
        {#each Array(12) as _, index}
          <article>
            <h2>Scrollable section {index + 1}</h2>
            <p>
              Long fixture content verifies that header, navigation, and the
              persistent overlay remain outside the main scroll surface.
            </p>
          </article>
        {/each}
        <div id="shell-demo-end" data-testid="shell-demo-final-content">
          <strong>Final content remains reachable and unobscured.</strong>
          {#if !showChrome}
            <button type="button" onclick={() => (showChrome = true)}>
              Restore optional regions
            </button>
          {/if}
        </div>
      </div>
    {/snippet}

    {#snippet persistentOverlay()}
      {#if showChrome}
        <div class="shell-demo-persistent" data-testid="shell-demo-persistent">
          Persistent overlay
        </div>
      {/if}
    {/snippet}
  </LifeOsAppShell>
</section>

<style>
  .shell-showcase {
    --shell-demo-safe-top: 0px;
    --shell-demo-safe-bottom: 0px;
    height: 100dvh;
    min-height: 560px;
  }

  .shell-showcase--safe-area {
    --safe-top-effective: 36px;
    --mobile-tabbar-safe-padding: 30px;
  }

  .shell-demo-header {
    padding: max(12px, var(--shell-demo-safe-top)) 20px 12px;
  }

  .shell-demo-header__inner,
  .shell-demo-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .shell-demo-header__inner {
    justify-content: space-between;
    width: 100%;
  }

  .shell-demo-controls {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .shell-demo-controls button,
  #shell-demo-end button {
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--card);
    color: var(--t1);
  }

  .shell-demo-sidebar {
    gap: 8px;
  }

  .shell-demo-content {
    width: min(100%, 760px);
    margin: 0 auto;
    padding: 28px max(20px, var(--page-gutter)) 48px;
  }

  .shell-demo-eyebrow {
    color: var(--accent);
    font: 600 var(--text-xs) / 1.4 var(--mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .shell-demo-content h1 {
    margin: 8px 0 12px;
    font-size: clamp(28px, 5vw, 48px);
    line-height: 1.08;
  }

  .shell-demo-content article {
    padding: 24px 0;
    border-top: 1px solid var(--border);
  }

  .shell-demo-focus-guard {
    display: grid;
    gap: 6px;
    max-width: 320px;
    margin: 24px 0;
    color: var(--t2);
    font-size: var(--text-sm);
  }

  .shell-demo-focus-guard input {
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--card);
    color: var(--t1);
  }

  .shell-demo-content article h2 {
    margin-bottom: 8px;
  }

  #shell-demo-end {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 80px;
    padding: 20px;
    border: 2px solid var(--accent);
    border-radius: var(--radius-lg);
    background: var(--accent-bg);
  }

  .shell-demo-persistent {
    position: fixed;
    right: max(18px, var(--safe-right-effective));
    bottom: calc(var(--mobile-tabbar-total-h) + 16px);
    z-index: var(--z-fab);
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    box-shadow: var(--shadow-elevated);
    color: var(--t1);
  }

  @media (--life-os-desktop) {
    .shell-demo-persistent {
      bottom: 18px;
    }
  }

  @media (--life-os-mobile) {
    .shell-demo-header__inner {
      align-items: flex-start;
      flex-direction: column;
    }

    .shell-demo-controls {
      justify-content: flex-start;
    }
  }
</style>
