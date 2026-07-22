import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PROJECT_SPINE_ACTION_TYPES,
  buildCockpitModel,
  buildProjectSpineAction,
  buildProjectTodayModel,
  isProjectSpineWriterEnabled,
} from './projectSpine.core.js'

const OWNER = 'c2831538-94b0-4a57-b034-5e873a53c42e'
const NOW = Date.parse('2026-07-22T12:00:00Z')

describe('projectSpine.core — writer gate', () => {
  it('fail-closed by default, dual flag to open, read-canary always closed', () => {
    assert.equal(isProjectSpineWriterEnabled({}), false)
    assert.equal(isProjectSpineWriterEnabled({ VITE_KENOS_PROD_WRITES: '1' }), false)
    assert.equal(
      isProjectSpineWriterEnabled({ VITE_KENOS_PROD_WRITES: '1', VITE_KENOS_PROJECT_SPINE_WRITER: '1' }),
      true,
    )
    assert.equal(
      isProjectSpineWriterEnabled({
        VITE_KENOS_READ_CANARY: '1',
        VITE_KENOS_PROD_WRITES: '1',
        VITE_KENOS_PROJECT_SPINE_WRITER: '1',
      }),
      false,
    )
  })
})

describe('projectSpine.core — action envelope', () => {
  it('builds a valid contract envelope', () => {
    const action = buildProjectSpineAction(
      'project.set_context',
      { projectId: 'p-1', outcome: 'ship it', status: 'active' },
      { authUserId: OWNER, now: NOW },
    )
    assert.equal(action.schemaVersion, '1')
    assert.equal(action.actionType, 'project.set_context')
    assert.equal(action.producer, 'plan')
    assert.equal(action.targetDomain, 'plan')
    assert.deepEqual(action.actor, { type: 'user', id: OWNER })
    assert.equal(action.requestedRisk, 'R1')
    assert.equal(action.payload.projectId, 'p-1')
    assert.match(action.requestedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    assert.match(action.idempotencyKey, /^spine_ui:/)
  })

  it('rejects unknown actions and missing identity', () => {
    assert.throws(() => buildProjectSpineAction('project.delete_everything', { projectId: 'p' }, { authUserId: OWNER }))
    assert.throws(() => buildProjectSpineAction('project.set_context', { projectId: 'p' }, {}))
    assert.throws(() => buildProjectSpineAction('project.set_context', {}, { authUserId: OWNER }))
    assert.equal(PROJECT_SPINE_ACTION_TYPES.length, 4)
  })
})

const FIXTURE = {
  projects: [
    { data: { id: 'p-aios', title: 'Life OS · AIOS', status: 'active' } },
    { data: { id: 'p-other', title: '未接脊柱的项目', status: 'active' } },
    { data: { id: 'p-del', title: '已删', status: 'active', deletedAt: 1 } },
  ],
  contexts: [
    {
      project_id: 'p-aios', outcome: '上线脊柱', status: 'active', context_type: 'development',
      next_action_task_id: 't-1', review_at: '2026-07-22',
    },
  ],
  links: [
    { project_id: 'p-aios', object_type: 'plan.task', object_id: 't-1', relation: 'next', display_metadata: {} },
    { project_id: 'p-aios', object_type: 'knowledge.note', object_id: 'AIOS 设计', relation: 'reference', display_metadata: { title: 'AIOS 设计' } },
    { project_id: 'p-aios', object_type: 'url', object_id: 'https://www.kenos.space', relation: 'reference', display_metadata: {} },
    { project_id: 'p-aios', object_type: 'plan.task', object_id: 't-x', relation: 'waiting_on', display_metadata: { title: '等 Owner 审批' } },
    { project_id: 'p-aios', object_type: 'url', object_id: 'https://old', relation: 'reference', display_metadata: {}, deleted_at: '2026-07-21T00:00:00Z' },
  ],
  tasks: [
    { id: 't-1', title: '验收 Cockpit', projectId: 'p-aios', completed: false, updatedAt: NOW },
    { id: 't-2', title: '已完成任务', projectId: 'p-aios', completed: true, updatedAt: NOW - 1000 },
    { id: 't-3', title: '不相关', projectId: null, completed: false },
  ],
  activity: [
    { action_type: 'project.set_context', entity_ref: { type: 'plan.project', id: 'p-aios' }, created_at: '2026-07-22T11:00:00Z' },
    { action_type: 'plan.complete_task', entity_ref: { type: 'plan.task', id: 't-2' }, created_at: '2026-07-22T10:00:00Z' },
    { action_type: 'approval.decide', entity_ref: { type: 'plan.project', id: 'p-aios' }, created_at: '2026-07-21T10:00:00Z' },
  ],
  nowMs: NOW,
}

describe('projectSpine.core — cockpit model', () => {
  const model = buildCockpitModel(FIXTURE)

  it('answers the cockpit questions for a spine project', () => {
    const p = model.projects.find((x) => x.id === 'p-aios')
    assert.equal(p.outcome, '上线脊柱')
    assert.deepEqual(p.nextAction, { taskId: 't-1', title: '验收 Cockpit', completed: false, dueDate: null })
    assert.equal(p.openTasks.length, 1)
    assert.equal(p.doneTasks.length, 1)
    assert.equal(p.noteLinks.length, 1)
    assert.equal(p.urlLinks.length, 1, 'soft-deleted links are excluded')
    assert.equal(p.waiting.length, 1)
    assert.equal(p.decisions.length, 1)
    assert.equal(p.reviewAt, '2026-07-22')
    // task-level activity attributed to the project through task.projectId
    assert.equal(p.recentActivity.length, 3)
  })

  it('keeps non-spine projects visible but unranked, drops tombstones', () => {
    assert.equal(model.projects.some((x) => x.id === 'p-del'), false)
    assert.equal(model.projects[0].id, 'p-aios', 'spine projects sort first')
    assert.equal(model.projects.find((x) => x.id === 'p-other').hasContext, false)
  })
})

describe('projectSpine.core — Today integration model', () => {
  it('surfaces next actions / waiting / review-due / recently progressed', () => {
    const today = buildProjectTodayModel(buildCockpitModel(FIXTURE), NOW)
    assert.deepEqual(today.activeNextActions.map((x) => x.taskId), ['t-1'])
    assert.deepEqual(today.waitingProjects.map((x) => x.projectId), ['p-aios'])
    assert.deepEqual(today.needsReview.map((x) => x.reviewAt), ['2026-07-22'])
    assert.deepEqual(today.recentlyProgressed.map((x) => x.projectId), ['p-aios'])
  })

  it('completed next action drops out of active list', () => {
    const done = structuredClone(FIXTURE)
    done.tasks[0].completed = true
    const today = buildProjectTodayModel(buildCockpitModel(done), NOW)
    assert.equal(today.activeNextActions.length, 0)
  })
})
