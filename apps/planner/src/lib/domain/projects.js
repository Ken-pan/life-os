import { S, save, uid } from '../state.svelte.js'
import { softDeleteAttachmentsForOwner } from '../services/attachmentService.js'

/** @param {string} value */
function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** @param {unknown} value */
function clampProgress(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** @param {Partial<import('../types.js').PlannerProject>} input */
export function createProject(input = {}) {
  const now = Date.now()
  const title = input.title?.trim() || ''
  const project = {
    id: uid(),
    title,
    slug: input.slug?.trim() || slugify(title) || `project-${now}`,
    status: input.status ?? 'active',
    areaId: input.areaId ?? null,
    priority: input.priority ?? null,
    summary: input.summary ?? '',
    progressMode: input.progressMode ?? 'automatic',
    manualProgress: input.progressMode === 'manual' ? clampProgress(input.manualProgress) : null,
    roadmapRefs: input.roadmapRefs ? JSON.parse(JSON.stringify(input.roadmapRefs)) : [],
    repoRefs: input.repoRefs ? JSON.parse(JSON.stringify(input.repoRefs)) : [],
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
  }
  S.projects = [...S.projects, project]
  save()
  return project
}

/** @param {string} id @param {Partial<import('../types.js').PlannerProject>} patch */
export function updateProject(id, patch) {
  const prev = S.projects.find((project) => project.id === id)
  if (!prev) return null
  const status = patch.status ?? prev.status
  const progressMode = patch.progressMode ?? prev.progressMode
  const next = {
    ...prev,
    ...patch,
    id: prev.id,
    title: patch.title !== undefined ? patch.title.trim() : prev.title,
    slug: patch.slug !== undefined ? patch.slug.trim() || prev.slug : prev.slug,
    status,
    progressMode,
    manualProgress:
      progressMode === 'manual'
        ? clampProgress(patch.manualProgress ?? prev.manualProgress)
        : null,
    roadmapRefs: patch.roadmapRefs
      ? JSON.parse(JSON.stringify(patch.roadmapRefs))
      : prev.roadmapRefs,
    repoRefs: patch.repoRefs ? JSON.parse(JSON.stringify(patch.repoRefs)) : prev.repoRefs,
    archivedAt:
      status === 'archived' && !prev.archivedAt
        ? Date.now()
        : status !== 'archived'
          ? null
          : prev.archivedAt,
    updatedAt: Date.now(),
  }
  S.projects = S.projects.map((project) => (project.id === id ? next : project))
  save()
  return next
}

/** @param {string} id @param {import('../types.js').ProjectStatus} status */
export function setProjectStatus(id, status) {
  return updateProject(id, { status })
}

/** @param {string} id */
export function deleteProject(id) {
  const now = Date.now()
  S.projects = S.projects.map((project) =>
    project.id === id ? { ...project, deletedAt: now, updatedAt: now } : project,
  )
  softDeleteAttachmentsForOwner('project', id)
  save()
}

/** @param {import('../types.js').PlannerProject[]} projects */
export function visibleProjects(projects = S.projects) {
  return projects
    .filter((project) => !project.deletedAt && project.status !== 'archived')
    .sort((a, b) => {
      const statusRank = statusSortRank(a.status) - statusSortRank(b.status)
      if (statusRank) return statusRank
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.title.localeCompare(b.title)
    })
}

/** @param {import('../types.js').PlannerProject[]} projects */
export function selectableProjects(projects = S.projects) {
  return projects
    .filter((project) => !project.deletedAt && project.status !== 'archived' && project.status !== 'shipped')
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** @param {string | null | undefined} id @param {import('../types.js').PlannerProject[]} projects */
export function getProjectById(id, projects = S.projects) {
  if (!id) return null
  return projects.find((project) => project.id === id && !project.deletedAt) ?? null
}

/**
 * Only allow browser-safe external links from synced project references.
 * Invalid URLs remain visible as labels but are not rendered as anchors.
 * @param {string | null | undefined} value
 */
export function safeProjectRefUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * @param {import('../types.js').PlannerProject} project
 * @param {import('../types.js').Task[]} tasks
 */
export function projectOpenTasks(project, tasks = S.tasks) {
  return tasks.filter(
    (task) => task.projectId === project.id && !task.completed && !task.deletedAt,
  )
}

/**
 * Derived next action for V1: first open task after the existing task priority/order rules.
 * @param {import('../types.js').PlannerProject} project
 * @param {import('../types.js').Task[]} tasks
 */
export function projectNextTask(project, tasks = S.tasks) {
  return projectOpenTasks(project, tasks).sort((a, b) => {
    const priority = priorityRank(a.priority) - priorityRank(b.priority)
    if (priority) return priority
    return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  })[0] ?? null
}

/** @param {import('../types.js').ProjectStatus} status */
function statusSortRank(status) {
  if (status === 'active') return 0
  if (status === 'paused') return 1
  if (status === 'shipped') return 2
  return 3
}

/** @param {import('../types.js').TaskPriority} priority */
function priorityRank(priority) {
  if (priority === 'P0') return 0
  if (priority === 'P1') return 1
  if (priority === 'P2') return 2
  return 3
}
