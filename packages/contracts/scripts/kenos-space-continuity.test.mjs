import assert from 'node:assert/strict'
import {
  KenosResumeDescriptorSchema,
  KenosContinueStoreSchema,
  KENOS_RESUME_DESCRIPTOR_VERSION,
  spaceIdFromListKey,
  listKeyForSpaceId,
} from '../src/kenos-space-continuity.ts'

const OWNER = '20000000-0000-4000-8000-000000000001'
const now = new Date().toISOString()
const later = new Date(Date.now() + 86400000).toISOString()

const ok = KenosResumeDescriptorSchema.safeParse({
  version: KENOS_RESUME_DESCRIPTOR_VERSION,
  userId: OWNER,
  spaceId: 'plan',
  route: 'https://planner.kenos.space/upcoming?kenosTask=t1&kenosFilter=overdue',
  entityId: 't1',
  substate: { filter: 'overdue', detailOpen: true },
  displayTitle: 'Plan',
  displaySubtitle: 'Upcoming · Overdue · 测试任务',
  updatedAt: now,
  expiresAt: later,
})
assert.equal(ok.success, true)

const sensitive = KenosResumeDescriptorSchema.safeParse({
  version: 1,
  userId: OWNER,
  spaceId: 'plan',
  route: '/upcoming',
  displayTitle: 'token leaked',
  updatedAt: now,
})
assert.equal(sensitive.success, false)

assert.equal(spaceIdFromListKey('hosted:training'), 'training')
assert.equal(listKeyForSpaceId('plan'), 'hosted:plan')

const store = KenosContinueStoreSchema.safeParse({
  version: 2,
  ownerId: OWNER,
  recent: ['hosted:plan'],
  pinned: [],
  resume: {
    'hosted:plan': ok.data,
  },
  currentListKey: 'hosted:plan',
})
assert.equal(store.success, true)

console.log('kenos-space-continuity contract ok')
