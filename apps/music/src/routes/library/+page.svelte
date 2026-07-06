<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n/index.js'
  import TrackRow from '$lib/components/TrackRow.svelte'
  import TrackTable from '$lib/components/TrackTable.svelte'
  import { getAllTracks } from '$lib/db.js'
  import { ensureArtRepaired } from '$lib/import.js'
  import { librarySignals, S, patchLocalSettings } from '$lib/state.svelte.js'
  import { setPageChrome } from '$lib/pageChrome.svelte.js'
  import { appendToQueue } from '$lib/player.svelte.js'

  let tracks = $state([])
  let sortKey = $state('addedAt')
  let sortDir = $state(/** @type {'asc' | 'desc'} */ ('desc'))
  let filter = $state('')
  let selectedIds = $state(new Set())
  let isDesktop = $state(false)

  async function loadTracks() {
    await ensureArtRepaired()
    tracks = await getAllTracks()
  }

  onMount(() => {
    loadTracks()
    const mq = window.matchMedia('(min-width: 861px)')
    isDesktop = mq.matches
    const onChange = () => {
      isDesktop = mq.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  })

  $effect(() => {
    void librarySignals.epoch
    if (librarySignals.epoch > 0) loadTracks()
  })

  /** @param {string} key */
  function onSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    else {
      sortKey = key
      sortDir =
        key === 'title' || key === 'artist' || key === 'album' ? 'asc' : 'desc'
    }
  }

  function toggleDensity() {
    patchLocalSettings({
      libraryDensity:
        S.settings.libraryDensity === 'compact' ? 'comfortable' : 'compact',
    })
  }

  /** @param {string} id @param {MouseEvent} e */
  function onToggleSelect(id, e) {
    const next = new Set(selectedIds)
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      if (next.has(id)) next.delete(id)
      else next.add(id)
    } else {
      next.clear()
      next.add(id)
    }
    selectedIds = next
  }

  function addSelectedToQueue() {
    const picked = tracks.filter((tr) => selectedIds.has(tr.id))
    appendToQueue(picked)
    selectedIds = new Set()
  }

  $effect(() => {
    const actions = []
    if (tracks.length > 0) {
      actions.push({
        label:
          S.settings.libraryDensity === 'compact'
            ? t('common.comfortable')
            : t('common.compact'),
        icon: 'layout-list',
        variant: 'ghost',
        onClick: toggleDensity,
      })
      actions.push({
        label: t('common.import'),
        href: '/import',
        variant: 'secondary',
        icon: 'upload',
      })
    }
    setPageChrome({ actions })
  })

  $effect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        document.getElementById('library-filter')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div class="wrap library-page">
  {#if selectedIds.size}
    <div class="batch-bar">
      <span>{t('common.selected', { count: selectedIds.size })}</span>
      <button type="button" class="btn-secondary" onclick={addSelectedToQueue}
        >{t('common.addToQueue')}</button
      >
      <button
        type="button"
        class="btn-ghost"
        onclick={() => (selectedIds = new Set())}>{t('common.cancel')}</button
      >
    </div>
  {/if}

  {#if isDesktop && tracks.length}
    <input
      id="library-filter"
      class="library-filter"
      type="search"
      placeholder={t('library.filterPlaceholder')}
      bind:value={filter}
    />
    <TrackTable
      {tracks}
      density={S.settings.libraryDensity}
      {sortKey}
      {sortDir}
      {filter}
      {selectedIds}
      {onSort}
      {onToggleSelect}
    />
  {:else if tracks.length}
    {#each tracks as track, i (track.id)}
      <TrackRow {track} {tracks} index={i} compactActions />
    {/each}
  {:else}
    <div class="empty-state">
      <p class="empty-state-title">{t('common.empty')}</p>
      <p class="empty-state-hint">{t('common.emptyHint')}</p>
      <a class="btn-primary" href="/import">{t('common.import')}</a>
    </div>
  {/if}
</div>

<style>
  .library-filter {
    width: 100%;
    max-width: 360px;
    margin-bottom: var(--space-4);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--card);
  }

  .library-filter:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .batch-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-3);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  }
</style>
