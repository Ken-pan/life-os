<script>
  import TrackArt from './TrackArt.svelte';
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n/index.js';
  import { artGradient } from '$lib/trackArt.js';
  import { playTracks } from '$lib/player.svelte.js';
  import { pinSpeedDialItem, unpinSpeedDialItem, hideSpeedDialItem } from '$lib/speedDialStore.js';
  import { speedDialReasonKey } from '$lib/speedDial.js';
  import { clampPopoverPosition } from '@life-os/theme';
  import { tick } from 'svelte';

  /** @type {{ cell: import('$lib/speedDial.js').SpeedDialCell, active?: boolean, slotIndex?: number, onChange?: () => void }} */
  let { cell, active = false, slotIndex = 0, onChange } = $props();

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  /** @type {HTMLDivElement | null} */
  let menuEl = $state(null);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let longPressTimer;
  let longPressTriggered = $state(false);

  const coverSeed = $derived(cell.coverSeeds[0] || cell.id);
  const coverUrl = $derived(cell.coverUrls[0]);
  const reasonLabel = $derived.by(() => {
    const key = speedDialReasonKey(cell.reason);
    return key && !cell.pinned ? t(key) : '';
  });

  function activate() {
    if (cell.variant === 'add') return;
    if (!cell.tracks.length) return;
    playTracks(cell.tracks, 0, 'speed_dial', {
      entityType: cell.entityType === 'add' ? 'track' : /** @type {import('$lib/musicInteractions.js').EntityType} */ (cell.entityType),
      entityId: cell.entityId
    });
  }

  /** @param {MouseEvent} e */
  function onContextMenu(e) {
    if (cell.variant === 'add') return;
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  }

  /** @param {number} x @param {number} y */
  function openMenuAt(x, y) {
    menuX = x;
    menuY = y;
    menuOpen = true;
  }

  /** @param {TouchEvent} e */
  function onTouchStart(e) {
    if (cell.variant === 'add') return;
    longPressTriggered = false;
    const touch = e.touches[0];
    if (!touch) return;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      openMenuAt(touch.clientX, touch.clientY);
    }, 480);
  }

  function onTouchEnd() {
    clearTimeout(longPressTimer);
  }

  /** @param {MouseEvent} e */
  function onActivate(e) {
    if (longPressTriggered) {
      e.preventDefault();
      longPressTriggered = false;
      return;
    }
    activate();
  }

  async function onPin() {
    if (cell.variant === 'add') return;
    await pinSpeedDialItem(cell.entityType, cell.entityId, slotIndex);
    menuOpen = false;
    onChange?.();
  }

  async function onUnpin() {
    await unpinSpeedDialItem(cell.id);
    menuOpen = false;
    onChange?.();
  }

  async function onHide() {
    await hideSpeedDialItem(cell.id);
    menuOpen = false;
    onChange?.();
  }

  $effect(() => {
    if (!menuOpen) return;
    menuX;
    menuY;
    tick().then(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      const { left, top } = clampPopoverPosition(menuX, menuY, rect.width, rect.height);
      menuEl.style.left = `${left}px`;
      menuEl.style.top = `${top}px`;
    });
  });
</script>

