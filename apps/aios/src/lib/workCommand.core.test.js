import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  KenosWorkActionProposalSchema,
  KenosWorkProjectSchema,
} from '../../../../packages/contracts/src/kenos.ts'
import {
  buildWorkTodayProjection,
  cancelWorkActionProposal,
  compareWorkShadow,
  CONNECTOR_REGISTRY_PROPOSAL,
  convertWorkActionProposalToPlanTask,
  createWorkActionProposal,
  createWorkDeliverable,
  createWorkMemoryStore,
  createWorkProject,
  isWorkTaskConversionEnabled,
  reconcileLibraryRefs,
  reconcilePlanTaskRefs,
  recordWorkDecision,
  recordWorkMeeting,
  updateWorkDeliverableStatus,
} from './kenos/workCommand.core.js'

const ownerId = '20000000-0000-4000-8000-000000000001'
const __dirname = dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(readFileSync(join(__dirname, '../../../../packages/contracts/fixtures/kenos/v1/corpus.json'), 'utf8'))
const valid = new Map(corpus.valid.map((fixture) => [fixture.id, fixture.value]))

test('creates Work project/deliverable/meeting/decision and Activity', () => {
  const store = createWorkMemoryStore()
  const project = createWorkProject(store, {
    ownerId,
    title: 'Phase 3',
    safeSummary: 'Work foundation',
    status: 'active',
    priority: 'high',
  })
  assert.equal(project.ok, true)
  assert.equal(KenosWorkProjectSchema.safeParse(project.project).success, true)

  const deliverable = createWorkDeliverable(store, {
    ownerId,
    projectId: project.project.id,
    title: 'Contracts',
    safeSummary: 'Ship contracts',
  })
  assert.equal(deliverable.ok, true)
  assert.equal(updateWorkDeliverableStatus(store, { id: deliverable.deliverable.id, ownerId, status: 'blocked' }).ok, true)

  const meeting = recordWorkMeeting(store, {
    ownerId,
    projectId: project.project.id,
    title: 'Kickoff',
    occurredAt: '2026-07-19T01:00:00.000Z',
    safeSummary: 'Agreed ownership',
  })
  assert.equal(meeting.ok, true)

  const decision = recordWorkDecision(store, {
    ownerId,
    projectId: project.project.id,
    meetingId: meeting.meeting.id,
    title: 'Host in AIOS',
    safeSummary: 'Use AIOS strangler host',
    status: 'decided',
    decidedAt: '2026-07-19T01:05:00.000Z',
    decidedBy: { safeLabel: 'Ken' },
  })
  assert.equal(decision.ok, true)
  assert.ok(store.activities.length >= 4)
})

test('WorkActionProposal is not a Task and converts only with explicit user + flag', () => {
  const store = createWorkMemoryStore()
  const project = createWorkProject(store, { ownerId, title: 'P', safeSummary: 'S' })
  const draft = createWorkActionProposal(store, {
    ownerId,
    workEntityRef: { id: project.project.id, type: 'work.project', ownerDomain: 'work', ownerId },
    proposedTaskTitle: 'Follow up',
    safeContext: 'Needs review',
    idempotencyKey: 'proposal-1',
  })
  assert.equal(draft.ok, true)
  assert.equal(draft.proposal.status, 'draft')
  assert.equal(KenosWorkActionProposalSchema.safeParse(draft.proposal).success, true)

  const replay = createWorkActionProposal(store, {
    ownerId,
    workEntityRef: { id: project.project.id, type: 'work.project', ownerDomain: 'work', ownerId },
    proposedTaskTitle: 'Follow up',
    safeContext: 'Needs review',
    idempotencyKey: 'proposal-1',
  })
  assert.equal(replay.replayed, true)

  const conflict = createWorkActionProposal(store, {
    ownerId,
    workEntityRef: { id: project.project.id, type: 'work.project', ownerDomain: 'work', ownerId },
    proposedTaskTitle: 'Different',
    safeContext: 'Needs review',
    idempotencyKey: 'proposal-1',
  })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.error.code, 'work_idempotency_conflict')

  draft.proposal.status = 'proposed'
  store.proposals.set(draft.proposal.id, draft.proposal)

  const blocked = convertWorkActionProposalToPlanTask(store, {
    id: draft.proposal.id,
    ownerId,
    userRequested: true,
  }, { conversionEnabled: false })
  assert.equal(blocked.error.code, 'work_conversion_flag_off')

  const converted = convertWorkActionProposalToPlanTask(store, {
    id: draft.proposal.id,
    ownerId,
    userRequested: true,
  }, { conversionEnabled: true })
  assert.equal(converted.ok, true)
  assert.equal(converted.simulation, true)
  assert.equal(converted.productionWrite, false)
  assert.equal(converted.proposal.status, 'converted')
  assert.equal(converted.planTaskRef.taskRef.type, 'plan.task')
  assert.equal(converted.createTaskAction.actionType, 'plan.create_task')
  assert.equal(converted.createTaskAction.producer, 'plan')
})

