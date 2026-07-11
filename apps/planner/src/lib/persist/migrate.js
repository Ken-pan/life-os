import { SYSTEM_LIST_INBOX, normalizeRecurrence } from '../types.js'

export const SCHEMA_VERSION = 3

const PROJECT_STATUSES = /** @type {const} */ (['active', 'paused', 'shipped', 'archived'])
const PROJECT_PRIORITIES = /** @type {const} */ (['p0', 'p1', 'p2', 'p3'])
const PROJECT_PROGRESS_MODES = /** @type {const} */ (['automatic', 'manual'])
const REPO_REF_KINDS = /** @type {const} */ ([
  'repo',
  'branch',
  'commit',
  'pull_request',
  'issue',
  'deploy',
])

/** 墓碑（已删除标记）保留时长，超过后本地与云端都会被物理清理 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** @param {{ deletedAt?: number|null }} item @param {number} [now] */
export function isExpiredTombstone(item, now = Date.now()) {
  return Boolean(item?.deletedAt && now - item.deletedAt > TOMBSTONE_TTL_MS)
}

/**
 * 把数组拆成「仍需同步的行」与「过期墓碑 id」。
 * @template {{ id: string, deletedAt?: number|null }} T
 * @param {T[]} items
 * @param {number} [now]
 * @returns {{ live: T[], expiredIds: string[] }}
 */
export function splitExpiredTombstones(items, now = Date.now()) {
  /** @type {T[]} */
  const live = []
  /** @type {string[]} */
  const expiredIds = []
  for (const item of items) {
    if (isExpiredTombstone(item, now)) expiredIds.push(item.id)
    else live.push(item)
  }
  return { live, expiredIds }
}

export const dateKeyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayKey = () => dateKeyOf(new Date())

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

/** @returns {import('../types.js').AppState} */
export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    projects: [],
    lists: [
      {
        id: SYSTEM_LIST_INBOX,
        title: 'inbox',
        icon: 'inbox',
        color: '#F5A623',
        sortOrder: 0,
        system: 'inbox',
        updatedAt: 0,
        deletedAt: null,
      },
    ],
    settings: {
      theme: 'auto',
      locale: 'zh',
      defaultListId: SYSTEM_LIST_INBOX,
      notificationsEnabled: false,
      syncAuto: true,
      lockPortraitOnPhone: true,
      rhythmEnabled: true,
      dailyGoal: 3,
      rhythmPaused: false,
      rhythmRestDays: [],
      updatedAt: 0,
    },
  }
}

