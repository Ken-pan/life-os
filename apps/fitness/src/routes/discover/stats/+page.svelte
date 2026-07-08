<script>
  import { S, sessionStats, displayWeight } from '$lib/state.svelte.js';
  import {
    sessionDates,
    sessionsByWeek,
    volumeByDayType,
    customWeightsList,
    monthCalendar,
    exerciseCompletion,
    exerciseHistory,
    exercisePR
  } from '$lib/stats.js';
  import { progressionAdvice, formatProgressionWeight } from '$lib/progression.js';
  import { findExercise } from '$lib/programRuntime.js';
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import BackButton from '$lib/components/BackButton.svelte';
  import { t, resolveLocale } from '$lib/i18n/index.js';
  import { dayDisplayFull } from '$lib/i18n/programLabels.js';
  import { messages } from '$lib/i18n/messages/index.js';

  let expandedEx = $state(null);

  const overview = $derived(sessionStats());
  const weeks = $derived(sessionsByWeek(4));
  const maxWeek = $derived(Math.max(...weeks.map((w) => w.count), 1));
  const volume = $derived(volumeByDayType(28));
  const maxVol = $derived(Math.max(...volume.map((v) => v.sets), 1));
  const weights = $derived(customWeightsList());
  const exercises = $derived(exerciseCompletion(28));
  const cal = $derived(monthCalendar());
  const dowLabels = $derived.by(() => messages[resolveLocale(S.settings.locale)].stats.dow);

  const calCells = $derived.by(() => {
    const cells = [];
    for (let i = 0; i < cal.startDow; i++) cells.push({ empty: true });
    for (let d = 1; d <= cal.daysInMonth; d++) {
      const date = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sessions = cal.sessions[date] || [];
      cells.push({ day: d, date, sessions, empty: false });
    }
    return cells;
  });

  const totalDates = $derived(sessionDates().length);
  const monthCount = $derived.by(() => {
    const prefix = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}`;
    return sessionDates().filter((d) => d.startsWith(prefix)).length;
  });

  function toggleEx(exId) {
    expandedEx = expandedEx === exId ? null : exId;
  }

  function trendMax(history) {
    return Math.max(...history.map((h) => h.e1rm || h.weight || h.avgReps || 0), 1);
  }

  const unitLabel = $derived(S.settings.unit === 'kg' ? 'kg' : 'lbs');
</script>

<section class="view">
  <div class="wrap">
    <div class="page-head" use:reveal>
      <BackButton href="/discover" label={t('tools.backDiscover')} />
    </div>

    <div class="sec-header" use:reveal>
      <span class="tag" data-ui-decor="tag">{t('stats.tag')}</span><h2 class="sec-title">{t('stats.title')}</h2>
      <span class="sec-note">{t('stats.subtitle')}</span>
    </div>

    <div class="stats-grid">
      <div class="stat-card" use:reveal>
        <div class="stat-v">{overview.total}</div>
        <div class="stat-l" data-ui-decor="stat-label">{t('stats.totalDays')}</div>
      </div>
      <div class="stat-card" use:reveal={{ delay: 40 }}>
        <div class="stat-v">{overview.week7}</div>
        <div class="stat-l" data-ui-decor="stat-label">{t('stats.last7')}</div>
      </div>
      <div class="stat-card" use:reveal={{ delay: 80 }}>
        <div class="stat-v">{overview.daysSince ?? '—'}</div>
        <div class="stat-l" data-ui-decor="stat-label">{t('stats.daysSince')}</div>
      </div>
      <div class="stat-card" use:reveal={{ delay: 120 }}>
        <div class="stat-v">{monthCount}</div>
        <div class="stat-l" data-ui-decor="stat-label">{t('stats.monthDays')}</div>
      </div>
    </div>

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('stats.weeklyCount')}</div>
      <div class="set-row" style="display:block;padding-bottom:18px">
        <div class="week-bars">
          {#each weeks as w (w.label)}
            <div class="week-bar">
              <div class="bar-label">{w.count}</div>
              <div class="bar" style="height:{Math.max(8, (w.count / maxWeek) * 72)}px"></div>
              <div class="bar-sub">{w.label}</div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('stats.calendar', { label: cal.label })}</div>
      <div class="set-row" style="display:block;padding-bottom:16px">
        <div class="cal-grid">
          {#each dowLabels as d (d)}
            <div class="cal-head">{d}</div>
          {/each}
          {#each calCells as cell, i (i)}
            {#if cell.empty}
              <div class="cal-cell empty"></div>
            {:else}
              <div class="cal-cell" class:has-session={cell.sessions.length > 0}>
                <span>{cell.day}</span>
                {#if cell.sessions.length}
                  <span class="cal-cn">{cell.sessions.map((s) => s.cn).join('')}</span>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
        {#if totalDates === 0}
          <p class="sr-desc" style="margin-top:12px">{t('stats.calendarEmpty')}</p>
        {/if}
      </div>
    </div>

    {#if volume.length}
      <div class="set-group" use:reveal>
        <div class="sg-title" data-ui-decor="section-label">{t('stats.volumeByDay')}</div>
        <div class="set-row" style="display:block">
          {#each volume as v (v.id)}
            <div class="volume-row">
              <span class="vr-name">{dayDisplayFull(v)}</span>
              <div class="volume-bar-track">
                <div class="volume-bar-fill" style="width:{Math.round((v.sets / maxVol) * 100)}%"></div>
              </div>
              <span class="vr-meta">{t('stats.setsCount', { n: v.sets })}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if exercises.length}
      <div class="set-group" use:reveal>
        <div class="sg-title" data-ui-decor="section-label">{t('stats.exerciseTrend')}</div>
        <div class="set-row" style="display:block">
          {#each exercises as ex (ex.exId)}
            {@const pr = exercisePR(ex.exId)}
            {@const advice = progressionAdvice(ex.exId)}
            {@const history = exerciseHistory(ex.exId, 6)}
            {@const tMax = trendMax(history)}
            <div class="ex-trend-block">
              <button type="button" class="ex-row ex-row-btn" onclick={() => toggleEx(ex.exId)}>
                <span class="ex-name">
                  {ex.name}
                  {#if pr}<span class="pr-badge">PR {pr.date.slice(5)}</span>{/if}
                </span>
                <span class="ex-meta">{ex.done}/{ex.total} {t('common.sets')} · {ex.pct}%</span>
              </button>
              {#if advice.action === 'increase'}
                <div class="ex-advice-hint"><Icon name="trending-up" size={11} /> {t('stats.suggestIncrease', { delta: advice.delta })}</div>
              {/if}
              {#if expandedEx === ex.exId && history.length}
                <div class="trend-chart" role="img" aria-label={t('stats.trendAria', { name: ex.name })}>
                  {#each history as h (h.date)}
                    <div class="trend-col">
                      <div
                        class="trend-bar"
                        style="height:{Math.max(6, ((h.e1rm || h.weight || h.avgReps || 0) / tMax) * 56)}px"
                        title="{h.date}: {h.weight != null ? displayWeight(h.weight) : '—'} {unitLabel}{h.e1rm ? `\ne1RM ≈ ${displayWeight(h.e1rm)} ${unitLabel}` : ''}"
                      ></div>
                      <span class="trend-label">{h.date.slice(5)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if weights.length}
      <div class="set-group" use:reveal>
        <div class="sg-title" data-ui-decor="section-label">{t('stats.customWeights')}</div>
        <div class="set-row" style="display:block">
          {#each weights as w (w.exId)}
            {@const advice = progressionAdvice(w.exId)}
            {@const ex = findExercise(w.exId)?.ex}
            {@const pf = ex && advice.action === 'increase' ? formatProgressionWeight(ex, advice) : null}
            <div class="ex-row">
              <span class="ex-name">{w.name}</span>
              <span class="ex-meta">
                {displayWeight(w.weight)} {unitLabel.toUpperCase()} · {w.dayCn}{t('stats.daySuffix')}
                {#if pf?.delta != null}
                  <span class="meta-chip"><Icon name="trending-up" size={10} /> +{pf.delta}</span>
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="set-note" use:reveal>
      {t('stats.footnote')}
      <a class="btn-link" href="/discover/records">{t('stats.viewRecords')} <Icon name="chevron-right" size={11} /></a>
    </div>
  </div>
</section>
