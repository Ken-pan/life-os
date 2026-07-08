<script>
  import TrackArt from './TrackArt.svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import { artGradient } from '$lib/trackArt.js'
  import { playTracks } from '$lib/player.svelte.js'
  import {
    pinSpeedDialItem,
    unpinSpeedDialItem,
    hideSpeedDialItem,
  } from '$lib/speedDialStore.js'
  import { speedDialReasonKey } from '$lib/speedDial.js'
  import { playSurpriseMe } from '$lib/recommendations.js'
  import { toast } from '$lib/ui.svelte.js'
  import { clampPopoverPosition } from '@life-os/theme'
  import { tick } from 'svelte'

  /** @type {{ cell: import('$lib/speedDial.js').SpeedDialCell, active?: boolean, slotIndex?: number, onChange?: () => void }} */
  let { cell, active = false, slotIndex = 0, onChange } = $props()

  let menuOpen = $state(false)
  let menuX = $state(0)
  let menuY = $state(0)
  let surpriseLoading = $state(false)
  /** @type {HTMLDivElement | null} */
  let menuEl = $state(null)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let longPressTimer
  let longPressTriggered = $state(false)

  const coverSeed = $derived(cell.coverSeeds[0] || cell.id)
  const coverUrl = $derived(cell.coverUrls[0])
  const reasonLabel = $derived.by(() => {
    const key = speedDialReasonKey(cell.reason)
    return key && !cell.pinned ? t(key) : ''
  })

  function activate() {
    if (cell.variant === 'surprise') return
    if (!cell.tracks.length) return
    playTracks(cell.tracks, 0, 'speed_dial', {
      entityType:
        /** @type {import('$lib/musicInteractions.js').EntityType} */ (
          cell.entityType
        ),
      entityId: cell.entityId,
    })
  }

  async function onSurprise() {
    if (surpriseLoading) return
    surpriseLoading = true
    try {
      const { count } = await playSurpriseMe()
      if (count > 0) return
      toast(t('home.speedDialSurpriseEmpty'))
    } catch {
      toast(t('home.speedDialSurpriseFailed'), { error: true })
    } finally {
      surpriseLoading = false
    }
  }

  /** @param {MouseEvent} e */
  function onContextMenu(e) {
    if (cell.variant === 'surprise') return
    e.preventDefault()
    openMenuAt(e.clientX, e.clientY)
  }

  /** @param {number} x @param {number} y */
  function openMenuAt(x, y) {
    menuX = x
    menuY = y
    menuOpen = true
  }

  /** @param {TouchEvent} e */
  function onTouchStart(e) {
    if (cell.variant === 'surprise') return
    longPressTriggered = false
    const touch = e.touches[0]
    if (!touch) return
    clearTimeout(longPressTimer)
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      openMenuAt(touch.clientX, touch.clientY)
    }, 480)
  }

  function onTouchEnd() {
    clearTimeout(longPressTimer)
  }

  /** @param {MouseEvent} e */
  function onActivate(e) {
    if (longPressTriggered) {
      e.preventDefault()
      longPressTriggered = false
      return
    }
    activate()
  }

  async function onPin() {
    if (cell.variant === 'surprise') return
    await pinSpeedDialItem(cell.entityType, cell.entityId, slotIndex)
    menuOpen = false
    onChange?.()
  }

  async function onUnpin() {
    await unpinSpeedDialItem(cell.id)
    menuOpen = false
    onChange?.()
  }

  async function onHide() {
    await hideSpeedDialItem(cell.id)
    menuOpen = false
    onChange?.()
  }

  $effect(() => {
    if (!menuOpen) return
    menuX
    menuY
    tick().then(() => {
      if (!menuEl) return
      const rect = menuEl.getBoundingClientRect()
      const { left, top } = clampPopoverPosition(
        menuX,
        menuY,
        rect.width,
        rect.height,
      )
      menuEl.style.left = `${left}px`
      menuEl.style.top = `${top}px`
    })
  })
