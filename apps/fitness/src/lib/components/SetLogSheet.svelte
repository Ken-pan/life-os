<script>
  import {
    setLogSheet,
    closeSetLogSheet,
    openFitnessToolSheet,
  } from '$lib/ui.svelte.js'
  import { S, exWeight, exBarWeight, exEquipMode } from '$lib/state.svelte.js'
  import {
    estimate1RM,
    isBarbellExercise,
    plateConfigFor,
  } from '$lib/tools/calculators.js'
  import { useSheetEnterShown } from '@life-os/platform-web/svelte/overlay'
  import { t } from '$lib/i18n/index.js'

  const sheetEnter = useSheetEnterShown(() =>
    Boolean(setLogSheet.open && setLogSheet.ex),
  )

  function confirm() {
    setLogSheet.onConfirm?.({ reps: setLogSheet.reps, rir: setLogSheet.rir })
    closeSetLogSheet()
  }

  function skip() {
    setLogSheet.onSkip?.()
    closeSetLogSheet()
  }

  function onKey(e) {
    if (e.key === 'Escape') skip()
  }

  function bumpReps(d) {
    setLogSheet.reps = Math.max(1, setLogSheet.reps + d)
  }

  function setRir(v) {
    setLogSheet.rir = v
  }

  const exWeightLbs = $derived(setLogSheet.ex ? exWeight(setLogSheet.ex) : null)
  const hasBarWeight = $derived(exWeightLbs != null && exWeightLbs > 0)
  const showPlatesLink = $derived(
    hasBarWeight &&
      isBarbellExercise(setLogSheet.ex, exEquipMode(setLogSheet.ex)),
  )
  const rmPreview = $derived(
    hasBarWeight && setLogSheet.reps
      ? estimate1RM(exWeightLbs, setLogSheet.reps)
      : null,
  )

  function openTool(tab) {
    if (!setLogSheet.ex) return
    const unit = S.settings.unit === 'kg' ? 'kg' : 'lbs'
    const mode = exEquipMode(setLogSheet.ex)
    const plateCfg = plateConfigFor(setLogSheet.ex, unit, mode)
    openFitnessToolSheet({
      tab,
      weight: exWeightLbs,
      reps: setLogSheet.reps,
      sets: setLogSheet.ex.sets,
      targetWeight: exWeightLbs,
      barWeight: exBarWeight(setLogSheet.ex, unit) ?? undefined,
      plateSides: plateCfg?.sides,
      plateUnit: unit,
      ex: setLogSheet.ex,
      fromFocus: true,
    })
  }
</script>

<svelte:window onkeydown={onKey} />

{#if setLogSheet.open && setLogSheet.ex}
  <div
    class="sheet-bg kenos-sheet-motion"
    class:show={sheetEnter.shown}
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && skip()}
  >
    <div
      class="sheet"
      role="dialog"
      aria-label={t('setLog.aria')}
      aria-modal="true"
    >
      <div class="sheet-handle"></div>
      <div class="sheet-title">
        {t('setLog.title', {
          set: setLogSheet.setIndex,
          name: setLogSheet.ex.name,
        })}
      </div>
      <div class="sheet-sub">{t('setLog.sub')}</div>

      <div class="sheet-field">
        <span class="sheet-label">{t('setLog.reps')}</span>
        <div class="sheet-stepper">
          <button
            type="button"
            aria-label={t('setLog.decReps')}
            onclick={() => bumpReps(-1)}>−</button
          >
          <span class="sheet-val">{setLogSheet.reps}</span>
          <button
            type="button"
            aria-label={t('setLog.incReps')}
            onclick={() => bumpReps(1)}>+</button
          >
        </div>
      </div>

      <div class="sheet-field">
        <span class="sheet-label">{t('setLog.rir')}</span>
        <div class="rir-btns" role="group" aria-label={t('setLog.rirGroup')}>
          <button
            type="button"
            class:active={setLogSheet.rir === 0}
            aria-pressed={setLogSheet.rir === 0}
            onclick={() => setRir(0)}>0</button
          >
          <button
            type="button"
            class:active={setLogSheet.rir === 1}
            aria-pressed={setLogSheet.rir === 1}
            onclick={() => setRir(1)}>1</button
          >
          <button
            type="button"
            class:active={setLogSheet.rir >= 2}
            aria-pressed={setLogSheet.rir >= 2}
            onclick={() => setRir(2)}>2+</button
          >
        </div>
      </div>

      {#if (hasBarWeight && rmPreview) || showPlatesLink}
        <div class="setlog-tools">
          {#if hasBarWeight && rmPreview}
            <button
              type="button"
              class="setlog-tool-link"
              onclick={() => openTool('1rm')}
            >
              {t('setLog.estimate1rm', { weight: rmPreview.avg })}
            </button>
          {/if}
          {#if showPlatesLink}
            <button
              type="button"
              class="setlog-tool-link"
              onclick={() => openTool('plates')}
            >
              {t('focus.plates')}
            </button>
          {/if}
        </div>
      {/if}

      <div class="sheet-actions">
        <button type="button" class="sheet-skip" onclick={skip}
          >{t('setLog.skipLog')}</button
        >
        <button type="button" class="sheet-save" onclick={confirm}
          >{t('common.save')}</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .setlog-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin: -4px 0 14px;
  }
  .setlog-tool-link {
    min-height: 44px;
    padding: 10px 4px;
    border: none;
    background: none;
    font-size: var(--text-xs);
    color: var(--t3);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: color-mix(in srgb, var(--t3) 40%, transparent);
  }
  .setlog-tool-link:hover {
    color: var(--accent);
    text-decoration-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
</style>
