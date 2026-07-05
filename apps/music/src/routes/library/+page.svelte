<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getAllTracks } from '$lib/db.js';

  let tracks = $state([]);

  onMount(async () => {
    tracks = await getAllTracks();
  });
</script>

<div class="wrap">
  <div class="page-section-head" style="margin-top:0">
    <h2 class="page-title">{t('library.title')}</h2>
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
