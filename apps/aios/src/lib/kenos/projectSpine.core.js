/**
 * Project Spine core — pure builders for the Kenos Project Cockpit.
 *
 * Canonical ownership (hard boundary, see docs/productivity/PROJECT_SPINE_CONTRACT.md):
 *   Project      → public.planner_projects  (Planner owns; Spine never writes it)
 *   Task         → public.planner_tasks     (Planner owns; via kenos_*_plan_task_action)
 *   Note content → Knowledge Vault          (Spine stores title references only)
 *   Context      → public.kenos_project_context  (via kenos_project_spine_action)
 *   Links        → public.kenos_project_links    (via kenos_project_spine_action)
 */

import { isProdReadCanaryMode } from './prodWriteGuard.core.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const PROJECT_SPINE_ACTION_TYPES = Object.freeze([
  'project.set_context',
  'project.set_next_action',
  'project.link_object',
  'project.unlink_object',
])

function contractUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

/** @param {Record<string, string | undefined> | undefined} env */
export function isProjectSpineWriterEnabled(env = import.meta.env) {
  if (isProdReadCanaryMode(env)) return false
  return env?.VITE_KENOS_PROD_WRITES === '1' && env?.VITE_KENOS_PROJECT_SPINE_WRITER === '1'
}

/**
 * Build one kenos_project_spine_action envelope.
 * @param {string} actionType
 * @param {object} payload must include projectId
 * @param {{ authUserId: string, now?: number, deviceId?: string, correlationId?: string, idempotencyKey?: string }} opts
 */
export function buildProjectSpineAction(actionType, payload, opts = {}) {
  if (!PROJECT_SPINE_ACTION_TYPES.includes(actionType)) {
    throw new Error(`unsupported project spine action: ${actionType}`)
  }
  const authUserId = opts.authUserId
  if (!authUserId || !UUID_PATTERN.test(authUserId)) {
    throw new Error('buildProjectSpineAction requires authenticated authUserId UUID')
  }
  const projectId = String(payload?.projectId || '').trim()
  if (!projectId) throw new Error('projectId required')
  const now = opts.now ?? Date.now()
  const correlationId =
    opts.correlationId && UUID_PATTERN.test(opts.correlationId) ? opts.correlationId : contractUuid()
  const deviceId = opts.deviceId && UUID_PATTERN.test(opts.deviceId) ? opts.deviceId : contractUuid()
  return {
    schemaVersion: '1',
    id: contractUuid(),
    actionType,
    producer: 'plan',
    targetDomain: 'plan',
    actor: { type: 'user', id: authUserId },
    deviceId,
    securityDomain: 'personal',
    dataClassification: 'personal',
    requestedRisk: 'R1',
    payload: { ...payload, projectId },
    idempotencyKey: opts.idempotencyKey || `spine_ui:${correlationId}`,
    requestedAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    correlationId,
  }
}

const CONTEXT_STATUSES = ['active', 'paused', 'waiting', 'completed', 'archived']

/**
 * Merge planner projects + spine context + links + tasks + activity into the
 * cockpit read model. All inputs are plain row arrays; pure and testable.
 * @param {{ projects?: any[], contexts?: any[], links?: any[], tasks?: any[], activity?: any[], nowMs?: number }} input
 */
