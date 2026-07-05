<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { S } from '$lib/state.svelte.js';
  import { getRecommendations } from '$lib/services/recommendations.js';
  import { buildAiPrompt, tasksFingerprint } from '$lib/services/aiPrompts.js';
  import { fetchAiText, isAiDisabled } from '$lib/services/aiClient.js';
  import { t } from '$lib/i18n/index.js';
  import { activeTasks, updateTask } from '$lib/domain/tasks.js';
  import { formatDateDisplay } from '$lib/domain/dateFormat.js';
  import { scheduleUndatedTasks, sortUndatedTasks } from '$lib/engine/scheduling.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { openTaskEditor, toast } from '$lib/ui.svelte.js';
  import { editTask } from '$lib/taskUi.js';
  import Icon from './Icon.svelte';

  const DISMISS_KEY = 'planner_insight_dismissed';

  let recs = $state([]);
  let aiBrief = $state('');
  let lastAiFp = $state('');
  /** @type {Set<string>} */
  let dismissed = $state(new Set());
  let showAll = $state(false);

  onMount(() => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (raw) dismissed = new Set(JSON.parse(raw));
    } catch {
      dismissed = new Set();
    }
  });

  $effect(() => {
    const tasks = activeTasks(S.tasks);
    let cancelled = false;
    getRecommendations({ tasks }).then((result) => {
      if (!cancelled) recs = result;
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (isAiDisabled()) return;
    const fp = tasksFingerprint();
    if (fp === lastAiFp) return;
    lastAiFp = fp;
    let cancelled = false;
    aiBrief = '';
    const prompt = buildAiPrompt('dailyBrief');
    fetchAiText('dailyBrief', fp, prompt)
      .then((result) => {
        if (!cancelled) aiBrief = result?.text || '';
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  const visibleRecs = $derived(
    recs.filter((rec) => {
      if (dismissed.has(rec.kind)) return false;
      if (rec.kind === 'welcome' && activeTasks(S.tasks).length > 0) return false;
      return true;
    })
  );

  const primaryRec = $derived(visibleRecs[0]);
  const extraRecs = $derived(visibleRecs.slice(1));

  function bodyFor(rec) {
    if (rec.kind === 'overdue') {
      const count = activeTasks(S.tasks).filter((t) => t.dueDate && t.dueDate < todayKey()).length;
      return t('insight.overdue_body', { count });
    }
    if (rec.kind === 'schedule') {
      const count = activeTasks(S.tasks).filter((t) => !t.dueDate).length;
      return t('insight.schedule_body', { count });
    }
    return t(`insight.${rec.body}`);
  }

  function busyDates() {
    return activeTasks(S.tasks)
      .filter((t) => t.dueDate)
      .map((t) => t.dueDate);
  }

  function persistDismissed() {
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed]));
    } catch {
      /* ignore */
    }
  }

  /** @param {string} kind */
  function dismiss(kind) {
    dismissed = new Set([...dismissed, kind]);
    persistDismissed();
  }

  /** @param {import('$lib/services/recommendations.js').Recommendation} rec */
  function handleAction(rec) {
    if (rec.kind === 'overdue' && rec.taskId) {
      const task = S.tasks.find((t) => t.id === rec.taskId);
      if (task) editTask(task);
      return;
    }
    if (rec.kind === 'schedule') {
      const results = scheduleUndatedTasks(sortUndatedTasks(activeTasks(S.tasks)), {
        busyDates: busyDates(),
        limit: 3
      });
      if (!results.length) {
        if (rec.taskId) {
          const task = S.tasks.find((t) => t.id === rec.taskId);
          if (task) editTask(task);
          else goto('/inbox');
        } else {
          goto('/inbox');
        }
        return;
      }
      for (const { task, date } of results) {
        updateTask(task.id, { dueDate: date });
      }
      if (results.length === 1) {
        toast(
          t('toast.scheduled', {
            title: results[0].task.title,
            date: formatDateDisplay(results[0].date)
          })
        );
      } else {
        toast(t('toast.scheduledBatch', { count: results.length }));
      }
      dismiss(rec.kind);
      return;
    }
    if (rec.kind === 'welcome') openTaskEditor();
    if (rec.kind === 'focus') goto('/');
  }

  /** @param {import('$lib/services/recommendations.js').Recommendation} rec */
  function actionLabel(rec) {
    if (rec.kind === 'overdue') return t('insight.actionOverdue');
    if (rec.kind === 'schedule') return t('insight.actionSchedule');
    if (rec.kind === 'welcome') return t('insight.actionWelcome');
    if (rec.kind === 'focus') return t('insight.actionFocus');
    return '';
  }

  /** @param {import('$lib/services/recommendations.js').Recommendation} rec */
  function showAction(rec) {
    return Boolean(actionLabel(rec));
  }

  const taskCount = $derived(activeTasks(S.tasks).length);
  /** @type {boolean | null} */
  let userExpanded = $state(null);
  const showExpanded = $derived(userExpanded ?? taskCount === 0);
  const suggestionCount = $derived((aiBrief ? 1 : 0) + visibleRecs.length);
  const hasSuggestions = $derived(Boolean(aiBrief || primaryRec || extraRecs.length));
</script>

{#if hasSuggestions}
  {#if showExpanded}
  <div class="insight-stack">
    {#if aiBrief}
      <article class="insight-banner insight-banner--ai">
        <div class="insight-banner-copy">
          <p class="insight-banner-title">{t('insight.ai_title')}</p>
          <p class="insight-banner-body">{aiBrief}</p>
        </div>
        <button
          type="button"
          class="insight-banner-dismiss"
          onclick={() => (aiBrief = '')}
          aria-label={t('common.close')}
        >
          <Icon name="x" size={16} strokeWidth={2} />
        </button>
      </article>
    {/if}

    {#if primaryRec}
      <article class="insight-banner insight-banner--{primaryRec.kind}">
        <div class="insight-banner-copy">
          <p class="insight-banner-title">{t(`insight.${primaryRec.title}`)}</p>
          <p class="insight-banner-body">{bodyFor(primaryRec)}</p>
        </div>
        <div class="insight-banner-actions">
          {#if showAction(primaryRec)}
            <button type="button" class="insight-banner-cta" onclick={() => handleAction(primaryRec)}>
              {actionLabel(primaryRec)}
            </button>
          {/if}
          <button
            type="button"
            class="insight-banner-dismiss"
            onclick={() => dismiss(primaryRec.kind)}
            aria-label={t('common.close')}
          >
            <Icon name="x" size={16} strokeWidth={2} />
          </button>
        </div>
      </article>
    {/if}

    {#if showAll}
      {#each extraRecs as rec (rec.kind)}
        <article class="insight-banner insight-banner--{rec.kind}">
          <div class="insight-banner-copy">
            <p class="insight-banner-title">{t(`insight.${rec.title}`)}</p>
            <p class="insight-banner-body">{bodyFor(rec)}</p>
          </div>
          <div class="insight-banner-actions">
            {#if showAction(rec)}
              <button type="button" class="insight-banner-cta" onclick={() => handleAction(rec)}>
                {actionLabel(rec)}
              </button>
            {/if}
            <button
              type="button"
              class="insight-banner-dismiss"
              onclick={() => dismiss(rec.kind)}
              aria-label={t('common.close')}
            >
              <Icon name="x" size={16} strokeWidth={2} />
            </button>
          </div>
        </article>
      {/each}
    {:else if extraRecs.length}
      <button type="button" class="insight-more-btn" onclick={() => (showAll = true)}>
        {t('insight.moreSuggestions', { count: extraRecs.length })}
      </button>
    {/if}
  </div>
  {:else}
    <button type="button" class="insight-summary" onclick={() => (userExpanded = true)}>
      <Icon name="sparkles" size={16} strokeWidth={2} />
      <span>{t('insight.summary', { count: suggestionCount })}</span>
      <Icon name="chevron-down" size={16} strokeWidth={2} />
    </button>
  {/if}
{/if}
