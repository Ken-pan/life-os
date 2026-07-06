<script>
  import { t } from '$lib/i18n/index.js';
  import { formatPlannedTotal } from '$lib/domain/schedule.js';

  /** @type {{ scheduled: number, completed: number, plannedMinutes: number, unscheduled: number }} */
  let { scheduled, completed, plannedMinutes, unscheduled } = $props();
</script>

<div class="schedule-summary" aria-live="polite">
  <div class="schedule-summary-stat">
    <span class="schedule-summary-value">{scheduled}</span>
    <span class="schedule-summary-label">{t('schedule.summaryScheduled')}</span>
  </div>
  <div class="schedule-summary-stat">
    <span class="schedule-summary-value">{formatPlannedTotal(plannedMinutes, t)}</span>
    <span class="schedule-summary-label">{t('schedule.summaryPlanned')}</span>
  </div>
  <div class="schedule-summary-stat">
    <span class="schedule-summary-value">{unscheduled}</span>
    <span class="schedule-summary-label">{t('schedule.summaryUnscheduled')}</span>
  </div>
  {#if scheduled > 0 && completed === scheduled}
    <p class="schedule-summary-done">{t('schedule.summaryAllDone')}</p>
  {/if}
</div>
