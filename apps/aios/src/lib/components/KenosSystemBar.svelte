<script>
  /**
   * Mobile chrome: page/Space title first — not a fixed "Kenos" brand bar.
   * Capture only on Today; Continue always available.
   */
  import Icon from '@life-os/platform-web/svelte/icon'
  import { page } from '$app/state'
  import { openContinueSheet, openQuickSwitchSheet } from '$lib/kenos/spaceSwitcher.svelte.js'

  /** @type {{ onCapture?: () => void, title?: string, compact?: boolean }} */
  let { onCapture = undefined, title = '', compact = false } = $props()

  const isToday = $derived(page.url.pathname === '/')
  const showCapture = $derived(Boolean(onCapture) && isToday)
  const heading = $derived(title || (isToday ? 'Today' : ''))
</script>

<div class="kenos-system-bar" class:compact data-testid="kenos-system-bar">
  <span class="page-heading">{heading}</span>
  <div class="actions">
    {#if showCapture}
      <button type="button" class="ghost" onclick={onCapture} aria-label="Capture">
        Capture
      </button>
    {/if}
    <button
      type="button"
      class="icon-btn"
      data-testid="kenos-quick-switch-trigger"
      aria-label="Quick Switch"
      title="Quick Switch (⌘⇧.)"
      onclick={openQuickSwitchSheet}
    >
      <Icon name="search" size={16} strokeWidth={1.75} />
    </button>
    <button
      type="button"
      class="continue"
      data-testid="kenos-space-switcher-fab"
      aria-label="Continue to a recent Space"
      title="Continue (⌘.)"
      onclick={openContinueSheet}
    >
      <Icon name="history" size={16} strokeWidth={1.75} />
      <span>Continue</span>
    </button>
  </div>
</div>

<style>
  .kenos-system-bar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 6px 14px;
    padding-top: max(6px, env(safe-area-inset-top, 0px));
    background: var(--kenos-chrome-bg, color-mix(in srgb, var(--bg) 78%, transparent));
    border-bottom: 1px solid var(--kenos-chrome-border, color-mix(in srgb, var(--border) 85%, transparent));
    backdrop-filter: blur(18px) saturate(1.2);
    -webkit-backdrop-filter: blur(18px) saturate(1.2);
  }
  .kenos-system-bar.compact {
    min-height: 40px;
    padding-block: 4px;
  }
  .page-heading {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--t1);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .ghost,
  .continue,
  .icon-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 12px;
    border-radius: var(--kenos-radius-control, 8px);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost,
  .icon-btn {
    border: 0;
    background: transparent;
    color: var(--t2);
  }
  .icon-btn {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
  .icon-btn:hover {
    color: var(--t1);
  }
  .continue {
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    background: var(--kenos-surface-overlay, color-mix(in srgb, var(--bg) 88%, transparent));
    color: var(--t1);
  }
  .continue:hover {
    border-color: color-mix(in srgb, var(--t1) 22%, var(--border));
  }
  @media (min-width: 900px) {
    .kenos-system-bar {
      display: none;
    }
  }
</style>
