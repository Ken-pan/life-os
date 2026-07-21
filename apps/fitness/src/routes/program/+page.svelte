<script>
  import { getProgram, rotationLabel, suppPairBadgeText } from '$lib/programRuntime.js';
  import { dayImage } from '$lib/data/program.js';
  import CoverMedia from '$lib/components/CoverMedia.svelte';
  import { todayDayId, lastSessionForDay, estMinutes, ORDER } from '$lib/state.svelte.js';
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { t } from '$lib/i18n/index.js';
  import { dayDisplayFull } from '$lib/i18n/programLabels.js';

  const program = $derived(getProgram());
  const recId = $derived(todayDayId());
  const m = $derived(program.meta);
  const extras = $derived(Object.keys(program.days).filter((id) => program.days[id].supp));
  const rotLabel = $derived(rotationLabel(program));
  const daysPerWeek = $derived(
    Number(m.daysPerWeek) > 0 ? Number(m.daysPerWeek) : ORDER().length,
  );
  const dayOrder = $derived.by(() => {
    const ids = ORDER();
    if (!recId || ids[0] === recId) return ids;
    return [recId, ...ids.filter((id) => id !== recId)];
  });
</script>

<section class="view">
  <div class="wrap">
    <div class="prog-plan-summary" use:reveal>
      <span class="tag" data-ui-decor="tag">{t('program.tag')}</span>
      <div class="prog-plan-line">
        {t('program.cycleLabel')} · {m.name}
      </div>
      <div class="prog-plan-line">
        {t('program.frequencyLabel')} · {t('program.frequencyValue', { n: daysPerWeek })}
      </div>
      <a class="btn-link prog-plan-manage" href="/program/edit">
        {t('program.managePlan')}
        <Icon name="chevron-right" size={11} />
      </a>
    </div>

    <p class="lib-intro">{t('program.intro', { rotation: rotLabel })}</p>

    <div class="prog-list">
      {#each dayOrder as did (did)}
        {@const d = program.days[did]}
        {@const ls = lastSessionForDay(did)}
        {@const isNext = did === recId}
        <a
          class="prog-day"
          class:is-next={isNext}
          href="/day/{did}"
          use:reveal
          aria-label={isNext
            ? t('program.ariaToday', {
                cn: d.cn,
                name: d.name,
                min: estMinutes(d),
                count: d.ex.length,
                last: ls ? t('program.ariaLast', { date: ls.date.slice(5) }) : ''
              })
            : undefined}
        >
          <div class="pd-media">
            <CoverMedia src={dayImage(did)} alt="" loading="lazy" size="lg" />
            <div class="pd-overlay">
              <div class="pd-head">
                <div class="pd-name">{dayDisplayFull(d)}</div>
                {#if isNext}<span class="pd-badge" aria-hidden="true">{t('program.todayPick')}</span>{/if}
              </div>
              <div class="pd-meta">
                ≈{estMinutes(d)}{t('common.min')} · {t('home.exercisesCount', { n: d.ex.length })}
                {#if ls} · {t('home.lastOn', { date: ls.date.slice(5) })}{/if}
              </div>
            </div>
          </div>
        </a>
      {/each}
    </div>

    {#if extras.length}
      <div class="sec-header" style="margin-top:30px">
        <span class="tag" data-ui-decor="tag">{t('home.extra')}</span><h2 class="sec-title">{t('home.suppTraining')}</h2><span class="sec-note">{t('home.notInRotation')}</span>
      </div>
      <p class="lib-intro">{t('home.suppIntro')}</p>
      <div class="prog-list">
        {#each extras as did (did)}
          {@const d = program.days[did]}
          {@const ls = lastSessionForDay(did)}
          <a class="prog-day" href="/day/{did}" use:reveal>
            <div class="pd-media">
              <CoverMedia src={dayImage(did)} alt="" loading="lazy" size="lg" />
              <div class="pd-overlay">
                <div class="pd-head">
                  <div class="pd-name">{dayDisplayFull(d)}</div>
                  <span class="pd-badge">{suppPairBadgeText(program, did, t)}</span>
                </div>
                <div class="pd-meta">
                  ≈{estMinutes(d)}{t('common.min')} · {t('home.exercisesCount', { n: d.ex.length })}
                  {#if ls} · {t('home.lastOn', { date: ls.date.slice(5) })}{/if}
                </div>
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .prog-plan-summary {
    margin: 0 0 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .prog-plan-line {
    font-size: 0.92rem;
    color: var(--text-2, inherit);
    opacity: 0.9;
  }

  .prog-plan-manage {
    align-self: flex-start;
    margin-top: 4px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
</style>
