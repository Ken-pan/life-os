<script>
  import {
    timer,
    fmtTime,
    ringProgressFrac,
    restPhase,
    cancelTimer,
    addTime,
    subTime
  } from '$lib/timer.svelte.js';
  import Icon from '$lib/components/Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  let { variant = 'float' } = $props();

  const CIRC = 2 * Math.PI * 44;
  const dashOffset = $derived(CIRC * (1 - ringProgressFrac()));
  const phase = $derived(restPhase());
  const inFinalTen = $derived(phase === 'warn' || phase === 'countdown');

  const timeDisplay = $derived(
    inFinalTen ? String(timer.remain) : fmtTime(timer.remain)
  );

  const subText = $derived(
    timer.status === 'complete'
      ? t('timer.complete')
      : phase === 'countdown'
        ? t('timer.countdown')
        : phase === 'warn'
          ? t('timer.prepareNext')
          : timer.mode === 'work'
            ? t('timer.work')
            : t('timer.rest')
  );

  const show = $derived(
    timer.visible && (variant === 'inline' ? timer.inline : !timer.inline)
  );
  const cancelLabel = $derived(
    timer.mode === 'work' ? t('timer.cancelWork') : t('timer.cancelRest')
  );
</script>

{#if show}
  <div
    class="tw"
    class:show-done={timer.showDone}
    class:inline={variant === 'inline'}
    class:final-ten={inFinalTen}
  >
    <div class="tw-inner">
      <div class="tw-exname">{timer.name}</div>
      <div
        class="tw-ring-wrap"
        class:warn={phase === 'warn'}
        class:countdown={phase === 'countdown'}
        class:complete={timer.status === 'complete'}
        class:compact={variant === 'inline'}
      >
        <svg class="tw-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="tw-track" cx="50" cy="50" r="44" />
          <circle
            class="tw-prog"
            cx="50"
            cy="50"
            r="44"
            style="stroke-dashoffset: {dashOffset}"
          />
        </svg>
        <div class="tw-center">
          <div
            class="tw-time"
            class:warn={phase === 'warn'}
            class:countdown={phase === 'countdown'}
          >
            {timeDisplay}
          </div>
          <div class="tw-sub">{subText}</div>
          <div class="tw-done">{timer.mode === 'work' ? t('timer.workDone') : t('timer.restDone')}</div>
        </div>
      </div>
      <div class="tw-ctrls">
        <button class="tw-btn" title="-15s" aria-label={t('timer.dec15')} disabled={phase === 'complete'} onclick={() => subTime(15)}>−15</button>
        <button class="tw-btn cancel" title={cancelLabel} aria-label={cancelLabel} onclick={cancelTimer}><Icon name="x" size={14} /></button>
        <button class="tw-btn" title="+15s" aria-label={t('timer.inc15')} disabled={phase === 'complete'} onclick={() => addTime(15)}>+15</button>
      </div>
    </div>
  </div>
{/if}
