<script>
  /**
   * 独立凑重工具面板：单位切换、快捷步进、常用 preset、双模式、片库/卡箍。
   * variant="focus" 时默认精简视图，渐进展开装片选项。
   */
  import Icon from '$lib/components/Icon.svelte';
  import PlateBuilder from '$lib/components/PlateBuilder.svelte';
  import {
    platePresetsAround,
    PLATE_PRESETS,
    QUICK_STEPS,
    plateCollapsedLine,
    plateLoading,
    plateConfigFor,
    equipVariantsFor,
    equipHint,
    DEFAULT_BAR_LBS,
    DEFAULT_BAR_KG
  } from '$lib/tools/calculators.js';
  import { plateInventoryFor, plateCollarFor, exEquipMode, setExEquipMode, exBarWeight } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';

  let {
    ex = null,
    unit = $bindable('lbs'),
    value = $bindable(225),
    bar = $bindable(DEFAULT_BAR_LBS),
    sides = 2,
    showUnitToggle = true,
    showPresets = true,
    showQuickSteps = true,
    compact = false,
    variant = 'full'
  } = $props();

  let builderMode = $state('target');
  let moreOpen = $state(false);

  const isFocus = $derived(variant === 'focus');
  const activeEquip = $derived(ex ? exEquipMode(ex) : null);
  const equipVariants = $derived(ex ? equipVariantsFor(ex) : null);
  const plateCfg = $derived(ex ? plateConfigFor(ex, unit, activeEquip) : null);
  const effectiveSides = $derived(plateCfg?.sides ?? sides);
  const step = $derived(unit === 'kg' ? 2.5 : 5);
  const unitLabel = $derived(unit.toUpperCase());
  const quickPresets = $derived(
    equipVariants || plateCfg ? platePresetsAround(Number(value) || 0, unit) : []
  );
  const presets = $derived(PLATE_PRESETS[unit] ?? PLATE_PRESETS.lbs);
  const quickSteps = $derived(QUICK_STEPS[unit] ?? QUICK_STEPS.lbs);
  const denoms = $derived(plateInventoryFor(unit));
  const barOptions = $derived(unit === 'kg' ? [20, 15, 10, 0] : [45, 35, 25, 15, 0]);
  const currentVal = $derived(Number(value) || 0);

  const collapsedHint = $derived.by(() => {
    const v = Number(value) || 0;
    if (!v) return null;
    const r = plateLoading(v, bar, {
      sides: effectiveSides,
      plates: denoms,
      collar: effectiveSides === 2 ? plateCollarFor(unit) : 0
    });
    if (!r.plates?.length) return null;
    return plateCollapsedLine(r.verify ?? v, r.plates, effectiveSides, unit);
  });

  function pickEquip(equip) {
    if (!ex?.id || !equip) return;
    setExEquipMode(ex.id, equip);
    const cfg = plateConfigFor(ex, unit, equip);
    if (cfg) bar = exBarWeight(ex, unit, equip) ?? cfg.defaultBar;
    moreOpen = false;
    builderMode = 'target';
  }

  $effect(() => {
    variant;
    moreOpen = false;
  });

  function bump(d) {
    value = Math.max(0, Math.round(((Number(value) || 0) + d) * 100) / 100);
    builderMode = 'target';
  }

  function setUnit(u) {
    if (u === unit) return;
    unit = u;
    bar = u === 'kg' ? DEFAULT_BAR_KG : DEFAULT_BAR_LBS;
    builderMode = 'target';
  }
</script>

