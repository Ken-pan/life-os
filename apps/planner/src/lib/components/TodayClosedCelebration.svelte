<script>
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';
  import Icon from '@life-os/platform-web/svelte/icon';

  /** @type {{
    stats: { tasks: number, habits: number, focus: number, points: number },
    variant?: 'clean' | 'partial',
    unscheduledCount?: number,
    onDismiss?: () => void,
    onOpenCalendar?: () => void
  }} */
  let {
    stats,
    variant = 'clean',
    unscheduledCount = 0,
    onDismiss,
    onOpenCalendar,
  } = $props();

  const DISMISS_KEY = 'planner_today_closed';
  const isPartial = $derived(variant === 'partial');

  $effect(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, todayKey());
    } catch {
      /* ignore */
    }
  });

  function dismiss() {
    onDismiss?.();
  }
</script>

<div class="today-closed" class:today-closed--partial={isPartial} role="status" aria-live="polite">
  <div class="today-closed-orb" aria-hidden="true">
    <span class="today-closed-orb-ring today-closed-orb-ring--outer"></span>
    <span class="today-closed-orb-ring today-closed-orb-ring--inner"></span>
    <span class="today-closed-orb-core">
      <Icon name="sparkles" size={22} strokeWidth={2} />
    </span>
  </div>
  <h2 class="today-closed-title">
    {isPartial ? t('home.closedPartialTitle') : t('home.closedTitle')}
  </h2>
  <p class="today-closed-stats">
    {#if isPartial}
      {t('home.closedPartialStats', { done: stats.tasks, count: unscheduledCount })}
    {:else}
      {t('home.closedTasks', { count: stats.tasks })}
      {#if stats.habits > 0}
        · {t('home.closedHabits', { count: stats.habits })}
      {/if}
      {#if stats.focus > 0}
        · {t('home.closedFocus', { count: stats.focus })}
      {/if}
    {/if}
  </p>
  <div class="today-closed-actions">
    {#if isPartial}
      <button type="button" class="today-progress-chip today-progress-chip--action" onclick={() => onOpenCalendar?.()}>
        {t('home.scheduleRemaining')}
      </button>
      <button type="button" class="today-progress-chip today-progress-chip--ghost" onclick={() => goto('/completed')}>
        {t('home.viewDoneLog')}
      </button>
    {:else}
      <button type="button" class="today-progress-chip" onclick={() => goto('/upcoming')}>
        {t('home.planTomorrow')}
      </button>
      <button type="button" class="today-progress-chip today-progress-chip--ghost" onclick={() => goto('/completed')}>
        {t('home.viewDoneLog')}
      </button>
    {/if}
    <button type="button" class="today-closed-dismiss" onclick={dismiss} aria-label={t('common.close')}>
      {t('common.close')}
    </button>
  </div>
</div>