export function buildCockpitModel({ projects = [], contexts = [], links = [], tasks = [], activity = [], nowMs = Date.now() } = {}) {
  const contextByProject = new Map(contexts.map((c) => [c.project_id, c]))
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const tasksByProject = new Map()
  for (const task of tasks) {
    if (!task.projectId || task.deletedAt) continue
    if (!tasksByProject.has(task.projectId)) tasksByProject.set(task.projectId, [])
    tasksByProject.get(task.projectId).push(task)
  }
  const linksByProject = new Map()
  for (const link of links) {
    if (link.deleted_at) continue
    if (!linksByProject.has(link.project_id)) linksByProject.set(link.project_id, [])
    linksByProject.get(link.project_id).push(link)
  }
  const activityByProject = new Map()
  for (const row of activity) {
    const ref = row.entity_ref || {}
    let projectId = null
    if (ref.type === 'plan.project') projectId = ref.id
    else if (ref.type === 'plan.task' && taskById.get(ref.id)?.projectId) projectId = taskById.get(ref.id).projectId
    if (!projectId) continue
    if (!activityByProject.has(projectId)) activityByProject.set(projectId, [])
    activityByProject.get(projectId).push(row)
  }

  const items = []
  for (const row of projects) {
    const data = row.data || row
    if (!data?.id || data.deletedAt) continue
    const context = contextByProject.get(data.id) || null
    const projectTasks = (tasksByProject.get(data.id) || [])
      .slice()
      .sort((a, b) => Number(a.completed) - Number(b.completed) || (b.updatedAt || 0) - (a.updatedAt || 0))
    const nextActionTask = context?.next_action_task_id ? taskById.get(context.next_action_task_id) || null : null
    const projectLinks = linksByProject.get(data.id) || []
    const projectActivity = (activityByProject.get(data.id) || [])
      .slice()
      .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
    const status = context && CONTEXT_STATUSES.includes(context.status) ? context.status : (data.status === 'active' ? 'active' : data.status)
    items.push({
      id: data.id,
      title: data.title || data.slug || data.id,
      summary: data.summary || '',
      plannerStatus: data.status || 'active',
      status,
      contextType: context?.context_type || null,
      outcome: context?.outcome || '',
      reviewAt: context?.review_at || null,
      nextAction: nextActionTask
        ? { taskId: nextActionTask.id, title: nextActionTask.title, completed: !!nextActionTask.completed, dueDate: nextActionTask.dueDate || null }
        : null,
      openTasks: projectTasks.filter((t) => !t.completed),
      doneTasks: projectTasks.filter((t) => t.completed),
      waiting: projectLinks.filter((l) => l.relation === 'waiting_on'),
      noteLinks: projectLinks.filter((l) => l.object_type === 'knowledge.note'),
      urlLinks: projectLinks.filter((l) => l.object_type === 'url'),
      taskLinks: projectLinks.filter((l) => l.object_type === 'plan.task'),
      decisions: projectActivity.filter((a) => String(a.action_type || '').startsWith('approval.')),
      recentActivity: projectActivity.slice(0, 12),
      hasContext: !!context,
    })
  }
  // Spine projects first (has context), then by recency of activity/updated
  items.sort((a, b) => Number(b.hasContext) - Number(a.hasContext) || a.title.localeCompare(b.title, 'zh-Hans-CN'))
  return { asOf: nowMs, projects: items }
}

/**
 * Minimal Today integration model. Read-only; every entry deep-links back to
 * its canonical owner surface.
 * @param {ReturnType<typeof buildCockpitModel>} cockpit
 * @param {number} nowMs
 */
export function buildProjectTodayModel(cockpit, nowMs = Date.now()) {
  const today = new Date(nowMs)
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const spineProjects = cockpit.projects.filter((p) => p.hasContext)
  const recentCutoff = nowMs - 48 * 3600_000
  return {
    activeNextActions: spineProjects
      .filter((p) => p.status === 'active' && p.nextAction && !p.nextAction.completed)
      .map((p) => ({ projectId: p.id, projectTitle: p.title, ...p.nextAction })),
    waitingProjects: spineProjects
      .filter((p) => p.status === 'waiting' || p.waiting.length > 0)
      .map((p) => ({ projectId: p.id, projectTitle: p.title, waitingOn: p.waiting.map((w) => w.display_metadata?.title || w.object_id) })),
    needsReview: spineProjects
      .filter((p) => p.reviewAt && String(p.reviewAt) <= todayYmd && p.status !== 'completed' && p.status !== 'archived')
      .map((p) => ({ projectId: p.id, projectTitle: p.title, reviewAt: p.reviewAt })),
    recentlyProgressed: spineProjects
      .filter((p) => p.recentActivity.some((a) => Date.parse(a.created_at || 0) >= recentCutoff))
      .map((p) => ({ projectId: p.id, projectTitle: p.title, lastActivityAt: p.recentActivity[0]?.created_at || null })),
  }
}
