<script>
  import { getProgram, rotationLabel } from '$lib/programRuntime.js'
  import { dayImage } from '$lib/data/program.js'
  import CoverMedia from '$lib/components/CoverMedia.svelte'
  import {
    S,
    todayKey,
    todayDayId,
    dayDone,
    lastSessionForDay,
    sessionStats,
    estMinutes,
    ORDER,
  } from '$lib/state.svelte.js'
  import { effectiveDone } from '$lib/logs.js'
  import { reveal } from '$lib/actions/reveal.js'
  import { deloadAdvice, markDeloadDone } from '$lib/phase.js'

  import { coachBrief } from '$lib/coach.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import KnowledgeTrigger from '$lib/components/KnowledgeTrigger.svelte'
  import KnowledgeCarousel from '$lib/components/KnowledgeCarousel.svelte'
  import { t, localeTag } from '$lib/i18n/index.js'
  import {
    dayDisplayName,
    dayDecorEn,
    dayDisplayFull,
  } from '$lib/i18n/programLabels.js'

  const program = $derived(getProgram())
  const recId = $derived(todayDayId())
  const day = $derived(program.days[recId])
  const m = $derived(program.meta)
  const rotLabel = $derived(rotationLabel(program))
  const stats = $derived(sessionStats())
  const dd = $derived(dayDone(todayKey(), day))

  const hist = $derived.by(() => {
    const seen = new Set()
    const rows = []
    const push = (date, dayId) => {
      const key = `${date}|${dayId}`
      if (seen.has(key) || !program.days[dayId]) return
      seen.add(key)
      rows.push({ date, dayId })
    }
    Object.keys(S.logs).forEach((k) => {
      const [date, dayId] = k.split('|')
      if (Object.values(S.logs[k]).some((v) => effectiveDone(v, Infinity) > 0))
        push(date, dayId)
    })
    ;(S.rotation.history || []).forEach((h) => push(h.date, h.dayId))
    return rows
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.dayId.localeCompare(a.dayId),
      )
      .slice(0, 6)
  })

  const lastHist = $derived(hist.length ? hist[0] : null)

  const dateLabel = $derived(
    new Date().toLocaleDateString(localeTag(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
  )

  const whenLabel = $derived(
    stats.daysSince === 0
      ? t('common.today')
      : t('common.daysAgo', { n: stats.daysSince }),
  )

  const reason = $derived.by(() => {
    if (lastHist) {
      return t('home.reasonRotated', {
        lastDay: program.days[lastHist.dayId].cn,
        when: whenLabel,
        rotLabel,
        todayDay: day.cn,
      })
    }
    return t('home.reasonFresh', { todayDay: day.cn })
  })

  const lastLabel = $derived.by(() => {
    if (!lastHist) return t('common.noRecord')
    return t('home.lastLabel', {
      day: program.days[lastHist.dayId].cn,
      when: whenLabel,
    })
  })

  const extras = $derived(
    Object.keys(program.days).filter((id) => program.days[id].supp),
  )
  const coach = $derived(coachBrief())
  const totalSets = $derived(day.ex.reduce((a, e) => a + e.sets, 0))
  const deload = $derived(deloadAdvice())
</script>

<section class="view">
  <div class="wrap">
    <div class="life-os-grid life-os-grid--split hero">
      <div class="life-os-grid__main hero-copy" use:reveal>
        <p class="eyebrow">
          {dateLabel}<span data-ui-decor="meta-strip"> · {m.name}</span>
        </p>
        <div class="hero-kicker" data-ui-decor="kicker">
          {t('home.todayPick')}
        </div>
        <h1 class="hero-title">
          {#if dayDecorEn(day)}
            {dayDisplayName(day)}
            <span
              class="accent decor-en"
              data-ui-decor="en-accent"
              aria-hidden="true">{dayDecorEn(day)}</span
            >
          {:else}
            <span class="accent">{dayDisplayName(day)}</span>
          {/if}
        </h1>
        <p class="hero-sub">{day.subtitle}</p>
        <div class="hero-status">
          {t('home.lastSession')} <b>{lastLabel}</b> · {t('home.weekCount', {
            n: stats.week7,
          })} · {t('home.totalCount', { n: stats.total })}
          · <a class="btn-link" href="/discover/stats">{t('home.statsLink')}</a>
        </div>
      </div>
      <div class="life-os-grid__aside hero-media" use:reveal={{ delay: 60 }}>
        <CoverMedia
          src={dayImage(recId)}
          alt={t('home.trainingCoverAlt', { day: day.cn })}
          loading="eager"
          size="lg"
        />
        <div class="hm-label">
          <div>
            <div class="hm-kicker" data-ui-decor="kicker">
              {t('home.todayWorkout')}
            </div>
            <div class="hm-title">{dayDisplayName(day)}</div>
          </div>
          <div class="hm-time">≈ {estMinutes(day)} {t('common.min')}</div>
        </div>
      </div>
    </div>

    {#if deload.shouldDeload}
      <div class="callout deload-callout" use:reveal>
        <span class="co-label" data-ui-decor="callout-label"
          >{t('home.deloadLabel')}</span
        >
        <KnowledgeTrigger entryId="deload" />
        {deload.reason}。{t('home.deloadHint')}
        <button
          type="button"
          class="btn-link deload-mark"
          onclick={() => markDeloadDone()}>{t('home.deloadMark')}</button
        >
      </div>
    {/if}

    {#if coach.length}
      <div class="coach-panel" use:reveal>
        <div class="coach-head">
          <div class="coach-head-copy">
            <div class="coach-label">{t('home.coach')}</div>
            <div class="coach-sub">{t('home.coachSub')}</div>
          </div>
        </div>
        {#each coach as tip (tip.id)}
          <div
            class="coach-tip"
            class:warn={tip.tone === 'warn'}
            class:success={tip.tone === 'success'}
            class:action={tip.tone === 'action'}
          >
            <div class="coach-tip-title">{tip.title}</div>
            <div class="coach-tip-body">{tip.body}</div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="cycle-progress" aria-label={t('home.cycleOrder')} use:reveal>
      <div class="cycle-head">
        <div class="cycle-label" data-ui-decor="section-label">
          {t('home.cycleOrder')}
          <KnowledgeTrigger entryId="rotation" iconOnly />
        </div>
        <div class="cycle-next">{t('home.cycleToday', { day: day.cn })}</div>
      </div>
      <div class="cycle-track">
        {#each ORDER() as did (did)}
          {@const d = program.days[did]}
          {@const ls = lastSessionForDay(did)}
          <div
            class="cycle-step"
            class:is-next={did === recId}
            class:is-done={ls}
          >
            <span class="cycle-mark"></span>
            <span class="cycle-text">
              <span class="cycle-cn">{dayDisplayName(d)}</span>
              {#if dayDecorEn(d)}
                <span
                  class="cycle-en decor-en"
                  data-ui-decor="en-accent"
                  aria-hidden="true">{dayDecorEn(d)}</span
                >
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </div>

    <div class="today-card" use:reveal>
      <div class="tc-content">
        <div class="tc-label">{t('home.trainingDetail')}</div>
        <div class="callout" style="margin:0 0 14px">
          {@html reason}
          <KnowledgeTrigger entryId="frequency" class="knowledge-inline" />
        </div>
        <div class="tc-meta">
          <span><b>{day.ex.length}</b>{t('home.exercises')}</span>
          <span><b>{totalSets}</b>{t('home.workingSets')}</span>
          <span>≈ <b>{estMinutes(day)}</b> {t('common.min')}</span>
          <span>
            {t('home.volume')} · <b>{day.vol || ''}</b>
            <KnowledgeTrigger entryId="volume-landmarks" />
          </span>
        </div>
        <div class="tc-progress">
          <div class="tc-bar"><div style="width:{dd.pct}%"></div></div>
          <div class="tc-pct">
            {t('home.todayProgress', {
              done: dd.done,
              total: dd.total,
              pct: dd.pct,
            })}
          </div>
        </div>
        <a class="btn-start" href="/day/{recId}/focus"
          ><Icon name="play" size={14} />
          {dd.done > 0
            ? t('home.continueWorkout')
            : t('home.startWorkout', { day: day.cn })}</a
        >
      </div>
    </div>

    <KnowledgeCarousel dayId={recId} />

    <div class="sec-header">
      <span class="tag" data-ui-decor="tag">{t('home.manualPick')}</span>
      <h2 class="sec-title">{t('home.switchDay')}</h2>
    </div>
    <div class="life-os-grid week-rail">
      {#each ORDER() as did (did)}
        {@const d = program.days[did]}
        <a class="wr-day" class:is-today={did === recId} href="/day/{did}">
          {#if dayDecorEn(d)}
            <span
              class="wr-dow decor-en"
              data-ui-decor="en-accent"
              aria-hidden="true">{dayDecorEn(d)}</span
            >
          {/if}
          <span class="wr-tag">{dayDisplayName(d)}</span>
          <span class="wr-dot" class:part={did === recId}></span>
        </a>
      {/each}
    </div>

    {#if extras.length}
      <div class="sec-header">
        <span class="tag" data-ui-decor="tag">{t('home.extra')}</span>
        <h2 class="sec-title">{t('home.suppTraining')}</h2>
        <span class="sec-note">{t('home.notInRotation')}</span>
      </div>
      <p class="lib-intro">{t('home.suppIntro')}</p>
      <div class="prog-list">
        {#each extras as eid (eid)}
          {@const d = program.days[eid]}
          {@const ls = lastSessionForDay(eid)}
          <a class="prog-day" href="/day/{eid}">
            <div class="pd-media">
              <CoverMedia src={dayImage(eid)} alt="" loading="lazy" size="lg" />
              <div class="pd-overlay">
                <div class="pd-head">
                  <div class="pd-name">{dayDisplayFull(d)}</div>
                  <span class="pd-badge">{t('home.anytime')}</span>
                </div>
                <div class="pd-meta">
                  ≈{estMinutes(d)}{t('common.min')} · {t(
                    'home.exercisesCount',
                    { n: d.ex.length },
                  )}
                  {#if ls}
                    · {t('home.lastOn', { date: ls.date.slice(5) })}{/if}
                </div>
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}

    {#if hist.length}
      <div class="sec-header">
        <span class="tag" data-ui-decor="tag">{t('home.records')}</span>
        <h2 class="sec-title">{t('home.recentWorkouts')}</h2>
        <a class="sec-note btn-link" href="/discover/records"
          >{t('home.allRecords')}</a
        >
      </div>
      <div class="prog-list">
        {#each hist as h, i (h.date + h.dayId + i)}
          {@const d = program.days[h.dayId]}
          {#if d}
            {@const ddo = dayDone(h.date, d)}
            <a
              class="prog-day prog-day--row"
              href={h.date === todayKey()
                ? ddo.pct >= 100
                  ? `/day/${h.dayId}/summary`
                  : `/day/${h.dayId}/focus`
                : '/discover/records'}
            >
              <span class="pd-idx">{h.date.slice(5)}</span>
              <div class="pd-body">
                <div class="pd-name">{dayDisplayFull(d)}</div>
                <div class="pd-meta">
                  {t('home.setsDone', {
                    done: ddo.done,
                    total: ddo.total,
                    pct: ddo.pct,
                  })}
                </div>
              </div>
              {#if ddo.pct >= 100}
                <span class="pd-done"><Icon name="check" size={11} /></span>
              {:else}
                <Icon name="chevron-right" size={18} class="pd-chev" />
              {/if}
            </a>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</section>
