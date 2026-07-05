<script>
  import { browser } from '$app/environment';
  import {
    baseProgram,
    getProgram,
    setExerciseOverride,
    removeExerciseFromDay,
    addExerciseToDay,
    resetExerciseInDay,
    clearAllProgramOverrides,
    overrideCount,
    exerciseHasOverride,
    moveExerciseInDay,
    exportProgramOverrides,
    importProgramOverrides
  } from '$lib/programRuntime.js';
  import { getPoolExercisesForDay } from '$lib/data/program.js';
  import { localizeExercise } from '$lib/i18n/exerciseLabels.js';
  import SchemePicker from '$lib/components/SchemePicker.svelte';
  import { S, todayDayId } from '$lib/state.svelte.js';
  import { toast } from '$lib/ui.svelte.js';
  import { reveal } from '$lib/actions/reveal.js';
  import BackButton from '$lib/components/BackButton.svelte';
  import ExerciseThumb from '$lib/components/ExerciseThumb.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { t } from '$lib/i18n/index.js';
  import { dayDisplayName, dayDecorEn } from '$lib/i18n/programLabels.js';

  const SETS_MIN = 1;
  const SETS_MAX = 10;
  const REST_MIN = 30;
  const REST_MAX = 600;
  const REST_STEP = 15;
  const EXPANDED_STORAGE_KEY = 'prog-edit-expanded-days';

  let importInput;
  let savePulse = $state(false);
  let saveFeedbackTimer = null;
  let savePulseTimer = null;

  const base = $derived(baseProgram());
  const live = $derived(getProgram());
  const dayEntries = $derived(Object.entries(live.days));
  const recDayId = $derived(todayDayId());

  function loadExpandedDays() {
    const today = todayDayId();
    if (!browser) return new Set([today]);
    try {
      const raw = sessionStorage.getItem(EXPANDED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return new Set(parsed);
      }
    } catch {
      /* ignore */
    }
    return new Set([today]);
  }

  let expandedDays = $state(loadExpandedDays());

  function persistExpandedDays() {
    if (!browser) return;
    sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...expandedDays]));
  }

  function setDayExpanded(dayId, open) {
    const next = new Set(expandedDays);
    if (open) next.add(dayId);
    else next.delete(dayId);
    expandedDays = next;
    persistExpandedDays();
  }

  function jumpToDay(dayId) {
    setDayExpanded(dayId, true);
    requestAnimationFrame(() => {
      document.getElementById(`day-${dayId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function notifySaved() {
    clearTimeout(saveFeedbackTimer);
    clearTimeout(savePulseTimer);
    saveFeedbackTimer = setTimeout(() => {
      savePulse = true;
      savePulseTimer = setTimeout(() => {
        savePulse = false;
      }, 900);
    }, 800);
  }

  function patch(exId, field, raw) {
    let val = raw;
    if (field === 'sets' || field === 'rest' || field === 'w') {
      val = parseFloat(raw);
      if (isNaN(val)) return;
    }
    if (field === 'scheme' && val === 'straight') {
      setExerciseOverride(exId, { scheme: 'straight', pairWith: undefined });
    } else if (field === 'scheme' && val !== 'superset') {
      setExerciseOverride(exId, { scheme: val, pairWith: undefined });
    } else {
      setExerciseOverride(exId, { [field]: val });
    }
    notifySaved();
  }

  function pairOptions(dayId, exId) {
    return (live.days[dayId]?.ex ?? []).filter((e) => e.id !== exId);
  }

  function bumpSets(exId, current, delta) {
    const next = Math.min(SETS_MAX, Math.max(SETS_MIN, current + delta));
    if (next !== current) patch(exId, 'sets', next);
  }

  function bumpRest(exId, current, delta) {
    const next = Math.min(REST_MAX, Math.max(REST_MIN, current + delta * REST_STEP));
    if (next !== current) patch(exId, 'rest', next);
  }

  function moveEx(dayId, exId, delta) {
    moveExerciseInDay(dayId, exId, delta);
    notifySaved();
  }

  function onExportProgram() {
    const blob = new Blob([JSON.stringify(exportProgramOverrides(), null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fitos-program-overrides.json';
    a.click();
    URL.revokeObjectURL(url);
    toast(t('programEdit.toastExported'));
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importProgramOverrides(JSON.parse(String(reader.result)));
        toast(t('programEdit.toastImported'));
      } catch (err) {
        toast(err.message || t('programEdit.importFailed'));
      }
    };
    reader.readAsText(file);
  }

  function onResetAll() {
    if (confirm(t('programEdit.confirmReset'))) {
      clearAllProgramOverrides();
      toast(t('programEdit.toastReset'));
    }
  }

  function onDeleteEx(dayId, ex) {
    if (confirm(t('programEdit.confirmDelete', { name: ex.name }))) {
      removeExerciseFromDay(dayId, ex.id);
      notifySaved();
    }
  }

  function optionalPool(dayId, day) {
    const liveIds = new Set(live.days[dayId]?.ex.map((e) => e.id) ?? []);
    const baseIds = new Set(day.ex.map((e) => e.id));
    const addedIds = new Set(S.programOverrides?.[`day:${dayId}`]?.addedEx ?? []);
    return getPoolExercisesForDay(dayId)
      .map(localizeExercise)
      .filter(
      (ex) => !liveIds.has(ex.id) && !baseIds.has(ex.id) && !addedIds.has(ex.id)
    );
  }
</script>

<input bind:this={importInput} type="file" accept="application/json,.json" hidden onchange={onImportFile} />

<section class="view view--program-edit">
  <div class="wrap">
    <div class="page-head" use:reveal>
      <BackButton href="/program" label={t('programEdit.backProgram')} />
    </div>

    <div class="sec-header" use:reveal>
      <span class="tag" data-ui-decor="tag">{t('programEdit.tag')}</span>
      <h2 class="sec-title">{t('programEdit.title')}</h2>
      <span class="sec-note sec-note--save" class:is-pulse={savePulse}>{t('programEdit.modified', { n: overrideCount() })}</span>
    </div>

    <p class="lib-intro" use:reveal>
      {t('programEdit.intro')}
    </p>

    <div class="import-toolbar" use:reveal>
      <div class="import-row import-row--tools">
        <button type="button" class="btn-secondary" onclick={onExportProgram}>{t('programEdit.export')}</button>
        <button type="button" class="btn-secondary" onclick={() => importInput.click()}>{t('programEdit.import')}</button>
        <button type="button" class="btn-danger-outline" onclick={onResetAll}>{t('programEdit.resetDefault')}</button>
      </div>
    </div>

    <nav class="day-jump life-os-scroll-x life-os-scroll-x--snap" aria-label={t('programEdit.jumpDaysAria')} use:reveal>
      {#each dayEntries as [dayId, day] (dayId)}
        <button
          type="button"
          class="day-jump-chip"
          class:day-jump-chip--today={dayId === recDayId}
          onclick={() => jumpToDay(dayId)}
        >{day.cn}</button>
      {/each}
    </nav>

    {#each dayEntries as [dayId, day] (dayId)}
      {@const visibleEx = live.days[dayId]?.ex ?? []}
      {@const poolEx = optionalPool(dayId, day)}
      <details
        class="day-collapsible set-group set-group--edit"
        class:day-collapsible--today={dayId === recDayId}
        id="day-{dayId}"
        open={expandedDays.has(dayId)}
        ontoggle={(e) => setDayExpanded(dayId, e.currentTarget.open)}
        use:reveal
      >
        <summary class="day-collapsible-summary" aria-label={t('programEdit.daySummaryAria', { cn: day.cn, name: day.name, count: visibleEx.length })}>
          <div class="day-collapsible-main">
            <div class="day-collapsible-title">
              <span class="day-collapsible-cn">{dayDisplayName(day)}</span>
              {#if dayDecorEn(day)}
                <span class="day-collapsible-en decor-en" data-ui-decor="en-accent" aria-hidden="true">{dayDecorEn(day)}</span>
              {/if}
              {#if dayId === recDayId}
                <span class="day-collapsible-today">{t('programEdit.today')}</span>
              {/if}
            </div>
            <span class="day-collapsible-meta">{t('programEdit.exerciseCount', { n: visibleEx.length })}</span>
            <span class="day-collapsible-hint">{t('programEdit.expandHint')}</span>
          </div>
          <span class="day-collapsible-chev" aria-hidden="true">
            <Icon name="chevron-right" size={18} />
          </span>
        </summary>
        <div class="set-row prog-edit-list">
          {#each visibleEx as ex, vi (ex.id)}
            <div class="prog-edit-row prog-edit-row--compact">
              <div class="pe-order-col" aria-label={t('programEdit.reorderAria')}>
                <button
                  type="button"
                  class="pe-order-btn"
                  aria-label={t('programEdit.moveUp', { name: ex.name })}
                  disabled={vi === 0}
                  onclick={() => moveEx(dayId, ex.id, -1)}
                >↑</button>
                <button
                  type="button"
                  class="pe-order-btn"
                  aria-label={t('programEdit.moveDown', { name: ex.name })}
                  disabled={vi === visibleEx.length - 1}
                  onclick={() => moveEx(dayId, ex.id, 1)}
                >↓</button>
              </div>
              <ExerciseThumb exId={ex.id} />
              <div class="prog-edit-body">
                <div class="prog-edit-head">
                  <span class="ex-name">
                    {ex.name}
                    {#if exerciseHasOverride(ex.id)}
                      <span class="pe-mod-badge" aria-label={t('programEdit.modifiedAria')}>{t('programEdit.modifiedBadge')}</span>
                    {/if}
                    <span class="mtag">{ex.m}</span>
                  </span>
                  <button
                    type="button"
                    class="btn-link btn-link--danger"
                    onclick={() => onDeleteEx(dayId, ex)}
                  >{t('programEdit.delete')}</button>
                </div>
                <div class="prog-edit-fields prog-edit-fields--compact">
                  <div class="pe-inline pe-inline--stepper">
                    <span class="pe-inline-label">{t('programEdit.sets')}</span>
                    <div class="stepper pe-stepper">
                      <button
                        type="button"
                        aria-label={t('programEdit.decSets')}
                        disabled={ex.sets <= SETS_MIN}
                        onclick={() => bumpSets(ex.id, ex.sets, -1)}
                      >−</button>
                      <span class="sv">{ex.sets}</span>
                      <button
                        type="button"
                        aria-label={t('programEdit.incSets')}
                        disabled={ex.sets >= SETS_MAX}
                        onclick={() => bumpSets(ex.id, ex.sets, 1)}
                      >+</button>
                    </div>
                  </div>
                  <div class="pe-inline pe-inline--stepper">
                    <span class="pe-inline-label">{t('programEdit.rest')}</span>
                    <div class="stepper pe-stepper">
                      <button
                        type="button"
                        aria-label={t('programEdit.decRest')}
                        disabled={ex.rest <= REST_MIN}
                        onclick={() => bumpRest(ex.id, ex.rest, -1)}
                      >−</button>
                      <span class="sv">{ex.rest}</span>
                      <button
                        type="button"
                        aria-label={t('programEdit.incRest')}
                        disabled={ex.rest >= REST_MAX}
                        onclick={() => bumpRest(ex.id, ex.rest, 1)}
                      >+</button>
                    </div>
                  </div>
                  <label class="pe-inline pe-inline--reps">
                    <span class="pe-inline-label">{t('setLog.reps')}</span>
                    <input
                      type="text"
                      value={ex.reps}
                      onchange={(e) => patch(ex.id, 'reps', e.currentTarget.value)}
                    />
                  </label>
                  <SchemePicker
                    inline
                    scheme={ex.scheme}
                    pairWith={ex.pairWith}
                    pairOptions={pairOptions(dayId, ex.id)}
                    exerciseName={ex.name}
                    onSchemeChange={(val) => patch(ex.id, 'scheme', val)}
                    onPairChange={(val) => patch(ex.id, 'pairWith', val)}
                  />
                </div>
                {#if exerciseHasOverride(ex.id)}
                  <button type="button" class="btn-link pe-reset" onclick={() => { resetExerciseInDay(dayId, ex.id); notifySaved(); }}>{t('programEdit.resetExercise')}</button>
                {/if}
              </div>
            </div>
          {/each}
          {#if poolEx.length}
            <details class="hidden-collapsible ex-pool-collapsible">
              <summary>{t('programEdit.poolTitle', { n: poolEx.length })}</summary>
              <p class="ex-pool-hint">{t('programEdit.poolHint')}</p>
              {#each poolEx as ex (ex.id)}
                <div class="prog-edit-row pool-ex">
                  <ExerciseThumb exId={ex.id} />
                  <div class="prog-edit-body">
                    <div class="prog-edit-head">
                      <span class="ex-name">{ex.name} <span class="mtag">{ex.m}</span></span>
                      <span class="ex-pool-meta">{ex.sets}×{ex.reps}</span>
                      <button
                        type="button"
                        class="btn-link"
                        onclick={() => {
                          addExerciseToDay(dayId, ex.id);
                          notifySaved();
                        }}
                      >{t('programEdit.add')}</button>
                    </div>
                  </div>
                </div>
              {/each}
            </details>
          {/if}
        </div>
      </details>
    {/each}
  </div>
</section>
