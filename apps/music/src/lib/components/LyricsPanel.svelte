<script>
  import { tick } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import { parseLyrics, activeLyricIndex } from '$lib/lyrics.js';

  /** @type {{ lyrics?: string, currentTime?: number }} */
  let { lyrics = '', currentTime = 0 } = $props();

  const model = $derived(parseLyrics(lyrics));
  const active = $derived(activeLyricIndex(model, currentTime));

  /** @type {HTMLElement | undefined} */
  let scrollEl = $state();
  let lastActive = -2;

  $effect(() => {
    const idx = active;
    if (idx < 0 || idx === lastActive || !scrollEl) return;
    lastActive = idx;
    tick().then(() => {
      const node = scrollEl?.querySelector(`[data-lyric-idx="${idx}"]`);
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });
</script>

{#if model.lines.length}
  <section class="now-playing-lyrics" aria-label={t('nowPlaying.lyrics')}>
    <div class="now-playing-lyrics-head">
      {t('nowPlaying.lyrics')}
      {#if model.timed}
        <span class="now-playing-lyrics-tag">{t('nowPlaying.synced')}</span>
      {/if}
    </div>
    <div class="now-playing-lyrics-body" class:timed={model.timed} bind:this={scrollEl}>
      {#each model.lines as line, i}
        <p
          class="now-playing-lyrics-line"
          class:active={model.timed && i === active}
          class:passed={model.timed && i < active}
          data-lyric-idx={i}
        >
          {line.text}
        </p>
      {/each}
    </div>
  </section>
{:else}
  <p class="now-playing-lyrics-empty">{t('nowPlaying.noLyrics')}</p>
{/if}
