<script>
  import Icon from '@life-os/platform-web/svelte/icon';
  import PlateBuilder from '$lib/components/PlateBuilder.svelte';
  import { weightModal, closeWeightModal, toast } from '$lib/ui.svelte.js';
  import {
    S,
    exWeight,
    exUnit,
    setExWeight,
    exBarWeight,
    setExBarWeight,
    exEquipMode,
    setExEquipMode,
    hasSavedEquipMode,
    recommendEquipFor,
    displayWeight,
    plateInventoryFor,
    plateCollarFor
  } from '$lib/state.svelte.js';
  import {
    EQUIP_INFO,
    plateConfigFor,
    plateLoadingNearest,
    platePresetsAround,
    equipVariantsFor
  } from '$lib/tools/calculators.js';
  import { recommendNextWeight } from '$lib/progression.js';
  import { equipLabel, equipHint } from '$lib/tools/calculators.js';
  import { t } from '$lib/i18n/index.js';

  let val = $state(0);
  let bar = $state(45);
  let builderMode = $state('target');
  let plateSettingsOpen = $state(false);
  let equipMenuOpen = $state(false);
  let loadedModalExId = null;
  /** 弹窗内临时加载方式（未显式保存时用于应用推荐，不写入 settings） */
  let modalEquip = $state(null);

  const unitSetting = $derived(S.settings.unit === 'kg' ? 'kg' : 'lbs');
  const isKg = $derived(unitSetting === 'kg');

  /* 存储恒为 LBS；kg 模式下编辑值为换算后的 KG */
  function toDisplay(lbs) {
    return isKg ? displayWeight(lbs) : lbs;
  }
  function toStore(v) {
    const n = parseFloat(String(v)) || 0;
    return isKg ? Math.round((n / 0.4536) * 4) / 4 : n;
  }

  const ex = $derived(weightModal.ex);
  const activeEquip = $derived(
    modalEquip ?? (ex ? exEquipMode(ex) : null)
  );
  const equipInfo = $derived(activeEquip ? EQUIP_INFO[activeEquip] : null);
  const equipVariants = $derived(ex ? equipVariantsFor(ex) : null);
  const plateCfg = $derived(ex ? plateConfigFor(ex, unitSetting, activeEquip) : null);
  const richPlateUi = $derived(!!plateCfg || !!equipVariants);
  const unitLabel = $derived(ex ? exUnit(ex).toUpperCase() : '');
  const exLabel = $derived(ex ? `${ex.name} · ${ex.m}` : '');
  const activeEquipLabel = $derived.by(() => {
    if (!activeEquip) return '';
    return equipVariants?.find((m) => m.equip === activeEquip)?.label ?? equipLabel(activeEquip);
  });
  const activeEquipHint = $derived(activeEquip && !plateCfg ? equipHint(activeEquip) : '');

  const weightLbs = $derived(toStore(parseFloat(String(val)) || 0));
  const equipRecommendation = $derived.by(() => {
    if (!ex || !equipVariants) return null;
    return recommendEquipFor(ex, weightLbs);
  });
  const recommendedEquip = $derived(equipRecommendation?.equip ?? activeEquip);
  const recommendedEquipLabel = $derived.by(() => {
    if (!recommendedEquip) return '';
    return equipVariants?.find((m) => m.equip === recommendedEquip)?.label ?? equipLabel(recommendedEquip);
  });
  const equipTriggerLabel = $derived(
    recommendedEquipLabel ? t('weight.recommendEquip', { equip: recommendedEquipLabel }) : ''
  );
  const equipDiffersFromRec = $derived(
    recommendedEquip && activeEquip && recommendedEquip !== activeEquip
  );
  const equipTriggerTitle = $derived.by(() => {
    const parts = [];
    if (equipDiffersFromRec) {
      parts.push(
        t('weight.equipCurrentVsRecommended', {
          current: activeEquipLabel,
          recommended: recommendedEquipLabel
        })
      );
    }
    const reason = equipRecommendation?.reason;
    if (reason === 'saved') parts.push(t('weight.recommendReasonSaved'));
    else if (reason === 'history') parts.push(t('weight.recommendReasonHistory'));
    else if (reason === 'weight') parts.push(t('weight.recommendReasonWeight'));
    else if (reason === 'default') parts.push(t('weight.recommendReasonDefault'));
    if (activeEquipHint) parts.push(activeEquipHint);
    return parts.length ? parts.join(' · ') : undefined;
  });

  function pickEquip(equip) {
    if (!weightModal.exId || !equip) return;
    modalEquip = equip;
    setExEquipMode(weightModal.exId, equip);
    const cfg = plateConfigFor(weightModal.ex, unitSetting, equip);
    if (cfg) bar = exBarWeight(weightModal.ex, unitSetting, equip) ?? cfg.defaultBar;
    plateSettingsOpen = false;
    equipMenuOpen = false;
    builderMode = 'target';
  }

  // 仅在弹窗打开 / 切换动作时初始化，避免重渲染把下拉菜单立刻关掉
  $effect(() => {
    if (!weightModal.open || !weightModal.ex) {
      if (!weightModal.open) {
        loadedModalExId = null;
        modalEquip = null;
      }
      return;
    }
    if (loadedModalExId === weightModal.exId) return;
    loadedModalExId = weightModal.exId;
    modalEquip = null;
    const cur = exWeight(weightModal.ex);
    val = toDisplay(cur == null ? 0 : cur);
    const b = exBarWeight(weightModal.ex);
    if (b != null) bar = b;
    if (equipVariantsFor(weightModal.ex) && !hasSavedEquipMode(weightModal.exId)) {
      const rec = recommendEquipFor(weightModal.ex, cur ?? 0);
      if (rec.equip) {
        modalEquip = rec.equip;
        const cfg = plateConfigFor(weightModal.ex, unitSetting, rec.equip);
        if (cfg) bar = exBarWeight(weightModal.ex, unitSetting, rec.equip) ?? cfg.defaultBar;
      }
    }
    plateSettingsOpen = false;
    equipMenuOpen = false;
  });

  const advice = $derived.by(() => {
    if (!weightModal.open || !weightModal.exId) return null;
    const a = recommendNextWeight(weightModal.exId);
    if (a.action === 'hold' || !a.suggestedWeight) return null;
    return a;
  });
  const adviceShown = $derived.by(() => {
    if (!advice) return null;
    const target = toDisplay(advice.suggestedWeight);
    if (Math.abs(target - (parseFloat(String(val)) || 0)) < 0.01) return null;
    return { ...advice, target };
  });

  function applyAdvice() {
    if (adviceShown) val = adviceShown.target;
  }

  /* 步进按器械类型：哑铃小步进，杠铃/器械 5 LBS（kg 模式减半） */
  const step = $derived.by(() => {
    const s = equipInfo?.step ?? 5;
    return isKg ? s / 2 : s;
  });

  /** 正向输入无法精确凑片时，提示可凑到的最近总重 */
  const plateNearest = $derived.by(() => {
    if (!plateCfg || !weightModal.open) return null;
    const v = parseFloat(String(val)) || 0;
    const b = Number(bar) || 0;
    const denoms = plateInventoryFor(unitSetting);
    const collar = plateCfg.sides === 2 ? plateCollarFor(unitSetting) : 0;
    const effectiveBar = b + collar;
    if (v <= effectiveBar) return null;
    return plateLoadingNearest(v, b, { sides: plateCfg.sides, plates: denoms, collar });
  });

  const quickPresets = $derived.by(() => {
    if (!richPlateUi) return [];
    const v = parseFloat(String(val)) || 0;
    return platePresetsAround(v, unitSetting);
  });
  const activeDenoms = $derived(plateInventoryFor(unitSetting));

  function bump(d) {
    val = Math.max(0, Math.round(((parseFloat(String(val)) || 0) + d) * 100) / 100);
  }

  function save() {
    if (!weightModal.ex) return;
    setExWeight(weightModal.exId, toStore(val));
    if (plateCfg && plateCfg.sides === 2) setExBarWeight(weightModal.exId, unitSetting, bar, activeEquip);
    toast(t('weight.updated'));
    closeWeightModal();
  }

  function onBgClick(e) {
    if (e.target === e.currentTarget) closeWeightModal();
  }

  function onWindowKeydown(e) {
    if (e.key === 'Escape' && weightModal.open) {
      if (equipMenuOpen) {
        equipMenuOpen = false;
        return;
      }
      closeWeightModal();
    }
    if (e.key === 'Enter' && weightModal.open) save();
  }

  function onModalClick(e) {
    if (equipMenuOpen && !e.target.closest('.wtm-equip')) equipMenuOpen = false;
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if weightModal.open && weightModal.ex}
<div
  class="modal-bg show"
  onclick={onBgClick}
  role="presentation"
