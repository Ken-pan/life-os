import assert from 'node:assert/strict'
import {
  buildResumeDescriptor,
  encodeResumeHandoff,
  decodeResumeHandoff,
  isResumeExpired,
  fallbackResumeToHome,
  migrateLegacyResume,
  resumeDescriptorToOpenUrl,
  domainContinueStorageKey,
  buildKenosContinueHandoffUrl,
} from '../src/kenosSpaceContinuity.js'

const now = Date.now()
const d = buildResumeDescriptor({
  userId: 'user-a',
  spaceId: 'training',
  route: 'https://fitness.kenos.space/day/chest/focus',
  entityId: 'c_fly',
  displayTitle: 'Training',
  displaySubtitle: '龙门架夹胸 · Set 2 of 4',
  substate: { set: 2, exerciseId: 'c_fly', dayId: 'chest' },
  updatedAt: now,
})
assert.equal(d.version, 1)
assert.equal(d.spaceId, 'training')

const encoded = encodeResumeHandoff(d)
const decoded = decodeResumeHandoff(encoded)
assert.equal(decoded?.entityId, 'c_fly')
assert.equal(decoded?.substate?.set, 2)

const expired = buildResumeDescriptor({
  userId: 'user-a',
  spaceId: 'plan',
  route: 'https://planner.kenos.space/upcoming',
  displayTitle: 'Plan',
  updatedAt: now - 10000,
  expiresAt: now - 1000,
})
assert.equal(isResumeExpired(expired, now), true)
const fallback = fallbackResumeToHome(expired, 'https://planner.kenos.space/')
assert.equal(fallback.route, 'https://planner.kenos.space/')
assert.equal(fallback.substate.resumeFallback, 'unsupported_or_expired')

const legacy = migrateLegacyResume(
  'hosted:plan',
  {
    lastRoute: 'https://planner.kenos.space/upcoming',
    selectedEntityId: 'task-1',
    filter: 'Overdue',
    updatedAt: now,
  },
  'user-a',
)
assert.equal(legacy?.entityId, 'task-1')
assert.equal(legacy?.displaySubtitle, 'Overdue')

const openUrl = resumeDescriptorToOpenUrl({
  ...d,
  spaceId: 'plan',
  route: 'https://planner.kenos.space/upcoming',
  entityId: 'task-9',
  substate: { filter: 'overdue', detailOpen: true },
})
assert.match(openUrl, /kenosTask=task-9/)
assert.match(openUrl, /kenosFilter=overdue/)

const fitnessUrl = resumeDescriptorToOpenUrl(d)
assert.match(fitnessUrl, /kenosEx=c_fly/)
assert.match(fitnessUrl, /kenosSet=2/)

assert.equal(
  domainContinueStorageKey('planner', 'user-a'),
  'kenos.continue.v2.planner.user-a',
)

const handoff = buildKenosContinueHandoffUrl('http://127.0.0.1:5197', d)
assert.match(handoff, /kenosResume=/)
assert.match(handoff, /openContinue=1/)

console.log('kenosSpaceContinuity runtime ok')
