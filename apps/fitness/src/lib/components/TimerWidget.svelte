<script>
  import {
    timer,
    fmtTime,
    ringProgressFrac,
    restPhase,
    cancelTimer,
    skipTimer,
    togglePause,
    addTime,
    subTime,
  } from '$lib/timer.svelte.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'

  let { variant = 'float' } = $props()

  const CIRC = 2 * Math.PI * 44
  const dashOffset = $derived(CIRC * (1 - ringProgressFrac()))
  const phase = $derived(restPhase())
  const inFinalTen = $derived(phase === 'warn' || phase === 'countdown')
  const isRest = $derived(timer.mode === 'rest')
  const canAdjust = $derived(phase !== 'complete' && !timer.showDone)

  const timeDisplay = $derived(
    timer.paused
      ? fmtTime(timer.remain)
      : inFinalTen
        ? String(timer.remain)
        : fmtTime(timer.remain),
  )

  const subText = $derived(
    timer.status === 'complete'
      ? t('timer.complete')
      : timer.paused
        ? t('timer.paused')
        : phase === 'countdown'
          ? t('timer.countdown')
          : phase === 'warn'
            ? t('timer.prepareNext')
            : timer.mode === 'work'
              ? t('timer.work')
              : t('timer.rest'),
  )

  const show = $derived(
    timer.visible && (variant === 'inline' ? timer.inline : !timer.inline),
  )
  const skipLabel = $derived(
    isRest ? t('timer.skipRest') : t('timer.cancelWork'),
  )
  const pauseLabel = $derived(
    timer.paused ? t('timer.resume') : t('timer.pause'),
  )

  function onPrimaryAction() {
    if (isRest) skipTimer()
    else cancelTimer()
  }
</script>

{#if show}
  <div
    class="tw"
    class:show-done={timer.showDone}
    class:inline={variant === 'inline'}
    class:final-ten={inFinalTen}
    class:paused={timer.paused}
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
          <div class="tw-done">
            {timer.mode === 'work' ? t('timer.workDone') : t('timer.restDone')}
          </div>
        </div>
      </div>
      <div class="tw-ctrls">
        <button
          type="button"
          class="tw-btn"
          title="-15s"
          aria-label={t('timer.dec15')}
          disabled={!canAdjust}
          onclick={() => subTime(15)}>−15</button
        >
        <button
          type="button"
          class="tw-btn"
          class:on={timer.paused}
          title={pauseLabel}
          aria-label={pauseLabel}
          disabled={!canAdjust}
          onclick={togglePause}
        >
          <Icon name={timer.paused ? 'play' : 'pause'} size={14} />
        </button>
        <button
          type="button"
          class="tw-btn"
          class:skip={isRest}
          class:cancel={!isRest}
          title={skipLabel}
          aria-label={skipLabel}
          disabled={!canAdjust}
          onclick={onPrimaryAction}
        >
          <Icon name={isRest ? 'check' : 'x'} size={14} />
        </button>
        <button
          type="button"
          class="tw-btn"
          title="+15s"
          aria-label={t('timer.inc15')}
          disabled={!canAdjust}
          onclick={() => addTime(15)}>+15</button
        >
      </div>
    </div>
  </div>
{/if}
