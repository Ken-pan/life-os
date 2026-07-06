<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getAllTracks } from '$lib/db.js';
  import { ensureArtRepaired } from '$lib/import.js';
  import { librarySignals } from '$lib/state.svelte.js';

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
</script>

<div class="wrap">
  <div class="page-toolbar">
    <a class="btn-secondary" href="/import">{t('common.import')}</a>
  </div>

  {#if tracks.length}
    {#each tracks as track, i (track.id)}
      <TrackRow {track} tracks={tracks} index={i} />
    {/each}
  {:else}
    <div class="empty-state">
      <p>{t('common.empty')}</p>
      <a class="btn-primary" href="/import">{t('common.import')}</a>
    </div>
  {/if}
</div>
