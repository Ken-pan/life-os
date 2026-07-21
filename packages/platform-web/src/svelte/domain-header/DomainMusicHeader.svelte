<script>
  /**
   * Domain Continuity — refined title + glass action bubble.
   * Scrolls with page content (not fixed native overlay).
   * Motion: @life-os/theme kenos-motion.css (KenosMotion web mirror).
   *
   * Shared across Plan / Training / Money / Music / Health / Home / Library.
   */
  import { isIosNativeShell } from '../../iosNativeShell.js'

  /**
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   *   composeAriaLabel?: string,
   *   showListsMenu?: boolean,
   *   listsMenuAriaLabel?: string,
   *   onListsMenu?: () => void,
   *   showBack?: boolean,
   *   backHref?: string,
   *   backLabel?: string,
   *   onBack?: () => void,
   *   compact?: boolean,
   *   quickSwitchLabel?: string,
   * }}
   */
  let {
    title = '',
    domainLabel = 'Domain',
    showCompose = false,
    composeAriaLabel = 'Compose',
    showListsMenu = false,
    listsMenuAriaLabel = 'Open lists',
    onListsMenu = undefined,
    showBack = false,
    backHref = '',
    backLabel = 'Back',
    onBack = undefined,
    compact = false,
    quickSwitchLabel = 'Quick Switch',
  } = $props()

  const heading = $derived(title || domainLabel)
  const hasBackHref = $derived(Boolean(backHref))
  /** Drill-in with explicit href: static title. History back still keeps QS chevron. */
  const titleInteractive = $derived(!hasBackHref)
  const titleAria = $derived(`${domainLabel}: ${quickSwitchLabel}`)

  function goBack() {
    if (typeof onBack === 'function') {
      onBack()
      return
    }
    try {
      if (typeof history !== 'undefined' && history.length > 1) {
        history.back()
        return
      }
    } catch {
      /* fall through */
    }
    try {
      window.location.assign('/')
    } catch {
      /* ignore */
    }
  }

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

  function listsMenu() {
    if (typeof onListsMenu === 'function') onListsMenu()
  }
</script>