</script>

{#if cell.variant === 'surprise'}
  <button
    type="button"
    class="speed-dial-cell speed-dial-cell--surprise"
    class:speed-dial-cell--loading={surpriseLoading}
    aria-label={t('home.speedDialSurpriseMe')}
    aria-busy={surpriseLoading}
    disabled={surpriseLoading}
    onclick={onSurprise}
  >
    <div class="speed-dial-surprise-bg" aria-hidden="true"></div>
    <span class="speed-dial-surprise-icon" aria-hidden="true">
      <Icon name="sparkles" size={22} strokeWidth={2} />
    </span>
    <span class="speed-dial-surprise-label"
      >{surpriseLoading
        ? t('home.speedDialSurpriseLoading')
        : t('home.speedDialSurpriseMe')}</span
    >
    <span class="speed-dial-surprise-hint"
      >{t('home.speedDialSurpriseHint')}</span
    >
  </button>
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
      <div
        class="speed-dial-cover speed-dial-cover--gradient"
        style:background={artGradient(coverSeed)}
      ></div>
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
  <div
    class="speed-dial-menu-backdrop"
    onclick={() => (menuOpen = false)}
  ></div>
  <div
    bind:this={menuEl}
    class="speed-dial-menu"
    style:left="{menuX}px"
    style:top="{menuY}px"
    role="menu"
  >
    {#if cell.pinned}
      <button type="button" role="menuitem" onclick={onUnpin}
        >{t('home.speedDialUnpin')}</button
      >
    {:else}
      <button type="button" role="menuitem" onclick={onPin}
        >{t('home.speedDialPin')}</button
      >
    {/if}
    <button type="button" role="menuitem" onclick={onHide}
      >{t('home.speedDialHide')}</button
    >
    <button type="button" role="menuitem" onclick={() => (menuOpen = false)}
      >{t('common.cancel')}</button
    >
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

  .speed-dial-cell--surprise {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1.5px solid color-mix(in srgb, var(--accent) 28%, transparent);
    background: #120d18;
    color: #fff;
    overflow: hidden;
  }

  .speed-dial-cell--surprise:disabled {
    cursor: wait;
    opacity: 0.92;
  }

  .speed-dial-surprise-bg {
    position: absolute;
    inset: -20%;
    background: radial-gradient(
        circle at 20% 20%,
        rgba(255, 120, 180, 0.55),
        transparent 52%
      ),
      radial-gradient(
        circle at 78% 72%,
        rgba(96, 165, 250, 0.48),
        transparent 50%
      ),
      radial-gradient(
        circle at 52% 48%,
        rgba(167, 139, 250, 0.42),
        transparent 58%
      ),
      linear-gradient(145deg, #1a1024 0%, #0f1524 100%);
    animation: speed-dial-surprise-shift 8s ease-in-out infinite alternate;
  }

  @keyframes speed-dial-surprise-shift {
    0% {
      transform: scale(1) rotate(0deg);
    }
    100% {
      transform: scale(1.08) rotate(6deg);
    }
  }

  .speed-dial-surprise-icon {
    position: relative;
    z-index: 1;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  }

  .speed-dial-surprise-label {
    position: relative;
    z-index: 1;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    line-height: 1.2;
    text-align: center;
    padding: 0 8px;
  }

  .speed-dial-surprise-hint {
    position: relative;
    z-index: 1;
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.72);
    text-align: center;
    padding: 0 8px;
  }

  @media (hover: hover) and (pointer: fine) {
    .speed-dial-cell--surprise:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--accent) 55%, transparent);
      transform: translateY(-1px);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .speed-dial-cell:not(.speed-dial-cell--surprise):hover {
      border-color: rgba(255, 255, 255, 0.35);
      transform: translateY(-1px);
    }
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
    background: linear-gradient(
      180deg,
      transparent 0%,
      rgba(0, 0, 0, 0.72) 68%,
      rgba(0, 0, 0, 0.88) 100%
    );
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
