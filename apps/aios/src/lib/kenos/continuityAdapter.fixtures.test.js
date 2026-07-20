/**
 * Planner / Fitness Space Continuity adapter unit proofs (no browser).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildResumeDescriptor,
  resumeDescriptorToOpenUrl,
  isResumeExpired,
  fallbackResumeToHome,
  bindOwnerClear,
} from './continuityAdapter.fixtures.js'

describe('space continuity adapters (descriptor shape)', () => {
  it('planner descriptor restores filter + task via query', () => {
    const d = buildResumeDescriptor({
      userId: 'u1',
      spaceId: 'plan',
      route: 'https://planner.kenos.space/upcoming',
      entityId: 'task-demo',
      displayTitle: 'Plan',
      displaySubtitle: 'Upcoming · Overdue · 测试任务',
      substate: { filter: 'overdue', detailOpen: true, progress: '任务详情已打开' },
    })
    const url = resumeDescriptorToOpenUrl(d)
    assert.match(url, /\/upcoming/)
    assert.match(url, /kenosTask=task-demo/)
    assert.match(url, /kenosFilter=overdue/)
    assert.match(url, /kenosDetail=1/)
  })

  it('fitness descriptor restores exercise + set via query', () => {
    const d = buildResumeDescriptor({
      userId: 'u1',
      spaceId: 'training',
      route: 'https://fitness.kenos.space/day/chest/focus',
      entityId: 'c_fly',
      displayTitle: 'Training',
      displaySubtitle: '龙门架夹胸 · Set 2 of 4',
      substate: { set: 2, exerciseId: 'c_fly', dayId: 'chest', progress: 'Set 2 of 4' },
    })
    const url = resumeDescriptorToOpenUrl(d)
    assert.match(url, /\/day\/chest\/focus/)
    assert.match(url, /kenosEx=c_fly/)
    assert.match(url, /kenosSet=2/)
  })

  it('expired descriptor falls back to home without dropping fields', () => {
    const now = Date.now()
    const d = buildResumeDescriptor({
      userId: 'u1',
      spaceId: 'training',
      route: 'https://fitness.kenos.space/day/chest/focus?kenosEx=c_fly',
      displayTitle: 'Training',
      displaySubtitle: 'Cable fly · Set 2 of 4',
      updatedAt: now - 5000,
      expiresAt: now - 1000,
    })
    assert.equal(isResumeExpired(d, now), true)
    const fb = fallbackResumeToHome(d, 'https://fitness.kenos.space/')
    assert.equal(fb.route, 'https://fitness.kenos.space/')
    assert.equal(fb.displayTitle, 'Training')
    assert.ok(fb.substate.priorRoute.includes('/day/chest/focus'))
  })

  it('account switch clears continue namespace', () => {
    const cleared = bindOwnerClear(
      { ownerId: 'a', resume: { 'hosted:plan': { route: '/x' } } },
      'b',
    )
    assert.equal(cleared.ownerId, 'b')
    assert.deepEqual(cleared.resume, {})
  })
})
