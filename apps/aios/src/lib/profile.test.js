import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_USER_PROFILE,
  PROFILE_SCHEMA_VERSION,
  migrateUserProfile,
} from './profile.js'

const LEGACY_FOCUS =
  '近期重心:冲刺个人作品集 portfolio2026(SvelteKit),准备"作品集马拉松"。'

test('default profile contains only stable facts', () => {
  assert.equal(DEFAULT_USER_PROFILE.includes(LEGACY_FOCUS), false)
  assert.equal(DEFAULT_USER_PROFILE.includes('近期重心:'), false)
})

test('v1 profile migration removes the known stale focus and preserves edits', () => {
  const migrated = migrateUserProfile(
    `自定义事实:喜欢短回答。\n${LEGACY_FOCUS}\n自定义事实:称呼树冲。`,
    1,
  )

  assert.equal(migrated.includes(LEGACY_FOCUS), false)
  assert.match(migrated, /自定义事实:喜欢短回答。/)
  assert.match(migrated, /自定义事实:称呼树冲。/)
})

test('current profile schema never rewrites user-authored content', () => {
  const custom = `近期重心:这是用户后来手动写入的新内容。\n${LEGACY_FOCUS}`
  assert.equal(migrateUserProfile(custom, PROFILE_SCHEMA_VERSION), custom)
})

test('non-string legacy profile falls back to the stable default', () => {
  assert.equal(migrateUserProfile(null, 1), DEFAULT_USER_PROFILE)
})
