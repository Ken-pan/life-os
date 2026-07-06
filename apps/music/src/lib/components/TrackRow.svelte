<script>
  import Icon from './Icon.svelte'
  import TrackArt from './TrackArt.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import LikeButton from './LikeButton.svelte'
  import { playTrack, playTracks, appendToQueue, insertAfterCurrent } from '$lib/player.svelte.js'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ track: import('$lib/types.js').Track, tracks?: import('$lib/types.js').Track[], index?: number, showLike?: boolean, compactActions?: boolean, queueMode?: boolean, richActions?: boolean, selected?: boolean, playSource?: import('$lib/musicInteractions.js').PlaySource, onSelect?: (e: MouseEvent) => void }} */
  let {
    track,
    tracks = [],
    index = 0,
    showLike = true,
    compactActions = false,
    queueMode = false,
    richActions = false,
    selected = false,
    playSource = 'home',
    onSelect,
  } = $props()

  /** @type {{ track: import('$lib/types.js').Track; x: number; y: number } | null} */
  let menu = $state(null)

  function onPlay() {
    if (tracks.length)
      playTracks(tracks, index, playSource, {
        entityType: 'track',
        entityId: track.id,
      })
    else playTrack(track, playSource)
  }

  /** @param {0 | 1} next */
  function onLikeChange(next) {
    track.liked = next
  }

  /** @param {MouseEvent} e */
  function onRowClick(e) {
    if (onSelect) onSelect(e)
    else onPlay()
  }

  /** @param {MouseEvent} e */
  function openMenu(e) {
    e.stopPropagation()
    menu = { track, x: e.clientX, y: e.clientY }
  }

  function closeMenu() {
    menu = null
  }
</script>

<div
  class="track-row"
  class:track-row--selected={selected}
  class:track-row--compact-actions={compactActions}
  class:track-row--queue={queueMode}
  class:track-row--rich-actions={richActions}
>
  <button
    type="button"
    class="track-row-art-btn"
    aria-label={t('common.playNow')}
    onclick={onPlay}
  >
    <TrackArt
      artUrl={track.artUrl}
      seed={track.id}
      class="track-row-art"
      lazy
      resolve={{
        albumKey: track.albumKey,
        artist: track.artist,
        album: track.album,
        title: track.title,
      }}
    />
    <span class="track-row-art-play" aria-hidden="true">
      <Icon name="play" size={14} strokeWidth={2} />
    </span>
  </button>
  <button type="button" class="track-row-body" onclick={onRowClick}>
    <div class="track-row-title">{track.title}</div>
    <div class="track-row-sub">{track.artist} · {track.album}</div>
  </button>
  {#if !queueMode}
  <div class="track-row-actions">
    {#if showLike}
      <LikeButton
        trackId={track.id}
        liked={track.liked}
        variant="row"
        class="track-row-action track-row-action--like"
        onChange={onLikeChange}
      />
    {/if}
    <button
      type="button"
      class="track-action-btn play track-row-action"
      aria-label={t('common.playNow')}
      onclick={onPlay}
    >
      <Icon name="play" size={16} strokeWidth={2} />
    </button>
    {#if richActions}
      <button
        type="button"
        class="track-action-btn track-row-action track-row-action--more"
        aria-label={t('common.more')}
        onclick={openMenu}
      >
        <Icon name="more-horizontal" size={16} />
      </button>
    {/if}
  </div>
  {/if}
</div>

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    track={menu.track}
    onClose={closeMenu}
    onPlay={() => onPlay()}
    onPlayNext={() => insertAfterCurrent([menu.track])}
    onAddQueue={() => appendToQueue([menu.track])}
    onLikeChange={onLikeChange}
  />
{/if}

<style>
  .track-row-body {
    flex: 1;
    min-width: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    padding: 0;
    color: inherit;
  }

  .track-row-art-btn {
    position: relative;
    flex-shrink: 0;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 8px;
  }

  .track-row-art-play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: inherit;
    background: color-mix(in srgb, var(--t1, var(--text)) 42%, transparent);
    color: #fff;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-standard);
  }

  @media (hover: hover) and (pointer: fine) {
    .track-row--rich-actions:hover .track-row-art-play,
    .track-row--rich-actions:focus-within .track-row-art-play {
      opacity: 1;
    }
  }

  @media (pointer: coarse) {
    .track-row--rich-actions .track-row-art-play {
      opacity: 0;
    }
  }
</style>