test('cancel proposal and reject silent conversion', () => {
  const store = createWorkMemoryStore()
  const project = createWorkProject(store, { ownerId, title: 'P', safeSummary: 'S' })
  const proposal = createWorkActionProposal(store, {
    ownerId,
    workEntityRef: { id: project.project.id, type: 'work.project', ownerDomain: 'work', ownerId },
    proposedTaskTitle: 'Cancel me',
    safeContext: 'draft',
    idempotencyKey: 'cancel-1',
  })
  const cancelled = cancelWorkActionProposal(store, { id: proposal.proposal.id, ownerId })
  assert.equal(cancelled.ok, true)
  assert.equal(cancelled.proposal.status, 'cancelled')

  const silent = convertWorkActionProposalToPlanTask(store, {
    id: proposal.proposal.id,
    ownerId,
    userRequested: false,
  }, { conversionEnabled: true })
  assert.equal(silent.error.code, 'work_explicit_user_required')
})

test('Plan/Library reconciliation and Today Work projection', () => {
  const fixture = structuredClone(valid.get('work-project-active'))
  const store = createWorkMemoryStore({
    projects: [fixture],
    deliverables: [structuredClone(valid.get('work-deliverable-in-progress'))],
    meetings: [structuredClone(valid.get('work-meeting-with-decisions'))],
    decisions: [structuredClone(valid.get('work-cross-domain-entity-refs'))],
    proposals: [structuredClone(valid.get('work-action-proposal-proposed'))],
    planTasks: [],
  })
  const plan = reconcilePlanTaskRefs(store, ownerId)
  assert.ok(plan.mismatches.some((row) => row.classes.includes('missing_task')))

  const library = reconcileLibraryRefs(store, ownerId)
  assert.equal(library.ok, true)

  const today = buildWorkTodayProjection(store, ownerId, { now: '2026-07-19T00:00:00.000Z' })
  assert.equal(today.ownerDomain, 'work')
  assert.ok(today.cards.every((card) => card.ownerDomain === 'work' && card.executorAvailable === false))
  assert.ok(today.cards.every((card) => card.deepLink && card.futureActionCapability && card.dataClassification))
  assert.ok(today.counts.activeProjects >= 1)
  assert.ok(today.counts.pendingProposals >= 1)

  const shadow = compareWorkShadow({ projectCount: 2, projectIds: [fixture.id, 'missing'] }, today)
  assert.ok(shadow.mismatches.some((row) => row.class === 'missing_in_new'))
})

test('conversion flag defaults Off and connector registry stays read-only', () => {
  assert.equal(isWorkTaskConversionEnabled({}), false)
  assert.ok(CONNECTOR_REGISTRY_PROPOSAL.every((entry) => entry.readWriteCapability === 'read_only'))
})

test('rejects Work writing canonical Task or transcript payload', () => {
  const store = createWorkMemoryStore()
  const project = createWorkProject(store, { ownerId, title: 'P', safeSummary: 'S', task: { id: 'x' } })
  assert.equal(project.error.code, 'work_must_not_embed_canonical_task')

  const ok = createWorkProject(store, { ownerId, title: 'P', safeSummary: 'S' })
  const meeting = recordWorkMeeting(store, {
    ownerId,
    projectId: ok.project.id,
    title: 'Bad',
    occurredAt: '2026-07-19T01:00:00.000Z',
    safeSummary: 'ok',
    transcript: 'full text',
  })
  assert.equal(meeting.error.code, 'work_sensitive_payload')
})
