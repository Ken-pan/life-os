import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FOCUS_DEFERRED_SELECT,
  FOCUS_SUGGESTIONS_SELECT,
  focusDeferredCapability,
  focusSuggestionsCapability,
  isFocusSideReadAvailable,
} from './focusSideReads.core.js'
import { readCanonicalFocusSource } from './focusReadSource.core.js'

describe('focusSideReads', () => {
  it('marks deferred/suggestions unavailable when Focus read Off — no network', async () => {
    const calls = []
    const client = {
      rpc: async (name) => {
        calls.push(['rpc', name])
        return { data: [], error: null }
      },
      from(table) {
        calls.push(['from', table])
        return {
          select() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
        }
      },
    }
    const focus = await readCanonicalFocusSource({
      client,
      authorized: true,
      online: true,
      env: {},
    })
    assert.equal(focus.state.status, 'unsupported')
    assert.equal(isFocusSideReadAvailable('deferred', {}), false)
    assert.equal(isFocusSideReadAvailable('suggestions', {}), false)
    assert.deepEqual(
      calls.filter((c) => c[0] === 'from'),
      [],
    )
    assert.equal(focusDeferredCapability({}).surface, 'unavailable')
    assert.equal(focusSuggestionsCapability({}).surface, 'unavailable')
  })

  it('skips side GETs when side flags Off even if Focus On', async () => {
    const fromTables = []
    const client = {
      rpc: async () => ({
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            owner_id: '22222222-2222-4222-8222-222222222222',
            mode: 'deep_work',
            status: 'active',
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      }),
      from(table) {
        fromTables.push(table)
        return {
          select() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
        }
      },
    }
    const focus = await readCanonicalFocusSource({
      client,
      authorized: true,
      online: true,
      env: {
        VITE_KENOS_PROD_READ_FOCUS: '1',
        VITE_KENOS_PROD_READ_FOCUS_DEFERRED: '0',
        VITE_KENOS_PROD_READ_FOCUS_SUGGESTIONS: '0',
      },
    })
    assert.equal(focus.state.status, 'ready')
    assert.deepEqual(fromTables, [])
    assert.equal(focus.sideCapabilities.deferred, 'unavailable')
    assert.equal(focus.sideCapabilities.suggestions, 'unavailable')
  })

  it('uses schema-aligned selects when side reads available', async () => {
    const selects = []
    const client = {
      rpc: async () => ({
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            owner_id: '22222222-2222-4222-8222-222222222222',
            mode: 'deep_work',
            status: 'active',
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      }),
      from(table) {
        return {
          select(cols) {
            selects.push({ table, cols })
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
        }
      },
    }
    await readCanonicalFocusSource({
      client,
      authorized: true,
      online: true,
      env: { VITE_KENOS_PROD_READ_FOCUS: '1' },
    })
    assert.ok(selects.some((s) => s.table === 'kenos_deferred_items' && s.cols === FOCUS_DEFERRED_SELECT))
    assert.ok(
      selects.some((s) => s.table === 'kenos_proactive_suggestions' && s.cols === FOCUS_SUGGESTIONS_SELECT),
    )
  })

  it('records side error without pretending empty when request fails', async () => {
    const client = {
      rpc: async () => ({
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            owner_id: '22222222-2222-4222-8222-222222222222',
            mode: 'deep_work',
            status: 'active',
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      }),
      from() {
        return {
          select() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({ data: null, error: { message: 'column missing', code: '42703' } })
          },
        }
      },
    }
    const focus = await readCanonicalFocusSource({
      client,
      authorized: true,
      online: true,
      env: { VITE_KENOS_PROD_READ_FOCUS: '1' },
    })
    assert.equal(focus.state.status, 'partial')
    assert.equal(focus.sideCapabilities.deferred, 'error')
    assert.equal(focus.sideCapabilities.suggestions, 'error')
    assert.equal(focus.deferred.length, 0)
    assert.match(focus.state.message, /部分相关来源异常/)
  })
})
