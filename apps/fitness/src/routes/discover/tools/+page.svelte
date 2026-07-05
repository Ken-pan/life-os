<script>
  import { reveal } from '$lib/actions/reveal.js';
  import BackButton from '$lib/components/BackButton.svelte';
  import PlateToolPanel from '$lib/components/PlateToolPanel.svelte';
  import {
    estimate1RM,
    calcBMI,
    volumeTotal,
    restSuggestion,
    plateCollapsedLine,
    plateLoading
  } from '$lib/tools/calculators.js';
  import { plateInventoryFor, plateCollarFor } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';

  const INTENSITY = [
    ['strength', 'tools.intensityStrength'],
    ['hypertrophy', 'tools.intensityHypertrophy'],
    ['endurance', 'tools.intensityEndurance']
  ];

  let openTool = $state('1rm');

  let rmWeight = $state(135);
  let rmReps = $state(8);
  const rm1 = $derived(estimate1RM(rmWeight, rmReps));

  let plateUnit = $state('lbs');
  let plateTarget = $state(225);
  let plateBar = $state(45);

  const plateCollapsed = $derived.by(() => {
    if (openTool === 'plates') return null;
    const v = Number(plateTarget) || 0;
    if (!v) return null;
    const denoms = plateInventoryFor(plateUnit);
    const r = plateLoading(v, plateBar, {
      sides: 2,
      plates: denoms,
      collar: plateCollarFor(plateUnit)
    });
    if (!r.plates?.length) return null;
    return plateCollapsedLine(r.verify ?? v, r.plates, 2, plateUnit);
  });

  let bmiWeight = $state(70);
  let bmiHeight = $state(175);
  const bmiResult = $derived(calcBMI(bmiWeight, bmiHeight));

  let volSets = $state(4);
  let volReps = $state(10);
  let volWeight = $state(100);
  let restIntensity = $state('hypertrophy');
  const volTotal = $derived(volumeTotal(volSets, volReps, volWeight));
  const restAdvice = $derived(restSuggestion(restIntensity));

  function toggleTool(id) {
    openTool = openTool === id ? '' : id;
  }
</script>

