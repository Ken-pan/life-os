import assert from 'node:assert/strict'

import { createLocalCache } from '../src/localCache.js'

/** @type {Record<string, string>} */
const store = {}

const mockStorage = {
  get length() {
    return Object.keys(store).length
  },
  key(index) {
    return Object.keys(store)[index] ?? null
  },
  getItem(key) {
    return store[key] ?? null
  },
  setItem(key, value) {
    store[key] = value
  },
  removeItem(key) {
    delete store[key]
  },
  clear() {
    for (const key of Object.keys(store)) delete store[key]
  },
}

const originalWindow = globalThis.window

globalThis.window = /** @type {Window & typeof globalThis} */ ({
  localStorage: mockStorage,
})

try {
  const cache = createLocalCache({ prefix: 'test_cache' })

  assert.throws(() => createLocalCache({ prefix: '' }), /prefix is required/)

  cache.writeCache('state', 'user-1', { tasks: [1] })
  assert.deepEqual(cache.readCache('state', 'user-1'), { tasks: [1] })
  assert.equal(cache.readCache('state', 'user-2'), null)

  mockStorage.setItem(
    'life_os_auth',
    JSON.stringify({ user: { id: 'uid-42' } }),
  )
  assert.equal(cache.peekSessionUserId(), 'uid-42')

  mockStorage.setItem(
    'life_os_auth',
    JSON.stringify({ currentSession: { user: { id: 'uid-legacy' } } }),
  )
  assert.equal(cache.peekSessionUserId(), 'uid-legacy')

  cache.writeCache('other', 'user-1', { x: 1 })
  cache.clearAllCache()
  assert.equal(cache.readCache('state', 'user-1'), null)
  assert.equal(cache.readCache('other', 'user-1'), null)

  const customAuth = createLocalCache({
    prefix: 'custom_cache',
    authStorageKey: 'custom_auth',
  })
  mockStorage.setItem('custom_auth', JSON.stringify({ user: { id: 'custom' } }))
  assert.equal(customAuth.peekSessionUserId(), 'custom')
  assert.equal(cache.peekSessionUserId(), 'uid-legacy')

  mockStorage.setItem(
    'test_cache:state:user-1',
    JSON.stringify({ v: 99, userId: 'user-1', data: { stale: true } }),
  )
  assert.equal(cache.readCache('state', 'user-1'), null)
} finally {
  for (const key of Object.keys(store)) delete store[key]
  if (originalWindow === undefined) {
    // @ts-expect-error test cleanup
    delete globalThis.window
  } else {
    globalThis.window = originalWindow
  }
}

console.log('localCache.test.mjs: ok')
