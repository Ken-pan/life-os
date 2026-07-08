<script>
  import { S, uid } from '$lib/state.svelte.js';
  import { createTask, updateTask, deleteTask, addSubtask } from '$lib/domain/tasks.js';
  import { taskEditor, closeTaskEditor, toast } from '$lib/ui.svelte.js';
  import { fetchTaskBreakdown, isAiDisabled } from '$lib/services/aiClient.js';
  import { t, listLabel } from '$lib/i18n/index.js';
  import { SYSTEM_LIST_INBOX, RECURRENCE_RULES, REMINDER_PRESETS } from '$lib/types.js';
  import { TASK_KINDS, normalizeTaskKind } from '$lib/domain/taskKind.js';
  import { SCHEDULE_DURATIONS, formatDurationLabel } from '$lib/domain/schedule.js';
  import { lockScroll, unlockScroll } from '$lib/scrollLock.js';
  import { createImeGuard } from '@life-os/theme';
  import DateField from './DateField.svelte';
  import TimeField from './TimeField.svelte';
  import Icon from '@life-os/platform-web/svelte/icon';

  const ime = createImeGuard();

  let subtaskDraft = $state('');
  let aiBusy = $state(false);
  let showAdvanced = $state(false);
  /** @type {HTMLInputElement | null} */
  let titleInput = $state(null);

  const draft = $derived(taskEditor.draft);
  const isNew = $derived(!taskEditor.taskId);
  const recurrenceRule = $derived(draft?.recurrence?.rule || 'none');

  const needsAdvancedOpen = $derived.by(() => {
    if (!draft) return false;
    return (
      Boolean(draft.notes?.trim()) ||
      draft.reminderMinutes != null ||
      Boolean(draft.recurrence) ||
      (draft.priority ?? 0) > 0 ||
      draft.tags.length > 0 ||
      draft.subtasks.length > 0 ||
      normalizeTaskKind(draft.meta?.kind) !== 'standard' ||
      draft.scheduledDate ||
      draft.scheduledStart ||
      draft.durationMinutes
    );
  });

  $effect(() => {
    if (taskEditor.open) {
      showAdvanced = needsAdvancedOpen;
      lockScroll();
      if (!taskEditor.taskId) {
        // 新建任务：自动聚焦标题，移动端直接弹出键盘
        requestAnimationFrame(() => titleInput?.focus());
      }
      return () => unlockScroll();
    }
    showAdvanced = false;
  });

  function setRecurrenceRule(rule) {
    if (!draft) return;
    if (rule === 'none') {
      draft.recurrence = null;
      return;
    }
    draft.recurrence = {
      rule,
      interval: draft.recurrence?.interval || 1,
      until: draft.recurrence?.until || null,
      seriesId: draft.recurrence?.seriesId || null
    };
  }

  function save() {
    if (!draft?.title?.trim()) return;
    const payload = {
      title: draft.title,
      notes: draft.notes,
      listId: draft.listId,
      priority: draft.priority,
      dueDate: draft.dueDate,
      dueTime: draft.dueTime || null,
      scheduledDate: draft.scheduledDate || null,
      scheduledStart: draft.scheduledStart || null,
      durationMinutes: draft.durationMinutes ?? null,
      reminderMinutes: draft.reminderMinutes ?? null,
      recurrence: draft.recurrence,
      tags: [...draft.tags],
      subtasks: JSON.parse(JSON.stringify(draft.subtasks)),
      meta: {
        ...(draft.meta || {}),
        kind: normalizeTaskKind(draft.meta?.kind),
      },
    };
    if (isNew) {
      createTask({
        ...payload,
        listId: payload.listId || S.settings.defaultListId || SYSTEM_LIST_INBOX
      });
    } else {
      updateTask(taskEditor.taskId, payload);
    }
    closeTaskEditor();
  }

  function remove() {
    if (!taskEditor.taskId) return;
    deleteTask(taskEditor.taskId);
    toast(t('toast.deleted'));
    closeTaskEditor();
  }

  function addSub() {
    if (!subtaskDraft.trim() || !draft) return;
    if (isNew) {
      draft.subtasks = [
        ...draft.subtasks,
        { id: uid(), title: subtaskDraft.trim(), done: false }
      ];
    } else {
      addSubtask(taskEditor.taskId, subtaskDraft);
      const live = S.tasks.find((t) => t.id === taskEditor.taskId);
      if (live) draft.subtasks = JSON.parse(JSON.stringify(live.subtasks));
    }
    subtaskDraft = '';
  }

  async function aiSplit() {
    if (!draft?.title?.trim() || aiBusy || isAiDisabled()) return;
    aiBusy = true;
    try {
      const lines = await fetchTaskBreakdown(draft.title.trim());
      if (!lines.length) {
        toast(t('toast.aiUnavailable'), 'warn');
        return;
      }
      if (isNew) {
        draft.subtasks = lines.map((title) => ({ id: crypto.randomUUID(), title, done: false }));
      } else {
        for (const title of lines) addSubtask(taskEditor.taskId, title);
        const live = S.tasks.find((t) => t.id === taskEditor.taskId);
        if (live && draft) draft.subtasks = JSON.parse(JSON.stringify(live.subtasks));
      }
      showAdvanced = true;
      toast(t('toast.aiSplitDone'));
    } catch {
      toast(t('toast.aiUnavailable'), 'warn');
    } finally {
      aiBusy = false;
    }
  }

  const priorityOptions = [
    { v: 0, label: t('task.p0') },
    { v: 1, label: t('task.p1') },
    { v: 2, label: t('task.p2') },
    { v: 3, label: t('task.p3') },
    { v: 4, label: t('task.p4') }
  ];

  function toggleDraftSubtask(subId) {
    if (!draft) return;
    draft.subtasks = draft.subtasks.map((s) =>
      s.id === subId ? { ...s, done: !s.done } : s
    );
  }

  function reminderLabel(minutes) {
    if (minutes === 0) return t('reminder.atTime');
    if (minutes === 1440) return t('reminder.beforeDay');
    return t('reminder.before', { min: minutes });
  }

  const reminderOptions = $derived([
    { v: null, label: t('reminder.off') },
    ...REMINDER_PRESETS.map((m) => ({
      v: m,
      label: reminderLabel(m)
    }))
  ]);

  const canRemind = $derived(Boolean(draft?.dueDate));
