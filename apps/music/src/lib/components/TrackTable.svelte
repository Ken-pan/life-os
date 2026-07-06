<script>
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import TrackArt from './TrackArt.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import LikeButton from './LikeButton.svelte';
  import { playTrack, playTracks, appendToQueue } from '$lib/player.svelte.js';
  import { formatTime } from '$lib/player.svelte.js';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ tracks: import('$lib/types.js').Track[], density?: 'comfortable' | 'compact', sortKey?: string, sortDir?: 'asc' | 'desc', filter?: string, selectedIds?: Set<string>, onSort?: (key: string) => void, onToggleSelect?: (id: string, e: MouseEvent) => void, onContext?: (track: import('$lib/types.js').Track, x: number, y: number) => void }} */
  let {
    tracks,
    density = 'comfortable',
    sortKey = 'addedAt',
    sortDir = 'desc',
    filter = '',
    selectedIds = new Set(),
    onSort,
    onToggleSelect,
    onContext
  } = $props();

  /** @type {{ track: import('$lib/types.js').Track; x: number; y: number } | null} */
  let menu = $state(null);

  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    let list = [...tracks];
    if (q) {
      list = list.filter(
        (tr) =>
          tr.title.toLowerCase().includes(q) ||
          tr.artist.toLowerCase().includes(q) ||
          tr.album.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      /** @type {Record<string, keyof import('$lib/types.js').Track>} */
      const keyMap = {
        addedAt: 'addedAt',
        title: 'title',
        artist: 'artist',
        album: 'album',
        duration: 'duration'
      };
      const field = keyMap[sortKey] || 'addedAt';
      const av = a[field];
      const bv = b[field];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv), 'zh')
        : String(bv).localeCompare(String(av), 'zh');
    });
    return list;
  });

  /** @param {string} key */
  function sort(key) {
    onSort?.(key);
  }

  /** @param {import('$lib/types.js').Track} track @param {MouseEvent} e */
  function openMenu(track, e) {
    e.preventDefault();
    menu = { track, x: e.clientX, y: e.clientY };
    onContext?.(track, e.clientX, e.clientY);
  }

  function closeMenu() {
    menu = null;
  }

  /** @param {number} ms */
  function formatAdded(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
</script>

<div class="track-table" class:track-table--compact={density === 'compact'}>
  <div class="track-table-head" role="row">
    <span class="track-table-col track-table-col--idx">#</span>
    <button type="button" class="track-table-col track-table-col--title" class:is-sorted={sortKey === 'title'} onclick={() => sort('title')}>
      {t('library.colTitle')}
      {#if sortKey === 'title'}<Icon name="arrow-up-down" size={12} />{/if}
    </button>
    <button type="button" class="track-table-col track-table-col--artist" class:is-sorted={sortKey === 'artist'} onclick={() => sort('artist')}>
      {t('library.colArtist')}
      {#if sortKey === 'artist'}<Icon name="arrow-up-down" size={12} />{/if}
    </button>
    <button type="button" class="track-table-col track-table-col--album" class:is-sorted={sortKey === 'album'} onclick={() => sort('album')}>
      {t('library.colAlbum')}
      {#if sortKey === 'album'}<Icon name="arrow-up-down" size={12} />{/if}
    </button>
    <button type="button" class="track-table-col track-table-col--added" class:is-sorted={sortKey === 'addedAt'} onclick={() => sort('addedAt')}>
      {t('library.colAdded')}
      {#if sortKey === 'addedAt'}<Icon name="arrow-up-down" size={12} />{/if}
    </button>
    <button type="button" class="track-table-col track-table-col--duration" class:is-sorted={sortKey === 'duration'} onclick={() => sort('duration')}>
      {t('library.colDuration')}
      {#if sortKey === 'duration'}<Icon name="arrow-up-down" size={12} />{/if}
    </button>
    <span class="track-table-col track-table-col--like">{t('library.colLike')}</span>
    <span class="track-table-col track-table-col--actions"></span>
  </div>

  {#each filtered as track, i (track.id)}
    <div
      class="track-table-row"
      class:track-table-row--selected={selectedIds.has(track.id)}
      role="row"
      tabindex={0}
      oncontextmenu={(e) => openMenu(track, e)}
    >
      <span class="track-table-col track-table-col--idx">{i + 1}</span>
      <div class="track-table-col track-table-col--title">
        <TrackArt artUrl={track.artUrl} seed={track.id} class="track-table-art" />
        <button
          type="button"
          class="track-table-title-btn"
          onclick={(e) => (onToggleSelect ? onToggleSelect(track.id, e) : playTrack(track))}
        >
          {track.title}
        </button>
      </div>
      <span class="track-table-col track-table-col--artist">{track.artist}</span>
      <span class="track-table-col track-table-col--album">{track.album}</span>
      <span class="track-table-col track-table-col--added">{formatAdded(track.addedAt)}</span>
      <span class="track-table-col track-table-col--duration">{track.duration ? formatTime(track.duration) : '—'}</span>
      <span class="track-table-col track-table-col--like">
        <LikeButton
          trackId={track.id}
          liked={track.liked}
          variant="table"
          size={16}
          onChange={(next) => (track.liked = next)}
        />
      </span>
      <span class="track-table-col track-table-col--actions">
        <button type="button" class="track-table-icon-btn play" aria-label={t('common.playNow')} onclick={() => playTrack(track)}>
          <Icon name="play" size={14} strokeWidth={2} />
        </button>
        <button type="button" class="track-table-icon-btn" aria-label={t('common.more')} onclick={(e) => openMenu(track, e)}>
          <Icon name="more-horizontal" size={16} />
        </button>
      </span>
    </div>
  {/each}
</div>

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    track={menu.track}
    onClose={closeMenu}
    onPlay={() => playTrack(menu.track)}
    onAddQueue={() => appendToQueue([menu.track])}
  />
{/if}
