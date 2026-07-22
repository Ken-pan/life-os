/**
 * Project Spine host — reads the cockpit data set and executes spine actions
 * via the atomic kenos_project_spine_action RPC (idempotency + outbox +
 * activity in one transaction). Task mutations go through the canonical
 * kenos_*_plan_task_action RPCs; planner_projects is never written here.
 */

import { lifeOsReadClient } from '../lifeos.js'
import { supabase } from '../supabase.js'
import {
  buildProjectSpineAction,
  isProjectSpineWriterEnabled,
} from './projectSpine.core.js'

async function requireSession() {
  if (!supabase) throw new Error('Supabase 未配置')
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) throw error
  if (!session?.user?.id) throw new Error('需要先登录 Life OS 账户(设置 → 云同步登录)')
  return session
}

/** Load everything the cockpit needs in one round of parallel reads. */
export async function loadProjectSpineData() {
  await requireSession()
  const client = lifeOsReadClient()
  if (!client) throw new Error('public schema client unavailable')
  const [projects, contexts, links, tasks, activity] = await Promise.all([
    client.from('planner_projects').select('id, data, updated_at'),
    client.from('kenos_project_context').select('*'),
    client.from('kenos_project_links').select('*').is('deleted_at', null),
    client.from('planner_tasks').select('data'),
    client.rpc('kenos_list_plan_activity', { p_limit: 200, p_before: null }),
  ])
  for (const r of [projects, contexts, links, tasks, activity]) {
    if (r.error) throw new Error(r.error.message || 'Project Spine 读取失败')
  }
  return {
    projects: projects.data || [],
    contexts: contexts.data || [],
    links: links.data || [],
    tasks: (tasks.data || []).map((row) => row.data).filter(Boolean),
    activity: Array.isArray(activity.data) ? activity.data : activity.data?.items || [],
  }
}

/**
 * Execute one spine action via the hosted RPC.
 * @param {'project.set_context'|'project.set_next_action'|'project.link_object'|'project.unlink_object'} actionType
 * @param {object} payload
 */
export async function executeProjectSpineAction(actionType, payload) {
  if (!isProjectSpineWriterEnabled()) {
    throw new Error('Project Spine writer flags are off (VITE_KENOS_PROD_WRITES + VITE_KENOS_PROJECT_SPINE_WRITER)')
  }
  const session = await requireSession()
  const action = buildProjectSpineAction(actionType, payload, { authUserId: session.user.id })
  const client = lifeOsReadClient()
  const { data, error } = await client.rpc('kenos_project_spine_action', { action_request: action })
  if (error) throw new Error(error.message || 'Project Spine RPC failed')
  if (!data?.ok) throw new Error(data?.error?.message || 'Project Spine RPC rejected')
  return data
}

/** Complete / reopen the next-action task through the canonical Plan command RPC. */
export async function completePlanTask(taskId, completed = true) {
  if (!isProjectSpineWriterEnabled()) {
    throw new Error('Project Spine writer flags are off')
  }
  const session = await requireSession()
  const authUserId = session.user.id
  const correlationId = crypto.randomUUID()
  const rpcName = completed ? 'kenos_complete_plan_task_action' : 'kenos_reopen_plan_task_action'
  const client = lifeOsReadClient()
  const { data, error } = await client.rpc(rpcName, {
    action_request: {
      schemaVersion: '1',
      id: crypto.randomUUID(),
      actionType: completed ? 'plan.complete_task' : 'plan.reopen_task',
      producer: 'plan',
      targetDomain: 'plan',
      actor: { type: 'user', id: authUserId },
      deviceId: crypto.randomUUID(),
      securityDomain: 'personal',
      dataClassification: 'personal',
      requestedRisk: 'R1',
      payload: { taskId, completed },
      idempotencyKey: `spine_ui_complete:${correlationId}`,
      requestedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      correlationId,
    },
  })
  if (error) throw new Error(error.message || 'Plan task RPC failed')
  if (!data?.ok) throw new Error(data?.error?.message || 'Plan task RPC rejected')
  return data
}

/** Create a task in the project through the canonical create-task command RPC. */
export async function createPlanTaskInProject(projectId, title, { dueDate = null, priority = 'P2' } = {}) {
  if (!isProjectSpineWriterEnabled()) {
    throw new Error('Project Spine writer flags are off')
  }
  const session = await requireSession()
  const authUserId = session.user.id
  const client = lifeOsReadClient()
  const createCorr = crypto.randomUUID()
  const { data: created, error: createError } = await client.rpc('kenos_create_plan_task_action', {
    action_request: {
      schemaVersion: '1',
      id: crypto.randomUUID(),
      actionType: 'plan.create_task',
      producer: 'plan',
      targetDomain: 'plan',
      actor: { type: 'user', id: authUserId },
      deviceId: crypto.randomUUID(),
      securityDomain: 'personal',
      dataClassification: 'personal',
      requestedRisk: 'R1',
      payload: { title, priority, ...(dueDate ? { dueDate } : {}) },
      idempotencyKey: `spine_ui_task:${createCorr}`,
      requestedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      correlationId: createCorr,
    },
  })
  if (createError) throw new Error(createError.message || '创建任务失败')
  if (!created?.ok) throw new Error(created?.error?.message || '创建任务被拒绝')
  const taskId = created.taskId
  const projCorr = crypto.randomUUID()
  const { data: attached, error: attachError } = await client.rpc('kenos_update_plan_task_project_action', {
    action_request: {
      schemaVersion: '1',
      id: crypto.randomUUID(),
      actionType: 'plan.update_task_project',
      producer: 'plan',
      targetDomain: 'plan',
      actor: { type: 'user', id: authUserId },
      deviceId: crypto.randomUUID(),
      securityDomain: 'personal',
      dataClassification: 'personal',
      requestedRisk: 'R1',
      payload: { taskId, projectId },
      idempotencyKey: `spine_ui_attach:${projCorr}`,
      requestedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      correlationId: projCorr,
    },
  })
  if (attachError) throw new Error(attachError.message || '任务归属项目失败')
  if (!attached?.ok) throw new Error(attached?.error?.message || '任务归属项目被拒绝')
  return { taskId }
}
