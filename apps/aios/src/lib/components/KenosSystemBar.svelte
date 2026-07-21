<script>
  /**
   * Compact page chrome: static title + trailing Liquid Glass action group.
   * Inside the scroll surface — not sticky/fixed — so it scrolls away with content.
   * Space switching is Shelf-only (no Quick Switch). Capture (web Today) + Continue
   * (non-native web); Settings account control on native Today only.
   */
  import Icon from '@life-os/platform-web/svelte/icon'
  import { page } from '$app/state'
  import { t } from '$lib/i18n/index.js'
  import { isIosNativeShell } from '$lib/kenos/iosNativeShell.js'
  import { openContinueSheet } from '$lib/kenos/spaceSwitcher.svelte.js'

  /** @type {{ onCapture?: () => void, title?: string, compact?: boolean }} */
  let { onCapture = undefined, title = '', compact = false } = $props()

  const nativeShell = $derived(isIosNativeShell())
  const isToday = $derived(page.url.pathname === '/')
  const showCapture = $derived(Boolean(onCapture) && isToday && !nativeShell)
  const showSettings = $derived(nativeShell && isToday)
  const showContinue = $derived(!nativeShell)
  const showActions = $derived(showCapture || showSettings || showContinue)
  const heading = $derived(title || (isToday ? t('nav.today') : ''))

  function openSettings() {
    try {
      window.location.href = 'kenos://settings'
    } catch {
      /* ignore */
    }
  }
</script>

<header
  class="kenos-system-bar"
  class:compact
  class:native-shell={nativeShell}
  data-testid="kenos-system-bar"
  aria-label={heading}
>
  <h1 class="large-title kenos-anim-chrome-enter">{heading}</h1>
  {#if showActions}
    <div
      class="action-bubble kenos-anim-chrome-enter-stagger"
      role="toolbar"
      aria-label="Page actions"
    >
      {#if showCapture}
        <button
          type="button"
          class="bubble-btn"
          onclick={onCapture}
          aria-label={t('nav.capture')}
        >
          <Icon name="plus" size={15} strokeWidth={2} />
        </button>
      {/if}
      {#if showSettings}
        <button
          type="button"
          class="bubble-btn"
          data-testid="kenos-today-settings"
          aria-label={t('nav.settings')}
          title={t('nav.settings')}
          onclick={openSettings}
        >
          <Icon name="user" size={15} strokeWidth={1.75} />
        </button>
      {/if}
      {#if showContinue}
        <button
          type="button"
          class="bubble-btn"
          data-testid="kenos-space-switcher-fab"
          aria-label={t('nav.continue')}
          title={`${t('nav.continue')} (⌘.)`}
          onclick={openContinueSheet}
        >
          <Icon name="history" size={15} strokeWidth={1.75} />
        </button>
      {/if}
    </div>
  {/if}
</header>

<style>
  .kenos-system-bar {
    /* Motion tokens: @life-os/theme kenos-motion.css */
    /* Geometry: --kenos-chrome-* (packages/design-tokens structural). */

    /* Scrolls with page content — never sticky/fixed (Apple Music Library / Home). */
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: max(44px, var(--kenos-chrome-control-h, 32px));
    padding: 0 var(--kenos-chrome-inline, var(--kenos-space-inline, 16px))
      var(--kenos-chrome-header-pad-bottom, 8px);
    background: transparent;
    border: 0;
  }
  .kenos-system-bar.compact {
    min-height: max(44px, var(--kenos-chrome-control-h, 32px));
    padding-block: 0 6px;
  }
  .large-title {
    margin: 0;
    font-size: var(--kenos-chrome-title-size, 24px);
    font-weight: var(--kenos-chrome-title-weight, 650);
    letter-spacing: var(--kenos-chrome-title-tracking, -0.03em);
    line-height: var(--kenos-chrome-title-leading, 1.15);
    color: var(--t1, inherit);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* P2-5: toolbar cluster — material, not a heavy glass capsule */
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
  .action-bubble:active {
    transform: scale(var(--kenos-press-scale-bubble, 0.97));
    opacity: 0.96;
  }
  :global(html[data-theme='light']) .action-bubble,
  :global(html:not([data-theme='dark'])) .action-bubble {
    /* White cluster on warm paper — same family as Continuity DomainMusicHeader */
    background: color-mix(in srgb, var(--card, #fff) 88%, transparent);
    border-color: color-mix(in srgb, var(--t1, #111) 10%, transparent);
    box-shadow: none;
  }
  :global(html[data-ios-native-shell='true'][data-theme='dark']) .action-bubble,
  :global(html[data-ios-native-shell='true']:not([data-theme='light']))
    .action-bubble {
    background: color-mix(in srgb, #fff 10%, transparent);
    border-color: color-mix(in srgb, #fff 14%, transparent);
  }
  .bubble-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--t1, #f5f5f7);
    /* Round 2: ≥44pt hit target; optical chrome control stays 32 */
    width: max(44px, var(--kenos-chrome-control-h, 32px));
    height: max(44px, var(--kenos-chrome-control-h, 32px));
    min-width: 44px;
    min-height: 44px;
    border-radius: var(--kenos-chrome-control-radius, 8px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transform-origin: center;
    transition:
      background var(--kenos-motion-press) var(--kenos-ease-press),
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .bubble-btn :global(svg) {
    width: var(--kenos-chrome-icon-size, 15px);
    height: var(--kenos-chrome-icon-size, 15px);
  }
  .bubble-btn:active {
    background: color-mix(in srgb, var(--t1, #fff) 12%, transparent);
    transform: scale(var(--kenos-press-scale, 0.97));
    opacity: var(--kenos-press-opacity, 0.92);
  }
  @media (prefers-reduced-motion: reduce) {
    .action-bubble,
    .bubble-btn {
      transition-duration: var(--kenos-motion-press-reduce, 0.1s);
    }
  }
</style>
