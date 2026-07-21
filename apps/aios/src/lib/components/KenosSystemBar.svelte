<script>
  /**
   * Compact page chrome: refined title + trailing Liquid Glass action group.
   * Inside the scroll surface — not sticky/fixed — so it scrolls away with content.
   * iOS 26: toolbar items share a glass capsule (WWDC25 / Adopting Liquid Glass).
   * Motion tokens mirror native KenosMotion (chrome ~360ms, press ~220ms).
   */
  import Icon from '@life-os/platform-web/svelte/icon'
  import { page } from '$app/state'
  import { t } from '$lib/i18n/index.js'
  import {
    openContinueSheet,
    openQuickSwitchSheet,
  } from '$lib/kenos/spaceSwitcher.svelte.js'

  /** @type {{ onCapture?: () => void, title?: string, compact?: boolean }} */
  let { onCapture = undefined, title = '', compact = false } = $props()

  const isToday = $derived(page.url.pathname === '/')
  const showCapture = $derived(Boolean(onCapture) && isToday)
  const heading = $derived(title || (isToday ? t('nav.today') : ''))
  const quickSwitchLabel = $derived(t('nav.quickSwitch'))
  const titleAria = $derived(`${heading}: ${quickSwitchLabel}`)
</script>

<header
  class="kenos-system-bar"
  class:compact
  data-testid="kenos-system-bar"
  aria-label={heading}
>
  <button
    type="button"
    class="title-btn kenos-anim-chrome-enter"
    onclick={openQuickSwitchSheet}
    aria-label={titleAria}
  >
    <h1 class="large-title">{heading}</h1>
    <span class="chevron" aria-hidden="true">⌄</span>
  </button>
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
    <button
      type="button"
      class="bubble-btn"
      data-testid="kenos-quick-switch-trigger"
      aria-label={quickSwitchLabel}
      title={`${quickSwitchLabel} (⌘⇧.)`}
      onclick={openQuickSwitchSheet}
    >
      <Icon name="layout-grid" size={15} strokeWidth={1.75} />
    </button>
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
  </div>
</header>

<style>
  .kenos-system-bar {
    /* Motion tokens: @life-os/theme kenos-motion.css */

    /* Scrolls with page content — never sticky/fixed (Apple Music Library / Home). */
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 36px;
    padding: 0 var(--kenos-space-inline, 16px) 10px;
    background: transparent;
    border: 0;
  }
  .kenos-system-bar.compact {
    min-height: 32px;
    padding-block: 0 6px;
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
    color: var(--t1);
    transition: opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .chevron {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: color-mix(in srgb, var(--t1) 48%, transparent);
    margin-top: 1px;
    transition:
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  /* iOS 26 Liquid Glass cluster — must read on pure black (Assistant). */
  .action-bubble {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0;
    padding: 1px;
    border-radius: 999px;
    background: color-mix(in srgb, #fff 14%, transparent);
    border: 1px solid color-mix(in srgb, #fff 18%, transparent);
    backdrop-filter: blur(24px) saturate(1.45);
    -webkit-backdrop-filter: blur(24px) saturate(1.45);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, #000 28%, transparent),
      0 1px 0 color-mix(in srgb, #fff 10%, transparent) inset,
      0 3px 10px color-mix(in srgb, #000 14%, transparent);
    transform-origin: center;
    transition:
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .action-bubble:active {
    transform: scale(var(--kenos-press-scale-bubble));
    opacity: 0.96;
  }
  /* Light: quiet material chip (incl. iOS native shell — do not force white glass). */
  :global(html[data-theme='light']) .action-bubble,
  :global(html:not([data-theme='dark'])) .action-bubble {
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    border-color: color-mix(in srgb, var(--t1) 10%, transparent);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, var(--t1) 6%, transparent),
      0 1px 0 color-mix(in srgb, #fff 75%, transparent) inset,
      0 2px 8px color-mix(in srgb, var(--t1) 5%, transparent);
  }
  /* Dark / default native: translucent white glass */
  :global(html[data-theme='dark']) .action-bubble,
  :global(html[data-ios-native-shell='true'][data-theme='dark'])
    .action-bubble {
    background: color-mix(in srgb, #fff 14%, transparent);
    border-color: color-mix(in srgb, #fff 18%, transparent);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, #000 28%, transparent),
      0 1px 0 color-mix(in srgb, #fff 10%, transparent) inset,
      0 3px 10px color-mix(in srgb, #000 14%, transparent);
  }
  .bubble-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* Compact glass chip — denser than HIG solo control, fine in a cluster */
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--t1);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transform-origin: center;
    transition:
      background var(--kenos-motion-press) var(--kenos-ease-press),
      transform var(--kenos-motion-press) var(--kenos-ease-press),
      opacity var(--kenos-motion-press) var(--kenos-ease-press);
  }
  .bubble-btn:hover {
    background: color-mix(in srgb, var(--t1) 10%, transparent);
  }
  .bubble-btn:active {
    background: color-mix(in srgb, var(--t1) 16%, transparent);
    transform: scale(var(--kenos-press-scale));
    opacity: var(--kenos-press-opacity);
  }
  @media (prefers-reduced-motion: reduce) {
    .large-title,
    .chevron,
    .action-bubble,
    .bubble-btn {
      transition-duration: var(--kenos-motion-press-reduce);
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
  @media (min-width: 900px) {
    .kenos-system-bar {
      display: none;
    }
  }
</style>
