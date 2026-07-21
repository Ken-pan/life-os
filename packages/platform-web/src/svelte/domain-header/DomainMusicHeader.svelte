<script>
  /**
   * Domain Continuity — static page title + glass action bubble.
   * Scrolls with page content (not fixed native overlay).
   * Space switching is via Shelf (Spaces Orb in native dock only) — title is never a shelf trigger.
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
  } = $props()

  const heading = $derived(title || domainLabel)
  const showDomainEyebrow = $derived(Boolean(title && domainLabel))
  const headingAria = $derived(
    showDomainEyebrow ? `${domainLabel} · ${heading}` : heading,
  )
  const hasBackHref = $derived(Boolean(backHref))
  const actionCount = $derived(
    1 + (showListsMenu ? 1 : 0) + (showCompose ? 1 : 0),
  )
  /** Single More → plain 44×44 toolbar button; multi-actions keep the cluster. */
  const plainToolbar = $derived(actionCount === 1)

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

  function openMore() {
    try {
      window.location.href = 'kenos://more'
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

  /**
   * Title crossfade only when heading *changes* — not on first mount
   * (chrome-enter already settles the stack).
   * Decided in `$effect.pre` so `{#key}` remounts with the correct class.
   */
  let previousHeading = $state(/** @type {string | null} */ (null))
  let titleCrossfade = $state(false)
  $effect.pre(() => {
    const next = heading
    titleCrossfade =
      previousHeading !== null && previousHeading !== next
    previousHeading = next
  })
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
        {/if}
        <div class="title-stack kenos-anim-chrome-enter">
          {#key heading}
            <h1
              class="large-title title-static"
              class:kenos-anim-title-crossfade={titleCrossfade}
              aria-label={headingAria}
            >
              {heading}
            </h1>
          {/key}
          {#if showDomainEyebrow}
            <p class="domain-eyebrow" aria-hidden="true">{domainLabel}</p>
          {/if}
        </div>
      </div>
    {/if}
    <div
      class="action-bubble kenos-anim-chrome-enter-stagger"
      class:is-plain={plainToolbar}
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
        onclick={openMore}
        aria-label="More"
        data-testid="kenos-domain-more"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
    </div>
  </header>
{/if}

<style>
  .domain-music-header {
    /* Geometry: --kenos-chrome-* (packages/design-tokens structural). */
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 var(--kenos-chrome-inline, 16px)
      var(--kenos-chrome-header-pad-bottom, 8px);
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
    top: var(--kenos-chrome-header-pad-bottom, 8px);
    right: var(--kenos-chrome-inline, 16px);
    pointer-events: auto;
  }
  .title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 auto;
  }
  .title-stack {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .domain-eyebrow {
    margin: 0;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    line-height: 1.2;
    color: var(--t3, #8e8e93);
  }
  .back-btn {
    appearance: none;
    border: 0;
    background: transparent;
    flex-shrink: 0;
    width: max(44px, var(--kenos-chrome-control-h, 32px));
    height: max(44px, var(--kenos-chrome-control-h, 32px));
    min-width: 44px;
    min-height: 44px;
    margin-left: -6px;
    padding: 0;
    border-radius: var(--kenos-chrome-control-radius, 8px);
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
  .title-static {
    cursor: default;
    pointer-events: none;
  }
  .large-title {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--kenos-chrome-title-size, 24px);
    font-weight: var(--kenos-chrome-title-weight, 650);
    letter-spacing: var(--kenos-chrome-title-tracking, -0.03em);
    line-height: var(--kenos-chrome-title-leading, 1.15);
    color: var(--t1, #f5f5f7);
  }
  /* Multi-action cluster keeps light material; single More stays plain. */
  .action-bubble {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0;
    border-radius: var(--kenos-chrome-cluster-radius, 10px);
    background: color-mix(in srgb, var(--bg, #111) 55%, transparent);
    border: 1px solid color-mix(in srgb, var(--t1, #fff) 12%, transparent);
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    box-shadow: none;
    transform-origin: center;
    transition:
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .action-bubble.is-plain {
    background: transparent;
    border-color: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .action-bubble:not(.is-plain):active {
    transform: scale(var(--kenos-press-scale-bubble));
    opacity: 0.96;
  }
  :global(html[data-theme='light']) .action-bubble:not(.is-plain),
  :global(html:not([data-theme='dark'])) .action-bubble:not(.is-plain) {
    background: color-mix(in srgb, var(--bg, #fff) 82%, transparent);
    border-color: color-mix(in srgb, var(--t1, #111) 10%, transparent);
    box-shadow: none;
  }
  :global(html[data-ios-native-shell='true'][data-theme='dark'])
    .action-bubble:not(.is-plain),
  :global(html[data-ios-native-shell='true']:not([data-theme='light']))
    .action-bubble:not(.is-plain) {
    background: color-mix(in srgb, #fff 10%, transparent);
    border-color: color-mix(in srgb, #fff 14%, transparent);
  }
  .bubble-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--t1, #f5f5f7);
    width: max(44px, var(--kenos-chrome-control-h, 32px));
    height: max(44px, var(--kenos-chrome-control-h, 32px));
    min-width: 44px;
    min-height: 44px;
    border-radius: var(--kenos-chrome-control-radius, 8px);
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
  .bubble-btn svg {
    width: var(--kenos-chrome-icon-size, 15px);
    height: var(--kenos-chrome-icon-size, 15px);
  }
  .bubble-btn:active {
    background: color-mix(in srgb, #fff 14%, transparent);
    transform: scale(var(--kenos-press-scale));
    opacity: var(--kenos-press-opacity);
  }
  @media (prefers-reduced-motion: reduce) {
    .action-bubble,
    .bubble-btn,
    .back-btn {
      transition-duration: var(--kenos-motion-press-reduce);
    }
    .action-bubble:not(.is-plain):active {
      transform: scale(0.99);
      opacity: 0.97;
    }
    .bubble-btn:active,
    .back-btn:active {
      transform: scale(0.98);
      opacity: 0.94;
    }
  }
</style>
