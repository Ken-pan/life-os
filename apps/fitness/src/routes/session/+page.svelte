<script>
  /**
   * Domain dock "Workout" alias — there is no /session route in Fitness IA.
   * Land on today's focus session (same as Today CTA).
   */
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { todayDayId } from '$lib/state.svelte.js'
  import { t } from '$lib/i18n/index.js'

  onMount(() => {
    const dayId = todayDayId()
    void goto(dayId ? `/day/${dayId}/focus` : '/program', { replaceState: true })
  })
</script>

<p class="redirect" role="status">{t('session.opening')}</p>

<style>
  .redirect {
    margin: 48px auto;
    text-align: center;
    color: var(--t2);
    font-size: var(--kenos-type-body, 15px);
  }
</style>
