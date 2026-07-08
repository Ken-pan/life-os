<script>
  import { page } from '$app/state';
  import { getProgram } from '$lib/programRuntime.js';
  import { dayImage } from '$lib/data/program.js';
  import CoverMedia from '$lib/components/CoverMedia.svelte';
  import ExerciseThumb from '$lib/components/ExerciseThumb.svelte';
  import {
    S,
    todayKey,
    exWeight,
    exUnit,
    exBarWeight,
    exEquipMode,
    displayWeight,
    fmtRest
  } from '$lib/state.svelte.js';
  import { parseTimedTarget, toggleSet } from '$lib/session.js';
  import { effectiveDone } from '$lib/logs.js';
  import { startTimer } from '$lib/timer.svelte.js';
  import { toast, openWeightModal, openFitnessToolSheet } from '$lib/ui.svelte.js';
  import { isBarbellExercise, plateConfigFor } from '$lib/tools/calculators.js';
  import { goto } from '$app/navigation';
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import BackButton from '$lib/components/BackButton.svelte';
  import { t } from '$lib/i18n/index.js';

  const id = $derived(page.params.id);
  const day = $derived(getProgram().days[id]);

  $effect(() => {
    if (day) {
      S.lastDay = id;
    }
  });

  const dk = $derived(todayKey());
  const totalSets = $derived(day ? day.ex.reduce((a, e) => a + e.sets, 0) : 0);

  function doneOf(ex) {
    const log = S.logs[dk + '|' + id]?.[ex.id];
    return effectiveDone(log, ex.sets);
  }

  function weightInfo(ex) {
    const w = exWeight(ex);
    const isBw = w === 0 || w == null;
    const wDisplay = isBw ? t('common.bodyweight') : displayWeight(w);
    const small = (typeof wDisplay === 'string' && wDisplay.length > 3) || w === 0;
    return { w, isBw, wDisplay, small, unit: exUnit(ex) };
  }

  function onChip(ex, i) {
    const { prev, next } = toggleSet(id, ex.id, i);
    if (next > prev && next < ex.sets) {
      startTimer(ex.rest, ex.name);
      toast(t('focus.setDoneRest', { set: next }));
    } else if (next >= ex.sets && next > prev) {
      toast(t('focus.exDone', { name: ex.name }));
    }
  }

  function timedInfo(ex) {
    const seconds = parseTimedTarget(ex.reps);
    return seconds ? { seconds, label: fmtRest(seconds) } : null;
  }

  function startWorkTimer(ex) {
    const timed = timedInfo(ex);
    if (!timed) return;
    startTimer(timed.seconds, ex.name, null, { mode: 'work' });
    toast(t('focus.workTimer', { name: ex.name, time: timed.label }));
  }

  function complete() {
    goto(`/day/${id}/summary`);
  }

  function openPlates(ex) {
    const w = exWeight(ex);
    if (w == null || w <= 0) return;
    const unit = S.settings.unit === 'kg' ? 'kg' : 'lbs';
    const plateCfg = plateConfigFor(ex, unit, exEquipMode(ex));
    openFitnessToolSheet({
      tab: 'plates',
      weight: w,
      targetWeight: w,
      barWeight: exBarWeight(ex, unit) ?? undefined,
      plateSides: plateCfg?.sides,
      plateUnit: unit,
      ex
    });
  }
</script>

