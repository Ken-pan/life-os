import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SHELL_KEY_PINNED,
  SHELL_KEY_RECENT,
  SHELL_RESUME_PREFIX,
  applyShellRows,
  buildLocalShellRows,
  bumpShellSyncMeta,
  emptyShellSyncMeta,
  normalizeShellSyncMeta,
  planShellStateSync,
  resumeTimestampMs,
} from './shellStateSync.core.js'

const ISO = (ms) => new Date(ms).toISOString()

function stateWith({ pinned = [], recent = [], resume = {} } = {}) {
  return {
    version: 2,
    ownerId: 'u1',
    pinned,
    recent,
    resume,
    currentListKey: null,
  }
}

test('meta: 本地 pin/recent 变更 bump 时间戳,未变不 bump', () => {
  const prev = stateWith({ pinned: ['hosted:plan'], recent: ['hosted:plan'] })
  const next = stateWith({
    pinned: ['hosted:plan', 'hosted:money'],
    recent: ['hosted:plan'],
  })
  const meta = bumpShellSyncMeta(prev, next, emptyShellSyncMeta(), 1000)
  assert.equal(meta.pinnedAt, 1000)
  assert.equal(meta.recentAt, 0)
})

test('meta: 首次持久化(prev=null)不当作变更', () => {
  const meta = bumpShellSyncMeta(
    null,
    stateWith({ pinned: ['hosted:plan'] }),
    emptyShellSyncMeta(),
    1000,
  )
  assert.equal(meta.pinnedAt, 0)
})

test('meta: 本地删续播 → 墓碑;重新出现 → 撤销墓碑', () => {
  const resume = { 'hosted:plan': { updatedAt: ISO(500) } }
  const dropped = bumpShellSyncMeta(
    stateWith({ resume }),
    stateWith({}),
    emptyShellSyncMeta(),
    900,
  )
  assert.equal(dropped.tombstones[SHELL_RESUME_PREFIX + 'hosted:plan'], 900)

  const restored = bumpShellSyncMeta(
    stateWith({}),
    stateWith({ resume: { 'hosted:plan': { updatedAt: ISO(1200) } } }),
    dropped,
    1200,
  )
  assert.equal(restored.tombstones[SHELL_RESUME_PREFIX + 'hosted:plan'], undefined)
})

test('rows: 从未本地改过的 pinned/recent 不参与推送;续播带 descriptor 时间戳', () => {
  const state = stateWith({
    pinned: ['hosted:plan'],
    recent: ['hosted:plan'],
    resume: { 'hosted:plan': { route: '/tasks', updatedAt: ISO(2000) } },
  })
  const rows = buildLocalShellRows(state, emptyShellSyncMeta())
  assert.deepEqual(
    rows.map((r) => r.key),
    [SHELL_RESUME_PREFIX + 'hosted:plan'],
  )
  assert.equal(rows[0].updated_at, 2000)
})

test('rows: 改过的 pinned/recent + 墓碑全部成行', () => {
  const state = stateWith({ pinned: ['hosted:money'], recent: ['hosted:money'] })
  const meta = {
    pinnedAt: 100,
    recentAt: 200,
    tombstones: { [SHELL_RESUME_PREFIX + 'hosted:plan']: 300 },
  }
  const rows = buildLocalShellRows(state, meta)
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
  assert.deepEqual(byKey[SHELL_KEY_PINNED].value, { ids: ['hosted:money'] })
  assert.equal(byKey[SHELL_KEY_PINNED].updated_at, 100)
  assert.equal(byKey[SHELL_KEY_RECENT].updated_at, 200)
  assert.equal(byKey[SHELL_RESUME_PREFIX + 'hosted:plan'].deleted, true)
  assert.equal(byKey[SHELL_RESUME_PREFIX + 'hosted:plan'].updated_at, 300)
})

