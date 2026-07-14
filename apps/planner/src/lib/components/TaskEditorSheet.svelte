<script>
  import { S, uid } from '$lib/state.svelte.js';
  import { createTask, updateTask, deleteTask, restoreTask, addSubtask } from '$lib/domain/tasks.js';
  import { taskEditor, closeTaskEditor, toast } from '$lib/ui.svelte.js';
  import { fetchTaskBreakdown, isAiDisabled } from '$lib/services/aiClient.js';
  import { t, listLabel } from '$lib/i18n/index.js';
  import { SYSTEM_LIST_INBOX, RECURRENCE_RULES, REMINDER_PRESETS } from '$lib/types.js';
  import { TASK_KINDS, normalizeTaskKind } from '$lib/domain/taskKind.js';
  import { selectableProjects } from '$lib/domain/projects.js';
  import {
    filterCaptureProjects,
    projectQueryFromTitle,
    titleWithoutProjectQuery,
  } from '$lib/domain/taskCapture.js';
  import { SCHEDULE_DURATIONS, formatDurationLabel } from '$lib/domain/schedule.js';
  import { lockScroll, unlockScroll } from '$lib/scrollLock.js';
  import { activateFocusTrap, createImeGuard } from '@life-os/theme';
  import { paperLinksForTask } from '$lib/paperLinks.js';
  import DateField from './DateField.svelte';
  import TimeField from './TimeField.svelte';
  import ProjectPicker from './ProjectPicker.svelte';
  import Icon from '@life-os/platform-web/svelte/icon';
  import AttachmentList from './attachments/AttachmentList.svelte';
  import AttachmentUploader from './attachments/AttachmentUploader.svelte';

  const ime = createImeGuard();

  let subtaskDraft = $state('');
  let aiBusy = $state(false);
  let showAdvanced = $state(false);
  let showDiscardConfirm = $state(false);
  let showDeleteConfirm = $state(false);
  let showTitleError = $state(false);
  let titleComposing = $state(false);
  let titleSuggestionDismissed = $state(false);
  let titleSuggestionIndex = $state(0);
  /** @type {HTMLInputElement | null} */
  let titleInput = $state(null);
  /** @type {HTMLElement | null} */
  let sheetEl = $state(null);

  const draft = $derived(taskEditor.draft);
  const isNew = $derived(!taskEditor.taskId);
  const recurrenceRule = $derived(draft?.recurrence?.rule || 'none');
  const projects = $derived(selectableProjects());
  const canSave = $derived(Boolean(draft?.title?.trim()));
  const paperLinks = $derived(paperLinksForTask(draft));
  const isDirty = $derived(
    Boolean(draft && taskEditor.initialDraft) &&
      JSON.stringify(draft) !== JSON.stringify(taskEditor.initialDraft)
  );
  const titleProjectQuery = $derived(
    titleComposing || titleSuggestionDismissed || !draft
      ? null
      : projectQueryFromTitle(draft.title)
  );
  const titleProjectSuggestions = $derived(
    titleProjectQuery == null
      ? []
      : filterCaptureProjects(projects, titleProjectQuery, 5)
  );

  const advancedCount = $derived.by(() => {
    if (!draft) return 0;
    return [
      Boolean(draft.notes?.trim()),
      draft.reminderMinutes != null,
      Boolean(draft.recurrence),
      draft.priority !== 'P3',
      draft.tags.length > 0,
      draft.subtasks.length > 0,
      normalizeTaskKind(draft.meta?.kind) !== 'standard',
      Boolean(draft.scheduledDate || draft.scheduledStart || draft.durationMinutes),
      draft.urgency !== 'normal',
      draft.size !== 'medium',
      draft.area !== 'other',
      draft.effortMin != null,
      Boolean(draft.nextAction?.trim()),
      Boolean(draft.aiContext?.trim()),
    ].filter(Boolean).length;
  });

  const needsAdvancedOpen = $derived(!isNew && advancedCount > 0);

  $effect(() => {
    if (taskEditor.open) {
      showAdvanced = needsAdvancedOpen;
      showDiscardConfirm = false;
      showDeleteConfirm = false;
      showTitleError = false;
      titleSuggestionDismissed = false;
      lockScroll();
      const releaseFocus = sheetEl
        ? activateFocusTrap(sheetEl, { initialFocusSelector: '#task-title' })
        : () => {};
      return () => {
        releaseFocus();
        unlockScroll();
      };
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
    if (!draft?.title?.trim()) {
      showTitleError = true;
      titleInput?.focus();
      return;
    }
    const payload = {
      title: draft.title,
      notes: draft.notes,
      listId: draft.listId,
      priority: draft.priority,
      urgency: draft.urgency || 'normal',
      size: draft.size || 'medium',
      area: draft.area || 'other',
      effortMin: draft.effortMin != null ? Number(draft.effortMin) : null,
      nextAction: draft.nextAction || null,
      aiContext: draft.aiContext || null,
      projectId: draft.projectId || null,
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
      const created = createTask({
        ...payload,
        listId: payload.listId || S.settings.defaultListId || SYSTEM_LIST_INBOX
      });
      toast(t('toast.taskCreated'), {
        actionLabel: t('common.undo'),
        onAction: () => deleteTask(created.id),
        key: `task-created:${created.id}`,
        dedupeMs: 0,
      });
    } else {
      updateTask(taskEditor.taskId, payload);
      toast(t('toast.saved'));
    }
    closeTaskEditor();
  }

  function requestClose() {
    titleSuggestionDismissed = true;
    if (isDirty) {
      showDiscardConfirm = true;
      return;
    }
    closeTaskEditor();
  }

  function discardAndClose() {
    showDiscardConfirm = false;
    closeTaskEditor();
  }

  /** @param {import('$lib/types.js').PlannerProject} project */
  function selectTitleProject(project) {
    if (!draft) return;
    draft.projectId = project.id;
    draft.title = titleWithoutProjectQuery(draft.title);
    titleSuggestionDismissed = true;
    titleSuggestionIndex = 0;
    requestAnimationFrame(() => titleInput?.focus());
  }

  /** @param {KeyboardEvent} event */
  function handleTitleKeydown(event) {
    if (ime.isComposing(event)) return;
    if (titleProjectSuggestions.length && !titleSuggestionDismissed) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        titleSuggestionIndex = Math.min(
          titleSuggestionIndex + 1,
          titleProjectSuggestions.length - 1,
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        titleSuggestionIndex = Math.max(titleSuggestionIndex - 1, 0);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        selectTitleProject(titleProjectSuggestions[titleSuggestionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        titleSuggestionDismissed = true;
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  }

  /** @param {KeyboardEvent} event */
  function handleDialogKeydown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    if (showDiscardConfirm) {
      showDiscardConfirm = false;
      return;
    }
    if (showDeleteConfirm) {
      showDeleteConfirm = false;
      return;
    }
    requestClose();
  }

  function remove() {
    if (!taskEditor.taskId) return;
    const taskId = taskEditor.taskId;
    deleteTask(taskId);
    toast(t('toast.deleted'), {
      actionLabel: t('common.undo'),
      onAction: () => restoreTask(taskId),
      key: `task-deleted:${taskId}`,
      dedupeMs: 0,
    });
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
    { v: 'P0', label: t('task.priority_P0') },
    { v: 'P1', label: t('task.priority_P1') },
    { v: 'P2', label: t('task.priority_P2') },
    { v: 'P3', label: t('task.priority_P3') }
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
  function handleGlobalPaste(e) {
    if (!draft || isNew) return
    const items = e.clipboardData?.items
    if (!items) return
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          import('$lib/services/attachmentService.js').then(({ uploadAttachment }) => {
            uploadAttachment('task', draft.id, file, 'paste').catch((err) => {
              toast(err.message, 'error')
            })
          })
          return
        }
      }
    }
  }

  async function copyPaperReference(link) {
    const value = `paperos://notebook/${encodeURIComponent(link.noteId)}?pageId=${encodeURIComponent(link.pageId)}&page=${link.pageIndex}`;
    try {
      await navigator.clipboard.writeText(value);
      toast(t('task.paperLinkCopied'));
    } catch {
      toast(t('task.paperLinkCopyFailed'), 'warn');
    }
  }
</script>

{#if taskEditor.open && draft}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="sheet-bg" role="presentation" onclick={(e) => e.target === e.currentTarget && closeTaskEditor()}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div 
      class="sheet task-editor-sheet" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="task-editor-title"
      onpaste={handleGlobalPaste}
    >
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div>
          <h2 id="task-editor-title" class="sheet-title">{isNew ? t('task.createTitle') : t('task.editTitle')}</h2>
          <p id="task-editor-description" class="sheet-description">
            {isNew ? t('task.createDescription') : t('task.editDescription')}
          </p>
        </div>
        <button type="button" class="sheet-close" onclick={requestClose} aria-label={t('common.close')}>
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
          aria-invalid={showTitleError}
          aria-describedby={showTitleError ? 'task-title-error' : undefined}
          oninput={() => {
            showTitleError = false;
            titleSuggestionDismissed = false;
            titleSuggestionIndex = 0;
          }}
          oncompositionstart={() => {
            titleComposing = true;
            ime.compositionstart();
          }}
          oncompositionend={(e) => {
            ime.compositionend(e);
            setTimeout(() => (titleComposing = false), 0);
          }}
          oncompositioncancel={() => {
            titleComposing = false;
            ime.compositioncancel();
          }}
          onkeydown={handleTitleKeydown}
        />
        {#if showTitleError}
          <p id="task-title-error" class="field-error">{t('task.titleRequired')}</p>
        {/if}
        {#if titleProjectSuggestions.length && !titleSuggestionDismissed}
          <div class="title-project-menu" role="listbox" aria-label={t('task.projectSuggestions')}>
            {#each titleProjectSuggestions as project, index (project.id)}
              <button
                type="button"
                role="option"
                aria-selected={index === titleSuggestionIndex}
                class:is-active={index === titleSuggestionIndex}
                onclick={() => selectTitleProject(project)}
              >
                <Icon name="folder" size={16} strokeWidth={1.8} />
                <span>{project.title}</span>
              </button>
            {/each}
          </div>
        {/if}
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

      <div class="field field--project">
        <ProjectPicker
          value={draft.projectId}
          onchange={(projectId) => {
            draft.projectId = projectId;
          }}
        />
      </div>

      {#if paperLinks.length}
        <section class="paper-links" aria-label={t('task.paperLinks')}>
          <div class="paper-links-heading">
            <span>{t('task.paperLinks')}</span>
            <span>{paperLinks.length}</span>
          </div>
          {#each paperLinks as link (link.id)}
            <div class="paper-link-row">
              <Icon name="link" size={17} strokeWidth={1.8} />
              <div>
                <strong>{link.noteTitle}</strong>
                <span>{t('task.paperLinkPage', { page: link.pageIndex })}</span>
              </div>
              <button type="button" onclick={() => copyPaperReference(link)}>
                {t('task.copyPaperLink')}
              </button>
            </div>
          {/each}
        </section>
      {/if}

      <button
        type="button"
        class="sheet-advanced-toggle"
        aria-expanded={showAdvanced}
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        <span>
          {advancedCount > 0
            ? t('task.detailsSummary', { count: advancedCount })
            : t('task.moreOptions')}
        </span>
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

          <div class="field-row">
            <div class="field">
              <label for="task-urgency">{t('task.urgency')}</label>
              <select id="task-urgency" bind:value={draft.urgency}>
                <option value="urgent">{t('task.urgencyUrgent')}</option>
                <option value="normal">{t('task.urgencyNormal')}</option>
                <option value="low">{t('task.urgencyLow')}</option>
              </select>
            </div>
            <div class="field">
              <label for="task-size">{t('task.size')}</label>
              <select id="task-size" bind:value={draft.size}>
                <option value="small">{t('task.sizeSmall')}</option>
                <option value="medium">{t('task.sizeMedium')}</option>
                <option value="large">{t('task.sizeLarge')}</option>
                <option value="epic">{t('task.sizeEpic')}</option>
              </select>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="task-area">{t('task.area')}</label>
              <select id="task-area" bind:value={draft.area}>
                <option value="life">{t('task.areaLife')}</option>
                <option value="work">{t('task.areaWork')}</option>
                <option value="planner">{t('task.areaPlanner')}</option>
                <option value="fitness">{t('task.areaFitness')}</option>
                <option value="finance">{t('task.areaFinance')}</option>
                <option value="home">{t('task.areaHome')}</option>
                <option value="other">{t('task.areaOther')}</option>
              </select>
            </div>
            <div class="field">
              <label for="task-effort">{t('task.effortMin')}</label>
              <input
                id="task-effort"
                type="number"
                placeholder="e.g. 30"
                bind:value={draft.effortMin}
              />
            </div>
          </div>

          <div class="field">
            <label for="task-next-action">{t('task.nextAction')}</label>
            <input
              id="task-next-action"
              type="text"
              placeholder="Next concrete step..."
              bind:value={draft.nextAction}
            />
          </div>

          <div class="field">
            <label for="task-ai-context">{t('task.aiContext')}</label>
            <textarea
              id="task-ai-context"
              rows="2"
              placeholder="Context or hints for later AI triage..."
              bind:value={draft.aiContext}
            ></textarea>
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
          
          {#if !isNew}
            <div class="field">
              <span class="field-label">{t('attachments.title', 'Attachments')}</span>
              <AttachmentList ownerType="task" ownerId={draft.id} />
              <AttachmentUploader ownerType="task" ownerId={draft.id} />
            </div>
          {/if}
        </div>
      {/if}

      {#if !isNew}
        <button type="button" class="sheet-delete-action" onclick={() => (showDeleteConfirm = true)}>
          <Icon name="trash" size={17} strokeWidth={1.8} />
          {t('task.deleteTask')}
        </button>
      {/if}

      {#if showDeleteConfirm}
        <div class="discard-confirm discard-confirm--danger" role="alert">
          <div>
            <strong>{t('task.deleteTitle')}</strong>
            <span>{t('task.deleteDescription')}</span>
          </div>
          <div class="discard-confirm-actions">
            <button type="button" class="btn-secondary" onclick={() => (showDeleteConfirm = false)}>
              {t('common.cancel')}
            </button>
            <button type="button" class="btn-danger" onclick={remove}>
              {t('task.deleteAction')}
            </button>
          </div>
        </div>
      {/if}

      {#if showDiscardConfirm}
        <div class="discard-confirm" role="alert">
          <div>
            <strong>{t('task.discardTitle')}</strong>
            <span>{t('task.discardDescription')}</span>
          </div>
          <div class="discard-confirm-actions">
            <button type="button" class="btn-secondary" onclick={() => (showDiscardConfirm = false)}>
              {t('task.keepEditing')}
            </button>
            <button type="button" class="btn-danger" onclick={discardAndClose}>
              {t('task.discardAction')}
            </button>
          </div>
        </div>
      {/if}

      <div class="sheet-actions">
        <button type="button" class="btn-secondary" onclick={requestClose}>{t('common.cancel')}</button>
        <button type="button" class="btn-primary" disabled={!canSave} onclick={save}>
          {isNew ? t('task.createAction') : t('task.saveChanges')}
        </button>
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
  .field-error {
    margin: 7px 0 0;
    color: var(--feedback-error, #b42318);
    font-size: var(--text-sm);
  }
  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .paper-links {
    margin: 0 0 12px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .paper-links-heading,
  .paper-link-row {
    display: flex;
    align-items: center;
  }
  .paper-links-heading {
    justify-content: space-between;
    padding: 10px 2px 7px;
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--text-xs);
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .paper-link-row {
    gap: 10px;
    min-height: 52px;
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .paper-link-row > div {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }
  .paper-link-row strong,
  .paper-link-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .paper-link-row strong { color: var(--t1); font-size: var(--text-sm); }
  .paper-link-row span { color: var(--t3); font-size: var(--text-xs); }
  .paper-link-row button {
    min-height: 40px;
    padding: 0 8px;
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: 600;
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
  .sheet-description {
    margin: 4px 0 0;
    color: var(--t3);
    font-size: var(--text-sm);
    line-height: 1.35;
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
    animation: task-details-in 150ms ease-out;
  }
  .field--title {
    position: relative;
  }
  .title-project-menu {
    position: absolute;
    z-index: var(--z-popover, 50);
    top: calc(100% + 5px);
    left: 0;
    right: 0;
    overflow: hidden;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
    box-shadow: var(--shadow-popover, 0 14px 34px rgba(0, 0, 0, 0.16));
  }
  .title-project-menu button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 42px;
    padding: 0 10px;
    border-radius: calc(var(--radius-control) - 2px);
    color: var(--t1);
    text-align: left;
  }
  .title-project-menu button:hover,
  .title-project-menu button.is-active {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .sheet-delete-action {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    margin: 2px 0 6px;
    padding: 0 8px;
    color: var(--feedback-error, #b42318);
    font-size: var(--text-sm);
  }
  .sheet-delete-action:hover {
    background: color-mix(in srgb, var(--feedback-error, #b42318) 7%, transparent);
  }
  .discard-confirm {
    display: grid;
    gap: 12px;
    margin: 6px 0;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--feedback-warning, #b54708) 24%, var(--border));
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--feedback-warning, #b54708) 6%, var(--card));
    animation: task-details-in 150ms ease-out;
  }
  .discard-confirm > div:first-child {
    display: grid;
    gap: 3px;
  }
  .discard-confirm--danger {
    border-color: color-mix(in srgb, var(--feedback-error, #b42318) 24%, var(--border));
    background: color-mix(in srgb, var(--feedback-error, #b42318) 6%, var(--card));
  }
  .discard-confirm strong {
    color: var(--t1);
    font-size: var(--text-sm);
  }
  .discard-confirm span {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .discard-confirm-actions {
    display: flex;
    gap: 8px;
  }
  .discard-confirm-actions button {
    flex: 1;
  }
  @keyframes task-details-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (--life-os-desktop) {
    :global(.task-editor-sheet) .sheet-handle {
      display: none;
    }
  }

  @media (--life-os-mobile) {
    :global(.task-editor-sheet) {
      border-radius: 28px 28px 0 0;
      padding: 12px 24px calc(16px + env(safe-area-inset-bottom));
      max-height: min(88dvh, calc(var(--app-vh, 100dvh) - 8px));
      scroll-padding-bottom: calc(72px + env(safe-area-inset-bottom));
      animation: task-sheet-in 180ms cubic-bezier(.2, .8, .2, 1);
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

    :global(.task-editor-sheet) .field--project {
      margin-bottom: 8px;
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

  @keyframes task-sheet-in {
    from { transform: translateY(18px); opacity: .75; }
    to { transform: translateY(0); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet-advanced,
    .discard-confirm,
    :global(.task-editor-sheet) {
      animation: none;
    }
  }
</style>
