<script>
  import { t } from '$lib/i18n/index.js';

  /** @type {{ lyrics?: string }} */
  let { lyrics = '' } = $props();

  const lines = $derived(
    lyrics
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );
</script>

{#if lines.length}
  <section class="now-playing-lyrics" aria-label={t('nowPlaying.lyrics')}>
    <div class="now-playing-lyrics-head">{t('nowPlaying.lyrics')}</div>
    <div class="now-playing-lyrics-body">
      {#each lines as line}
        <p class="now-playing-lyrics-line">{line}</p>
      {/each}
    </div>
  </section>
{:else}
  <p class="now-playing-lyrics-empty">{t('nowPlaying.noLyrics')}</p>
{/if}
