<script>
  import { S, sessionStats, displayWeight, todayKey } from '$lib/state.svelte.js';
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
  import { muscleVolumeStatus } from '$lib/coachMetrics.js';
  import {
    bodyweightSeries,
    bodyweightDelta,
    latestBodyweight,
    logBodyweight,
    displayBodyweight
  } from '$lib/bodyweight.js';
  import { progressionAdvice, formatProgressionWeight } from '$lib/progression.js';
  import { findExercise } from '$lib/programRuntime.js';
  import { muscleGroupLabel } from '$lib/i18n/exerciseLabels.js';
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { LineChart, BarChart } from '@life-os/platform-web/svelte/charts';
  import BackButton from '$lib/components/BackButton.svelte';
  import { t, resolveLocale } from '$lib/i18n/index.js';
  import { dayDisplayFull } from '$lib/i18n/programLabels.js';
  import { messages } from '$lib/i18n/messages/index.js';

  let expandedEx = $state(null);
  let bwInput = $state('');

  const bwSeries = $derived(bodyweightSeries(120));
  const bwLatest = $derived(latestBodyweight());
  const bwDelta = $derived(bodyweightDelta(30));

  const bwLoggedToday = $derived(bwLatest?.date === todayKey());

  function saveBodyweight() {
    const v = parseFloat(bwInput);
    if (!(v > 0)) return;
    if (logBodyweight(v)) bwInput = '';
  }

  const overview = $derived(sessionStats());
  const weeks = $derived(sessionsByWeek(4));
  const volume = $derived(volumeByDayType(28));
  const maxVol = $derived(Math.max(...volume.map((v) => v.sets), 1));
  const muscleVol = $derived(muscleVolumeStatus(7));
  const muscleVolActive = $derived(muscleVol.some((m) => m.sets > 0));
  const mvScaleMax = $derived(Math.max(...muscleVol.map((m) => Math.max(m.sets, m.mrv)), 1));
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
      <div class="sg-title" data-ui-decor="section-label">{t('stats.bodyweight')}</div>
      <div class="set-row" style="display:block">
        <div class="bw-head">
          <div class="bw-current">
            {#if bwLatest}
              <span class="bw-val">{displayBodyweight(bwLatest.w)}</span>
              <span class="bw-unit">{unitLabel}</span>
            {:else}
              <span class="bw-val bw-empty-val">—</span>
            {/if}
          </div>
          <div class="bw-meta">
            {#if bwDelta}
              {@const up = bwDelta.deltaDisplay > 0}
              {@const flat = bwDelta.deltaDisplay === 0}
              <span class="bw-delta">
                {#if flat}
                  {t('stats.bwFlat', { days: bwDelta.days })}
                {:else}
                  <Icon name={up ? 'trending-up' : 'trending-down'} size={12} />
                  {t('stats.bwDelta', {
                    days: bwDelta.days,
                    sign: up ? '+' : '−',
                    delta: Math.abs(bwDelta.deltaDisplay),
                    unit: unitLabel
                  })}
                {/if}
              </span>
            {/if}
            {#if bwLatest}
              <span class="bw-latest">{t('stats.bwLatest', { date: bwLatest.date.slice(5) })}</span>
            {/if}
          </div>
        </div>

        <div class="bw-input-row">
          <input
            class="bw-input"
            type="number"
            inputmode="decimal"
            step="0.1"
            min="0"
            placeholder={t('stats.bwPlaceholder')}
            bind:value={bwInput}
            onkeydown={(e) => e.key === 'Enter' && saveBodyweight()}
            aria-label={t('stats.bwPlaceholder')}
          />
          <span class="bw-input-unit">{unitLabel}</span>
          <button type="button" class="bw-btn" onclick={saveBodyweight} disabled={!(parseFloat(bwInput) > 0)}>
            {bwLoggedToday ? t('stats.bwUpdate') : t('stats.bwLog')}
          </button>
        </div>

        {#if bwSeries.length >= 2}
          <div class="bw-linechart">
            <LineChart
              labels={bwSeries.map((e) => e.date.slice(5))}
              series={[
                {
                  label: t('stats.bodyweight'),
                  values: bwSeries.map((e) => displayBodyweight(e.w))
                }
              ]}
              area
              height={150}
              baseline="auto"
              format={(v) => `${Math.round(v * 10) / 10}${unitLabel}`}
              ariaLabel={t('stats.bodyweight')}
            />
          </div>
        {:else if !bwLatest}
          <p class="sr-desc" style="margin-top:12px">{t('stats.bwEmpty')}</p>
        {/if}
      </div>
    </div>

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('stats.weeklyCount')}</div>
      <div class="set-row" style="display:block;padding-bottom:14px">
        <BarChart
          labels={weeks.map((w) => w.label)}
          series={[{ label: t('stats.weeklyCount'), values: weeks.map((w) => w.count) }]}
          height={150}
          showValues="always"
          ariaLabel={t('stats.weeklyCount')}
        />
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

    <div class="set-group" use:reveal>
      <div class="sg-title" data-ui-decor="section-label">{t('stats.muscleVolume')}</div>
      <div class="set-row" style="display:block">
        <p class="mv-note">{t('stats.muscleVolumeNote')}</p>
        {#if muscleVolActive}
          {#each muscleVol as m (m.group)}
            {@const zoneL = (m.mev / mvScaleMax) * 100}
            {@const zoneR = (m.mrv / mvScaleMax) * 100}
            {@const fillW = (m.sets / mvScaleMax) * 100}
            <div class="mv-row">
              <span class="mv-name">{muscleGroupLabel(m.group)}</span>
              <div
                class="mv-track"
                role="img"
                aria-label={t('stats.mvSets', { n: m.sets }) + ' · ' + t('stats.mvTarget', { mev: m.mev, mrv: m.mrv })}
              >
                <span class="mv-zone" style="left:{zoneL}%;width:{Math.max(0, zoneR - zoneL)}%"></span>
                <span class="mv-fill mv-{m.status}" style="width:{fillW}%"></span>
              </div>
              <span class="mv-meta">
                <span class="mv-count">{m.sets}</span>
                <span class="mv-target">{t('stats.mvTarget', { mev: m.mev, mrv: m.mrv })}</span>
              </span>
            </div>
          {/each}
          <p class="mv-legend">
            <span class="mv-dot mv-low"></span>{t('stats.mvLow')}
            <span class="mv-dot mv-optimal"></span>{t('stats.mvOptimal')}
            <span class="mv-dot mv-high"></span>{t('stats.mvHigh')}
          </p>
        {:else}
          <p class="sr-desc" style="margin-top:4px">{t('stats.mvEmpty')}</p>
        {/if}
      </div>
    </div>

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

<style>
  .bw-linechart {
    margin-top: 14px;
  }
</style>
