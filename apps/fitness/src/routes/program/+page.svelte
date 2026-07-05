<script>
  import { getProgram, rotationLabel } from '$lib/programRuntime.js';
  import { dayImage } from '$lib/data/program.js';
  import CoverMedia from '$lib/components/CoverMedia.svelte';
  import { todayDayId, lastSessionForDay, estMinutes, ORDER } from '$lib/state.svelte.js';
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '$lib/components/Icon.svelte';
  import KnowledgeTrigger from '$lib/components/KnowledgeTrigger.svelte';
  import { t } from '$lib/i18n/index.js';
  import { dayDisplayFull } from '$lib/i18n/programLabels.js';

  const program = $derived(getProgram());
  const recId = $derived(todayDayId());
  const m = $derived(program.meta);
  const extras = $derived(Object.keys(program.days).filter((id) => program.days[id].supp));
  const rotLabel = $derived(rotationLabel(program));
</script>

<section class="view">
  <div class="wrap">
    <div class="sec-header" use:reveal>
      <span class="tag" data-ui-decor="tag">{t('program.tag')}</span>
      <span class="sec-note">{m.name}</span>
      <KnowledgeTrigger entryId="volume-landmarks" />
      <KnowledgeTrigger entryId="mesocycle" />
    </div>
    <p class="lib-intro">
      {t('program.intro', { rotation: rotLabel })}
      <KnowledgeTrigger entryId="rotation" />
      <KnowledgeTrigger entryId="frequency" />
      <a class="btn-link" href="/program/edit" style="margin-left:8px">{t('program.customEdit')} <Icon name="chevron-right" size={11} /></a>
    </p>

    <div class="prog-list">
      {#each ORDER() as did (did)}
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