</script>

{#if taskEditor.open && draft}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="sheet-bg" role="presentation" onclick={(e) => e.target === e.currentTarget && closeTaskEditor()}>
    <div class="sheet task-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2 id="task-editor-title" class="sheet-title">{isNew ? t('common.add') : t('common.edit')}</h2>
        <button type="button" class="sheet-close" onclick={closeTaskEditor} aria-label={t('common.close')}>
          <Icon name="x" size={20} strokeWidth={1.75} />
        </button>
      </div>

      <div class="field field--title">
        <label for="task-title">{t('task.title')}</label>
        <input
          id="task-title"
          class="task-editor-title-input"
          bind:this={titleInput}
          bind:value={draft.title}
          enterkeyhint="done"
          oncompositionstart={ime.compositionstart}
          oncompositionend={(e) => ime.compositionend(e)}
          oncompositioncancel={ime.compositioncancel}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              if (ime.isComposing(e)) return;
              e.preventDefault();
              save();
            }
          }}
        />
      </div>

      <div class="field-row">
        <div class="field">
          <label for="task-due">{t('task.dueDate')}</label>
          <DateField
            id="task-due"
            compact
            value={draft.dueDate}
            onchange={(next) => {
              draft.dueDate = next;
              if (!draft.dueDate) draft.reminderMinutes = null;
            }}
          />
        </div>
        <div class="field">
          <label for="task-time">{t('task.dueTime')}</label>
          <TimeField
            id="task-time"
            value={draft.dueTime}
            onchange={(next) => {
              draft.dueTime = next;
            }}
          />
        </div>
      </div>

      <button
        type="button"
        class="sheet-advanced-toggle"
        aria-expanded={showAdvanced}
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        <span>{t('task.moreOptions')}</span>
        <Icon name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={18} strokeWidth={2} />
      </button>

      {#if showAdvanced}
        <div class="sheet-advanced">
          <div class="field">
            <label for="task-notes">{t('task.notes')}</label>
            <textarea id="task-notes" bind:value={draft.notes} rows="3"></textarea>
          </div>

          <div class="field">
            <span class="field-label">{t('task.reminder')}</span>
            {#if !canRemind}
              <p class="field-hint">{t('reminder.needDueDate')}</p>
            {:else}
              <div class="seg seg-scroll">
                {#each reminderOptions as opt}
                  <button
                    type="button"
                    class:on={draft.reminderMinutes === opt.v}
                    onclick={() => (draft.reminderMinutes = opt.v)}
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
              {#if draft.reminderMinutes != null && !draft.dueTime}
                <p class="field-hint">{t('reminder.defaultTime')}</p>
              {/if}
            {/if}
          </div>

          <div class="field">
            <span class="field-label">{t('task.recurrence')}</span>
            <div class="seg seg-scroll">
              {#each RECURRENCE_RULES as rule}
                <button type="button" class:on={recurrenceRule === rule} onclick={() => setRecurrenceRule(rule)}>
                  {t(`recurrence.${rule}`)}
                </button>
              {/each}
            </div>
            {#if draft.recurrence && recurrenceRule !== 'none'}
              <label for="recurrence-until" class="field-label">{t('recurrence.until')}</label>
              <DateField
                id="recurrence-until"
                value={draft.recurrence.until}
                onchange={(next) => {
                  if (draft.recurrence) draft.recurrence.until = next;
                }}
              />
              {#if !draft.recurrence.until}
                <p class="field-hint">{t('recurrence.untilHint')}</p>
              {/if}
            {/if}
          </div>

          <div class="field">
            <span class="field-label">{t('schedule.sectionTitle')}</span>
            <p class="field-hint">{t('schedule.sectionHint')}</p>
            <label for="task-scheduled-date" class="field-label">{t('schedule.planDate')}</label>
            <DateField
              id="task-scheduled-date"
              value={draft.scheduledDate}
              onchange={(next) => {
                draft.scheduledDate = next;
                if (!next) {
                  draft.scheduledStart = null;
                  draft.durationMinutes = null;
                }
              }}
            />
            <label for="task-scheduled-start" class="field-label">{t('schedule.startTime')}</label>
            <input
              id="task-scheduled-start"
              type="time"
              value={draft.scheduledStart || ''}
              disabled={!draft.scheduledDate}
              oninput={(e) => {
                draft.scheduledStart = e.currentTarget.value || null;
              }}
            />
            <span class="field-label">{t('schedule.duration')}</span>
            <div class="seg seg-scroll">
              {#each SCHEDULE_DURATIONS as mins}
                <button
                  type="button"
                  class:on={draft.durationMinutes === mins}
                  disabled={!draft.scheduledDate}
                  onclick={() => (draft.durationMinutes = mins)}
                >
                  {formatDurationLabel(mins, t)}
                </button>
              {/each}
            </div>
          </div>

          <div class="field">
            <span class="field-label">{t('task.kind')}</span>
            <div class="seg seg-scroll">
              {#each TASK_KINDS as kind}
                <button
                  type="button"
                  class:on={normalizeTaskKind(draft.meta?.kind) === kind}
                  onclick={() => {
                    draft.meta = { ...(draft.meta || {}), kind };
                  }}
                >
                  {t(`task.kind${kind[0].toUpperCase()}${kind.slice(1)}`)}
                </button>
              {/each}
            </div>
          </div>

          <div class="field">
            <label for="task-priority">{t('task.priority')}</label>
            <select id="task-priority" bind:value={draft.priority}>
              {#each priorityOptions as opt}
                <option value={opt.v}>{opt.label}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <label for="task-list">{t('task.list')}</label>
            <select id="task-list" bind:value={draft.listId}>
              {#each S.lists.filter((l) => !l.deletedAt) as list (list.id)}
                <option value={list.id}>{listLabel(list)}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <label for="task-tags">{t('task.tags')}</label>
            <input
              id="task-tags"
              value={draft.tags.join(', ')}
              oninput={(e) => {
                draft.tags = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean);
              }}
              placeholder="work, personal"
            />
          </div>

          {#if !isNew || draft.subtasks.length}
            <div class="field">
              <span class="field-label">{t('task.subtasks')}</span>
              {#each draft.subtasks as sub (sub.id)}
                <div class="subtask-row">
                  <input type="checkbox" checked={sub.done} onchange={() => toggleDraftSubtask(sub.id)} />
                  <span class:done-text={sub.done}>{sub.title}</span>
                </div>
              {/each}
              <div class="quick-add quick-add--mobile" style="margin-top:8px">
                <input bind:value={subtaskDraft} placeholder={t('task.addSubtask')} />
                <button type="button" class="btn-secondary" onclick={addSub}>{t('common.add')}</button>
              </div>
            </div>
          {/if}

          <button type="button" class="btn-secondary ai-split-btn" disabled={aiBusy || !draft.title?.trim()} onclick={aiSplit}>
            {aiBusy ? t('task.aiSplitting') : t('task.aiSplit')}
          </button>
        </div>
      {/if}

      <div class="sheet-actions">
        <button type="button" class="btn-secondary" onclick={closeTaskEditor}>{t('common.cancel')}</button>
        {#if !isNew}
          <button type="button" class="btn-secondary" onclick={remove}>{t('common.delete')}</button>
        {/if}
        <button type="button" class="btn-primary" onclick={save}>{t('common.save')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .field-label {
    display: block;
    font-family: var(--mono);
    font-size: var(--text-xs);
    color: var(--t3);
    letter-spacing: .06em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .field-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--t3);
  }
  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .ai-split-btn {
    width: 100%;
    margin-bottom: 12px;
  }
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 16px;
  }
  .sheet-header .sheet-title {
    margin: 0;
  }
  .sheet-close {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: var(--tap-min);
    height: var(--tap-min);
    border-radius: var(--radius-control);
    color: var(--t2);
  }
  .sheet-close:hover {
    background: color-mix(in srgb, var(--t1) 6%, transparent);
    color: var(--t1);
  }
  .sheet-advanced-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: var(--tap-min);
    margin-bottom: 12px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-control);
    color: var(--t2);
    font-size: var(--text-md);
    font-weight: 500;
  }
  .sheet-advanced-toggle:hover {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
    color: var(--t1);
  }
  .sheet-advanced {
    display: flex;
    flex-direction: column;
  }

  @media (--life-os-mobile) {
    :global(.task-editor-sheet) {
      border-radius: 28px 28px 0 0;
      padding: 12px 24px calc(16px + env(safe-area-inset-bottom));
      max-height: 80dvh;
      scroll-padding-bottom: calc(72px + env(safe-area-inset-bottom));
    }

    :global(.task-editor-sheet) .sheet-handle {
      width: 36px;
      height: 5px;
      margin-bottom: 12px;
    }

    :global(.task-editor-sheet) .field--title {
      margin-bottom: 12px;
    }

    :global(.task-editor-sheet) .task-editor-title-input {
      min-height: 60px;
      height: 60px;
      padding: 0 14px;
      line-height: 1.35;
    }

    :global(.task-editor-sheet .date-display),
    :global(.task-editor-sheet .time-display) {
      min-height: 60px;
      height: 60px;
    }

    :global(.task-editor-sheet) .field {
      margin-bottom: 14px;
    }

    :global(.task-editor-sheet) input:focus,
    :global(.task-editor-sheet) textarea:focus,
    :global(.task-editor-sheet) select:focus {
      outline: 2px solid color-mix(in srgb, var(--accent) 42%, transparent);
      outline-offset: 1px;
    }

    :global(.task-editor-sheet) .field-row {
      gap: 12px;
      margin-bottom: 12px;
    }

    :global(.task-editor-sheet) .sheet-advanced-toggle {
      min-height: 56px;
      height: 56px;
      margin-bottom: 8px;
      padding: 0 12px;
      border-radius: var(--radius-control);
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface-2, var(--bg-2)) 70%, var(--card));
    }

    :global(.task-editor-sheet) .sheet-actions {
      position: sticky;
      bottom: 0;
      z-index: 1;
      gap: 12px;
      margin-top: 12px;
      padding-top: 12px;
      padding-bottom: max(4px, env(safe-area-inset-bottom));
      background: linear-gradient(to top, var(--card) 80%, transparent);
    }

    :global(.task-editor-sheet) .sheet-actions .btn-primary,
    :global(.task-editor-sheet) .sheet-actions .btn-secondary {
      min-height: 56px;
      height: 56px;
    }
  }
</style>
