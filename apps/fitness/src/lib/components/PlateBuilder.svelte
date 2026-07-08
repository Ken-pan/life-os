<script>
  /**
   * 杠铃片凑重
   * · 目标模式：输入总重 → 贪心拆片
   * · 点片模式：点击铃片加减 → 实时汇总总重
   */
  import {
    PLATES_LBS,
    PLATES_KG,
    plateLoading,
    plateLoadingNearest,
    plateSideSummary,
    plateSideExpanded,
    plateCollapsedLine,
    plateSettingsSummary,
    allPlatesFor
  } from '$lib/tools/calculators.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import Dumbbell from '$lib/dumbbell-kit/Dumbbell.svelte';
  import { plateSpecsFor, plateSwatch } from '$lib/dumbbell-kit/weightMap.js';
  import {
    plateInventoryFor,
    isPlateEnabled,
    setPlateEnabled,
    plateCollarFor,
    setPlateCollar
  } from '$lib/state.svelte.js';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n/index.js';

  let {
    unit = 'lbs',
    sides = 2,
    bar = $bindable(45),
    barOptions = [45, 35, 25, 15, 0],
    value = $bindable(0),
    showBarPicker = true,
    allowCustomBar = true,
    plateDenoms = null,
    showInventory = false,
    showModeToggle = false,
    showCollar = false,
    compact = false,
    progressiveDisclosure = false,
    settingsExpanded = $bindable(false),
    hideFormula = false,
    focusGlance = false,
    builderMode = $bindable('target')
  } = $props();

  let inventoryOpen = $state(false);
  let customBarMode = $state(false);
  let customBarVal = $state('');

  /** Touch / narrow viewport — matches @media (pointer: coarse), (max-width: 420px) in styles */
  let mobileLike = $state(false);

  $effect(() => {
    if (!browser) return;
    const mq = window.matchMedia('(pointer: coarse), (max-width: 420px)');
    const sync = () => {
      mobileLike = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  $effect(() => {
    unit;
    customBarMode = false;
  });

  /** Focus-glance preview: barbell tap-to-remove only on desktop-like pointers */
  const barbellTapEnabled = $derived(!focusGlance || !mobileLike);
  const barbellAriaLabel = $derived(
    focusGlance && mobileLike ? t('plates.barbellAriaPreview') : t('plates.barbellAria')
  );

  const allDenoms = $derived(allPlatesFor(unit));
  const denoms = $derived(plateDenoms ?? plateInventoryFor(unit));
  const collar = $derived(plateCollarFor(unit));
  /** 卡箍仅计入双侧杠铃；单端装片（地雷管等）不使用卡箍 */
  const effectiveCollar = $derived(sides === 2 ? collar : 0);
  const unitLabel = $derived(unit.toUpperCase());
  const sideLabel = $derived(sides === 2 ? t('plates.perSide') : t('plates.singleSide'));

  const PLATE_META = {
    lbs: {
      45: { c: '#d04838', h: 62, w: 21 },
      35: { c: '#3888e0', h: 54, w: 19 },
      25: { c: '#34a864', h: 47, w: 17 },
      10: { c: '#d8a020', h: 38, w: 15 },
      5: { c: '#6888b8', h: 31, w: 13 },
      2.5: { c: '#607080', h: 25, w: 11 }
    },
    kg: {
      25: { c: '#d04838', h: 62, w: 21 },
      20: { c: '#3888e0', h: 57, w: 20 },
      15: { c: '#d8a020', h: 50, w: 17 },
      10: { c: '#34a864', h: 42, w: 15 },
      5: { c: '#6888b8', h: 33, w: 13 },
      2.5: { c: '#b89888', h: 27, w: 11 },
      1.25: { c: '#607080', h: 23, w: 10 }
    }
  };
  const meta = $derived(PLATE_META[unit] ?? PLATE_META.lbs);

  const effectiveBar = $derived((Number(bar) || 0) + effectiveCollar);

  const loaded = $derived.by(() => {
    const v = Number(value) || 0;
    const b = Number(bar) || 0;
    if (v > 0 && v < effectiveBar) {
      return { plates: [], rem: 0, exact: false, belowBar: true };
    }
    const r = plateLoading(v, b, { sides, plates: denoms, collar: effectiveCollar });
    let rem = 0;
    if (v > effectiveBar) {
      rem = Math.round(((v - effectiveBar) / sides - r.plates.reduce((a, p) => a + p, 0)) * 1000) / 1000;
      if (rem < 0) rem = 0;
    }
    return {
      plates: r.plates,
      rem,
      exact: rem < 0.01,
      belowBar: v > 0 && v < effectiveBar
    };
  });

  const barbellRemoveDisabled = $derived(!loaded.plates.length || (focusGlance && mobileLike));

  const summary = $derived(plateSideSummary(loaded.plates));
  const expandedSummary = $derived(plateSideExpanded(loaded.plates));
  const settingsSummary = $derived(
    plateSettingsSummary({
      bar: Number(bar) || 0,
      unit,
      collar: effectiveCollar,
      denoms,
      sides
    })
  );
  const collapsed = $derived(
    loaded.plates.length
      ? plateCollapsedLine(totalOf(loaded.plates), loaded.plates, sides, unit)
      : null
  );

  /** 片数多时缩小铃片，避免杠铃视图横向滚动 */
  const vizScale = $derived.by(() => {
    const n = loaded.plates.length;
    if (n <= 0) return 1;
    if (sides !== 2) {
      if (n <= 4) return 1;
      return Math.max(0.55, 1 - (n - 4) * 0.09);
    }
    if (n <= 3) return 1;
    if (n <= 4) return 0.92;
    if (n <= 5) return 0.8;
    return Math.max(0.5, 0.8 - (n - 5) * 0.065);
  });

  const showAdvanced = $derived(!progressiveDisclosure || settingsExpanded);

  function plateStyle(p) {
    const m = meta[p] ?? { c: '#727984', h: 32, w: 13 };
    return [
      `--pc:color-mix(in oklab, ${m.c} 99%, white 1%)`,
      `--plate-hi:color-mix(in oklab, ${m.c} 88%, white 12%)`,
      `--plate-low:color-mix(in oklab, ${m.c} 96%, black 4%)`,
      `--plate-deep:color-mix(in oklab, ${m.c} 90%, black 10%)`,
      `--plate-edge:color-mix(in oklab, ${m.c} 84%, black 16%)`,
      `--pb-h:${m.h}px`,
      `--pb-w:${m.w}px`
    ].join(';');
  }

  /** Inner plates (index 0) stack above outer plates for consistent overlap. */
  function plateButtonStyle(p, stackIndex) {
    return `${plateStyle(p)};z-index:${loaded.plates.length - stackIndex}`;
  }

  /** 杠铃 sprite 渲染的片规格（面额按 sprite 直径对位；5/2.5 LB 为铸铁黑染色） */
  const barSpecs = $derived(sides === 2 ? plateSpecsFor(loaded.plates, unit) : []);
  /** 图例/可用片圆点颜色：双侧视图跟随 sprite 片色，单端视图沿用 CSS 片色 */
  function dotColor(p) {
    if (sides === 2) return plateSwatch(p, unit);
    return meta[p]?.c ?? '#727984';
  }

  const nearest = $derived.by(() => {
    const v = Number(value) || 0;
    if (!v || v <= effectiveBar || loaded.exact) return null;
    return plateLoadingNearest(v, Number(bar) || 0, {
      sides,
      plates: denoms,
      collar: effectiveCollar
    });
  });

  function totalOf(plates, b = Number(bar) || 0) {
    const base = b + effectiveCollar;
    return Math.round((base + plates.reduce((a, p) => a + p, 0) * sides) * 100) / 100;
  }
  function add(p) {
    builderMode = 'build';
    value = totalOf([...loaded.plates, p]);
  }
  function removeAt(i) {
    builderMode = 'build';
    const plates = [...loaded.plates];
    plates.splice(i, 1);
    value = totalOf(plates);
  }
  function removeLast() {
    if (loaded.plates.length) removeAt(loaded.plates.length - 1);
  }
  function pickBar(b) {
    customBarMode = false;
    const keep = loaded.exact ? loaded.plates : null;
    bar = b;
    if (keep) value = totalOf(keep, b);
  }
  function applyCustomBar() {
    const n = parseFloat(customBarVal);
    if (Number.isFinite(n) && n >= 0) {
      bar = n;
      customBarMode = false;
      if (loaded.exact) value = totalOf(loaded.plates, n);
    }
  }
  function snap(w) {
    value = w;
    builderMode = 'target';
  }
  function toggleInventoryPlate(p) {
    setPlateEnabled(unit, p, !isPlateEnabled(unit, p));
  }
  function bumpCollar(d) {
    const cur = plateCollarFor(unit);
    setPlateCollar(unit, Math.max(0, Math.round((cur + d) * 100) / 100));
  }
</script>

<div class="pb" class:pb--focus-glance={focusGlance}>
  {#if showModeToggle && showAdvanced}
    <div class="pb-modes" role="tablist" aria-label={t('plates.modeAria')}>
      <button
        type="button"
        role="tab"
        aria-selected={builderMode === 'target'}
        class:on={builderMode === 'target'}
        onclick={() => (builderMode = 'target')}
      >{t('plates.modeTarget')}</button>
      <button
        type="button"
        role="tab"
        aria-selected={builderMode === 'build'}
        class:on={builderMode === 'build'}
        onclick={() => (builderMode = 'build')}
      >{t('plates.modeBuild')}</button>
    </div>
  {/if}

  <div class="pb-caption">
    {#if loaded.plates.length}
      {#if compact && collapsed}
        <div class="pb-compact">{collapsed}</div>
      {:else if !focusGlance}
        {@const perSide = Math.round(loaded.plates.reduce((a, b) => a + b, 0) * 100) / 100}
        <div class="pb-hero">
          <div class="pb-hero-title">{sideLabel}{t('plates.loadingSide')}</div>
          <div class="pb-hero-result">{summary} {unitLabel}</div>
          {#if !hideFormula}
            <div class="pb-hero-formula">
              {t('plates.barFormula', { total: totalOf(loaded.plates), bar: Number(bar), unit: unitLabel })}
              {#if effectiveCollar > 0} {t('plates.barCollar', { collar: effectiveCollar })}{/if}
              + {sideLabel} {perSide} {unitLabel} × {sides}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
    {#if builderMode === 'target' && !loaded.exact && !loaded.belowBar && Number(value) > 0}
      <div class="pb-warn">
        {t('plates.shortfall', { rem: loaded.rem, unit: unitLabel })}
        {#if nearest?.under != null}
          <button type="button" class="pb-snap" onclick={() => snap(nearest.under)}>{t('plates.lighter', { n: nearest.under })}</button>
        {/if}
        {#if nearest?.over != null && nearest.over !== nearest.under}
          <button type="button" class="pb-snap" onclick={() => snap(nearest.over)}>{t('plates.heavier', { n: nearest.over })}</button>
        {/if}
      </div>
    {/if}
  </div>

  <div
    class="pb-viz-container"
    class:pb-viz-container--glance={focusGlance && loaded.plates.length && !(compact && collapsed)}
  >
    {#if focusGlance && loaded.plates.length && !(compact && collapsed)}
      <div class="pb-hero pb-hero--glance">
        <div class="pb-hero-title">{sideLabel}{t('plates.loadingSide')}</div>
        <div class="pb-hero-result">{expandedSummary}</div>
      </div>
    {/if}
    {#if !focusGlance}
      <div class="pb-sec-title">{sides === 2 ? t('plates.barbellView') : t('plates.singleView')}</div>
    {/if}
    {#if sides === 2}
      <div class="pb-barbell-stage" class:pb-barbell-stage--glance={focusGlance}>
        <div class="pb-barbell" aria-label={barbellAriaLabel}>
          <button
            type="button"
            class="pb-render-hit"
            class:pb-render-hit--preview={!barbellTapEnabled}
            onclick={removeLast}
            disabled={barbellRemoveDisabled}
            aria-hidden={!barbellTapEnabled}
            aria-label={barbellTapEnabled ? t('plates.removeLast') : undefined}
            title={barbellTapEnabled ? t('plates.removeLast') : undefined}
          >
            <Dumbbell plates={barSpecs} scale={focusGlance ? 2.7 : 2} class="pb-render-canvas" />
          </button>

          {#if !loaded.plates.length}
            <span class="pb-empty pb-empty--barbell">
              {loaded.belowBar ? t('plates.belowBar') : t('plates.tapToAdd')}
            </span>
          {/if}
        </div>

        {#if !focusGlance}
          <aside class="pb-barbell-legend" aria-label={t('plates.legendAria')}>
            <div class="pb-legend-line">
              <span class="pb-legend-key">{t('plates.barShaft')}</span>
              <span class="pb-legend-val">{Number(bar) || '—'} {unitLabel}</span>
            </div>
            {#if loaded.plates.length}
              <div class="pb-legend-line">
                <span class="pb-legend-key">{sideLabel}</span>
                <span class="pb-legend-val">{summary} {unitLabel}</span>
              </div>
              <div class="pb-legend-swatches" aria-hidden="true">
                {#each [...new Set(loaded.plates)].sort((a, b) => b - a) as p (p)}
                  <span class="pb-legend-swatch" style="--pc:{dotColor(p)}" title="{p} {unitLabel}"></span>
                {/each}
              </div>
            {:else}
              <p class="pb-legend-hint">{t('plates.tapPlatesHint')}</p>
            {/if}
          </aside>
        {/if}
      </div>
    {:else}
      <div class="pb-viz-stage" class:pb-viz-stage--glance={focusGlance}>
        <div
          class="pb-viz"
          class:pb-viz--dense={vizScale < 1}
          style="--pb-scale:{vizScale}"
          aria-label={t('plates.loadedAria')}
        >
          <div class="pb-sleeve" aria-hidden="true"></div>
          <div class="pb-collar" aria-hidden="true"></div>
          {#if loaded.plates.length}
            {#each loaded.plates as p, i (`${p}-${i}`)}
              <button
                type="button"
                class="pb-plate"
                style={plateButtonStyle(p, i)}
                onclick={() => removeAt(i)}
                aria-label={t('plates.removePlate', { p }) + ' ' + unitLabel}
                title={t('plates.removePlate', { p })}
              ></button>
            {/each}
          {:else}
            <span class="pb-empty">{loaded.belowBar ? t('plates.belowBar') : t('plates.tapToAdd')}</span>
          {/if}
        </div>
        {#if !focusGlance && loaded.plates.length}
          <aside class="pb-barbell-legend pb-barbell-legend--single" aria-label={t('plates.legendAria')}>
            <div class="pb-legend-line">
              <span class="pb-legend-key">{sideLabel}</span>
              <span class="pb-legend-val">{summary} {unitLabel}</span>
            </div>
            <div class="pb-legend-swatches" aria-hidden="true">
              {#each [...new Set(loaded.plates)].sort((a, b) => b - a) as p (p)}
                <span class="pb-legend-swatch" style="--pc:{dotColor(p)}" title="{p} {unitLabel}"></span>
              {/each}
            </div>
          </aside>
        {/if}
      </div>
    {/if}
  </div>

  {#if showAdvanced}
  <div class="pb-settings">
    {#if progressiveDisclosure}
      <button
        type="button"
        class="wc-settings-collapse"
        aria-expanded={settingsExpanded}
        onclick={() => (settingsExpanded = false)}
      >
        <Icon name="settings" size={16} />
        <span>{t('plates.collapseSettings')}</span>
        <Icon name="chevron-up" size={16} />
      </button>
    {/if}
    {#if showBarPicker && barOptions.length > 1}
      <div class="pb-bars" role="group" aria-label={t('plates.barPickerAria')}>
        <span class="pb-cap">{t('plates.barbell')}</span>
        {#each barOptions as b (b)}
          <button
            type="button"
            class="pb-bar-chip"
            class:on={!customBarMode && Number(bar) === b}
            onclick={() => pickBar(b)}
          >{b === 0 ? t('plates.platesOnly') : b}</button>
        {/each}
        {#if allowCustomBar}
          <button
            type="button"
            class="pb-bar-chip"
            class:on={customBarMode || (!barOptions.includes(Number(bar)) && Number(bar) > 0)}
            onclick={() => {
              customBarMode = true;
              customBarVal = String(bar);
            }}
          >{t('plates.custom')}</button>
        {/if}
      </div>
      {#if customBarMode}
        <div class="pb-custom-bar">
          <input
            type="number"
            min="0"
            step="0.5"
            bind:value={customBarVal}
            aria-label={t('plates.customBarAria')}
          />
          <button type="button" class="pb-custom-apply" onclick={applyCustomBar}>{t('plates.apply')}</button>
        </div>
      {/if}
    {/if}

    {#if showCollar}
      <div class="pb-collar-row">
        <span class="pb-cap">{t('plates.collar')}</span>
        <div class="pb-collar-ctrl">
          <button type="button" class="pb-step" onclick={() => bumpCollar(-(unit === 'kg' ? 1.25 : 2.5))} aria-label={t('plates.decCollar')}>−</button>
          <span class="pb-collar-val">{collar} {unitLabel}</span>
          <button type="button" class="pb-step" onclick={() => bumpCollar(unit === 'kg' ? 1.25 : 2.5)} aria-label={t('plates.incCollar')}>+</button>
        </div>
      </div>
    {/if}

    <div class="pb-rack-wrap">
      <span class="pb-cap">{t('plates.available')}</span>
      <div class="pb-rack" role="group" aria-label={t('plates.addPlateAria', { perSide: sides === 2 ? t('calc.perSideSuffix') : '' })}>
        {#each denoms as p (p)}
          <button type="button" class="pb-add" onclick={() => add(p)} aria-label={t('plates.addOne', { p, unit: unitLabel })}>
            <span class="pb-dot" style="background:{dotColor(p)}" aria-hidden="true"></span><span>{p}</span>
          </button>
        {/each}
        <button
          type="button"
          class="pb-add pb-undo"
          onclick={removeLast}
          disabled={!loaded.plates.length}
          aria-label={t('plates.removeLast')}
        >⌫</button>
        {#if showInventory}
          <button
            type="button"
            class="pb-add pb-inv-toggle"
            class:on={inventoryOpen}
            onclick={() => (inventoryOpen = !inventoryOpen)}
            aria-label={t('plates.inventorySettings')}
            title={t('plates.inventoryTitle')}
          >{t('plates.inventoryTitle')}</button>
        {/if}
      </div>
    </div>

    {#if showInventory && inventoryOpen}
      <div class="pb-inventory" role="group" aria-label={t('plates.inventoryAria')}>
        {#each allDenoms as p (p)}
          <button
            type="button"
            class="pb-inv-chip"
            class:off={!isPlateEnabled(unit, p)}
            onclick={() => toggleInventoryPlate(p)}
          >
            <span class="pb-dot" style="background:{dotColor(p)}" aria-hidden="true"></span><span>{p}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
  {/if}

  {#if progressiveDisclosure && !settingsExpanded}
    <button
      type="button"
      class="wc-settings-row"
      aria-expanded={settingsExpanded}
      onclick={() => (settingsExpanded = true)}
    >
      <Icon name="settings" size={16} />
      <span class="wc-settings-label">{t('plates.equipSettings')}</span>
      <span class="wc-settings-summary">{settingsSummary}</span>
      <Icon name="chevron-down" size={16} />
    </button>
  {/if}
</div>

<style>
  .pb {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pb--focus-glance {
    gap: 4px;
  }
  .pb-viz-container--glance {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background:
      radial-gradient(
        ellipse 62% 90% at 50% 26%,
        color-mix(in srgb, var(--t1) 6%, transparent),
        transparent 72%
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, #8fa3c0 8%, var(--bg-2)) 0%,
        color-mix(in srgb, #8fa3c0 3%, var(--bg-2)) 100%
      );
  }
  .pb-hero--glance {
    margin: 0;
    padding: 8px 10px 0;
    gap: 1px;
    text-align: center;
  }
  .pb--focus-glance .pb-hero--glance .pb-hero-title {
    font-size: 10px;
    font-weight: 500;
    color: var(--t3);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .pb--focus-glance .pb-hero--glance .pb-hero-result {
    font-family: var(--mono);
    font-size: clamp(15px, 4.4vw, 17px);
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--t1);
  }
  .pb--focus-glance .pb-viz-container--glance .pb-barbell {
    min-height: 100px;
    padding: 7px 10px 11px;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .pb--focus-glance .pb-viz-container--glance .pb-viz-stage--glance .pb-viz {
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    padding: 6px 10px 10px;
  }
  @media (max-height: 700px) {
    .pb--focus-glance {
      gap: 2px;
    }
    .pb-hero--glance {
      padding: 6px 10px 0;
    }
    .pb--focus-glance .pb-hero--glance .pb-hero-result {
      font-size: clamp(14px, 4vw, 16px);
    }
    .pb--focus-glance .pb-viz-container--glance .pb-barbell :global(.pb-render-canvas) {
      max-height: 68px;
    }
    .pb--focus-glance .pb-viz-container--glance .pb-barbell {
      min-height: 90px;
      padding: 5px 10px 9px;
    }
  }
  .pb--focus-glance .pb-viz-container:not(.pb-viz-container--glance) {
    padding-top: 0;
  }
  .pb-modes {
    display: flex;
    gap: 6px;
  }
  .pb-modes button {
    flex: 1;
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--t2);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .pb-modes button.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  }
  .pb-cap {
    font-size: var(--text-xs);
    color: var(--t3);
    letter-spacing: 0.04em;
    min-width: 42px;
    margin-top: 6px;
  }
  .pb-bars {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pb-bar-chip {
    min-width: 44px;
    min-height: 44px;
    padding: 5px 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all var(--dur-fast) var(--ease-standard);
  }
  .pb-bar-chip.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  }
  .pb-custom-bar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 4px;
  }
  .pb-custom-bar input {
    flex: 1;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--t1);
    font: inherit;
  }
  .pb-custom-apply {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
    color: var(--t1);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .pb-collar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pb-collar-ctrl {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pb-step {
    width: 44px;
    height: 44px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--t1);
    font-size: var(--text-3xl);
    cursor: pointer;
  }
  .pb-collar-val {
    min-width: 72px;
    text-align: center;
    font-family: var(--mono);
    font-size: var(--text-sm);
    color: var(--t1);
  }

  .pb-viz-container {
    position: relative;
  }
  .pb-viz-container::before,
  .pb-viz-container::after {
    content: none;
  }

  .pb-barbell-stage,
  .pb-viz-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: stretch;
  }
  .pb-barbell-stage--glance,
  .pb-viz-stage--glance {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .pb-barbell-legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 88px;
    align-self: stretch;
    justify-content: center;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    box-shadow: none;
  }
  .pb-barbell-legend--single {
    min-width: 72px;
  }
  .pb-legend-line {
    display: grid;
    grid-template-columns: 2.4em 1fr;
    gap: 6px;
    align-items: baseline;
    font-size: var(--text-xs);
    line-height: 1.35;
  }
  .pb-legend-key {
    color: var(--t3);
    letter-spacing: 0.04em;
  }
  .pb-legend-val {
    font-family: var(--mono);
    font-weight: 600;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .pb-legend-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding-top: 2px;
  }
  .pb-legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--pc, var(--t3));
    border: 1px solid rgb(255 255 255 / 0.08);
    box-shadow: none;
  }
  .pb-legend-hint {
    margin: 0;
    font-size: 11px;
    color: var(--t3);
    line-height: 1.35;
  }
  @media (max-width: 420px) {
    .pb-barbell-stage:not(.pb-barbell-stage--glance),
    .pb-viz-stage:not(.pb-viz-stage--glance) {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .pb-barbell-legend,
    .pb-barbell-legend--single {
      min-width: 0;
      width: 100%;
      align-self: auto;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 14px;
      padding: 10px 12px;
    }
    .pb-legend-line {
      display: flex;
      gap: 6px;
      align-items: baseline;
    }
    .pb-legend-swatches {
      padding-top: 0;
      margin-left: auto;
    }
  }

  .pb-barbell,
  .pb-viz {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    --pb-scale: 1;
    --pb-bore: 10px;
    --pb-grain: url("data:image/svg+xml,%3Csvg viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='r'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.05' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23r)' opacity='0.38'/%3E%3C/svg%3E");
    --pb-plate-r: max(2px, calc(3.5px * var(--pb-scale, 1)));
    --pb-plate-r-in: max(1px, calc(2px * var(--pb-scale, 1)));
    min-height: 84px;
    padding: 10px 12px;
    border-radius: 10px;
    overflow-x: hidden;
    overflow-y: visible;
    isolation: isolate;
    border: 1px solid var(--border);
    /* 展示台底色：--bg-2 掺 8% 冷蓝灰 + 顶部中央淡光晕，衬出铸铁黑片轮廓；
       基于主题变量混色，浅色模式自动变为冷白 */
    background:
      radial-gradient(
        ellipse 62% 90% at 50% 26%,
        color-mix(in srgb, var(--t1) 6%, transparent),
        transparent 72%
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, #8fa3c0 8%, var(--bg-2)) 0%,
        color-mix(in srgb, #8fa3c0 3%, var(--bg-2)) 100%
      );
    box-shadow: none;
  }
  .pb-barbell::before,
  .pb-viz::before,
  .pb-barbell::after,
  .pb-viz::after {
    content: none;
  }
  .pb-viz {
    padding: 10px 12px;
  }
  .pb-render-hit {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .pb-render-hit:disabled {
    cursor: default;
  }
  .pb-render-hit--preview,
  .pb-render-hit--preview:disabled {
    pointer-events: none;
    cursor: default;
  }
  .pb-barbell :global(.pb-render-canvas) {
    display: block;
    width: auto;
    height: auto;
    max-height: 64px;
    max-width: 100%;
  }
  .pb--focus-glance .pb-viz-container--glance .pb-barbell :global(.pb-render-canvas) {
    max-height: 78px;
  }
  @media (pointer: coarse), (max-width: 420px) {
    .pb--focus-glance .pb-render-hit {
      pointer-events: none;
      cursor: default;
    }
  }

  .pb-viz--dense {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--t3) 45%, transparent) transparent;
  }
  .pb-viz--dense::-webkit-scrollbar {
    height: 4px;
  }
  .pb-viz--dense::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--t3) 45%, transparent);
    border-radius: 4px;
  }
  .pb-sleeve {
    position: absolute;
    left: -6px;
    right: -6px;
    top: 50%;
    height: var(--pb-bore);
    transform: translateY(-50%);
    border-radius: 999px;
    background:
      linear-gradient(
        180deg,
        rgb(255 255 255 / 0.048) 0%,
        #828890 12%,
        #626870 38%,
        #4a4f56 62%,
        #34383e 100%
      ),
      repeating-linear-gradient(
        64deg,
        rgb(255 255 255 / 0.058) 0 1px,
        transparent 1px 3px
      ),
      repeating-linear-gradient(
        -64deg,
        rgb(0 0 0 / 0.16) 0 1px,
        transparent 1px 3px
      ),
      repeating-linear-gradient(
        90deg,
        rgb(255 255 255 / 0.045) 0 1px,
        transparent 1px 5px
      );
    background-blend-mode: normal, overlay, soft-light, overlay;
    border: 1px solid rgb(255 255 255 / 0.04);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.06),
      inset 0 -1px 0 rgb(0 0 0 / 0.26),
      0 4px 10px rgb(0 0 0 / 0.24);
    pointer-events: none;
  }
  .pb-collar {
    flex-shrink: 0;
    width: 10px;
    height: calc(28px * var(--pb-scale, 1));
    border-radius: 2px;
    z-index: 4;
  }
  .pb-viz .pb-collar {
    background:
      linear-gradient(
        90deg,
        #8e939a 0%,
        #6a6f76 28%,
        #4a4e54 58%,
        #2e3136 100%
      ),
      repeating-linear-gradient(
        58deg,
        rgb(255 255 255 / 0.052) 0 1px,
        transparent 1px 3px
      ),
      repeating-linear-gradient(
        -58deg,
        rgb(0 0 0 / 0.15) 0 1px,
        transparent 1px 3px
      ),
      repeating-linear-gradient(
        0deg,
        rgb(255 255 255 / 0.04) 0 1px,
        transparent 1px 3px
      );
    background-blend-mode: normal, overlay, soft-light, overlay;
    border: 1px solid rgb(255 255 255 / 0.04);
    box-shadow:
      inset 1px 0 0 rgb(255 255 255 / 0.05),
      inset -2px 0 4px rgb(0 0 0 / 0.24),
      inset 0 -2px 0 rgb(0 0 0 / 0.2),
      0 4px 10px rgb(0 0 0 / 0.22);
    position: relative;
    z-index: 4;
  }
  .pb-plate {
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    height: calc(var(--pb-h, 32px) * var(--pb-scale, 1));
    width: calc(var(--pb-w, 13px) * var(--pb-scale, 1));
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: var(--pb-plate-r, 3.5px);
    background:
      var(--pb-grain),
      radial-gradient(
        ellipse at 34% 8%,
        rgb(255 255 255 / 0.022) 0%,
        transparent 18%
      ),
      linear-gradient(
        180deg,
        var(--plate-hi, var(--pc)) 0%,
        var(--pc) 20%,
        var(--pc) 58%,
        var(--plate-low, var(--pc)) 82%,
        var(--plate-deep, var(--plate-low, var(--pc))) 100%
      );
    background-size: 96px 96px, 100% 100%, 100% 100%;
    background-blend-mode: overlay, normal, normal;
    box-shadow:
      inset 1px 0 0 rgb(255 255 255 / 0.02),
      inset -3px 0 5px rgb(0 0 0 / 0.08),
      inset 0 -1px 0 rgb(0 0 0 / 0.18),
      inset 0 -6px 10px rgb(0 0 0 / 0.1),
      0 4px 8px -5px rgb(0 0 0 / 0.48);
    filter: none;
    cursor: pointer;
    transition:
      transform var(--dur-fast) var(--ease-standard),
      filter var(--dur-fast) var(--ease-standard);
  }
  .pb-viz .pb-plate {
    z-index: 3;
    margin-inline: 0;
  }
  .pb-viz .pb-plate + .pb-plate {
    margin-left: 1px;
  }
  .pb-viz .pb-plate::before {
    content: '';
    position: absolute;
    inset: 9px 7px 6px 7px;
    border-radius: var(--pb-plate-r-in, 2px);
    background:
      radial-gradient(
        ellipse 86% 72% at 38% 28%,
        rgb(255 255 255 / 0.022) 0%,
        transparent 58%
      ),
      radial-gradient(
        ellipse 94% 84% at 50% 54%,
        rgb(0 0 0 / 0.04) 0%,
        transparent 68%
      );
    box-shadow: none;
    filter: blur(0.35px);
    opacity: 0.3;
    pointer-events: none;
    -webkit-mask-image: radial-gradient(
      ellipse 90% 82% at 50% 46%,
      black 32%,
      transparent 100%
    );
    mask-image: radial-gradient(
      ellipse 90% 82% at 50% 46%,
      black 32%,
      transparent 100%
    );
  }
  .pb-viz .pb-plate + .pb-plate::before {
    background:
      radial-gradient(
        ellipse 34% 88% at 0% 50%,
        rgb(0 0 0 / 0.025) 0%,
        transparent 72%
      ),
      radial-gradient(
        ellipse 86% 72% at 38% 28%,
        rgb(255 255 255 / 0.018) 0%,
        transparent 58%
      ),
      radial-gradient(
        ellipse 94% 84% at 50% 54%,
        rgb(0 0 0 / 0.03) 0%,
        transparent 68%
      );
  }
  .pb-viz .pb-plate::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background-image:
      linear-gradient(to top, rgb(0 0 0 / 0.12) 0%, rgb(0 0 0 / 0.04) 5%, transparent 16%),
      radial-gradient(ellipse 52% 38% at 100% 100%, rgb(0 0 0 / 0.1), transparent 72%),
      radial-gradient(ellipse 52% 38% at 0% 100%, rgb(0 0 0 / 0.1), transparent 72%),
      var(--pb-grain);
    background-size: 100% 100%, 100% 100%, 100% 100%, 96px 96px;
    mix-blend-mode: normal, normal, normal, overlay;
    opacity: 0.58;
  }
  .pb-viz .pb-plate:hover {
    filter: none;
    box-shadow:
      inset 1px 0 0 rgb(255 255 255 / 0.025),
      inset -2px 0 5px rgb(0 0 0 / 0.1),
      inset 0 -1px 0 rgb(0 0 0 / 0.22),
      inset 0 -8px 12px rgb(0 0 0 / 0.12),
      0 6px 12px -4px rgb(0 0 0 / 0.48);
    transform: translateY(-1px);
  }
  .pb-viz .pb-plate:active {
    filter: none;
    transform: translateY(0) scale(0.99);
  }
  .pb-empty {
    position: relative;
    z-index: 1;
    margin-left: 8px;
    padding: 2px 8px;
    font-size: var(--text-xs);
    color: var(--t3);
    background: var(--bg);
    border-radius: 6px;
  }
  .pb-empty--barbell {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -10%);
    margin: 0;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(4px);
    white-space: nowrap;
  }

  .pb-caption {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 16px;
  }
  .pb-compact {
    font-family: var(--mono);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--t1);
    padding: 6px 0;
  }
  .pb-hero {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }
  .pb-hero-title {
    font-size: var(--text-sm);
    color: var(--t2);
  }
  .pb-hero-result {
    font-size: 24px;
    font-family: var(--disp);
    font-weight: 700;
    color: var(--t1);
    line-height: 1.1;
  }
  .pb-hero-formula {
    font-family: var(--mono);
    font-size: var(--text-xs);
    color: var(--t3);
  }
  .pb-sec-title {
    font-size: var(--text-xs);
    color: var(--t2);
    margin-bottom: 6px;
    font-weight: 500;
  }
  .pb-settings {
    display: flex;
    flex-direction: column;
    gap: var(--wc-section-gap);
    margin-top: 4px;
    padding-top: var(--wc-section-gap);
    border-top: 1px solid var(--border);
  }
  .pb-rack-wrap {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .pb-warn {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--warn, #c9a227);
    font-size: var(--text-xs);
  }
  .pb-snap {
    padding: 4px 10px;
    min-height: 32px;
    border: 1px solid color-mix(in srgb, var(--warn, #c9a227) 45%, transparent);
    border-radius: 999px;
    background: none;
    color: var(--warn, #c9a227);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .pb-snap:hover {
    background: color-mix(in srgb, var(--warn, #c9a227) 12%, transparent);
  }

  .pb-rack {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
  }
  .pb-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 44px;
    min-height: 44px;
    padding: 5px 11px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--dur-fast) var(--ease-standard);
  }
  .pb-add:hover {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    background: color-mix(in srgb, var(--accent) 6%, var(--bg));
  }
  .pb-add:active {
    transform: scale(0.94);
  }
  .pb-add:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pb-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .pb-undo {
    color: var(--t2);
  }
  .pb-inv-toggle.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .pb-inventory {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 0 0;
  }
  .pb-inv-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 40px;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .pb-inv-chip.off {
    opacity: 0.4;
    text-decoration: line-through;
  }
</style>
