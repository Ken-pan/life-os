<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getRecentTracks, getAllTracks, trackCount } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';

  let recent = $state([]);
  let total = $state(0);

  onMount(async () => {
    recent = await getRecentTracks(8);
    total = await trackCount();
  });

  async function shuffleAll() {
    const tracks = await getAllTracks();
    if (!tracks.length) return;
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    playTracks(tracks, 0);
  }
</script>

<div class="wrap">
  <section class="mood-hero">
    <div class="mood-hero-kicker">{t('home.kicker')}</div>
    <h2 class="mood-hero-title" style="white-space:pre-line">{t('home.heroTitle')}</h2>
    <p class="mood-hero-desc">{t('home.heroDesc')}</p>
    <div class="mood-hero-actions">
      {#if total > 0}
        <button class="btn-primary" type="button" onclick={shuffleAll}>{t('home.shuffleAll')}</button>
      {/if}
      <a class="btn-secondary" href="/import">{t('common.import')}</a>
    </div>
  </section>

  <section class="page-section">
    <div class="page-section-head">
      <h3 class="page-section-title">{t('home.quick')}</h3>
    </div>
    <div class="quick-grid">
      <a class="quick-card" href="/library"><span class="quick-card-label">{t('nav.library')}</span><span class="quick-card-sub">{t('common.songs', { count: total })}</span></a>
      <a class="quick-card" href="/liked"><span class="quick-card-label">{t('home.liked')}</span><span class="quick-card-sub">红心收藏</span></a>
      <a class="quick-card" href="/browse"><span class="quick-card-label">{t('nav.browse')}</span><span class="quick-card-sub">专辑 · 艺术家</span></a>
      <a class="quick-card" href="/search"><span class="quick-card-label">{t('common.search')}</span><span class="quick-card-sub">快速查找</span></a>
    </div>
  </section>

  {#if recent.length}
    <section class="page-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.recent')}</h3>
      </div>
      {#each recent as track, i (track.id)}
        <TrackRow {track} tracks={recent} index={i} />
      {/each}
    </section>
  {:else}
    <section class="empty-state">
      <p>{t('common.empty')}</p>
      <p>{t('common.emptyHint')}</p>
      <a class="btn-primary" href="/import">{t('common.import')}</a>
    </section>
  {/if}
</div>
