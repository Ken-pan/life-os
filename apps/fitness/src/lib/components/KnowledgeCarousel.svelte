<script>
  import { onMount } from 'svelte';
  import { reveal } from '$lib/actions/reveal.js';
  import { openKnowledgeSheet } from '$lib/ui.svelte.js';
  import { getRecommendedEntries, getKnowledgeTeaser } from '$lib/data/libraryHelpers.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { t } from '$lib/i18n/index.js';

  const DISMISS_KEY = 'fitness:knowledge-carousel-dismissed';

  /** @type {{ dayId: string }} */
  let { dayId } = $props();

  let dismissed = $state(false);
  let userOffset = $state(0);

  const baseOffset = $derived(new Date().getDate() + new Date().getMonth() * 31);
  const entries = $derived(
    getRecommendedEntries({ dayId, limit: 3, offset: baseOffset + userOffset })
  );

  onMount(() => {
    dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
  });

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    dismissed = true;
  }

  function shuffle() {
    userOffset += 1;
  }

  /** @param {string} entryId */
  function open(entryId) {
    openKnowledgeSheet(entryId);
  }

  /** @param {string} tag */
  function shortTag(tag) {
    return tag.split('·')[0].trim();
  }
</script>

{#if !dismissed && entries.length}
  <section class="knowledge-carousel" aria-label={t('knowledge.carouselAria')} use:reveal>
    <div class="knowledge-carousel-head">
      <div class="knowledge-carousel-brand">
        <div class="knowledge-carousel-brand-text">
          <span class="knowledge-carousel-label">{t('knowledge.carouselLabel')}</span>
          <span class="knowledge-carousel-hint">{t('knowledge.carouselHint')}</span>
        </div>
      </div>
      <div class="knowledge-carousel-actions">
        <button
          type="button"
          class="knowledge-carousel-btn"
          aria-label={t('knowledge.shuffle')}
          onclick={shuffle}
        >
          <Icon name="repeat" size={14} />
        </button>
        <button
          type="button"
          class="knowledge-carousel-btn"
          aria-label={t('knowledge.dismiss')}
          onclick={dismiss}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>

    <div class="knowledge-carousel-scroller">
      <div class="knowledge-carousel-track life-os-scroll-x life-os-scroll-x--snap-mandatory">
        {#each entries as entry, i (entry.id + userOffset)}
          <button
            type="button"
            class="knowledge-card"
            class:is-featured={i === 0}
            aria-label={t('knowledge.cardAria', { title: entry.title })}
            onclick={() => open(entry.id)}
          >
            <span class="knowledge-card-icon-wrap" aria-hidden="true">
              <Icon name={entry.icon || 'principles'} size={18} />
            </span>
            <span class="knowledge-card-body">
              <span class="knowledge-card-tag">{shortTag(entry.tag)}</span>
              <span class="knowledge-card-title">{entry.title}</span>
              <span class="knowledge-card-teaser">{getKnowledgeTeaser(entry, 96)}</span>
            </span>
            <Icon name="chevron-right" size={15} class="knowledge-card-chevron" />
          </button>
        {/each}
      </div>
    </div>
  </section>
{/if}
