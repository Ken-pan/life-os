<script>
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { searchTracks } from '$lib/db.js';

  let q = $state('');
  let tracks = $state([]);
  let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

  function onInput(e) {
    q = e.currentTarget.value;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      tracks = await searchTracks(q);
    }, 200);
  }
</script>

<div class="wrap">
  <input class="search-input" type="search" placeholder={t('search.placeholder')} value={q} oninput={onInput} />

  <section class="page-section">
    {#each tracks as track, i (track.id)}
      <TrackRow {track} tracks={tracks} index={i} />
    {/each}
  </section>
</div>