<section class="view">
  <div class="wrap">
    {#if !day}
      <div class="day-head">
        <BackButton href="/program" />
        <h1 class="day-title">{t('day.notFound')}</h1>
        <div class="day-sub">{t('day.notFoundSub')}</div>
      </div>
    {:else}
      <div class="day-head" use:reveal>
        <BackButton href="/program" />
        <h1 class="day-title">{day.cn}</h1>
        <div class="day-sub">{day.subtitle}</div>
        <div class="day-hero" use:reveal>
          <div class="day-visual">
            <CoverMedia src={dayImage(id)} alt={t('home.trainingCoverAlt', { day: day.cn })} loading="eager" size="lg" />
            <div class="dv-meta">
              <div class="dv-pill">{t('day.exercisesMeta', { count: day.ex.length, sets: totalSets })}</div>
            </div>
          </div>
          <a class="btn-start focus-entry" href="/day/{id}/focus">
            <span class="focus-entry-main"><Icon name="play" size={14} /> {t('day.enterFocus')}</span>
          </a>
        </div>
      </div>

      {#if day.note}
        <div class="callout" use:reveal>
          <span class="co-label" data-ui-decor="callout-label">{t('day.todayNote')}</span> {day.note}
        </div>
      {/if}

      {#if day.warmup && day.warmup.length}
        <div class="sec-header" use:reveal>
          <h2 class="sec-title">{t('day.warmup')}</h2>
          <span class="sec-note">{t('day.warmupNote')}</span>
        </div>
        <div class="warmup-box" use:reveal>
          {#each day.warmup as w (w.name)}
            <div class="wu-row">
              <span class="wu-name">{w.name}</span>
              <span class="wu-val g">{w.val}</span>
              <span class="wu-note">{w.note || ''}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="sec-header" use:reveal>
        <h2 class="sec-title">{t('day.exercises')}</h2>
        <span class="sec-note">{totalSets} {t('common.sets')}</span>
      </div>
      <div class="cards">
        {#each day.ex as ex (ex.id)}
          {@const done = doneOf(ex)}
          {@const wi = weightInfo(ex)}
          {@const timed = timedInfo(ex)}
          <div class="card" class:done-ex={done >= ex.sets} use:reveal>
            <div class="card-top">
              <ExerciseThumb exId={ex.id} />
              <div>
                <div class="c-name">
                  {ex.name}
                  <span class="mtag">{ex.m}</span>
                </div>
                <div class="badges">
                  <span class="badge sets">{ex.sets} × {ex.reps}</span>
                  {#if timed}
                    <button
                      class="badge work"
                      type="button"
                      onclick={() => startWorkTimer(ex)}
                    >{t('day.timedBadge', { time: timed.label })}<Icon name="play" size={11} class="badge-icon" /></button>
                  {/if}
                  <button
                    class="badge rest"
                    type="button"
                    onclick={() => startTimer(ex.rest, ex.name)}
                  >{t('day.restBadge', { time: fmtRest(ex.rest) })}<Icon name="timer" size={11} class="badge-icon" /></button>
                  <span class="badge rir">{ex.rir} RIR</span>
                </div>
                <div class="cues">
                  {#each ex.cues as c (c)}<span class="cue"><Icon name="arrow-right" size={11} class="cue-icon" /><span class="cue-text">{c}</span></span>{/each}
                </div>
              </div>
              <div
                class="w-panel"
                role="button"
                tabindex="0"
                aria-label={t('day.adjustWeightAria', {
                  name: ex.name,
                  weight: wi.wDisplay,
                  unit: wi.isBw ? '' : ' ' + wi.unit
                })}
                onclick={() => openWeightModal(id, ex)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openWeightModal(id, ex)}
              >
                <div class="w-num" class:small={wi.small}>{wi.wDisplay}</div>
                <div class="w-unit">{wi.isBw ? t('common.bodyweight') : wi.unit}</div>
                {#if isBarbellExercise(ex, exEquipMode(ex)) && !wi.isBw}
                  <button
                    type="button"
                    class="day-plates-link"
                    aria-label={t('day.platesAria', { name: ex.name })}
                    onclick={(e) => {
                      e.stopPropagation();
                      openPlates(ex);
                    }}
                  >
                    {t('focus.plates')}
                  </button>
                {/if}
                {#if ex.sub}<div class="w-sub">{ex.sub}</div>{/if}
              </div>
            </div>
            <div class="set-track" role="group" aria-label={t('day.setsGroupAria', { name: ex.name })}>
              <span class="st-label">{t('day.setsLabel')}</span>
              {#each Array(ex.sets) as _, i (i)}
                <button
                  class="set-chip"
                  class:done={i < done}
                  aria-pressed={i < done}
                  aria-label={t('day.setN', { n: i + 1 })}
                  onclick={() => onChip(ex, i + 1)}
                >
                  {i + 1}
                </button>
              {/each}
              <span class="st-count">{done}/{ex.sets}</span>
            </div>
          </div>
        {/each}
      </div>

      <button type="button" class="btn-secondary day-finish" onclick={complete}>{t('day.finishViewSummary')}</button>
    {/if}
  </div>
</section>
