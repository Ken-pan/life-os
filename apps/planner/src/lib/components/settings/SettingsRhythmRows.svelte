<script>
  import { S, updateSettings, todayKey } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import SettingsToggleRow from './SettingsToggleRow.svelte';
  import SettingsSegment from './SettingsSegment.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import {
    canMarkRestDay,
    isRestDay,
    restDaysUsedThisWeek,
  } from '$lib/domain/rhythm.js';
  import { toast } from '$lib/ui.svelte.js';

  const today = todayKey();
  const goalOptions = [1, 2, 3, 4, 5, 6, 7];

  const restToday = $derived(isRestDay(today, S.settings));
  const restUsed = $derived(restDaysUsedThisWeek(S.settings, today));

  function toggleRhythm(enabled) {
    updateSettings({ rhythmEnabled: enabled });
  }

  function togglePaused(paused) {
    updateSettings({ rhythmPaused: paused });
  }

  function setDailyGoal(goal) {
    updateSettings({ dailyGoal: goal });
  }

  function toggleRestToday() {
    const days = [...(S.settings.rhythmRestDays ?? [])];
    if (restToday) {
      updateSettings({ rhythmRestDays: days.filter((d) => d !== today) });
      toast(t('rhythm.restRemoved'));
      return;
    }
    if (!canMarkRestDay(S.settings, today)) {
      toast(t('rhythm.restLimit'), 'warn');
      return;
    }
    updateSettings({ rhythmRestDays: [...days, today] });
    toast(t('rhythm.restMarked'));
  }
</script>

<SettingsToggleRow
  label={t('rhythm.enabled')}
  desc={t('rhythm.enabledDesc')}
  checked={S.settings.rhythmEnabled !== false}
  onchange={toggleRhythm}
/>

{#if S.settings.rhythmEnabled !== false}
  <SettingsRow label={t('rhythm.dailyGoal')} desc={t('rhythm.dailyGoalDesc')}>
    <SettingsSegment ariaLabel={t('rhythm.dailyGoal')}>
      {#each goalOptions as goal}
        <button
          type="button"
          class:on={(S.settings.dailyGoal ?? 3) === goal}
          onclick={() => setDailyGoal(goal)}
        >
          {goal}
        </button>
      {/each}
    </SettingsSegment>
  </SettingsRow>

  <SettingsToggleRow
    label={t('rhythm.pause')}
    desc={t('rhythm.pauseDesc')}
    checked={Boolean(S.settings.rhythmPaused)}
    onchange={togglePaused}
  />

  <SettingsRow
    label={t('rhythm.restToday')}
    desc={t('rhythm.restTodayDesc', { used: restUsed, max: 2 })}
  >
    <button type="button" class="btn-secondary" onclick={toggleRestToday}>
      {restToday ? t('rhythm.restRemoveAction') : t('rhythm.restMarkAction')}
    </button>
  </SettingsRow>
{/if}