<section class="view">
  <div class="wrap">
    <div class="page-head" use:reveal>
      <BackButton href="/discover" label={t('tools.backDiscover')} />
    </div>

    <div class="sec-header" use:reveal>
      <h2 class="sec-title">{t('tools.title')}</h2>
      <span class="sec-note">{t('tools.offline')}</span>
      <p class="tools-context-note">{t('tools.contextNote')}</p>
    </div>

    <div class="tool-list">
      <div class="tool-card" class:open={openTool === '1rm'} use:reveal>
        <button type="button" class="tool-head" onclick={() => toggleTool('1rm')}>
          <span class="tool-title">{t('tools.rmTitle')}</span>
          <span class="tool-hint">{t('tools.rmHint')}</span>
        </button>
        {#if openTool === '1rm'}
          <div class="tool-body">
            <div class="tool-fields">
              <label class="tool-field">
                <span>{t('tools.weightLbs')}</span>
                <input type="number" min="1" step="2.5" bind:value={rmWeight} />
              </label>
              <label class="tool-field">
                <span>{t('tools.reps')}</span>
                <input type="number" min="1" max="15" bind:value={rmReps} />
              </label>
            </div>
            {#if rm1}
              <div class="tool-result">
                <div>{t('tools.est1rm', { avg: rm1.avg })}</div>
                <div class="tool-sub">Epley {rm1.epley} · Brzycki {rm1.brzycki}</div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="tool-card" class:open={openTool === 'plates'} use:reveal>
        <button type="button" class="tool-head" onclick={() => toggleTool('plates')}>
          <span class="tool-title">{t('tools.platesTitle')}</span>
          <span class="tool-hint">
            {#if plateCollapsed}
              {plateCollapsed}
            {:else}
              {t('tools.standardPlates', { unit: plateUnit })}
            {/if}
          </span>
        </button>
        {#if openTool === 'plates'}
          <div class="tool-body">
            <PlateToolPanel
              bind:unit={plateUnit}
              bind:value={plateTarget}
              bind:bar={plateBar}
            />
          </div>
        {/if}
      </div>

      <div class="tool-card" class:open={openTool === 'bmi'} use:reveal>
        <button type="button" class="tool-head" onclick={() => toggleTool('bmi')}>
          <span class="tool-title">{t('tools.bmiTitle')}</span>
          <span class="tool-hint">{t('tools.bmiHint')}</span>
        </button>
        {#if openTool === 'bmi'}
          <div class="tool-body">
            <div class="tool-fields">
              <label class="tool-field">
                <span>{t('tools.weightKg')}</span>
                <input type="number" min="30" step="0.5" bind:value={bmiWeight} />
              </label>
              <label class="tool-field">
                <span>{t('tools.heightCm')}</span>
                <input type="number" min="120" step="1" bind:value={bmiHeight} />
              </label>
            </div>
            {#if bmiResult}
              <div class="tool-result">
                <div>{t('tools.bmiResult', { bmi: bmiResult.bmi, label: bmiResult.label })}</div>
                <div class="tool-sub">{t('tools.bmiRanges')}</div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="tool-card" class:open={openTool === 'vol'} use:reveal>
        <button type="button" class="tool-head" onclick={() => toggleTool('vol')}>
          <span class="tool-title">{t('tools.volTitle')}</span>
          <span class="tool-hint">{t('tools.volHint')}</span>
        </button>
        {#if openTool === 'vol'}
          <div class="tool-body">
            <div class="tool-fields">
              <label class="tool-field">
                <span>{t('tools.sets')}</span>
                <input type="number" min="1" bind:value={volSets} />
              </label>
              <label class="tool-field">
                <span>{t('tools.repsPerSet')}</span>
                <input type="number" min="1" bind:value={volReps} />
              </label>
              <label class="tool-field">
                <span>{t('tools.weightOptional')}</span>
                <input type="number" min="0" step="2.5" bind:value={volWeight} />
              </label>
            </div>
            {#if volTotal}
              <div class="tool-result">
                <div>{t('tools.totalReps', { reps: volTotal.reps })}{#if volTotal.volume}{t('tools.totalVol', { vol: volTotal.volume })}{/if}</div>
              </div>
            {/if}
            <div class="tool-seg">
              {#each INTENSITY as [id, labelKey] (id)}
                <button type="button" class:on={restIntensity === id} onclick={() => (restIntensity = id)}>{t(labelKey)}</button>
              {/each}
            </div>
            <div class="tool-result">
              <div>{t('tools.restAdvice', { label: restAdvice.label, range: restAdvice.range })}</div>
              <div class="tool-sub">{t('tools.restSec', { sec: restAdvice.sec })}</div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .tools-context-note {
    margin: 8px 0 0;
    font-size: var(--text-sm);
    color: var(--t3);
    line-height: 1.45;
  }
  .tool-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tool-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .tool-card.open {
    border-color: color-mix(in srgb, var(--accent) 32%, transparent);
    border-left: 3px solid var(--accent);
  }
  .tool-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 16px 18px;
    background: none;
    border: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .tool-title {
    font-weight: 600;
    color: var(--t1);
  }
  .tool-hint {
    font-family: var(--mono);
    font-size: var(--text-xs);
    color: var(--t3);
    letter-spacing: 0.04em;
    max-width: 52%;
    text-align: right;
    line-height: 1.35;
  }
  .tool-body {
    padding: 0 18px 18px;
    border-top: 1px solid var(--border);
  }
  .tool-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding-top: 14px;
  }
  .tool-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--text-sm);
    color: var(--t2);
  }
  .tool-field input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--t1);
    font: inherit;
  }
  .tool-result {
    margin-top: 14px;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
    border-radius: 8px;
    font-size: var(--text-sm);
    color: var(--t2);
  }
  .tool-result b {
    color: var(--t1);
    font-family: var(--disp);
    font-size: var(--text-3xl);
  }
  .tool-sub {
    margin-top: 4px;
    font-size: var(--text-xs);
    color: var(--t3);
  }
  .tool-seg {
    display: flex;
    gap: 6px;
    margin-top: 14px;
    flex-wrap: wrap;
  }
  .tool-seg button {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .tool-seg button.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  }
</style>
