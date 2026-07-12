/**
 * Build a complete, normalized draft for the task editor.
 * Keeping every optional field explicit prevents progressive disclosure from
 * opening because an undefined value differs from its domain default.
 *
 * @param {{
 *   listId: string,
 *   dueDate?: string|null,
 *   scheduledDate?: string|null,
 *   scheduledStart?: string|null,
 *   durationMinutes?: number|null,
 *   projectId?: string|null,
 * }} defaults
 */
export function createTaskEditorDraft(defaults) {
  return {
    title: '',
    notes: '',
    listId: defaults.listId,
    priority: 'P3',
    urgency: 'normal',
    size: 'medium',
    area: 'other',
    effortMin: null,
    nextAction: null,
    aiContext: null,
    projectId: defaults.projectId ?? null,
    dueDate: defaults.dueDate ?? null,
    dueTime: null,
    scheduledDate: defaults.scheduledDate ?? null,
    scheduledStart: defaults.scheduledStart ?? null,
    durationMinutes: defaults.durationMinutes ?? null,
    reminderMinutes: null,
    recurrence: null,
    tags: [],
    subtasks: [],
    meta: { kind: 'standard' },
  }
}

