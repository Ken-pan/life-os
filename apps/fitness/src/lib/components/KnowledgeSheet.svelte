<script>
  import { tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { knowledgeSheet, closeKnowledgeSheet } from '$lib/ui.svelte.js';
  import { getLibraryEntry, getKnowledgePreview, libraryHref } from '$lib/data/libraryHelpers.js';
  import Icon from '$lib/components/Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  let closeBtn = $state(null);

  const entry = $derived(
    knowledgeSheet.entryId ? getLibraryEntry(knowledgeSheet.entryId) : null
  );
  const bullets = $derived(entry ? getKnowledgePreview(entry) : []);
  const fullHref = $derived(entry ? libraryHref(entry.id) : '/library');

  $effect(() => {
    if (knowledgeSheet.open) {
      tick().then(() => closeBtn?.focus());
    }
  });

  function onKey(e) {
    if (e.key === 'Escape' && knowledgeSheet.open) closeKnowledgeSheet();
  }

  function onBackdrop(e) {
    if (e.target === e.currentTarget) closeKnowledgeSheet();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if knowledgeSheet.open && entry}
  <div class="sheet-bg" role="presentation" onclick={onBackdrop}>
    <div
      class="sheet knowledge-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="knowledge-sheet-title"
    >
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="knowledge-head">
        <div class="knowledge-head-copy">
          {#if entry.icon}
            <Icon name={entry.icon} size={18} class="knowledge-icon" />
          {/if}
          <span class="knowledge-tag">{entry.tag}</span>
        </div>
        <button
          type="button"
          class="knowledge-close"
          aria-label={t('common.close')}
          bind:this={closeBtn}
          onclick={closeKnowledgeSheet}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      <h2 class="sheet-title" id="knowledge-sheet-title">{entry.title}</h2>

      {#if bullets.length}
        <ul class="knowledge-bullets">
          {#each bullets as line (line)}
            <li>{line}</li>
          {/each}
        </ul>
      {/if}

      {#if entry.cite}
        <p class="knowledge-cite">{entry.cite}</p>
      {/if}

      <a class="knowledge-full-link" href="{resolve('/library')}#lib-{entry.id}" onclick={closeKnowledgeSheet}>
        {t('knowledge.viewFull')}
        <Icon name="chevron-right" size={14} />
      </a>
    </div>
  </div>
{/if}
