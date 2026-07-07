import assert from 'node:assert/strict'

import {
  createThemePreferenceStoreWeb,
  fromWebThemePreference,
  toWebThemePreference,
} from '../src/index.js'

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
    clear() {
      values.clear()
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    get length() {
      return values.size
    },
  }
}

assert.equal(toWebThemePreference('light'), 'light')
assert.equal(toWebThemePreference('dark'), 'dark')
assert.equal(toWebThemePreference('system'), 'auto')

assert.equal(fromWebThemePreference('light'), 'light')
assert.equal(fromWebThemePreference('dark'), 'dark')
assert.equal(fromWebThemePreference('auto'), 'system')

{
  const storage = createMemoryStorage()
  const store = createThemePreferenceStoreWeb({
    storageKey: 'theme',
    defaultPreference: 'dark',
    storage,
    apply: false,
  })

  assert.equal(store.getPreference(), 'dark')
  assert.equal(store.getWebPreference(), 'dark')

  store.setPreference('system')
  assert.equal(store.getPreference(), 'system')
  assert.equal(store.getWebPreference(), 'auto')
  assert.equal(storage.getItem('theme'), 'auto')

  store.destroy()
}

{
  const storage = createMemoryStorage({ theme: 'auto' })
  const store = createThemePreferenceStoreWeb({
    storageKey: 'theme',
    defaultPreference: 'dark',
    storage,
    apply: false,
  })

  assert.equal(store.getPreference(), 'system')
  assert.equal(store.getWebPreference(), 'auto')
  store.destroy()
}

{
  globalThis.window = {}
  const storage = createMemoryStorage()
  const store = createThemePreferenceStoreWeb({
    storageKey: 'theme',
    defaultPreference: 'system',
    storage,
    apply: false,
  })

  assert.equal(store.getPreference(), 'system')
  assert.equal(store.getWebPreference(), 'auto')
  assert.equal(store.getResolvedTheme(), 'light')
  store.destroy()
  Reflect.deleteProperty(globalThis, 'window')
}

console.log('appearance.test.mjs — OK')
