import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AUTH_WALL_DOCUMENT_TITLE,
  classifyClientStorageKey,
  clearUserScopedClientStorage,
  shouldClearClientStorageKey,
  stripUserFieldsFromSettings,
} from './clientSessionCleanup.core.js'

function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key(i) {
      return [...map.keys()][i] ?? null
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null
    },
    setItem(k, v) {
      map.set(k, String(v))
    },
    removeItem(k) {
      map.delete(k)
    },
    _map: map,
  }
}

describe('clientSessionCleanup.core', () => {
  it('classifies aios_memory_* as user-scoped', () => {
    assert.equal(classifyClientStorageKey('aios_memory_v1'), 'USER_SCOPED_MEMORY')
    assert.equal(classifyClientStorageKey('aios_memory_backup_v1'), 'USER_SCOPED_MEMORY')
    assert.equal(classifyClientStorageKey('aios_memory_dreamed_at_v1'), 'USER_SCOPED_CACHE')
    assert.equal(classifyClientStorageKey('aios_gateway_url_v1'), 'DEVICE_GENERIC_SETTING')
    assert.equal(shouldClearClientStorageKey('aios_memory_v1'), true)
    assert.equal(shouldClearClientStorageKey('aios_gateway_url_v1'), false)
    assert.equal(shouldClearClientStorageKey('aios_memory_unknown_x'), true)
  })

  it('clears user memory keys and keeps device gateway', () => {
    const ls = mockStorage({
      aios_memory_v1: JSON.stringify([{ id: '1', text: 'user fact about project Alpha' }]),
      aios_memory_seeded_v1: '1',
      aios_memory_backup_v1: '[]',
      aios_chats_v1: '[]',
      aios_gateway_url_v1: 'http://127.0.0.1:18888',
      aiosos_v1: JSON.stringify({
        settings: {
          theme: 'dark',
          locale: 'zh',
          location: 'Seattle',
          userProfile: '姓名:Secret',
          customPrompt: 'be witty',
          model: 'llm-fast',
        },
      }),
    })
    const ss = mockStorage({ aios_active_chat_v1: 'c1', aios_drafts_v1: '{}' })
    const result = clearUserScopedClientStorage({
      localStorage: ls,
      sessionStorage: ss,
      stripAiososUserFields: stripUserFieldsFromSettings,
    })
    assert.equal(result.ok, true)
    assert.equal(ls.getItem('aios_memory_v1'), null)
    assert.equal(ls.getItem('aios_memory_seeded_v1'), null)
    assert.equal(ls.getItem('aios_chats_v1'), null)
    assert.equal(ls.getItem('aios_gateway_url_v1'), 'http://127.0.0.1:18888')
    assert.equal(ss.getItem('aios_active_chat_v1'), null)
    const settings = JSON.parse(ls.getItem('aiosos_v1')).settings
    assert.equal(settings.theme, 'dark')
    assert.equal(settings.locale, 'zh')
    assert.equal(settings.model, 'llm-fast')
    assert.equal(settings.location, '')
    assert.equal(settings.userProfile, '')
    assert.equal(settings.customPrompt, '')
  })

  it('login A memory is gone before login B (storage isolation)', () => {
    const ls = mockStorage({
      aios_memory_v1: JSON.stringify([{ id: 'a', text: 'A private habit' }]),
    })
    clearUserScopedClientStorage({
      localStorage: ls,
      sessionStorage: mockStorage(),
      stripAiososUserFields: stripUserFieldsFromSettings,
    })
    assert.equal(ls.getItem('aios_memory_v1'), null)
    // B writes new memory
    ls.setItem('aios_memory_v1', JSON.stringify([{ id: 'b', text: 'B only' }]))
    const texts = JSON.parse(ls.getItem('aios_memory_v1')).map((m) => m.text)
    assert.deepEqual(texts, ['B only'])
    assert.ok(!texts.some((t) => /A private/.test(t)))
  })

  it('auth wall title is stable and non-contextual', () => {
    assert.equal(AUTH_WALL_DOCUMENT_TITLE, 'Kenos — Sign in')
    assert.ok(!/Work|Focus|Inbox|Training|Today/i.test(AUTH_WALL_DOCUMENT_TITLE))
  })

  it('UNKNOWN aios_memory_* prefixes fail closed (cleared)', () => {
    const ls = mockStorage({ aios_memory_experimental_v9: '{"x":1}' })
    clearUserScopedClientStorage({
      localStorage: ls,
      sessionStorage: mockStorage(),
      stripAiososUserFields: stripUserFieldsFromSettings,
    })
    assert.equal(ls.getItem('aios_memory_experimental_v9'), null)
  })
})