<div class="ptp" class:ptp--focus={isFocus}>
  {#if isFocus}
    <div class="ptp-focus-scroll">
      <div class="wc-stepper ptp-focus-stepper">
        <button type="button" class="wc-step" aria-label={t('weightModal.decStep', { step, unit: unitLabel })} onclick={() => bump(-step)}>−{step}</button>
        <div class="wc-value">
          <input class="wc-value-input" type="number" min="0" step={step} bind:value aria-label="{t('tools.targetWeight')} {unitLabel}" />
          <span class="wc-value-unit">{unitLabel}</span>
        </div>
        <button type="button" class="wc-step" aria-label={t('weightModal.incStep', { step, unit: unitLabel })} onclick={() => bump(step)}>+{step}</button>
      </div>

      {#if quickPresets.length}
        <div class="wc-section">
          <div class="wc-label">{t('tools.quickPick')}</div>
          <div class="wc-chips" style="--wc-cols: {quickPresets.length}" role="group" aria-label={t('tools.quickPickAria')}>
            {#each quickPresets as p (p)}
              <button
                type="button"
                class="wc-chip wc-chip--num"
                class:on={Math.abs(currentVal - p) < 0.01}
                onclick={() => { value = p; builderMode = 'target'; }}
              >{p}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if equipVariants}
        <div class="wc-section">
          <div class="wc-label">{t('tools.loadMode')}</div>
          <div class="wc-chips" style="--wc-cols: {equipVariants.length}" role="group" aria-label={t('tools.loadModeAria')}>
            {#each equipVariants as mode (mode.equip)}
              <button
                type="button"
                class="wc-chip"
                class:on={activeEquip === mode.equip}
                aria-pressed={activeEquip === mode.equip}
                title={mode.hint}
                onclick={() => pickEquip(mode.equip)}
              >{mode.label}</button>
            {/each}
          </div>
          {#if activeEquip && !plateCfg}
            <p class="wc-hint">{equipHint(activeEquip)}</p>
          {/if}
        </div>
      {/if}

      {#if plateCfg}
      <PlateBuilder
        {unit}
        sides={effectiveSides}
        {compact}
        barOptions={plateCfg.barOptions}
        bind:bar
        bind:value
        bind:builderMode
        plateDenoms={denoms}
        progressiveDisclosure={isFocus}
        bind:settingsExpanded={moreOpen}
        showModeToggle={moreOpen}
        showInventory={moreOpen}
        showCollar={moreOpen}
        showBarPicker={moreOpen}
        allowCustomBar={moreOpen}
        hideFormula={!moreOpen}
        focusGlance
      />
      {/if}

      {#if moreOpen && showQuickSteps}
        <div class="wc-section">
          <div class="wc-label">{t('tools.quickBump')}</div>
          <div class="wc-chips" style="--wc-cols: 4" role="group" aria-label={t('tools.quickBumpAria')}>
            {#each (unit === 'kg' ? [-5, -2.5, 2.5, 5] : [-10, -5, 5, 10]) as stepVal (stepVal)}
              <button type="button" class="wc-chip wc-chip--num" onclick={() => bump(stepVal)}>
                {stepVal > 0 ? `+${stepVal}` : stepVal}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    {#if showUnitToggle}
      <div class="ptp-unit" role="group" aria-label={t('tools.unitAria')}>
        <button type="button" class:on={unit === 'lbs'} onclick={() => setUnit('lbs')}>LB</button>
        <button type="button" class:on={unit === 'kg'} onclick={() => setUnit('kg')}>KG</button>
      </div>
    {/if}

    <label class="ptp-field">
      <span>{t('tools.targetWeight')}</span>
      <div class="ptp-input-row">
        <div class="ptp-input-wrap">
          <input type="number" min="0" step={unit === 'kg' ? 2.5 : 5} bind:value />
          <span class="ptp-suffix">{unit}</span>
        </div>
        <button type="button" class="ptp-clear" onclick={() => (value = 0)}>{t('tools.clear')}</button>
      </div>
    </label>

    {#if showQuickSteps}
      <div class="wc-section">
        <div class="wc-label">{t('tools.quickBump')}</div>
        <div class="wc-chips" style="--wc-cols: {quickSteps.length}" role="group" aria-label={t('tools.quickBumpAria')}>
          {#each quickSteps as stepVal (stepVal)}
            <button type="button" class="wc-chip wc-chip--num" onclick={() => bump(stepVal)}>
              {stepVal > 0 ? `+${stepVal}` : stepVal}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if showPresets}
      <div class="wc-section">
        <div class="wc-label">{t('tools.presets')}</div>
        <div class="wc-chips" style="--wc-cols: {presets.length}" role="group" aria-label={t('tools.presetsAria')}>
          {#each presets as p (p)}
            <button
              type="button"
              class="wc-chip wc-chip--num"
              class:on={Math.abs(currentVal - p) < 0.01}
              onclick={() => { value = p; builderMode = 'target'; }}
            >{p}</button>
          {/each}
        </div>
      </div>
    {/if}

    {#if compact && collapsedHint}
      <div class="ptp-collapsed">{collapsedHint}</div>
    {/if}

    <PlateBuilder
      {unit}
      {sides}
      {compact}
      {barOptions}
      bind:bar
      bind:value
      bind:builderMode
      plateDenoms={denoms}
      showModeToggle
      showInventory
      showCollar
      showBarPicker
      allowCustomBar
    />
  {/if}
</div>

<style>
  .ptp {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ptp--focus {
    flex: 1;
    min-height: 0;
    gap: 0;
  }
  .ptp-focus-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding-bottom: 8px;
  }
  .ptp-focus-stepper {
    position: sticky;
    top: 0;
    z-index: 2;
    padding-bottom: 4px;
    background: linear-gradient(
      to bottom,
      var(--card) 78%,
      color-mix(in srgb, var(--card) 0%, transparent)
    );
  }
  .ptp-focus-footer {
    flex-shrink: 0;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    background: var(--card);
  }
  .ptp-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: 48px;
    padding: 12px 14px;
    border: 1px solid var(--border-l);
    border-radius: 14px;
    background: var(--bg-2);
    color: var(--t1);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .ptp-more:hover {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border-l));
    color: var(--accent);
  }
  .ptp-unit {
    display: inline-flex;
    gap: 6px;
    align-self: flex-start;
  }
  .ptp-unit button {
    min-width: 48px;
    min-height: 44px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .ptp-unit button.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  }
  .ptp-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--text-sm);
    color: var(--t2);
  }
  .ptp-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ptp-input-wrap {
    position: relative;
    flex: 1;
  }
  .ptp-input-wrap input {
    width: 100%;
    min-height: 44px;
    padding: 10px 40px 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--t1);
    font: inherit;
  }
  .ptp-suffix {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--t3);
    font-size: var(--text-sm);
    pointer-events: none;
  }
  .ptp-clear {
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-2);
    color: var(--t2);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .ptp-clear {
    font-family: var(--mono);
    font-size: var(--text-xs);
    color: var(--t2);
    padding: 8px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
  }
</style>