{#if cell.variant === 'add'}
  <a class="speed-dial-cell speed-dial-cell--add" href="/search" aria-label={t('home.speedDialAdd')}>
    <span class="speed-dial-add-icon" aria-hidden="true">
      <Icon name="plus" size={22} strokeWidth={2} />
    </span>
    <span class="speed-dial-add-label">{t('home.speedDialAddShort')}</span>
  </a>
{:else}
  <button
    type="button"
    class="speed-dial-cell"
    class:speed-dial-cell--active={active}
    class:speed-dial-cell--pinned={cell.pinned}
    aria-label={reasonLabel ? `${cell.title} — ${reasonLabel}` : cell.title}
    title={reasonLabel || undefined}
    onclick={onActivate}
    oncontextmenu={onContextMenu}
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
    ontouchcancel={onTouchEnd}
  >
    {#if coverUrl}
      <TrackArt artUrl={coverUrl} seed={coverSeed} class="speed-dial-cover" />
    {:else}
      <div class="speed-dial-cover speed-dial-cover--gradient" style:background={artGradient(coverSeed)}></div>
    {/if}
    <div class="speed-dial-shade" aria-hidden="true"></div>
    {#if reasonLabel}
      <span class="speed-dial-reason">{reasonLabel}</span>
    {/if}
    <span class="speed-dial-label">{cell.title}</span>
    {#if cell.pinned}
      <span class="speed-dial-pin" aria-hidden="true">•</span>
    {/if}
  </button>
{/if}

{#if menuOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="speed-dial-menu-backdrop" onclick={() => (menuOpen = false)}></div>
  <div
    bind:this={menuEl}
    class="speed-dial-menu"
    style:left="{menuX}px"
    style:top="{menuY}px"
    role="menu"
  >
    {#if cell.pinned}
      <button type="button" role="menuitem" onclick={onUnpin}>{t('home.speedDialUnpin')}</button>
    {:else}
      <button type="button" role="menuitem" onclick={onPin}>{t('home.speedDialPin')}</button>
    {/if}
    <button type="button" role="menuitem" onclick={onHide}>{t('home.speedDialHide')}</button>
    <button type="button" role="menuitem" onclick={() => (menuOpen = false)}>{t('common.cancel')}</button>
  </div>
{/if}

<style>
  .speed-dial-cell {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: 2.5px solid transparent;
    border-radius: 13px;
    background: #1a1214;
    color: #fff;
    font: inherit;
    overflow: hidden;
    cursor: pointer;
    touch-action: manipulation;
    transition: border-color var(--dur-fast) var(--ease-standard);
  }

  .speed-dial-cell--active {
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
  }

  .speed-dial-cell--add {
    background: color-mix(in srgb, var(--card) 88%, transparent);
    border: 1.5px dashed color-mix(in srgb, var(--t1) 18%, var(--border));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--t2, var(--text-secondary));
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .speed-dial-cell:not(.speed-dial-cell--add):hover {
      border-color: rgba(255, 255, 255, 0.35);
      transform: translateY(-1px);
    }

    .speed-dial-cell--add:hover {
      border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
      color: var(--t1, var(--text));
    }
  }

  .speed-dial-add-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--t1) 6%, transparent);
  }

  .speed-dial-add-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .speed-dial-cell :global(.speed-dial-cover) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .speed-dial-cover--gradient {
    position: absolute;
    inset: 0;
  }

  .speed-dial-shade {
    position: absolute;
    inset: auto 0 0;
    height: 58%;
    background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.72) 68%, rgba(0, 0, 0, 0.88) 100%);
    pointer-events: none;
  }

  .speed-dial-reason {
    position: absolute;
    top: 6px;
    left: 8px;
    z-index: 1;
    padding: 2px 6px;
    border-radius: 999px;
    font-size: 9px;
    letter-spacing: 0.04em;
    background: rgba(0, 0, 0, 0.52);
    color: rgba(255, 255, 255, 0.82);
    opacity: 1;
    transition: opacity var(--dur-fast) var(--ease-standard);
  }

  @media (hover: hover) and (pointer: fine) {
    .speed-dial-reason {
      opacity: 0;
    }

    .speed-dial-cell:hover .speed-dial-reason,
    .speed-dial-cell:focus-visible .speed-dial-reason {
      opacity: 1;
    }
  }

  .speed-dial-label {
    position: absolute;
    inset: auto clamp(6px, 2vw, 8px) clamp(6px, 2vw, 8px);
    z-index: 1;
    font-size: clamp(11px, 2.8vw, 13px);
    font-weight: 600;
    line-height: 1.25;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
  }

  .speed-dial-pin {
    position: absolute;
    top: 6px;
    right: 8px;
    color: #f5eaef;
    font-size: 18px;
    line-height: 1;
    z-index: 1;
  }

  .speed-dial-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-sheet) + 3);
    background: transparent;
  }

  .speed-dial-menu {
    position: fixed;
    z-index: calc(var(--z-sheet) + 4);
    min-width: 148px;
    padding: var(--space-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--card);
    box-shadow: var(--shadow-elevated);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .speed-dial-menu button {
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: var(--text-sm);
    cursor: pointer;
    min-height: var(--tap-min);
    touch-action: manipulation;
  }

  .speed-dial-menu button:focus-visible {
    background: rgba(255, 255, 255, 0.06);
  }

  @media (hover: hover) and (pointer: fine) {
    .speed-dial-menu button:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }
</style>
