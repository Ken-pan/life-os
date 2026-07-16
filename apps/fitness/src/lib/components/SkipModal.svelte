<script>
  import { skipModal, closeSkipModal } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import { exerciseName } from '$lib/i18n/exerciseLabels.js';
  import { getExLog } from '$lib/session.js';
  import { LifeOsDialog } from '@life-os/platform-web/svelte/overlay';

  const reasons = $derived([
    { id: 'equipment', label: t('skip.equipment') },
    { id: 'discomfort', label: t('skip.discomfort') },
    { id: 'other', label: t('skip.other') }
  ]);

  function confirm() {
    skipModal.onConfirm?.({
      reason: skipModal.reason,
      substituteId: skipModal.substituteId
    });
    closeSkipModal();
  }

  const alternatives = $derived(skipModal.ex?.alternatives ?? []);
  const completedSets = $derived(
    skipModal.ex ? getExLog(skipModal.dayId, skipModal.ex.id, skipModal.ex.sets).done : 0
  );
  const isPartialReplacement = $derived(completedSets > 0);
</script>

<LifeOsDialog
  open={skipModal.open && Boolean(skipModal.ex)}
  onClose={closeSkipModal}
  ariaLabel={t('skip.aria')}
>
  {#snippet header()}
    <div class="modal-title">
      {t(isPartialReplacement ? 'skip.replaceRemainingTitle' : 'skip.title', { name: skipModal.ex.name })}
    </div>
    <div class="modal-sub">{t('skip.sub')}</div>
  {/snippet}

  <div class="skip-reasons" role="radiogroup" aria-label={t('skip.reasonGroup')}>
    {#each reasons as r (r.id)}
      <button
        type="button"
        class="skip-reason"
        class:active={skipModal.reason === r.id}
        onclick={() => (skipModal.reason = r.id)}
      >{r.label}</button>
    {/each}
  </div>

  {#if alternatives.length}
    <div class="skip-alts">
      <div class="sheet-label">{t('skip.alternatives')}</div>
      {#each alternatives as alt (alt.id)}
        <button
          type="button"
          class="skip-alt"
          class:active={skipModal.substituteId === alt.id}
          aria-pressed={skipModal.substituteId === alt.id}
          onclick={() =>
            (skipModal.substituteId =
              skipModal.substituteId === alt.id ? null : alt.id)}
        >
          <span class="skip-alt-indicator" aria-hidden="true">✓</span>
          <span>{exerciseName(alt.id) || alt.name}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#snippet actions()}
    <button type="button" class="ma-cancel" onclick={closeSkipModal}>{t('common.cancel')}</button>
    <button type="button" class="ma-save" onclick={confirm}>
      {t(isPartialReplacement ? 'skip.confirmReplacement' : 'skip.confirm')}
    </button>
  {/snippet}
</LifeOsDialog>
