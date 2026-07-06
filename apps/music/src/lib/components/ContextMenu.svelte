<script>
  import { t } from '$lib/i18n/index.js';
  import { appendToQueue, playTrack } from '$lib/player.svelte.js';
  import { toggleLike, db } from '$lib/db.js';
  import { clampPopoverPosition } from '@life-os/theme';
  import { tick } from 'svelte';

  /** @type {{ x: number; y: number; track: import('$lib/types.js').Track; onClose: () => void; onPlay?: () => void; onPlayNext?: () => void; onAddQueue?: () => void; onLikeChange?: (next: 0 | 1) => void }} */
  let { x, y, track, onClose, onPlay, onPlayNext, onAddQueue, onLikeChange } = $props();

  /** @type {HTMLDivElement | null} */
  let el = $state(null);

  $effect(() => {
    x;
    y;
    tick().then(() => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const { left, top } = clampPopoverPosition(x, y, rect.width, rect.height);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    });

    /** @param {MouseEvent | TouchEvent} e */
    const onDoc = (e) => {
      if (el && !el.contains(/** @type {Node} */ (e.target))) onClose();
    };
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('touchstart', onDoc, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('touchstart', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  });

  async function onDelete() {
    await db.tracks.delete(track.id);
    onClose();
  }

  async function onToggleLike() {
    const next = await toggleLike(track.id);
    if (next === 0 || next === 1) {
      track.liked = next;
      onLikeChange?.(next);
    }
    onClose();
  }
</script>

<div bind:this={el} class="context-menu" style:left="{x}px" style:top="{y}px" role="menu">
  <button type="button" class="context-menu-item" role="menuitem" onclick={() => { (onPlay ?? (() => playTrack(track)))(); onClose(); }}>
    {t('common.playNow')}
  </button>
  <button type="button" class="context-menu-item" role="menuitem" onclick={() => { (onAddQueue ?? (() => appendToQueue([track])))(); onClose(); }}>
    {t('common.addToQueue')}
  </button>
  <button type="button" class="context-menu-item" role="menuitem" onclick={onToggleLike}>
    {track.liked ? t('liked.remove') : t('liked.add')}
  </button>
  <button type="button" class="context-menu-item context-menu-item--danger" role="menuitem" onclick={onDelete}>
    {t('common.delete')}
  </button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: calc(var(--z-sheet) + 4);
    min-width: 180px;
    padding: var(--space-1);
    border-radius: var(--radius-md);
    background: var(--card);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-elevated);
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    width: 100%;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--t1, var(--text));
    min-height: var(--tap-min);
  }

  .context-menu-item:focus-visible {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  @media (hover: hover) and (pointer: fine) {
    .context-menu-item:hover {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
    }
  }

  .context-menu-item--danger {
    color: var(--accent);
  }
</style>