/** @param {unknown} value */
function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** @param {unknown} value */
function optionalTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** @param {unknown} value */
function clampProgress(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** @param {string} value */
function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** @param {unknown} ref */
function migrateRoadmapRef(ref) {
  if (!ref || typeof ref !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (ref)
  const id = optionalString(r.id)
  const roadmapItemId = optionalString(r.roadmapItemId)
  const sourcePath = optionalString(r.sourcePath)
  if (!id || !roadmapItemId || !sourcePath) return null
  return {
    id,
    roadmapItemId,
    sourcePath,
    anchor: optionalString(r.anchor) ?? undefined,
    label: optionalString(r.label) ?? undefined,
    isPrimary: typeof r.isPrimary === 'boolean' ? r.isPrimary : undefined,
  }
}

/** @param {unknown} ref */
function migrateRepoRef(ref) {
  if (!ref || typeof ref !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (ref)
  const id = optionalString(r.id)
  const kind = REPO_REF_KINDS.includes(r.kind) ? r.kind : null
  const label = optionalString(r.label)
  const url = optionalString(r.url)
  if (!id || !kind || !label || !url) return null
  return { id, kind, label, url }
}

/** @param {unknown} project */
export function migrateProject(project) {
  if (!project || typeof project !== 'object') return null
  const p = /** @type {Record<string, unknown>} */ (project)
  const id = optionalString(p.id)
  if (!id) return null
  const title = optionalString(p.title) ?? optionalString(p.name) ?? id
  const slug = optionalString(p.slug) ?? (slugify(title) || id)
  const status = PROJECT_STATUSES.includes(p.status) ? p.status : 'active'
  const progressMode = PROJECT_PROGRESS_MODES.includes(p.progressMode)
    ? p.progressMode
    : 'automatic'
  return {
    ...p,
    id,
    title,
    slug,
    status,
    areaId: optionalString(p.areaId),
    priority: PROJECT_PRIORITIES.includes(p.priority) ? p.priority : null,
    summary: typeof p.summary === 'string' ? p.summary : '',
    progressMode,
    manualProgress: progressMode === 'manual' ? clampProgress(p.manualProgress) : null,
    roadmapRefs: Array.isArray(p.roadmapRefs)
      ? p.roadmapRefs.map(migrateRoadmapRef).filter(Boolean)
      : [],
    repoRefs: Array.isArray(p.repoRefs)
      ? p.repoRefs.map(migrateRepoRef).filter(Boolean)
      : [],
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    archivedAt: optionalTimestamp(p.archivedAt),
    deletedAt: optionalTimestamp(p.deletedAt),
  }
}

/** @param {unknown} task */
export function migrateTask(task) {
  if (!task || typeof task !== 'object') return null
  const t = /** @type {Record<string, unknown>} */ (task)

  let priority = t.priority
  if (typeof priority === 'number') {
    if (priority === 1) priority = 'P0'
    else if (priority === 2) priority = 'P1'
    else if (priority === 3) priority = 'P2'
    else priority = 'P3'
  } else if (priority !== 'P0' && priority !== 'P1' && priority !== 'P2' && priority !== 'P3') {
    priority = 'P3'
  }

  return {
    ...t,
    tags: Array.isArray(t.tags) ? t.tags : [],
    priority,
    urgency: typeof t.urgency === 'string' ? t.urgency : 'normal',
    size: typeof t.size === 'string' ? t.size : 'medium',
    area: typeof t.area === 'string' ? t.area : 'other',
    effortMin: typeof t.effortMin === 'number' ? t.effortMin : null,
    nextAction: typeof t.nextAction === 'string' ? t.nextAction : null,
    aiContext: typeof t.aiContext === 'string' ? t.aiContext : null,
    projectId: typeof t.projectId === 'string' ? t.projectId : null,
    reminderMinutes: t.reminderMinutes ?? null,
    scheduledDate: typeof t.scheduledDate === 'string' ? t.scheduledDate : null,
    scheduledStart: typeof t.scheduledStart === 'string' ? t.scheduledStart : null,
    durationMinutes:
      typeof t.durationMinutes === 'number' ? t.durationMinutes : null,
    recurrence: normalizeRecurrence(t.recurrence),
    deletedAt: typeof t.deletedAt === 'number' ? t.deletedAt : null,
    meta: t.meta && typeof t.meta === 'object'
      ? { kind: 'standard', ...t.meta }
      : { kind: 'standard' },
  }
}

/** @param {unknown} list */
export function migrateList(list) {
  if (!list || typeof list !== 'object') return null
  const l = /** @type {Record<string, unknown>} */ (list)
  if (typeof l.id !== 'string' || !l.id) return null
  const title =
    typeof l.title === 'string' && l.title.trim()
      ? l.title.trim()
      : typeof l.name === 'string' && l.name.trim()
        ? l.name.trim()
        : ''
  return {
    ...l,
    title,
    updatedAt: typeof l.updatedAt === 'number' ? l.updatedAt : 0,
    deletedAt: typeof l.deletedAt === 'number' ? l.deletedAt : null,
  }
}

/** @param {import('../types.js').Task[]} local @param {import('../types.js').Task[]} incoming */
export function mergeTasksByUpdatedAt(local, incoming) {
  const byId = new Map(local.map((t) => [t.id, t]))
  for (const t of incoming.map(migrateTask).filter(Boolean)) {
    const existing = byId.get(t.id)
    if (!existing || (t.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(t.id, t)
    }
  }
  return [...byId.values()]
}

/** LWW 合并清单：按 updatedAt 取较新，墓碑同样参与传播 */
/** @param {import('../types.js').TaskList[]} local @param {import('../types.js').TaskList[]} incoming */
export function mergeListsByUpdatedAt(local, incoming) {
  const byId = new Map(local.map((l) => [l.id, l]))
  for (const l of incoming.map(migrateList).filter(Boolean)) {
    const existing = byId.get(l.id)
    if (!existing || (l.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(l.id, l)
    }
  }
  return [...byId.values()]
}

/** LWW 合并项目：按 updatedAt 取较新，墓碑同样参与传播 */
/** @param {import('../types.js').PlannerProject[]} local @param {import('../types.js').PlannerProject[]} incoming */
export function mergeProjectsByUpdatedAt(local, incoming) {
  const byId = new Map(local.map((p) => [p.id, p]))
  for (const p of incoming.map(migrateProject).filter(Boolean)) {
    const existing = byId.get(p.id)
    if (!existing || (p.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(p.id, p)
    }
  }
  return [...byId.values()]
}

/**
 * LWW 合并设置：incoming（云端）更新才覆盖，避免旧设备的旧设置回灌。
 * 历史数据无 updatedAt 时视为 0（保留本地）。
 * @param {import('../types.js').AppSettings} local
 * @param {Partial<import('../types.js').AppSettings> | null | undefined} incoming
 */
export function mergeSettingsByUpdatedAt(local, incoming) {
  if (!incoming || typeof incoming !== 'object') return local
  const localAt = typeof local?.updatedAt === 'number' ? local.updatedAt : 0
  const incomingAt =
    typeof incoming.updatedAt === 'number' ? incoming.updatedAt : 0
  if (incomingAt > localAt) return { ...local, ...incoming }
  return local
}

/** @param {unknown} raw */
export function migrate(raw) {
  const base = defaultState()
  if (!raw || typeof raw !== 'object') return base
  const r = /** @type {Record<string, unknown>} */ (raw)
  const now = Date.now()
  const tasks = (
    Array.isArray(r.tasks) ? r.tasks.map(migrateTask).filter(Boolean) : []
  ).filter((t) => !isExpiredTombstone(t, now))
  const projects = (
    Array.isArray(r.projects) ? r.projects.map(migrateProject).filter(Boolean) : []
  ).filter((p) => !isExpiredTombstone(p, now))
  let lists = (
    Array.isArray(r.lists) ? r.lists.map(migrateList).filter(Boolean) : []
  ).filter((l) => !isExpiredTombstone(l, now))
  if (!lists.some((l) => l.id === SYSTEM_LIST_INBOX && !l.deletedAt)) {
    lists = [...base.lists, ...lists.filter((l) => l.id !== SYSTEM_LIST_INBOX)]
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    projects,
    lists,
    settings: { ...base.settings, ...(r.settings || {}) },
  }
}
