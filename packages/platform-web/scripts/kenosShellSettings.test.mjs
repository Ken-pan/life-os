import assert from 'node:assert/strict'
import {
  normalizeShellTheme,
  normalizeShellLocaleMode,
  resolveShellLocale,
  pullKenosShellSettings,
  pushKenosShellSettings,
  bindKenosShellSettings,
  publishShellTheme,
  publishShellLocale,
  publishNotificationCategoryEnabled,
  readNotificationCategoryEnabled,
} from '../src/kenosShellSettings.js'

assert.equal(normalizeShellTheme('Dark'), 'dark')
assert.equal(normalizeShellTheme('LIGHT'), 'light')
assert.equal(normalizeShellTheme('auto'), 'auto')
assert.equal(normalizeShellTheme('nope'), 'auto')

assert.equal(normalizeShellLocaleMode('zh-CN'), 'zh')
assert.equal(normalizeShellLocaleMode('en-US'), 'en')
assert.equal(normalizeShellLocaleMode('system'), 'system')
assert.equal(normalizeShellLocaleMode(''), 'system')

assert.equal(resolveShellLocale('zh'), 'zh')
assert.equal(resolveShellLocale('en'), 'en')
assert.equal(resolveShellLocale('system', 'zh-Hans-CN'), 'zh')
assert.equal(resolveShellLocale('system', 'en-US'), 'en')

const pull = await pullKenosShellSettings()
assert.equal(pull.skipped, true)

const push = await pushKenosShellSettings({ theme: 'dark', locale: 'zh' })
assert.equal(push.skipped, true)

const dispose = bindKenosShellSettings({
  getTheme: () => 'auto',
  setTheme: () => {},
  getLocale: () => 'zh',
  setLocale: () => {},
})
assert.equal(typeof dispose, 'function')
dispose()

const themePub = await publishShellTheme('dark', () => {})
assert.equal(themePub.skipped, true)

const localePub = await publishShellLocale('en', () => {})
assert.equal(localePub.skipped, true)

const catSet = await publishNotificationCategoryEnabled('plan_reminder', false)
assert.equal(catSet.skipped, true)

const catGet = await readNotificationCategoryEnabled('plan_reminder', true)
assert.equal(catGet.skipped, true)
assert.equal(catGet.enabled, true)

console.log('kenosShellSettings.test.mjs: ok')