>
  <div class="modal wtm" role="dialog" aria-label={t('weight.aria')} aria-modal="true" onclick={onModalClick}>
    <div class="wtm-head">
      <div class="wtm-head-main">
        <div class="modal-title">{t('weight.title')}</div>
        <div class="modal-sub wtm-sub">{exLabel}</div>
      </div>
      {#if equipVariants}
        <div class="wtm-equip">
          <button
            type="button"
            class="wtm-equip-btn"
            aria-haspopup="menu"
            aria-expanded={equipMenuOpen}
            aria-label={`${t('weight.loadMode')}: ${equipTriggerLabel}`}
            title={equipTriggerTitle}
            onclick={(e) => {
              e.stopPropagation();
              equipMenuOpen = !equipMenuOpen;
            }}
          >
            <span class="wtm-equip-label">{equipTriggerLabel}</span>
            <Icon name="chevron-down" size={14} class={equipMenuOpen ? 'wtm-equip-chev open' : 'wtm-equip-chev'} />
          </button>
          {#if equipMenuOpen}
            <div class="wtm-equip-menu" role="menu" aria-label={t('weight.loadModeAria')}>
              {#each equipVariants as mode (mode.equip)}
                <button
                  type="button"
                  class="wtm-equip-option"
                  class:on={activeEquip === mode.equip}
                  class:rec={recommendedEquip === mode.equip}
                  role="menuitemradio"
                  aria-checked={activeEquip === mode.equip}
                  title={mode.hint}
                  onclick={() => pickEquip(mode.equip)}
                >
                  {mode.label}
                  {#if recommendedEquip === mode.equip && activeEquip !== mode.equip}
                    <span class="wtm-equip-rec">{t('weight.equipRecommended')}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if equipInfo && !richPlateUi}
      <div class="wtm-sem" aria-label={t('weight.weightStandard')}>
        <span class="wtm-sem-equip">{equipLabel(activeEquip)}</span>
        <span class="wtm-sem-hint">{equipHint(activeEquip)}</span>
      </div>
    {/if}

    <div class="wc-stepper">
      <button type="button" class="wc-step" onclick={() => bump(-step)} aria-label={t('weight.decStep', { step, unit: unitLabel })}>
        −{step}
      </button>
      <div class="wc-value">
        <input class="wc-value-input" type="number" inputmode="decimal" bind:value={val} aria-label={t('weight.weightAria')} />
        <span class="wc-value-unit">{unitLabel}</span>
        {#if plateNearest && !plateNearest.exact}
          <span class="wc-value-note">
            {#if plateNearest.under != null}{t('weight.lighter', { n: plateNearest.under })}{/if}
            {#if plateNearest.over != null && plateNearest.over !== plateNearest.under}
              {#if plateNearest.under != null} · {/if}{t('weight.heavier', { n: plateNearest.over })}
            {/if}
            {unitLabel}
          </span>
        {/if}
      </div>
      <button type="button" class="wc-step" onclick={() => bump(step)} aria-label={t('weight.incStep', { step, unit: unitLabel })}>
        +{step}
      </button>
    </div>

    {#if richPlateUi && quickPresets.length}
      <div class="wc-section">
        <div class="wc-label">{t('weight.quickPick')}</div>
        <div class="wc-chips wc-chips--shortcut" style="--wc-cols: {quickPresets.length}" role="group" aria-label={t('weight.quickPickAria')}>
          {#each quickPresets as p (p)}
            <button
              type="button"
              class="wc-chip wc-chip--num"
              onclick={() => { val = p; builderMode = 'target'; }}
            >{p}</button>
          {/each}
        </div>
      </div>
    {/if}

    {#if adviceShown}
      <button
        type="button"
        class="wtm-advice"
        class:up={adviceShown.action === 'increase'}
        class:down={adviceShown.action === 'decrease'}
        onclick={applyAdvice}
        title={adviceShown.reason}
      >
        <Icon name={adviceShown.action === 'increase' ? 'trending-up' : 'trending-down'} size={14} />
        <span class="wtm-advice-text">
          {adviceShown.action === 'increase' ? t('weight.suggestIncrease') : t('weight.suggestDecrease')}
          <b>{adviceShown.target}</b> {unitLabel}
        </span>
        <span class="wtm-advice-apply">{t('common.adopt')}</span>
      </button>
    {/if}

    {#if plateCfg}
      <div class="wtm-plates">
        <PlateBuilder
          unit={unitSetting}
          sides={plateCfg.sides}
          barOptions={plateCfg.barOptions}
          showBarPicker={plateSettingsOpen && plateCfg.sides === 2}
          plateDenoms={activeDenoms}
          showModeToggle={plateSettingsOpen}
          showInventory={plateSettingsOpen}
          showCollar={plateSettingsOpen && plateCfg.sides === 2}
          allowCustomBar={plateSettingsOpen}
          progressiveDisclosure={true}
          bind:settingsExpanded={plateSettingsOpen}
          focusGlance={true}
          bind:builderMode
          bind:bar
          bind:value={val}
        />
      </div>
    {/if}

    <div class="modal-actions wc-actions" class:wc-actions--solo={richPlateUi}>
      {#if !richPlateUi}
        <button type="button" class="ma-cancel" onclick={closeWeightModal}>{t('common.cancel')}</button>
      {/if}
      <button type="button" class="ma-save" onclick={save}>{t('common.save')}</button>
    </div>
  </div>
</div>
{/if}

<style>
  .wtm-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
    position: relative;
    z-index: 3;
  }
  .wtm-head-main {
    min-width: 0;
    flex: 1;
  }
  .wtm-sub {
    margin-bottom: 0;
  }
  .wtm-equip {
    position: relative;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .wtm-equip-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 120px;
    padding: 6px 10px;
    border: 1px solid var(--border-l);
    border-radius: 999px;
    background: var(--bg-2);
    color: var(--t2);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    transition:
      border-color var(--dur-fast) var(--ease-standard),
      color var(--dur-fast) var(--ease-standard),
      background var(--dur-fast) var(--ease-standard);
  }
  .wtm-equip-btn:hover,
  .wtm-equip-btn[aria-expanded='true'] {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border-l));
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-2));
  }
  .wtm-equip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wtm-equip-chev {
    flex-shrink: 0;
    opacity: 0.7;
    transition: transform var(--dur-fast) var(--ease-standard);
  }
  .wtm-equip-chev.open {
    transform: rotate(180deg);
  }
  .wtm-equip-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 112px;
    padding: 4px;
    border: 1px solid var(--border-l);
    border-radius: 10px;
    background: var(--card-h, var(--card));
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
    z-index: 2;
  }
  .wtm-equip-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease-standard),
      color var(--dur-fast) var(--ease-standard);
  }
  .wtm-equip-option:hover {
    background: var(--bg-2);
    color: var(--t1);
  }
  .wtm-equip-option.on {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .wtm-equip-option.rec:not(.on) {
    color: var(--t1);
  }
  .wtm-equip-rec {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    opacity: 0.85;
  }

  .wtm {
    max-width: 380px;
    max-height: min(
      calc(100dvh - 48px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)),
      680px
    );
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .wtm-sem {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: -8px 0 10px;
    padding: 4px 10px;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border-l));
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 7%, var(--bg-2));
    font-size: var(--text-xs);
  }
  .wtm-sem-equip {
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.03em;
  }
  .wtm-sem-hint {
    color: var(--t2);
  }

  .wtm-advice {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 40px;
    margin: 0 0 14px;
    padding: 8px 12px;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    font-size: var(--text-sm);
    transition: filter var(--dur-fast) var(--ease-standard);
  }
  .wtm-advice.up {
    border: 1px solid color-mix(in srgb, var(--success, #3ea36a) 35%, transparent);
    background: color-mix(in srgb, var(--success, #3ea36a) 10%, var(--bg-2));
    color: var(--success, #3ea36a);
  }
  .wtm-advice.down {
    border: 1px solid color-mix(in srgb, var(--warn, #c9a227) 35%, transparent);
    background: color-mix(in srgb, var(--warn, #c9a227) 10%, var(--bg-2));
    color: var(--warn, #c9a227);
  }
  .wtm-advice:hover {
    filter: brightness(1.1);
  }
  .wtm-advice-text {
    flex: 1;
    color: var(--t1);
  }
  .wtm-advice-text b {
    font-family: var(--mono);
  }
  .wtm-advice-apply {
    font-size: var(--text-xs);
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 14%, transparent);
  }

  .wtm-plates {
    margin: 0 0 var(--wc-section-gap);
    padding-top: 0;
  }

  /* Quick-pick shortcuts only — no selection highlight */
  .wc-chips--shortcut :global(.wc-chip) {
    min-height: 36px;
    border-color: color-mix(in srgb, var(--border) 65%, transparent);
    background: transparent;
    color: var(--t3);
    font-size: var(--text-xs);
    font-weight: 500;
  }
  .wc-chips--shortcut :global(.wc-chip:hover) {
    border-color: var(--border-l);
    background: var(--bg-2);
    color: var(--t2);
  }
  .wc-chips--shortcut :global(.wc-chip:active) {
    transform: scale(0.97);
  }
  .wc-chips--shortcut :global(.wc-chip.on),
  .wc-chips--shortcut :global(.wc-chip[aria-pressed='true']) {
    border-color: color-mix(in srgb, var(--border) 65%, transparent);
    color: var(--t3);
    background: transparent;
  }

</style>
