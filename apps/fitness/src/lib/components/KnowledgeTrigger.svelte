<script>
  import { openKnowledgeSheet } from '$lib/ui.svelte.js';
  import { getLibraryEntry } from '$lib/data/libraryHelpers.js';
  import Icon from '$lib/components/Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ entryId: string; label?: string; iconOnly?: boolean; class?: string }} */
  let { entryId, label, iconOnly = false, class: className = '' } = $props();

  const triggerKey = $derived(`library.triggers.${entryId}`);
  const entry = $derived(getLibraryEntry(entryId));
  const resolvedTrigger = $derived(t(triggerKey));
  const triggerLabel = $derived(label ?? resolvedTrigger);
  const showLabel = $derived(
    !iconOnly && (Boolean(label) || resolvedTrigger !== triggerKey)
  );
  const ariaLabel = $derived(
    showLabel
      ? t('knowledge.learnPrefix', {
          label: triggerLabel,
          title: entry?.title ?? t('knowledge.learnTraining')
        })
      : t('knowledge.learnAbout', { title: entry?.title ?? t('knowledge.learnTraining') })
  );

  function open(e) {
    e.preventDefault();
    e.stopPropagation();
    if (entry) openKnowledgeSheet(entryId);
  }
</script>

{#if entry}
  <button
    type="button"
    class="knowledge-trigger {className}"
    aria-label={ariaLabel}
    title={entry.title}
    onclick={open}
  >
    {#if showLabel}
      <span class="knowledge-trigger-label">{triggerLabel}</span>
    {/if}
    <Icon name="info" size={14} class="knowledge-trigger-icon" />
  </button>
{/if}
