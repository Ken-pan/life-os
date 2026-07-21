<script>
  import { tick } from 'svelte'
  import { fitnessToolSheet, closeFitnessToolSheet } from '$lib/ui.svelte.js'
  import {
    estimate1RM,
    restSuggestion,
    volumeTotal,
  } from '$lib/tools/calculators.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { useSheetEnterShown } from '@life-os/platform-web/svelte/overlay'
  import PlateToolPanel from '$lib/components/PlateToolPanel.svelte'
  import { t } from '$lib/i18n/index.js'

  /** @type {HTMLDivElement | null} */
  let sheetEl = $state(null)
  const sheetEnter = useSheetEnterShown(() => fitnessToolSheet.open)

  const TABS = [
    ['1rm', 'tools.tab1rm'],
    ['plates', 'tools.tabPlates'],
    ['rest', 'tools.tabRest'],
  ]

  const INTENSITY = [
    ['strength', 'tools.intensityStrength'],
    ['hypertrophy', 'tools.intensityHypertrophy'],
    ['endurance', 'tools.intensityEndurance'],
  ]

  const isFocusPlates = $derived(
    fitnessToolSheet.fromFocus && fitnessToolSheet.tab === 'plates',
  )

  const rm1 = $derived(
    estimate1RM(fitnessToolSheet.rmWeight, fitnessToolSheet.rmReps),
  )
  const volTotal = $derived(
    volumeTotal(
      fitnessToolSheet.volSets,
      fitnessToolSheet.volReps,
      fitnessToolSheet.volWeight,
    ),
  )
  const restAdvice = $derived(restSuggestion(fitnessToolSheet.restIntensity))

  function onKey(e) {
    if (e.key === 'Escape' && fitnessToolSheet.open) closeFitnessToolSheet()
  }

  function onBackdrop(e) {
    if (e.target === e.currentTarget) closeFitnessToolSheet()
  }

  function setTab(id) {
    fitnessToolSheet.tab = id
  }

  /** @param {KeyboardEvent} e */
  function onTabKey(e, index) {
    const ids = TABS.map(([id]) => id)
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % ids.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + ids.length) % ids.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = ids.length - 1
    setTab(ids[next])
    e.currentTarget.parentElement
      ?.querySelectorAll('[role="tab"]')
      [next]?.focus()
  }

  $effect(() => {
    if (
      fitnessToolSheet.open &&
      fitnessToolSheet.tab === 'plates' &&
      !fitnessToolSheet.fromFocus
    ) {
      tick().then(() => {
        sheetEl
          ?.querySelector('.pb-viz-container')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
  })
</script>

<svelte:window onkeydown={onKey} />

{#if fitnessToolSheet.open}
  <div
    class="sheet-bg kenos-sheet-motion"
    class:show={sheetEnter.shown}
    role="presentation"
    onclick={onBackdrop}
  >
    <div
      class="sheet tool-sheet"
      class:tool-sheet--focus={isFocusPlates}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-sheet-title"
      bind:this={sheetEl}
    >
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="tool-sheet-head">
        <div class="tool-sheet-head-copy">
          <h2 class="sheet-title" id="tool-sheet-title">
            {isFocusPlates ? t('tools.sheetPlates') : t('tools.sheetTitle')}
          </h2>
          {#if isFocusPlates && fitnessToolSheet.exName}
            <p class="tool-sheet-sub">{fitnessToolSheet.exName}</p>
          {/if}
        </div>
        <button
          type="button"
          class="tool-sheet-close"
          aria-label={t('common.close')}
          onclick={closeFitnessToolSheet}
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {#if !isFocusPlates}
        <div
          class="tool-tabs seg seg-track life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge"
          role="tablist"
          aria-label={t('tools.tabListAria')}
        >
          {#each TABS as [id, labelKey], index (id)}
            <button
              type="button"
              role="tab"
              aria-selected={fitnessToolSheet.tab === id}
              tabindex={fitnessToolSheet.tab === id ? 0 : -1}
              class:active={fitnessToolSheet.tab === id}
              onclick={() => setTab(id)}
              onkeydown={(e) => onTabKey(e, index)}>{t(labelKey)}</button
            >
          {/each}
        </div>
      {/if}

      <div class="tool-sheet-body" class:tool-sheet-body--focus={isFocusPlates}>
        {#if fitnessToolSheet.tab === '1rm'}
          <div class="tool-pane" role="tabpanel">
            <div class="tool-fields">
              <label class="tool-field">
                <span>{t('tools.weightLbs')}</span>
                <input
                  type="number"
                  min="1"
                  step="2.5"
                  bind:value={fitnessToolSheet.rmWeight}
                />
              </label>
              <label class="tool-field">
                <span>{t('tools.reps')}</span>
                <input
                  type="number"
                  min="1"
                  max="15"
                  bind:value={fitnessToolSheet.rmReps}
                />
              </label>
            </div>
            {#if rm1}
              <div class="tool-result">
                <div>{t('tools.est1rm', { avg: rm1.avg })}</div>
                <div class="tool-sub">
                  Epley {rm1.epley} · Brzycki {rm1.brzycki}
                </div>
              </div>
            {/if}
          </div>
        {:else if fitnessToolSheet.tab === 'plates'}
          <div class="tool-pane" role="tabpanel">
            <PlateToolPanel
              ex={fitnessToolSheet.ex}
              bind:unit={fitnessToolSheet.plateUnit}
              bind:value={fitnessToolSheet.plateTarget}
              bind:bar={fitnessToolSheet.plateBar}
              sides={fitnessToolSheet.plateSides}
              showUnitToggle={fitnessToolSheet.plateSides === 2 &&
                !fitnessToolSheet.fromFocus}
              variant={fitnessToolSheet.fromFocus ? 'focus' : 'full'}
            />
          </div>
        {:else}
          <div class="tool-pane" role="tabpanel">
            <div class="tool-fields">
              <label class="tool-field">
                <span>{t('tools.sets')}</span>
                <input
                  type="number"
                  min="1"
                  bind:value={fitnessToolSheet.volSets}
                />
              </label>
              <label class="tool-field">
                <span>{t('tools.repsPerSet')}</span>
                <input
                  type="number"
                  min="1"
                  bind:value={fitnessToolSheet.volReps}
                />
              </label>
              <label class="tool-field tool-field-wide">
                <span>{t('tools.weightOptional')}</span>
                <input
                  type="number"
                  min="0"
                  step="2.5"
                  bind:value={fitnessToolSheet.volWeight}
                />
              </label>
            </div>
            {#if volTotal}
              <div class="tool-result">
                <div>
                  {t('tools.totalReps', {
                    reps: volTotal.reps,
                  })}{#if volTotal.volume}{t('tools.totalVol', {
                      vol: volTotal.volume,
                    })}{/if}
                </div>
              </div>
            {/if}
            <div class="tool-seg">
              {#each INTENSITY as [id, labelKey] (id)}
                <button
                  type="button"
                  class:on={fitnessToolSheet.restIntensity === id}
                  onclick={() => (fitnessToolSheet.restIntensity = id)}
                  >{t(labelKey)}</button
                >
              {/each}
            </div>
            <div class="tool-result">
              <div>
                {t('tools.restAdvice', {
                  label: restAdvice.label,
                  range: restAdvice.range,
                })}
              </div>
              <div class="tool-sub">
                {t('tools.restSec', { sec: restAdvice.sec })}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
