<script>
  import { S, dayDone, estMinutes, todayKey, displayWeight, exUnit } from '$lib/state.svelte.js';
  import { getProgram } from '$lib/programRuntime.js';
  import { effectiveDone } from '$lib/logs.js';
  import { recordedSessionMinutes } from '$lib/session.js';
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import BackButton from '$lib/components/BackButton.svelte';
  import { t, localeTag } from '$lib/i18n/index.js';
  import { dayDisplayFull } from '$lib/i18n/programLabels.js';

  let expandedKey = $state(null);

  function recentSessions(limit = 40) {
    const seen = new Set();
    const rows = [];

    const push = (date, dayId) => {
      const key = `${date}|${dayId}`;
      if (seen.has(key)) return;
      const day = getProgram().days[dayId];
      if (!day) return;
      const dd = dayDone(date, day);
      if (dd.done === 0) return;
      seen.add(key);
      const actualMin = recordedSessionMinutes(dayId, date);
      rows.push({
        key,
        date,
        dayId,
        cn: day.cn,
        name: day.name,
        pct: dd.pct,
        done: dd.done,
        total: dd.total,
        minLabel: actualMin
          ? t('records.minutes', { n: actualMin })
          : t('records.estMinutes', { n: estMinutes(day) }),
      });
    };

    [...(S.rotation.history || [])].reverse().forEach((h) => push(h.date, h.dayId));

    Object.keys(S.logs)
      .sort()
      .reverse()
      .forEach((k) => {
        const [date, dayId] = k.split('|');
        if (Object.values(S.logs[k]).some((v) => effectiveDone(v, Infinity) > 0)) push(date, dayId);
      });

    return rows
      .sort((a, b) => b.date.localeCompare(a.date) || b.dayId.localeCompare(a.dayId))
      .slice(0, limit);
  }

  const sessions = $derived(recentSessions());

  /** 某次训练的动作明细（历史回看） */
  function sessionDetail(s) {
    const day = getProgram().days[s.dayId];
    const log = S.logs[s.key] || {};
    if (!day?.ex) return [];
    return day.ex
      .map((ex) => {
        const entry = log[ex.id];
        const done = effectiveDone(entry, ex.sets);
        const skipped = entry && typeof entry === 'object' && entry.skipped;
        if (done === 0 && !skipped) return null;
        const sets = Array.isArray(entry?.sets) ? entry.sets.filter(Boolean) : [];
        return { ex, done, skipped, sets, unit: exUnit(ex) };
      })
      .filter(Boolean);
  }

  function setChip(s, unit) {
    const reps = s.reps != null ? t('records.repsChip', { n: s.reps }) : '—';
    const w = s.weight > 0 ? ` × ${displayWeight(s.weight)} ${unit}` : '';
    const rir = s.rir != null ? ` · RIR ${s.rir}` : '';
    return reps + w + rir;
  }

  const isToday = (s) => s.date === todayKey();

  function todayHref(s) {
    return s.pct >= 100 ? `/day/${s.dayId}/summary` : `/day/${s.dayId}/focus`;
  }

  function toggleDetail(key) {
    expandedKey = expandedKey === key ? null : key;
  }

  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(localeTag(), { month: 'short', day: 'numeric', weekday: 'short' });
  }
</script>

<section class="view">
  <div class="wrap">
    <div class="page-head" use:reveal>
      <BackButton href="/discover" label={t('tools.backDiscover')} />
    </div>

    <div class="sec-header" use:reveal>
      <h2 class="sec-title">{t('records.title')}</h2>
      <span class="sec-note">{t('records.recentCount', { n: sessions.length })}</span>
    </div>

    {#if sessions.length === 0}
      <div class="lib-empty" style="display:block" use:reveal>
        {t('records.empty')}
      </div>
    {:else}
      <div class="set-group" use:reveal>
        <div class="sg-title" data-ui-decor="section-label">{t('records.recent')}</div>
        {#each sessions as s (s.key)}
          {#if isToday(s)}
            <a class="set-row record-row" href={todayHref(s)}>
              <div>
                <div class="sr-label">{dayDisplayFull({ cn: s.cn, name: s.name })}</div>
                <div class="sr-desc">{fmtDate(s.date)} · {s.minLabel} · {s.done}/{s.total} {t('common.sets')}</div>
              </div>
              <span class="record-meta">
                <span class="record-pct" class:done={s.pct >= 100}>{s.pct}%</span>
                <Icon name="chevron-right" size={14} />
              </span>
            </a>
          {:else}
            <button
              type="button"
              class="set-row record-row record-row-btn"
              aria-expanded={expandedKey === s.key}
              onclick={() => toggleDetail(s.key)}
            >
              <div>
                <div class="sr-label">{dayDisplayFull({ cn: s.cn, name: s.name })}</div>
                <div class="sr-desc">{fmtDate(s.date)} · {s.minLabel} · {s.done}/{s.total} {t('common.sets')}</div>
              </div>
              <span class="record-meta">
                <span class="record-pct" class:done={s.pct >= 100}>{s.pct}%</span>
                <Icon name={expandedKey === s.key ? 'chevron-up' : 'chevron-down'} size={14} />
              </span>
            </button>
            {#if expandedKey === s.key}
              <div class="record-detail">
                {#each sessionDetail(s) as row (row.ex.id)}
                  <div class="summary-ex-row">
                    <div class="summary-ex-head">
                      <span class="ex-name">
                        {row.ex.name}
                        {#if row.skipped}<span class="skip-badge">{t('records.skipped')}</span>{/if}
                      </span>
                      <span class="ex-meta">{row.done}/{row.ex.sets} {t('common.sets')}</span>
                    </div>
                    {#if row.sets.length}
                      <div class="summary-sets">
                        {#each row.sets as st, i (i)}
                          <span class="summary-set-chip">{i + 1}: {setChip(st, row.unit)}</span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {/each}
      </div>
    {/if}

    <div class="set-note" use:reveal>
      {t('records.footnote')}<a class="btn-link" href="/discover/stats">{t('records.viewStats')} <Icon name="chevron-right" size={11} /></a>
    </div>
  </div>
</section>

<style>
  .record-row {
    text-decoration: none;
    color: inherit;
  }
  .record-row-btn {
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }
  .record-row:hover .sr-label {
    color: var(--t1);
  }
  .record-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    color: var(--t3);
  }
  .record-pct {
    font-family: var(--mono);
    font-size: var(--text-sm);
    color: var(--t3);
  }
  .record-pct.done {
    color: var(--accent);
  }
  .record-detail {
    padding: 4px 16px 14px;
    border-bottom: 1px solid var(--line);
  }
</style>
