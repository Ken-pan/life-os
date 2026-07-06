<script>
  import { tick } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import { parseLyrics, activeLyricIndex } from '$lib/lyrics.js';

  /** @type {{ lyrics?: string, currentTime?: number, fetching?: boolean, seekable?: boolean, stage?: boolean, singAlong?: boolean, onSeek?: (time: number) => void }} */
  let { lyrics = '', currentTime = 0, fetching = false, seekable = false, stage = false, singAlong = false, onSeek } = $props();

  const model = $derived(parseLyrics(lyrics));
  const active = $derived(activeLyricIndex(model, currentTime));
  const visualActive = $derived(model.timed && model.lines.length ? Math.max(active, 0) : -1);
  const canSeek = $derived(seekable && model.timed && typeof onSeek === 'function');

  /** @type {HTMLElement | undefined} */
  let scrollEl = $state();
  let lastActive = -2;

  $effect(() => {
    const idx = active;
    if (idx < 0 || idx === lastActive || !scrollEl || !model.timed) return;
    lastActive = idx;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    tick().then(() => scrollActiveIntoView(idx, reduced ? 'auto' : 'smooth'));
  });

  /** @param {number} idx @param {ScrollBehavior} behavior */
  function scrollActiveIntoView(idx, behavior = 'smooth') {
    if (idx < 0 || !scrollEl) return;
    const node = scrollEl.querySelector(`[data-lyric-idx="${idx}"]`);
    if (!(node instanceof HTMLElement)) return;
    const anchor = scrollEl.clientHeight * (stage ? 0.44 : 0.38);
    const top = Math.max(0, node.offsetTop - anchor);
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || behavior === 'auto') {
      scrollEl.scrollTop = top;
      return;
    }
    smoothScrollTo(scrollEl, top, 420);
  }

  /** @param {HTMLElement} el @param {number} top @param {number} duration */
  function smoothScrollTo(el, top, duration) {
    const start = el.scrollTop;
    const diff = top - start;
    if (Math.abs(diff) < 2) {
      el.scrollTop = top;
      return;
    }
    const t0 = performance.now();
    /** @param {number} t */
    function frame(t) {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      el.scrollTop = start + diff * eased;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /** @param {number} idx */
  function onLineClick(idx) {
    if (!canSeek) return;
    const line = model.lines[idx];
    if (!line || line.time <= 0) return;
    onSeek?.(line.time);
    scrollActiveIntoView(idx);
  }
</script>

{#if fetching}
  <section class="now-playing-lyrics now-playing-lyrics--loading" aria-label={t('nowPlaying.lyrics')} aria-busy="true">
    <div class="now-playing-lyrics-head">{t('nowPlaying.lyrics')}</div>
    <div class="now-playing-lyrics-skeleton" aria-hidden="true">
      {#each Array(5) as _, i (i)}
        <span class="now-playing-lyrics-skeleton-line" style:width="{55 + (i % 3) * 12}%"></span>
      {/each}
    </div>
    <p class="now-playing-lyrics-loading-copy">{t('nowPlaying.fetchingLyrics')}</p>
  </section>
{:else if model.lines.length}
  <section class="now-playing-lyrics" class:now-playing-lyrics--stage={stage} class:now-playing-lyrics--sing-along={singAlong} aria-label={t('nowPlaying.lyrics')}>
    {#if !stage}
      <div class="now-playing-lyrics-head">
        {t('nowPlaying.lyrics')}
        {#if model.timed}
          <span class="now-playing-lyrics-tag">{t('nowPlaying.synced')}</span>
        {:else}
          <span class="now-playing-lyrics-tag now-playing-lyrics-tag--plain">{t('nowPlaying.plain')}</span>
        {/if}
      </div>
    {/if}
    <div class="now-playing-lyrics-body" class:timed={model.timed} class:seekable={canSeek} bind:this={scrollEl}>
      {#each model.lines as line, i (i)}
        {@const isActive = model.timed && i === visualActive}
        {@const isNear = model.timed && visualActive >= 0 && Math.abs(i - visualActive) <= 2 && !isActive}
        {@const isFar = model.timed && visualActive >= 0 && !isActive && !isNear}
        {#if canSeek}
          <button
            type="button"
            class="now-playing-lyrics-line"
            class:active={isActive}
            class:near={isNear}
            class:far={isFar}
            class:passed={model.timed && i < active}
            data-lyric-idx={i}
            onclick={() => onLineClick(i)}
          >
            {line.text}
          </button>
        {:else}
          <p
            class="now-playing-lyrics-line"
            class:active={isActive}
            class:near={isNear}
            class:far={isFar}
            class:passed={model.timed && i < active}
            data-lyric-idx={i}
          >
            {line.text}
          </p>
        {/if}
      {/each}
    </div>
  </section>
{:else}
  <p class="now-playing-lyrics-empty">{t('nowPlaying.noLyrics')}</p>
{/if}
