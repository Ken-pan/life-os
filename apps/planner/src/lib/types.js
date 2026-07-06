/** @typedef {0|1|2|3|4} TaskPriority */

/** @typedef {'none'|'daily'|'weekly'|'monthly'|'yearly'} RecurrenceRule */

/**
 * @typedef {Object} TaskRecurrence
 * @property {RecurrenceRule} rule
 * @property {number} [interval]
 * @property {string|null} [until]
 * @property {string|null} [seriesId]
 */

/**
 * @typedef {Object} Subtask
 * @property {string} id
 * @property {string} title
 * @property {boolean} done
 */

/**
 * @typedef {Object} TaskMeta
 * @property {string[]} [aiHints]
 * @property {string} [suggestedDueDate]
 * @property {number} [confidence]
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} notes
 * @property {string} listId
 * @property {TaskPriority} priority
 * @property {string|null} dueDate
 * @property {string|null} dueTime
 * @property {number|null} reminderMinutes
 * @property {TaskRecurrence|null} recurrence
 * @property {string[]} tags
 * @property {Subtask[]} subtasks
 * @property {boolean} completed
 * @property {number|null} completedAt
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number|null} [deletedAt] 墓碑标记：非空表示已删除（跨设备传播后再物理清理）
 * @property {number} sortOrder
 * @property {TaskMeta} meta
 */

/**
 * @typedef {Object} TaskList
 * @property {string} id
 * @property {string} title
 * @property {string} icon
 * @property {string} color
 * @property {number} sortOrder
 * @property {number} [updatedAt] 最后修改时间（毫秒），用于跨设备 LWW 合并
 * @property {number|null} [deletedAt] 墓碑标记
 * @property {'inbox'|'completed'|undefined} [system]
 */

/**
 * @typedef {Object} AppSettings
 * @property {'light'|'dark'|'auto'} theme
 * @property {'zh'|'en'} locale
 * @property {string} defaultListId
 * @property {boolean} notificationsEnabled
 * @property {boolean} syncAuto
 * @property {number} [updatedAt] 设置最后修改时间（毫秒），用于跨设备 LWW 合并
 */

/**
 * @typedef {Object} AppState
 * @property {number} schemaVersion
 * @property {Task[]} tasks
 * @property {TaskList[]} lists
 * @property {AppSettings} settings
 */

/** @type {Record<TaskPriority, string>} */
export const PRIORITY_COLORS = {
  0: 'var(--t3)',
  1: '#E34432',
  2: '#F5A623',
  3: '#0F66AE',
  4: '#A8A5A0'
};

export const SYSTEM_LIST_INBOX = 'inbox';
export const SYSTEM_LIST_COMPLETED = 'completed';

export const RECURRENCE_RULES = /** @type {const} */ (['none', 'daily', 'weekly', 'monthly', 'yearly']);

export const REMINDER_PRESETS = /** @type {const} */ ([0, 5, 15, 30, 60, 1440]);

/** @returns {TaskRecurrence|null} */
export function normalizeRecurrence(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rule = RECURRENCE_RULES.includes(raw.rule) ? raw.rule : 'none';
  if (rule === 'none') return null;
  return {
    rule,
    interval: Math.max(1, Number(raw.interval) || 1),
    until: raw.until || null,
    seriesId: raw.seriesId || null
  };
}
