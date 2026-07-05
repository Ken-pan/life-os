<script>
  import { t } from '$lib/i18n/index.js';
  import PlayerControls from '$lib/components/PlayerControls.svelte';
  import { player } from '$lib/player.svelte.js';

  const track = $derived(player.queue[player.index] ?? null);
</script>

<div class="now-playing">
  {#if track}
    <div class="now-playing-art-wrap">
      {#if track.artUrl}
        <img class="now-playing-art" src={track.artUrl} alt="" />
      {:else}
        <div class="now-playing-art placeholder">♪</div>
      {/if}
    </div>
    <div class="now-playing-copy">
      <h1 class="now-playing-title">{track.title}</h1>
      <p class="now-playing-artist">{track.artist}</p>
      <p class="now-playing-album">{track.album}</p>
    </div>
    <PlayerControls large />
  {:else}
    <div class="empty-state">
      <p>{t('common.empty')}</p>
      <a class="btn-primary" href="/library">去资料库</a>
    </div>
  {/if}
</div>
