<script>
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';
  import Icon from './Icon.svelte';

  /** @type {{ stats: { tasks: number, habits: number, focus: number, points: number }, onDismiss?: () => void }} */
  let { stats, onDismiss } = $props();

  const DISMISS_KEY = 'planner_today_closed';

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

<div class="today-closed" role="status" aria-live="polite">
  <div class="today-closed-orb" aria-hidden="true">
    <span class="today-closed-orb-ring today-closed-orb-ring--outer"></span>
    <span class="today-closed-orb-ring today-closed-orb-ring--inner"></span>
    <span class="today-closed-orb-core">
      <Icon name="sparkles" size={22} strokeWidth={2} />
    </span>
  </div>
  <h2 class="today-closed-title">{t('home.closedTitle')}</h2>
  <p class="today-closed-stats">
    {t('home.closedTasks', { count: stats.tasks })}
    {#if stats.habits > 0}
      · {t('home.closedHabits', { count: stats.habits })}
    {/if}
    {#if stats.focus > 0}
      · {t('home.closedFocus', { count: stats.focus })}
    {/if}
  </p>
  <div class="today-closed-actions">
    <button type="button" class="today-progress-chip" onclick={() => goto('/upcoming')}>
      {t('home.planTomorrow')}
    </button>
    <button type="button" class="today-progress-chip today-progress-chip--ghost" onclick={() => goto('/completed')}>
      {t('home.viewDoneLog')}
    </button>
    <button type="button" class="today-closed-dismiss" onclick={dismiss} aria-label={t('common.close')}>
      {t('common.close')}
    </button>
  </div>
</div>
