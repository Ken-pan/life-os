/**
 * @typedef {'task'|'project'} AttachmentOwnerType
 */

/**
 * @typedef {'image'|'file'|'link'|'log'} AttachmentKind
 */

/**
 * @typedef {'upload'|'paste'|'camera'|'bug-report'|'system'} AttachmentSource
 */

/**
 * @typedef {'pending'|'uploading'|'ready'|'failed'} AttachmentStatus
 */

/**
 * @typedef {Object} PlannerAttachment
 * @property {string} id
 * @property {AttachmentOwnerType} ownerType
 * @property {string} ownerId
 * @property {AttachmentKind} kind
 * @property {AttachmentSource} source
 * @property {string} name
 * @property {string} [mimeType]
 * @property {number} [sizeBytes]
 * @property {string} [storageBucket]
 * @property {string} [storagePath]
 * @property {string} [thumbnailPath]
 * @property {string} [externalUrl]
 * @property {number} [width]
 * @property {number} [height]
 * @property {AttachmentStatus} status
 * @property {string} [errorCode]
 * @property {number} updatedAt
 * @property {number} [deletedAt]
 */

/** @typedef {'P0'|'P1'|'P2'|'P3'} TaskPriority */

/** @typedef {'none'|'daily'|'weekly'|'monthly'|'yearly'} RecurrenceRule */

/** @typedef {import('@life-os/contracts/appearance').ColorSchemePreference} ColorSchemePreference */

/** @typedef {'active'|'paused'|'shipped'|'archived'} ProjectStatus */

/** @typedef {'automatic'|'manual'} ProjectProgressMode */

/** @typedef {'p0'|'p1'|'p2'|'p3'} ProjectPriority */

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
 * @property {'micro'|'standard'|'focus'|'habit'} [kind]
 * @property {boolean} [needsSplit]
 * @property {number} [triagedAt] 最近一次完成快速处理的时间（毫秒）
 * @property {{ domain: 'finance', occurrenceId: string } | { domain: 'fitness', sessionId: string } | { domain: 'core', captureId: string }} [lifeEventRef] INTG.EVENTS.1.5 / PLNR.CORE.5 幂等键
 * @property {PaperPageLink[]} [paperLinks] PaperOS 稳定页反向链接
 */

/**
 * @typedef {Object} PaperPageLink
 * @property {string} id
 * @property {string} deviceId
 * @property {string} noteId
 * @property {string} pageId
 * @property {number} pageIndex
 * @property {string} noteTitle
 * @property {number} linkedAt
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} notes
 * @property {string} listId
 * @property {TaskPriority} priority
 * @property {'urgent'|'normal'|'low'} urgency
 * @property {'small'|'medium'|'large'|'epic'} size
 * @property {'life'|'work'|'planner'|'fitness'|'finance'|'home'|'other'} area
 * @property {number|null} effortMin
 * @property {string|null} nextAction
 * @property {string|null} aiContext
 * @property {string|null} projectId
 * @property {string|null} dueDate
 * @property {string|null} dueTime
 * @property {string|null} scheduledDate YYYY-MM-DD 计划在哪天做
 * @property {string|null} scheduledStart HH:mm 计划开始时间
 * @property {number|null} durationMinutes 计划时长（分钟）
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
 * @typedef {Object} RoadmapRef
 * @property {string} id
 * @property {string} roadmapItemId
 * @property {string} sourcePath
 * @property {string} [anchor]
 * @property {string} [label]
 * @property {boolean} [isPrimary]
 */

/**
 * @typedef {Object} RepoRef
 * @property {string} id
 * @property {'repo'|'branch'|'commit'|'pull_request'|'issue'|'deploy'} kind
 * @property {string} label
 * @property {string} url
 */

/**
 * @typedef {Object} PlannerProject
 * @property {string} id
 * @property {string} title
 * @property {string} slug
 * @property {ProjectStatus} status
 * @property {string|null} areaId
 * @property {ProjectPriority|null} priority
 * @property {string} summary
 * @property {ProjectProgressMode} progressMode
 * @property {number|null} manualProgress
 * @property {RoadmapRef[]} roadmapRefs
 * @property {RepoRef[]} repoRefs
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number|null} archivedAt
 * @property {number|null} deletedAt
 */

