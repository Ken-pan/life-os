<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getAllTracks } from '$lib/db.js';
  import { ensureArtRepaired } from '$lib/import.js';
  import { librarySignals } from '$lib/state.svelte.js';
  import { setPageChrome } from '$lib/pageChrome.svelte.js';

  let tracks = $state([]);

  async function loadTracks() {
    await ensureArtRepaired();
    tracks = await getAllTracks();
  }

  onMount(loadTracks);

  $effect(() => {
    void librarySignals.epoch;
    if (librarySignals.epoch > 0) loadTracks();
  });

  $effect(() => {
    setPageChrome({
      action:
        tracks.length > 0
          ? { label: t('common.import'), href: '/import', variant: 'secondary' }
          : null
    });
  });
</script>

<div class="wrap">
  {#if tracks.length}
    {#each tracks as track, i (track.id)}
      <TrackRow {track} tracks={tracks} index={i} />
    {/each}
  {:else}
    <div class="empty-state">
      <p class="empty-state-title">{t('common.empty')}</p>
      <p class="empty-state-hint">{t('common.emptyHint')}</p>
      <a class="btn-primary" href="/import">{t('common.import')}</a>
    </div>
  {/if}
</div>
