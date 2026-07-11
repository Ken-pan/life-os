<script>
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import {
    S,
    exWeight,
    exUnit,
    exBarWeight,
    exEquipMode,
    displayWeight,
    fmtRest,
    todayKey,
    setExWeight
  } from '$lib/state.svelte.js';
  import {
    getSessionProgress,
    getExLog,
    getCurrentSet,
    completeSet,
    undoLastSet,
    ensureSession,
    beginFocusSession,
    saveFocusCursor,
    loadFocusCursor,
    clearFocusCursor,
    markSessionEnded,
    abandonSessionIfEmpty,
    skipExercise,
    updateSetLog,
    parseTimedTarget,
    getSessionTimes,
    parseRepsTarget,
    getSessionExercises
  } from '$lib/session.js';
  import { recommendNextWeight, detectPR, isActionableHoldAdvice } from '$lib/progression.js';
  import { startTimer, timer, cancelTimer } from '$lib/timer.svelte.js';
  import { toast, openWeightModal, openSetLogSheet, openSkipModal, openFitnessToolSheet } from '$lib/ui.svelte.js';
  import TimerWidget from '$lib/components/TimerWidget.svelte';
  import Icon from '@life-os/platform-web/svelte/icon';
  import CoverMedia from '$lib/components/CoverMedia.svelte';
  import { focusHeroImage } from '$lib/data/program.js';
  import { schemeCoachHint, schemeLabel } from '$lib/data/setSchemes.js';
  import { bindScreenWakeLockWithGestureFallback } from '$lib/screenWakeLock.js';
  import {
    estimate1RM,
    intensityFromReps,
    restSuggestion,
    isBarbellExercise,
    plateConfigFor
  } from '$lib/tools/calculators.js';
  import { t } from '$lib/i18n/index.js';

  let { dayId, day } = $props();

  let exIndex = $state(0);
  let ctaPulse = $state(false);
  /** 本次训练已提示过的 PR（exId|type），避免每组重复弹同类 PR */
  const prToasted = new Set();
  let elapsedLabel = $state(null);
  let exitConfirmOpen = $state(false);
  let heroBroken = $state(false);
  let adoptedAdvice = $state(new Set());

  function adoptAdvice(exId, weight) {
    adoptedAdvice.add(exId);
    setExWeight(exId, weight);
    toast(t('focus.adoptedWeight'));
  }

  function formatElapsed(startMs, endMs) {
    const sec = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function refreshElapsed() {
    const times = getSessionTimes(dayId);
    elapsedLabel = times ? formatElapsed(times.startMs, Date.now()) : null;
  }

  onMount(() => {
    exIndex = loadFocusCursor(dayId) ?? getSessionProgress(dayId).exIndex;
    beginFocusSession(dayId);
    refreshElapsed();

    const releaseWakeLock = bindScreenWakeLockWithGestureFallback();
    const id = setInterval(refreshElapsed, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshElapsed();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      releaseWakeLock();
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  onDestroy(() => {
    cancelTimer();
    elapsedLabel = null;
    // 一组都没练就离开 → 不留下空会话记录
    abandonSessionIfEmpty(dayId);
  });

  $effect(() => {
    if (day) S.lastDay = dayId;
  });

  $effect(() => {
    saveFocusCursor(dayId, exIndex);
  });

  $effect(() => {
    if (timer.readyPulse) ctaPulse = true;
    if (ctaPulse && !timer.readyPulse) {
      const t = setTimeout(() => (ctaPulse = false), 1200);
      return () => clearTimeout(t);
    }
  });

  const progress = $derived(getSessionProgress(dayId));
  const sessionExercises = $derived(getSessionExercises(dayId));
  const currentEx = $derived(sessionExercises[exIndex] ?? null);

  $effect(() => {
    currentEx?.id;
    heroBroken = false;
  });

  const exLog = $derived(
    currentEx ? getExLog(dayId, currentEx.id, currentEx.sets) : null
  );
  const nextSet = $derived(
    currentEx ? getCurrentSet(dayId, currentEx.id, currentEx.sets) : null
  );
  const advice = $derived(currentEx ? recommendNextWeight(currentEx.id) : null);
  const schemeHint = $derived(
    currentEx ? schemeCoachHint(currentEx, sessionExercises) : null
  );
  const focusCues = $derived(currentEx?.cues ?? []);
  const schemeBadge = $derived(currentEx ? schemeLabel(currentEx.scheme) : null);
  const canUndo = $derived((exLog?.done ?? 0) > 0);

  const lastSetLog = $derived.by(() => {
    if (!exLog?.done) return null;
    return exLog.sets?.[exLog.done - 1] ?? null;
  });

  const inline1RM = $derived.by(() => {
    if (!lastSetLog || !currentEx) return null;
    const w = lastSetLog.weight ?? exWeight(currentEx);
    const r = lastSetLog.reps;
    if (!w || !r) return null;
    return estimate1RM(w, r);
  });

  const restHint = $derived(
    currentEx ? restSuggestion(intensityFromReps(currentEx.reps)) : null
  );

  function openTools(tab = '1rm') {
    if (!currentEx) return;
    const wi = weightInfo(currentEx);
    const unit = S.settings.unit === 'kg' ? 'kg' : 'lbs';
    const plateCfg = plateConfigFor(currentEx, unit, exEquipMode(currentEx));
    openFitnessToolSheet({
      tab,
      weight: wi.isBw ? null : wi.w,
      reps: lastSetLog?.reps ?? parseRepsTarget(currentEx.reps).mid,
      sets: currentEx.sets,
      targetWeight: wi.isBw ? null : wi.w,
      barWeight: exBarWeight(currentEx, unit) ?? undefined,
      plateSides: plateCfg?.sides,
      plateUnit: unit,
      ex: currentEx,
      fromFocus: true
    });
  }

  function weightInfo(ex) {
    const w = exWeight(ex);
    const isBw = w === 0 || w == null;
    return {
      w,
      isBw,
      wDisplay: isBw ? t('common.bodyweight') : displayWeight(w),
      unit: isBw ? t('common.bodyweight') : exUnit(ex)
    };
  }

  /**
   * 完成一组。注意：nextSet / currentEx 是 $derived，completeSet 写入日志后
   * 读取会得到新值，因此必须先快照再使用。
   * @returns {'rest' | 'nextEx' | 'exDone' | 'allDone' | null} 完成后的去向
   */
  function finishSet(payload = {}) {
    if (!currentEx || !nextSet) return null;

    const ex = currentEx;
    const setIndex = nextSet;
    const ctx = { dayId, exId: ex.id, setIndex };
    const result = completeSet(dayId, ex.id, setIndex, payload);

    if (!result.ok) return null;

    const prs = detectPR(ex.id, dayId, todayKey());
    const newPR = prs?.find((p) => !prToasted.has(`${ex.id}|${p.type}`));
    if (newPR) {
      prToasted.add(`${ex.id}|${newPR.type}`);
      toast(newPR.type === 'weight' ? t('focus.prWeight', { name: ex.name }) : t('focus.prVolume', { name: ex.name }));
    }

    if (setIndex < ex.sets) {
      startTimer(ex.rest, ex.name, ctx, { inline: true });
      toast(t('focus.setDoneRest', { set: setIndex }));
      return 'rest';
    }

    if (exIndex < sessionExercises.length - 1) {
      const nextEx = day.ex[exIndex + 1];
      exIndex += 1;
      startTimer(ex.rest, t('focus.nextTimer', { name: nextEx.name }), ctx, { inline: true });
      toast(t('focus.exDoneNext', { name: ex.name }));
      return 'nextEx';
    }

    cancelTimer();
    toast(t('focus.exDone', { name: ex.name }));
    return getSessionProgress(dayId).allDone ? 'allDone' : 'exDone';
  }

  function timedInfo(ex) {
    const seconds = parseTimedTarget(ex?.reps);
    return seconds ? { seconds, label: fmtRest(seconds) } : null;
  }

  function startWorkTimer(ex) {
    const timed = timedInfo(ex);
    if (!timed) return;
    startTimer(timed.seconds, ex.name, null, { inline: true, mode: 'work' });
    toast(t('focus.workTimer', { name: ex.name, time: timed.label }));
  }

  /** 全部完成后稍等 toast 展示完再进总结 */
  function scheduleSummary() {
    setTimeout(() => {
      if (getSessionProgress(dayId).allDone) gotoSummary();
    }, 600);
  }

  function onCompleteSet() {
    if (!currentEx || !nextSet) return;

    const ex = currentEx;
    const setIndex = nextSet;
    const mode = S.settings.logDetail || 'quick';

    if (mode === 'always') {
      openSetLogSheet({
        dayId,
        ex,
        setIndex,
        onConfirm: (p) => {
          if (finishSet(p) === 'allDone') scheduleSummary();
        },
        onSkip: () => {
          if (finishSet({}) === 'allDone') scheduleSummary();
        }
      });
      return;
    }

    const outcome = finishSet({});
    if (outcome == null) return;

    if (mode === 'quick') {
      // 全部完成时等补录弹层关闭后再进总结，避免弹层悬在总结页上
      openSetLogSheet({
        dayId,
        ex,
        setIndex,
        onConfirm: (p) => {
          updateSetLog(dayId, ex.id, setIndex, p);
          if (outcome === 'allDone') scheduleSummary();
        },
        onSkip: () => {
          if (outcome === 'allDone') scheduleSummary();
        }
      });
    } else if (outcome === 'allDone') {
      scheduleSummary();
    }
  }

  function goPrev() {
    if (exIndex > 0) {
      cancelTimer();
      exIndex -= 1;
    }
  }

  function goNext() {
    if (exIndex < sessionExercises.length - 1) {
      cancelTimer();
      exIndex += 1;
    }
  }

  function onSkip() {
    if (!currentEx) return;
    openSkipModal({
      dayId,
      ex: currentEx,
      onConfirm: ({ reason, substituteId }) => {
        const result = skipExercise(dayId, currentEx.id, reason, substituteId);
        if (!result.ok) return;
        toast(t('focus.skipped', { name: currentEx.name }));
        if (result.substituted) {
          // Replacement occupies the same persisted queue slot.
          exIndex = exIndex;
        } else if (exIndex < sessionExercises.length - 1) {
          exIndex += 1;
        } else {
          const p = getSessionProgress(dayId);
          if (p.allDone) gotoSummary();
          else exIndex = p.exIndex;
        }
      }
    });
  }

  function onUndo() {
    if (!currentEx) return;
    const r = undoLastSet(dayId, currentEx.id);
    if (r.ok) {
      cancelTimer();
      toast(t('focus.undoSet'));
    }
  }

  function gotoSummary() {
    exitConfirmOpen = false;
    cancelTimer();
    clearFocusCursor();
    markSessionEnded(dayId);
    goto(`/day/${dayId}/summary`);
  }

  function exitFocus() {
    cancelTimer();
    elapsedLabel = null;
    goto(`/day/${dayId}`);
  }

  function openExitConfirm() {
    exitConfirmOpen = true;
  }

  function closeExitConfirm() {
    exitConfirmOpen = false;
  }

  function onWindowKeydown(e) {
    if (e.key === 'Escape' && exitConfirmOpen) closeExitConfirm();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<section class="view focus-view">
  <div class="focus-stage">
    {#if currentEx}
      {@const wi = weightInfo(currentEx)}
      {@const timed = timedInfo(currentEx)}
      {@const heroImg = focusHeroImage(currentEx.id)}
      {@const showHeroImg = heroImg && !heroBroken}

      <div class="focus-hero">
        <div class="focus-hero-band" aria-hidden="true">
          <div class="focus-hero-statusguard"></div>
        </div>

        <div
          class="focus-hero-media"
          class:focus-hero-media--empty={!showHeroImg}
          style={showHeroImg ? `--hero-img: url('${heroImg}')` : undefined}
        >
          {#if showHeroImg}
            <img
              class="focus-hero-img"
              src={heroImg}
              alt=""
              loading="lazy"
              onerror={() => (heroBroken = true)}
            />
          {:else}
            <CoverMedia src={null} size="lg" />
          {/if}
          <div class="focus-hero-fade focus-hero-fade-top" aria-hidden="true"></div>
          <div class="focus-hero-fade focus-hero-fade-bottom" aria-hidden="true"></div>
          <div class="focus-hero-scrim" aria-hidden="true"></div>
        </div>

        <div
          class="focus-progress-bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progress.pct}
          aria-label={t('focus.progressAria', { pct: progress.pct })}
        >
          <div class="focus-progress-fill" style="width: {progress.pct}%"></div>
        </div>

        <header class="focus-header">
          <button type="button" class="focus-exit focus-icon-btn" onclick={openExitConfirm} aria-label={t('focus.exitAria')}>
            <Icon name="chevron-left" size={17} strokeWidth={2.25} />
          </button>
          <div class="focus-progress-meta focus-chip-ghost" aria-label={t('focus.progressAria', { pct: progress.pct })}>
            <span class="focus-ex-count">{exIndex + 1}/{sessionExercises.length}</span>
            {#if elapsedLabel}
              <span class="focus-chip-dot" aria-hidden="true">·</span>
              <span class="focus-elapsed" aria-label={t('focus.elapsedAria')}>{elapsedLabel}</span>
            {/if}
          </div>
        </header>
      </div>

      {#if timer.visible && timer.inline}
        <div class="focus-timer-island" class:has-hint={restHint}>
          <TimerWidget variant="inline" />
          {#if restHint}
            <button type="button" class="focus-rest-hint focus-rest-hint--island" onclick={() => openTools('rest')}>
              {restHint.label} · {t('focus.restSuggest', { range: restHint.range })}
            </button>
          {/if}
        </div>
      {/if}

      <div class="focus-sheet">
        <div class="focus-ex-head">
          <div class="focus-ex-head-main">
            <div class="focus-ex-name">{currentEx.name}</div>
            <div class="focus-ex-meta">
              <span class="badge sets">{currentEx.sets} × {currentEx.reps}</span>
              {#if timed}
                <button
                  class="badge work"
                  type="button"
                  onclick={() => startWorkTimer(currentEx)}
                >{t('focus.timedBadge', { time: timed.label })}<Icon name="play" size={11} class="badge-icon" /></button>
              {/if}
              <span class="badge rir">{currentEx.rir} RIR</span>
              <span class="badge rest">{t('focus.restBadge', { time: fmtRest(currentEx.rest) })}</span>
              {#if schemeBadge}
                <span class="badge scheme">{schemeBadge}</span>
              {/if}
            </div>
          </div>
          <div class="focus-weight-col">
            <button
              type="button"
              class="focus-weight"
              onclick={() => openWeightModal(dayId, currentEx)}
              aria-label={t('focus.adjustWeightAria', { name: currentEx.name, weight: wi.wDisplay, unit: wi.unit })}
            >
              <div class="w-num">
                {wi.wDisplay}
                {#if advice && !adoptedAdvice.has(currentEx.id)}
                  {#if advice.action === 'increase'}
                    <span class="w-badge increase" style="font-size:12px;color:var(--success);vertical-align:top;margin-left:4px;">↑+{displayWeight(advice.delta)}</span>
                  {:else if advice.action === 'decrease'}
                    <span class="w-badge decrease" style="font-size:12px;color:var(--warn);vertical-align:top;margin-left:4px;">{t('focus.decreaseBadge')}</span>
                  {/if}
                {/if}
              </div>
              <div class="w-unit">{wi.unit}</div>
            </button>
            {#if !wi.isBw}
              <div class="focus-weight-tools">
                {#if isBarbellExercise(currentEx, exEquipMode(currentEx))}
                  <button
                    type="button"
                    class="focus-plates-link"
                    aria-label={t('focus.platesAria')}
                    onclick={() => openTools('plates')}
                  >
                    {t('focus.plates')}
                  </button>
                {/if}
                <button
                  type="button"
                  class="focus-tool-btn"
                  aria-label={t('focus.calcAria')}
                  onclick={() => openTools('1rm')}
                >
                  <Icon name="calculator" size={14} />
                </button>
              </div>
            {/if}
          </div>
        </div>

        <div class="focus-sheet-top">
          {#if schemeHint}
            <div class="focus-coach focus-coach--scheme">{schemeHint}</div>
          {/if}

          {#if focusCues.length}
            <div class="focus-cues">
              {#each focusCues as c (c)}
                <span class="focus-cue">
                  <Icon name="arrow-right" size={11} class="focus-cue-icon" />
                  <span class="focus-cue-text">{c}</span>
                </span>
              {/each}
            </div>
          {/if}

          {#if advice && !adoptedAdvice.has(currentEx.id)}
            {#if advice.action === 'increase'}
              <div class="focus-advice increase" style="display:flex; justify-content:space-between; align-items:center;">
                <div><Icon name="trending-up" size={12} /> {advice.reason}</div>
                <button class="btn-link" style="font-weight:600; font-size:13px; color:var(--success); padding-left:12px;" onclick={() => adoptAdvice(currentEx.id, advice.suggestedWeight)}>{t('common.adopt')}</button>
              </div>
            {:else if advice.action === 'decrease'}
              <div class="focus-advice decrease" style="display:flex; justify-content:space-between; align-items:center;">
                <div><Icon name="trending-down" size={12} /> {advice.reason}</div>
                <button class="btn-link" style="font-weight:600; font-size:13px; color:var(--warn); padding-left:12px;" onclick={() => adoptAdvice(currentEx.id, advice.suggestedWeight)}>{t('common.adopt')}</button>
              </div>
            {:else if isActionableHoldAdvice(advice)}
              <div class="focus-advice hold" style="display:flex; align-items:center; gap:6px; color:var(--text-2);">
                <Icon name="info" size={12} /> {advice.reason}
              </div>
            {/if}
          {/if}

          {#if inline1RM}
            <button type="button" class="focus-inline-rm" onclick={() => openTools('1rm')}>
              {t('focus.estimate1rm', { weight: displayWeight(inline1RM.avg), unit: exUnit(currentEx) })}
              <span class="focus-inline-rm-sub">{t('focus.estimate1rmSub')}</span>
            </button>
          {/if}
        </div>

        <div class="focus-actions">
          <div class="focus-action-dock">
            {#if !exLog?.skipped}
              <div
                class="focus-set-progress"
                role="img"
                aria-label={t('focus.setProgressAria', { total: currentEx.sets, done: exLog?.done ?? 0 })}
              >
                <div class="focus-set-pips" aria-hidden="true">
                  {#each Array(currentEx.sets) as _, i (i)}
                    <span
                      class="focus-set-pip"
                      class:done={i < (exLog?.done ?? 0)}
                      class:current={nextSet === i + 1}
                    ></span>
                  {/each}
                </div>
                <span class="focus-set-count">
                  {#if nextSet}
                    {t('focus.setProgress', { done: exLog?.done ?? 0, total: currentEx.sets, remaining: currentEx.sets - (exLog?.done ?? 0) })}
                  {:else}
                    {t('focus.setAllDone', { total: currentEx.sets })}
                  {/if}
                </span>
              </div>
            {/if}

            {#if nextSet}
              <button
                type="button"
                class="focus-cta focus-cta-set"
                class:pulse={ctaPulse}
                onclick={onCompleteSet}
                aria-label={t('focus.completeSetAria', { set: nextSet, total: currentEx.sets, done: exLog.done })}
              >
                {t('focus.completeSet', { set: nextSet })}
              </button>
            {:else if progress.allDone}
              <button type="button" class="focus-cta" onclick={gotoSummary}>{t('focus.viewSummary')}</button>
            {:else if exLog?.skipped}
              <div class="focus-done-msg">{t('focus.skippedEx')}</div>
            {:else}
              <div class="focus-done-msg"><Icon name="check" size={14} /> {t('focus.exCompleted')}</div>
            {/if}

            <footer class="focus-footer">
              <button type="button" class="focus-nav-btn" disabled={exIndex === 0} onclick={goPrev} aria-label={t('focus.prevEx')}>{t('focus.prevEx')}</button>
              {#if canUndo}
                <button type="button" class="focus-nav-btn" onclick={onUndo} aria-label={t('focus.undo')}>{t('focus.undo')}</button>
              {/if}
              <button type="button" class="focus-nav-btn" onclick={onSkip} aria-label={t('focus.skip')}>{t('focus.skip')}</button>
              <button
                type="button"
                class="focus-nav-btn"
                disabled={exIndex >= sessionExercises.length - 1}
                onclick={goNext}
                aria-label={t('focus.nextEx')}
              >{t('focus.nextEx')}</button>
            </footer>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

{#if exitConfirmOpen}
  <div
    class="modal-bg show"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && closeExitConfirm()}
  >
    <div class="modal" role="dialog" aria-labelledby="focus-exit-title" aria-modal="true">
      <div class="modal-title" id="focus-exit-title">{t('focus.exitConfirmTitle')}</div>
      <div class="modal-sub">{t('focus.exitConfirmSub')}</div>
      <div class="modal-actions">
        <button type="button" class="ma-cancel" onclick={exitFocus}>{t('focus.backOverview')}</button>
        <button type="button" class="ma-save" onclick={gotoSummary}>{t('focus.endWorkout')}</button>
      </div>
    </div>
  </div>
{/if}
