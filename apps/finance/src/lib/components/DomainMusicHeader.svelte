<script>
  /**
   * Domain Continuity — Apple Music–style large title + glass action bubble.
   * Scrolls with page content (not fixed native overlay).
   * Motion tokens mirror native KenosMotion (chrome ~340ms, press ~220ms).
   */
  import { isIosNativeShell } from '@life-os/platform-web/ios-native-shell'

  /**
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   * }}
   */
  let { title = '', domainLabel = 'Money', showCompose = false } = $props()

  const heading = $derived(title || domainLabel)

  function openQuickSwitch() {
    try {
      window.location.href = 'kenos://quick-switch'
    } catch {
      /* ignore */
    }
  }

  function compose() {
    try {
      if (typeof window.__KENOS_DOMAIN_COMPOSE__ === 'function') {
        window.__KENOS_DOMAIN_COMPOSE__()
        return
      }
    } catch {
      /* fall through */
    }
    try {
      window.location.href = 'kenos://compose'
    } catch {
      /* ignore */
    }
  }
</script>

{#if isIosNativeShell()}
  <header class="domain-music-header" data-testid="kenos-domain-scroll-header">
    <button
      type="button"
      class="title-btn"
      onclick={openQuickSwitch}
      aria-label={`${domainLabel}: Quick Switch`}
    >
      <h1 class="large-title">{heading}</h1>
      <span class="chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="action-bubble" role="toolbar" aria-label="Domain actions">
      {#if showCompose}
        <button
          type="button"
          class="bubble-btn"
          onclick={compose}
          aria-label="Add Task"
        >
          <span aria-hidden="true">+</span>
        </button>
      {/if}
      <button
        type="button"
        class="bubble-btn"
        onclick={openQuickSwitch}
        aria-label="Quick Switch"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
{/if}

<style>
  .domain-music-header {
    /* Mirrors KenosMotion.chrome / press (native SSOT). */
    --kenos-motion-chrome: 340ms;
    --kenos-motion-press: 220ms;
    --kenos-ease-chrome: cubic-bezier(0.22, 1, 0.36, 1);
    --kenos-ease-press: cubic-bezier(0.3, 0, 0.2, 1);
    --kenos-press-scale: 0.94;
    --kenos-press-scale-bubble: 0.97;
    --kenos-press-opacity: 0.88;

    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    /* Inline 16 aligns with page content; top pad owned by shell (54 status). */
    padding: 2px 16px 12px;
    margin: 0;
    background: transparent;
  }
  .title-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0;
    cursor: pointer;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
    animation: kenos-chrome-enter var(--kenos-motion-chrome) var(--kenos-ease-chrome) both;
  }
  .title-btn:active .large-title {
    opacity: 0.82;
  }
  .title-btn:active .chevron {
    transform: translateY(2px);
    opacity: 0.85;
  }
  .large-title {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.12;
    color: var(--t1, #f5f5f7);
    transition: opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .chevron {
    flex-shrink: 0;
    font-size: 18px;
    font-weight: 600;
    color: color-mix(in srgb, var(--t1, #f5f5f7) 55%, transparent);
    margin-top: 6px;
    transition:
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .action-bubble {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, #fff 16%, transparent);
    border: 1px solid color-mix(in srgb, #fff 22%, transparent);
    backdrop-filter: blur(28px) saturate(1.6);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, #000 35%, transparent),
      0 1px 0 color-mix(in srgb, #fff 12%, transparent) inset;
    transform-origin: center;
    animation: kenos-chrome-enter var(--kenos-motion-chrome) var(--kenos-ease-chrome) 45ms both;
    transition:
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .action-bubble:active {
    transform: scale(var(--kenos-press-scale-bubble));
    opacity: 0.96;
  }
  .bubble-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--t1, #f5f5f7);
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transform-origin: center;
    transition:
      background var(--kenos-motion-press) var(--kenos-ease-press),
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .bubble-btn:active {
    background: color-mix(in srgb, #fff 14%, transparent);
    transform: scale(var(--kenos-press-scale));
    opacity: var(--kenos-press-opacity);
  }
  @keyframes kenos-chrome-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .title-btn,
    .action-bubble {
      animation: none;
    }
    .large-title,
    .chevron,
    .action-bubble,
    .bubble-btn {
      transition-duration: 100ms;
    }
    .action-bubble:active {
      transform: scale(0.99);
      opacity: 0.97;
    }
    .bubble-btn:active {
      transform: scale(0.98);
      opacity: 0.94;
    }
    .title-btn:active .chevron {
      transform: none;
    }
  }
</style>