/**
 * @typedef {Object} AppSettings
 * @property {'light'|'dark'|'auto'} theme Web runtime storage uses `auto`; contracts `ColorSchemePreference` uses `system` for the same semantics.
 * @property {'zh'|'en'} locale
 * @property {string} defaultListId
 * @property {boolean} notificationsEnabled
 * @property {boolean} syncAuto
 * @property {boolean} [lockPortraitOnPhone]
 * @property {number} [updatedAt] 设置最后修改时间（毫秒），用于跨设备 LWW 合并
 * @property {boolean} [rhythmEnabled] 节奏 / 成就追踪（可关闭）
 * @property {number} [dailyGoal] 每日目标完成数（1–7，默认 3）
 * @property {boolean} [rhythmPaused] 休假模式：暂停 streak 压力
 * @property {string[]} [rhythmRestDays] 休息日（YYYY-MM-DD，每周最多 2 天）
 */

/**
 * @typedef {Object} AppState
 * @property {number} schemaVersion
 * @property {Task[]} tasks
 * @property {TaskList[]} lists
 * @property {PlannerProject[]} projects
 * @property {AppSettings} settings
 */

/** @type {Record<TaskPriority, string>} */
export const PRIORITY_COLORS = {
  'P0': '#E34432',
  'P1': '#F5A623',
  'P2': '#0F66AE',
  'P3': 'var(--t3)',
}

export const SYSTEM_LIST_INBOX = 'inbox'
export const SYSTEM_LIST_COMPLETED = 'completed'

export const RECURRENCE_RULES = /** @type {const} */ ([
  'none',
  'daily',
  'weekly',
  'monthly',
  'yearly',
])

export const REMINDER_PRESETS = /** @type {const} */ ([0, 5, 15, 30, 60, 1440])

/** @returns {TaskRecurrence|null} */
export function normalizeRecurrence(raw) {
  if (!raw || typeof raw !== 'object') return null
  const rule = RECURRENCE_RULES.includes(raw.rule) ? raw.rule : 'none'
  if (rule === 'none') return null
  return {
    rule,
    interval: Math.max(1, Number(raw.interval) || 1),
    until: raw.until || null,
    seriesId: raw.seriesId || null,
  }
}

/**
 * @typedef {Object} PaperDeviceUser
 * @property {string} id
 * @property {string} name
 * @property {string} locale
 * @property {string} timezone
 */

/**
 * @typedef {Object} PaperDeviceScheduleBlock
 * @property {string} id
 * @property {string} title
 * @property {string} start HH:mm
 * @property {number} durationMinutes
 * @property {boolean} completed
 */

/**
 * @typedef {Object} PaperDeviceTask
 * @property {string} id
 * @property {string} title
 * @property {string} notes
 * @property {TaskPriority} priority
 * @property {string|null} dueDate YYYY-MM-DD
 * @property {boolean} completed
 * @property {number} updatedAt
 * @property {PaperPageLink[]} paperLinks
 */

/**
 * @typedef {Object} PaperDeviceTodayResponse
 * @property {string} serverTime ISO 8601
 * @property {string} cursor Stringified timestamp
 * @property {PaperDeviceUser} user
 * @property {Object} today
 * @property {string} today.date YYYY-MM-DD
 * @property {PaperDeviceTask|Object} today.currentFocus
 * @property {PaperDeviceScheduleBlock[]} today.scheduleBlocks
 * @property {PaperDeviceTask[]} tasks
 * @property {Object} inbox
 * @property {number} inbox.count
 * @property {Object} devicePolicy
 * @property {number} devicePolicy.activePollSeconds
 * @property {number} devicePolicy.idlePollSeconds
 * @property {number} devicePolicy.heartbeatSeconds
 */

/**
 * @typedef {Object} PaperDeviceAction
 * @property {string} clientActionId
 * @property {'task.complete'|'task.snooze'|'task.moveTomorrow'|'task.create'|'sync.heartbeat'} type
 * @property {string} [taskId]
 * @property {number} [baseVersion]
 * @property {string} [title]
 * @property {TaskPriority} [priority]
 * @property {string} [scheduledDate]
 * @property {number} [snoozeDays]
 */

/**
 * @typedef {Object} PaperDeviceActionBatch
 * @property {string} deviceId
 * @property {string} clientBatchId
 * @property {string} baseCursor
 * @property {PaperDeviceAction[]} actions
 */

/**
 * @typedef {Object} PaperDeviceActionResult
 * @property {'applied'|'partially_applied'|'rejected'} batchStatus
 * @property {string[]} applied clientActionIds
 * @property {string[]} conflicts clientActionIds
 * @property {string} newCursor
 */

/**
 * @typedef {Object} PaperDeviceDeltaResponse
 * @property {string} cursor
 * @property {boolean} hasMore
 * @property {Object} changes
 * @property {PaperDeviceTask[]} changes.upserted
 * @property {string[]} changes.deleted
 */

/**
 * @typedef {Object} PaperDeviceHeartbeat
 * @property {number} battery
 * @property {string} onlineState
 * @property {number} queueDepth
 * @property {string} appVersion
 * @property {string} osVersion
 */
