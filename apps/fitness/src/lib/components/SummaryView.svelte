<script>
  import { goto } from '$app/navigation';
  import {
    S,
    exWeight,
    exUnit,
    displayWeight,
    completeDay,
    ORDER,
    todayKey,
    setExWeight
  } from '$lib/state.svelte.js';
  import {
    getExLog,
    getSessionProgress,
    getSessionExercises,
    sessionDuration,
    markSessionEnded
  } from '$lib/session.js';
  import { dayProgressionAdvice, compareToLastSession, detectPR, formatProgressionWeight } from '$lib/progression.js';
  import { getProgram } from '$lib/programRuntime.js';
  import { toast } from '$lib/ui.svelte.js';
  import { autoCloudPushAfterWorkout } from '$lib/sync.js';
  import { reveal } from '$lib/actions/reveal.js';
  import { deloadAdvice, markDeloadDone } from '$lib/phase.js';
  import { coachHeadline } from '$lib/coach.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import BackButton from '$lib/components/BackButton.svelte';
  import { t } from '$lib/i18n/index.js';

  let { dayId, day } = $props();

  const dk = todayKey();
  const progress = $derived(getSessionProgress(dayId, dk));
  const duration = $derived(sessionDuration(dayId, dk));
  const advice = $derived(dayProgressionAdvice(dayId, dk));
  let adoptedAdvice = $state(new Set());

  $effect(() => {
    dayId;
    adoptedAdvice = new Set();
  });
  const compare = $derived(compareToLastSession(dayId, dk));
  const deload = $derived(deloadAdvice());
  const headline = $derived(coachHeadline(dayId));
  const isSupp = $derived(!ORDER().includes(dayId));
  const nextId = $derived(
    !isSupp ? ORDER()[(ORDER().indexOf(dayId) + 1) % ORDER().length] : null
  );

  function exRows() {
    return getSessionExercises(dayId, dk).flatMap((ex, index) => {
      const displayed = ex.substitution ? [day.ex[index], ex] : [ex];
      return displayed.map((rowEx) => {
        const ex = rowEx;
        const log = getExLog(dayId, ex.id, ex.sets, dk);
        const prs = detectPR(ex.id, dayId, dk);
        return {
          ex,
          log,
          replaced: Boolean(log.done > 0 && log.skipped?.substituteId),
          prs,
          w: exWeight(ex),
          unit: exUnit(ex)
        };
      });
    });
  }

  const rows = $derived(exRows());
  const showCoach = $derived(headline && progress.done > 0);
  const weightLabel = (row) =>
    row.w ? `${displayWeight(row.w)} ${row.unit}` : t('common.bodyweight');

  let finishing = $state(false);

  async function finish() {
    if (finishing) return;
    finishing = true;
    markSessionEnded(dayId);
    completeDay(dayId);
    await autoCloudPushAfterWorkout();
    toast(
      isSupp
        ? t('summary.toastSupp', { day: day.cn })
        : t('summary.toastDone', { day: day.cn, next: getProgram().days[nextId].cn })
    );
    goto('/');
  }

  function adoptAll() {
    advice.forEach((a) => {
      if (!adoptedAdvice.has(a.ex.id)) {
        adoptedAdvice.add(a.ex.id);
        setExWeight(a.ex.id, a.suggestedWeight);
      }
    });
    toast(t('summary.adoptAllToast'));
  }
</script>