test('plan: 逐 key LWW,本地新推、远端新拉、相等不动', () => {
  const local = [
    { key: SHELL_KEY_PINNED, value: { ids: ['a'] }, updated_at: 100 },
    { key: SHELL_KEY_RECENT, value: { ids: ['a'] }, updated_at: 50 },
    { key: SHELL_RESUME_PREFIX + 'hosted:plan', value: {}, updated_at: 70 },
  ]
  const remote = [
    { key: SHELL_KEY_PINNED, value: { ids: ['b'] }, updated_at: 90 },
    { key: SHELL_KEY_RECENT, value: { ids: ['b'] }, updated_at: 50 },
    { key: SHELL_RESUME_PREFIX + 'hosted:money', value: {}, updated_at: 80 },
  ]
  const { toPush, toApply } = planShellStateSync(local, remote)
  assert.deepEqual(
    toPush.map((r) => r.key),
    [SHELL_KEY_PINNED, SHELL_RESUME_PREFIX + 'hosted:plan'],
  )
  assert.deepEqual(
    toApply.map((r) => r.key),
    [SHELL_RESUME_PREFIX + 'hosted:money'],
  )
})

test('plan: 远端墓碑比本地续播新 → 应用删除;本地更新 → 推回覆盖墓碑', () => {
  const resumeKey = SHELL_RESUME_PREFIX + 'hosted:plan'
  const newerTombstone = planShellStateSync(
    [{ key: resumeKey, value: {}, updated_at: 100 }],
    [{ key: resumeKey, value: null, updated_at: 200, deleted: true }],
  )
  assert.equal(newerTombstone.toPush.length, 0)
  assert.deepEqual(newerTombstone.toApply.map((r) => r.key), [resumeKey])

  const localWins = planShellStateSync(
    [{ key: resumeKey, value: {}, updated_at: 300 }],
    [{ key: resumeKey, value: null, updated_at: 200, deleted: true }],
  )
  assert.deepEqual(localWins.toPush.map((r) => r.key), [resumeKey])
  assert.equal(localWins.toApply.length, 0)
})

test('apply: 远端行合入状态并采信远端时间戳(不回推 ping-pong)', () => {
  const state = stateWith({
    pinned: ['hosted:plan'],
    resume: { 'hosted:plan': { route: '/a', updatedAt: ISO(100) } },
  })
  const meta = { pinnedAt: 50, recentAt: 0, tombstones: {} }
  const rows = [
    { key: SHELL_KEY_PINNED, value: { ids: ['hosted:money', 'hosted:plan'] }, updated_at: 900 },
    {
      key: SHELL_RESUME_PREFIX + 'hosted:money',
      value: { route: '/accounts', updatedAt: ISO(800) },
      updated_at: 800,
    },
    { key: SHELL_RESUME_PREFIX + 'hosted:plan', value: null, updated_at: 950, deleted: true },
  ]
  const applied = applyShellRows(state, meta, rows)
  assert.deepEqual(applied.state.pinned, ['hosted:money', 'hosted:plan'])
  assert.equal(applied.meta.pinnedAt, 900)
  assert.equal(applied.state.resume['hosted:plan'], undefined)
  assert.equal(applied.state.resume['hosted:money'].route, '/accounts')

  // 应用后再编行:pinned 用远端时间戳,与远端打平 → 不再推送
  const rowsAfter = buildLocalShellRows(applied.state, applied.meta)
  const { toPush } = planShellStateSync(rowsAfter, rows)
  assert.equal(toPush.length, 0)
})

test('meta 归一:脏输入不崩,墓碑只留 resume 命名空间', () => {
  const meta = normalizeShellSyncMeta({
    pinnedAt: '123',
    recentAt: NaN,
    tombstones: {
      [SHELL_RESUME_PREFIX + 'hosted:plan']: 5,
      'spaces.pinned': 7,
      [SHELL_RESUME_PREFIX + 'hosted:money']: 'bad',
    },
  })
  assert.equal(meta.pinnedAt, 123)
  assert.equal(meta.recentAt, 0)
  assert.deepEqual(meta.tombstones, { [SHELL_RESUME_PREFIX + 'hosted:plan']: 5 })
})

test('resumeTimestampMs: ISO 解析,坏值归 0', () => {
  assert.equal(resumeTimestampMs(ISO(1234)), 1234)
  assert.equal(resumeTimestampMs('not-a-date'), 0)
  assert.equal(resumeTimestampMs(undefined), 0)
})
