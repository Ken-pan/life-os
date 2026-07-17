import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planConversationSync,
  planMemorySync,
  planSettingsLww,
} from './cloud-sync.core.js'

test('conversation: local-only pushes', () => {
  const { toPush, toPull, toTombstone, dropLocal } = planConversationSync(
    [{ id: 'a', updatedAt: 10 }],
    [],
    {},
  )
  assert.deepEqual(
    toPush.map((c) => c.id),
    ['a'],
  )
  assert.equal(toPull.length, 0)
  assert.equal(toTombstone.length, 0)
  assert.equal(dropLocal.size, 0)
})

test('conversation: remote newer pulls; local newer pushes', () => {
  const pull = planConversationSync(
    [{ id: 'a', updatedAt: 10 }],
    [{ id: 'a', updated_at: 20, deleted: false }],
  )
  assert.deepEqual(pull.toPull, ['a'])
  assert.equal(pull.toPush.length, 0)

  const push = planConversationSync(
    [{ id: 'a', updatedAt: 30 }],
    [{ id: 'a', updated_at: 20, deleted: false }],
  )
  assert.equal(push.toPush[0].id, 'a')
  assert.equal(push.toPull.length, 0)
})

test('conversation: remote tombstone drops local unless local newer (revive)', () => {
  const drop = planConversationSync(
    [{ id: 'a', updatedAt: 10 }],
    [{ id: 'a', updated_at: 20, deleted: true }],
  )
  assert.ok(drop.dropLocal.has('a'))

  const revive = planConversationSync(
    [{ id: 'a', updatedAt: 30 }],
    [{ id: 'a', updated_at: 20, deleted: true }],
  )
  assert.equal(revive.toPush[0].id, 'a')
  assert.equal(revive.dropLocal.size, 0)
})

test('conversation: snapshot miss means local deleted → tombstone; unknown remote → pull', () => {
  const tomb = planConversationSync([], [{ id: 'gone', updated_at: 5, deleted: false }], {
    gone: 5,
  })
  assert.deepEqual(tomb.toTombstone, ['gone'])

  const pull = planConversationSync([], [{ id: 'new', updated_at: 5, deleted: false }], {})
  assert.deepEqual(pull.toPull, ['new'])
})

test('memory: push / tombstone / add / drop', () => {
  const plan = planMemorySync(
    [{ id: 'local-new' }, { id: 'doomed' }],
    [
      { id: 'doomed', deleted: true },
      { id: 'snap-del', text: 'x', created_at: 1, deleted: false },
      { id: 'remote-new', text: 'y', created_at: 2, deleted: false },
    ],
    ['snap-del'],
  )
  assert.deepEqual(
    plan.toPush.map((m) => m.id),
    ['local-new'],
  )
  assert.ok(plan.dropLocal.has('doomed'))
  assert.deepEqual(plan.toTombstone, ['snap-del'])
  assert.equal(plan.toAdd.length, 1)
  assert.equal(plan.toAdd[0].id, 'remote-new')
})

test('settings LWW', () => {
  assert.equal(planSettingsLww(0, 100, true), 'pull')
  assert.equal(planSettingsLww(200, 100, true), 'push')
  assert.equal(planSettingsLww(100, 100, true), 'noop')
  assert.equal(planSettingsLww(50, 0, false), 'push')
})