<section class="view">
  <div class="wrap">
    <div class="page-head" use:reveal>
      <BackButton href="/day/{dayId}" />
    </div>

    <div class="sec-header" use:reveal>
      <h2 class="sec-title">{t('summary.title', { day: day.cn })}</h2>
      {#if duration}<span class="sec-note">{t('summary.minutes', { n: duration })}</span>{/if}
    </div>

    <div class="stats-grid summary-grid">
      <div class="stat-card" use:reveal>
        <div class="stat-v">{progress.done}/{progress.total}</div>
        <div class="stat-l" data-ui-decor="stat-label">{t('summary.setsCompleted')}</div>
      </div>
      {#if progress.done < progress.total}
        <div class="stat-card" use:reveal={{ delay: 40 }}>
          <div class="stat-v">{progress.pct}%</div>
          <div class="stat-l" data-ui-decor="stat-label">{t('summary.inProgress')}</div>
        </div>
      {:else if compare}
        <div class="stat-card" use:reveal={{ delay: 40 }}>
          <div class="stat-v">{compare.delta >= 0 ? '+' : ''}{compare.delta}</div>
          <div class="stat-l" data-ui-decor="stat-label">{t('summary.vsLast', { date: compare.prevDate.slice(5) })}</div>
        </div>
      {/if}
    </div>

    {#if showCoach}
      <div class="coach-panel summary-coach" use:reveal>
        <div class="coach-tip" class:warn={headline.tone === 'warn'} class:success={headline.tone === 'success'} class:action={headline.tone === 'action'}>
          <div class="coach-tip-title">{headline.title}</div>
          <div class="coach-tip-body">{headline.body}</div>
        </div>
      </div>
    {/if}

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('summary.exerciseDetail')}</div>
      <div class="set-row" style="display:block">
        {#each rows as row (row.ex.id)}
          <div class="summary-ex-row">
            <div class="summary-ex-head">
              <span class="ex-name">
                {row.ex.name}
                {#if row.prs?.length}<span class="pr-badge">PR</span>{/if}
                {#if row.replaced}
                  <span class="skip-badge replaced">{t('summary.replaced')}</span>
                {:else if row.log.skipped}
                  <span class="skip-badge">{t('summary.skipped')}</span>
                {/if}
              </span>
              <span class="ex-meta">{row.log.done}/{row.ex.sets} {t('common.sets')} · {weightLabel(row)}</span>
            </div>
            {#if row.log.sets?.some(Boolean)}
              <div class="summary-sets">
                {#each row.log.sets as s, i (i)}
                  {#if s}
                    <span class="summary-set-chip">
                      {t('summary.setChip', { n: i + 1, reps: s.reps ?? '—', rir: s.rir ?? '—' })}
                    </span>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    {#if advice.length}
      <div class="set-group" use:reveal>
        <div class="sg-title" data-ui-decor="section-label" style="display:flex; justify-content:space-between; align-items:center;">
          {t('summary.nextAdvice')}
          {#if advice.some((a) => !adoptedAdvice.has(a.ex.id))}
            <button type="button" class="btn-link" style="font-size:13px; font-weight:600;" onclick={adoptAll}>{t('summary.adoptAll')}</button>
          {/if}
        </div>
        <div class="set-row" style="display:block">
          {#each advice as a (a.ex.id)}
            {@const adopted = adoptedAdvice.has(a.ex.id)}
            <div class="advice-row" class:increase={a.action === 'increase'} style={adopted ? 'opacity:0.5;' : ''}>
              <span class="ex-name">{a.ex.name}</span>
              <span class="ex-meta">
                {#if adopted}
                  {t('summary.updatedTo', { weight: displayWeight(a.suggestedWeight) })}
                {:else if a.action === 'increase'}
                  {@const pf = formatProgressionWeight(a.ex, a)}
                  +{pf?.delta ?? displayWeight(a.delta)}
                  <span class="meta-chip"><Icon name="arrow-right" size={11} /> {t('summary.approx', { weight: displayWeight(a.suggestedWeight), unit: a.ex ? exUnit(a.ex) : '' })}</span>
                  · {a.reason}
                {:else if a.action === 'decrease'}
                  <span class="meta-chip"><Icon name="trending-down" size={11} /> {t('summary.approx', { weight: displayWeight(a.suggestedWeight), unit: a.ex ? exUnit(a.ex) : '' })}</span>
                  · {a.reason}
                {:else}
                  {a.reason}
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if deload.shouldDeload}
      <div class="callout deload-callout" use:reveal>
        <span class="co-label" data-ui-decor="callout-label">{t('summary.deloadLabel')}</span>
        {deload.reason}。{t('summary.deloadHint')}
        <button type="button" class="btn-link deload-mark" onclick={() => markDeloadDone()}>{t('summary.deloadMark')}</button>
      </div>
    {/if}

    <button type="button" class="btn-complete" onclick={finish} disabled={finishing}>
      {#if isSupp}
        <Icon name="check" size={16} /> {t('summary.finishSupp', { day: day.cn })}
      {:else}
        <Icon name="check" size={16} /> {t('summary.finishNext', { day: getProgram().days[nextId].cn })}
      {/if}
    </button>

    <div class="set-note" use:reveal>
      <a class="btn-link" href="/discover/records">{t('summary.viewRecords')} <Icon name="chevron-right" size={11} /></a>
    </div>

    {#if progress.pct < 100}
      <div class="page-foot-nav">
        <BackButton href="/day/{dayId}/focus" label={t('summary.continueWorkout')} />
      </div>
    {/if}
  </div>
</section>