{#if isIosNativeShell()}
  <header
    class="domain-music-header"
    class:is-compact={compact}
    data-testid="kenos-domain-scroll-header"
  >
    {#if !compact}
      <div class="title-row">
        {#if hasBackHref}
          <a
            class="back-btn"
            href={backHref}
            aria-label={backLabel}
            data-testid="kenos-domain-back"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.25"
              aria-hidden="true"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </a>
          <h1 class="large-title title-static kenos-anim-chrome-enter">{heading}</h1>
        {:else if showBack}
          <button
            type="button"
            class="back-btn"
            onclick={goBack}
            aria-label={backLabel}
            data-testid="kenos-domain-back"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.25"
              aria-hidden="true"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          {#if titleInteractive}
            <button
              type="button"
              class="title-btn kenos-anim-chrome-enter"
              onclick={openQuickSwitch}
              aria-label={titleAria}
            >
              <h1 class="large-title">{heading}</h1>
              <span class="chevron" aria-hidden="true">⌄</span>
            </button>
          {:else}
            <h1 class="large-title title-static kenos-anim-chrome-enter">{heading}</h1>
          {/if}
        {:else}
          <button
            type="button"
            class="title-btn kenos-anim-chrome-enter"
            onclick={openQuickSwitch}
            aria-label={titleAria}
          >
            <h1 class="large-title">{heading}</h1>
            <span class="chevron" aria-hidden="true">⌄</span>
          </button>
        {/if}
      </div>
    {/if}
    <div
      class="action-bubble kenos-anim-chrome-enter-stagger"
      role="toolbar"
      aria-label="Domain actions"
    >
      {#if showListsMenu}
        <button
          type="button"
          class="bubble-btn"
          onclick={listsMenu}
          aria-label={listsMenuAriaLabel}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <path d="M4 7h16" stroke-linecap="round" />
            <path d="M4 12h16" stroke-linecap="round" />
            <path d="M4 17h16" stroke-linecap="round" />
          </svg>
        </button>
      {/if}
      {#if showCompose}
        <button
          type="button"
          class="bubble-btn"
          onclick={compose}
          aria-label={composeAriaLabel}
        >
          <span aria-hidden="true">+</span>
        </button>
      {/if}
      <button
        type="button"
        class="bubble-btn"
        onclick={openQuickSwitch}
        aria-label={quickSwitchLabel}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>
    </div>
  </header>
{/if}

<style>
  .domain-music-header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 16px 8px;
    margin: 0;
    background: transparent;
  }
  .domain-music-header.is-compact {
    position: relative;
    z-index: 5;
    display: block;
    height: 0;
    width: 100%;
    padding: 0;
    margin: 0;
    overflow: visible;
    pointer-events: none;
  }
  .domain-music-header.is-compact .action-bubble {
    position: absolute;
    top: 8px;
    right: 12px;
    pointer-events: auto;
  }
  .title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 auto;
  }
  .back-btn {
    appearance: none;
    border: 0;
    background: transparent;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    margin-left: -6px;
    padding: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--t1, #f5f5f7);
    text-decoration: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--kenos-motion-press) var(--kenos-ease-press),
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .back-btn:active {
    background: color-mix(in srgb, #fff 12%, transparent);
    transform: scale(var(--kenos-press-scale));
    opacity: var(--kenos-press-opacity);
  }
  .title-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 0;
    cursor: pointer;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }
  .title-static {
    cursor: default;
    pointer-events: none;
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
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--t1, #f5f5f7);
    transition: opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .chevron {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: color-mix(in srgb, var(--t1, #f5f5f7) 48%, transparent);
    margin-top: 1px;
    transition:
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .action-bubble {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 1px;
    border-radius: 999px;
    background: color-mix(in srgb, #fff 14%, transparent);
    border: 1px solid color-mix(in srgb, #fff 18%, transparent);
    backdrop-filter: blur(24px) saturate(1.45);
    -webkit-backdrop-filter: blur(24px) saturate(1.45);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, #000 28%, transparent),
      0 1px 0 color-mix(in srgb, #fff 10%, transparent) inset;
    transform-origin: center;
    transition:
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .action-bubble:active {
    transform: scale(var(--kenos-press-scale-bubble));
    opacity: 0.96;
  }
  :global(html[data-theme='light']) .action-bubble,
  :global(html:not([data-theme='dark'])) .action-bubble {
    background: color-mix(in srgb, var(--bg, #fff) 70%, transparent);
    border-color: color-mix(in srgb, var(--t1, #111) 10%, transparent);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, var(--t1, #111) 6%, transparent),
      0 1px 0 color-mix(in srgb, #fff 75%, transparent) inset,
      0 2px 8px color-mix(in srgb, var(--t1, #111) 6%, transparent);
  }
  :global(html[data-ios-native-shell='true'][data-theme='dark']) .action-bubble,
  :global(html[data-ios-native-shell='true']:not([data-theme='light']))
    .action-bubble {
    background: color-mix(in srgb, #fff 14%, transparent);
    border-color: color-mix(in srgb, #fff 18%, transparent);
  }
  .bubble-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--t1, #f5f5f7);
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
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
  @media (prefers-reduced-motion: reduce) {
    .large-title,
    .chevron,
    .action-bubble,
    .bubble-btn,
    .back-btn {
      transition-duration: var(--kenos-motion-press-reduce);
    }
    .action-bubble:active {
      transform: scale(0.99);
      opacity: 0.97;
    }
    .bubble-btn:active,
    .back-btn:active {
      transform: scale(0.98);
      opacity: 0.94;
    }
    .title-btn:active .chevron {
      transform: none;
    }
  }
</style>
