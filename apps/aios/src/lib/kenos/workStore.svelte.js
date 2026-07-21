/**
 * Session-local Work foundation store for AIOS Phase 3 simulation.
 * Not a production writer. Feature flag default Off for remote hosts.
 */

import {
  buildWorkTodayProjection,
  createWorkActionProposal,
  createWorkDeliverable,
  createWorkMemoryStore,
  createWorkProject,
  convertWorkActionProposalToPlanTask,
  isWorkFoundationEnabled,
  isWorkTaskConversionEnabled,
  recordWorkDecision,
  recordWorkMeeting,
  updateWorkDeliverableStatus,
} from './workCommand.core.js'

const DEMO_OWNER = '20000000-0000-4000-8000-000000000001'

function emptyProjection() {
  return {
    ownerDomain: 'work',
    source: 'kenos_work_local_projection',
    freshness: 'empty',
    lastUpdated: null,
    cards: [],
    counts: {
      activeProjects: 0,
      deliverablesDueSoon: 0,
      blockedDeliverables: 0,
      recentMeetings: 0,
      unresolvedDecisions: 0,
      pendingProposals: 0,
      staleSources: 0,
    },
  }
}

function createDemoStore() {
  const store = createWorkMemoryStore()
  const project = createWorkProject(store, {
    id: 'a1000000-0000-4000-8000-000000000001',
    ownerId: DEMO_OWNER,
    title: 'Kenos Phase 3',
    safeSummary: 'Work loop foundation · local simulation only',
    status: 'active',
    priority: 'high',
    sourceRefs: [{
      sourceType: 'jira',
      connectorId: 'jira-read-only',
      externalId: 'PROJ-12',
      deepLink: 'https://example.atlassian.net/browse/PROJ-12',
      safeLabel: 'Jira PROJ-12',
      dataClassification: 'work_confidential',
      available: true,
    }],
    libraryRefs: [{
      libraryRef: {
        id: 'b1000000-0000-4000-8000-000000000001',
        type: 'library.document',
        ownerDomain: 'library',
        ownerId: DEMO_OWNER,
      },
      safeTitle: 'Phase 3 brief',
      dataClassification: 'work_confidential',
      sourceAvailable: true,
      deepLink: 'https://knowledge.kenos.space/library/b1000000-0000-4000-8000-000000000001',
    }],
  })
  createWorkDeliverable(store, {
    id: 'a2000000-0000-4000-8000-000000000001',
    ownerId: DEMO_OWNER,
    projectId: project.project.id,
    title: 'Work contracts',
    safeSummary: 'Contracts and fixtures',
    status: 'in_progress',
    targetAt: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(),
  })
  createWorkDeliverable(store, {
    id: 'a2000000-0000-4000-8000-000000000002',
    ownerId: DEMO_OWNER,
    projectId: project.project.id,
    title: 'Connector auto-write',
    safeSummary: 'Blocked until policy review',
    status: 'blocked',
  })
  const meeting = recordWorkMeeting(store, {
    id: 'a3000000-0000-4000-8000-000000000001',
    ownerId: DEMO_OWNER,
    projectId: project.project.id,
    title: 'Ownership review',
    occurredAt: new Date().toISOString(),
    safeSummary: 'Temporary Work ownership approved for foundation',
  })
  recordWorkDecision(store, {
    id: 'a4000000-0000-4000-8000-000000000001',
    ownerId: DEMO_OWNER,
    projectId: project.project.id,
    meetingId: meeting.meeting.id,
    title: 'Host Work in AIOS',
    safeSummary: 'Do not create a new OS app for foundation',
    status: 'proposed',
  })
  createWorkActionProposal(store, {
    id: 'a5000000-0000-4000-8000-000000000002',
    ownerId: DEMO_OWNER,
    workEntityRef: { id: project.project.id, type: 'work.project', ownerDomain: 'work', ownerId: DEMO_OWNER },
    proposedTaskTitle: 'Write Phase 3 closeout notes',
    safeContext: 'Awaiting explicit Create task confirmation',
    status: 'proposed',
    risk: 'R2',
    idempotencyKey: 'demo-proposal-1',
  })
  return store
}

function readDemoFlag() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('kenosDemo') === '1'
}

export const WORK = $state({
  enabled: false,
  conversionEnabled: false,
  demo: false,
  status: 'loading',
  error: null,
  store: createWorkMemoryStore(),
  projection: emptyProjection(),
  lastMessage: null,
})

export function refreshWorkSurface({ force = false } = {}) {
  const enabled = isWorkFoundationEnabled(import.meta.env) || readDemoFlag()
  const conversionEnabled = isWorkTaskConversionEnabled(import.meta.env) && enabled
  const demo = readDemoFlag()

  WORK.enabled = enabled
  WORK.conversionEnabled = conversionEnabled
  WORK.demo = demo

  if (!enabled) {
    WORK.status = 'unsupported'
    WORK.projection = emptyProjection()
    WORK.projection.freshness = 'unsupported'
    WORK.error = null
    return WORK
  }

  if (force || WORK.store.projects.size === 0) {
    WORK.store = demo ? createDemoStore() : createWorkMemoryStore()
  }

  WORK.projection = buildWorkTodayProjection(WORK.store, DEMO_OWNER)
  WORK.status = WORK.projection.cards.length ? 'ready' : 'empty'
  WORK.error = null
  void import('./nativeLocalAlerts.js')
    .then((m) =>
      m.syncDeliverableDueAlerts(WORK.projection.cards || [], { demo: WORK.demo }),
    )
    .catch(() => {})
  return WORK
}

export function listWorkProjects() {
  return [...WORK.store.projects.values()]
}

export function listWorkDeliverables() {
  return [...WORK.store.deliverables.values()]
}

export function listWorkMeetings() {
  return [...WORK.store.meetings.values()]
}

export function listWorkDecisions() {
  return [...WORK.store.decisions.values()]
}

export function listWorkProposals() {
  return [...WORK.store.proposals.values()]
}

export function convertProposal(proposalId) {
  if (!WORK.enabled) return { ok: false, error: { code: 'work_disabled', message: 'Work foundation disabled' } }
  // Read Client Canary / production writes: conversion never hits Kenos Plan command RPC.
  const result = convertWorkActionProposalToPlanTask(
    WORK.store,
    { id: proposalId, ownerId: DEMO_OWNER, userRequested: true },
    { conversionEnabled: WORK.conversionEnabled || WORK.demo },
  )
  WORK.lastMessage = result.ok
    ? `已转换为 Plan Task（simulation · productionWrite=${result.productionWrite}）`
    : result.error.message
  snapshotWorkStore()
  refreshWorkSurface()
  return result
}

export function updateDeliverable(id, status) {
  const result = updateWorkDeliverableStatus(WORK.store, { id, ownerId: DEMO_OWNER, status })
  snapshotWorkStore()
  refreshWorkSurface()
  return result
}

function snapshotWorkStore() {
  WORK.store = createWorkMemoryStore({
    projects: [...WORK.store.projects.values()],
    deliverables: [...WORK.store.deliverables.values()],
    meetings: [...WORK.store.meetings.values()],
    decisions: [...WORK.store.decisions.values()],
    proposals: [...WORK.store.proposals.values()],
    activities: [...WORK.store.activities],
    planTasks: [...WORK.store.planTasks.values()],
  })
}
