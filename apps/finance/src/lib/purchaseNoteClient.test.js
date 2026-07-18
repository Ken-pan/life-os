import { describe, it, expect } from 'vitest'
import { loadNote, saveNote } from './purchaseNoteClient.js'

// FINC.PURCHASE.6b — note + handled ("已处理") load/save boundaries.
//
// Exercised against an in-memory RPC that mirrors the Postgres functions in
// supabase/migrations/20260717230000_finance_purchase_notes.sql: a missing row
// reads back as empty defaults, purchase_note_set upserts full-field, and
// handled_at is stamped on the transition into handled and cleared on unmark.

function makeFakeDb({ now = '2026-07-17T00:00:00.000Z' } = {}) {
  /** @type {Map<string, { note: string, handled: boolean, handled_at: string|null }>} */
  const rows = new Map()

  function get({ p_transaction_id }) {
    const r = rows.get(p_transaction_id)
    if (!r) return { ok: true, note: '', handled: false, handled_at: null }
    return { ok: true, note: r.note, handled: r.handled, handled_at: r.handled_at }
  }

  function set({ p_transaction_id, p_note, p_handled }) {
    const prev = rows.get(p_transaction_id)
    const handled = !!p_handled
    const handled_at = handled ? (prev?.handled_at ?? now) : null
    const row = { note: p_note ?? '', handled, handled_at }
    rows.set(p_transaction_id, row)
    return { ok: true, ...row }
  }

  const rpc = async (name, params) => {
    if (name === 'purchase_note_get') return { data: get(params), error: null }
    if (name === 'purchase_note_set') return { data: set(params), error: null }
    return { data: null, error: { message: `unknown rpc ${name}` } }
  }

  return { rpc, rows }
}

const failingRpc = async () => ({ data: null, error: { message: 'relation does not exist' } })
const throwingRpc = async () => {
  throw new Error('network down')
}

describe('loadNote', () => {
  it('returns empty-but-available defaults when no row exists', async () => {
    const { rpc } = makeFakeDb()
    expect(await loadNote(rpc, 'txn-1')).toEqual({
      available: true,
      note: '',
      handled: false,
      handledAt: null,
    })
  })

  it('returns the saved note + handled flag', async () => {
    const { rpc } = makeFakeDb()
    await saveNote(rpc, { transactionId: 'txn-1', note: '已退货，等信用卡冲正', handled: true })
    expect(await loadNote(rpc, 'txn-1')).toEqual({
      available: true,
      note: '已退货，等信用卡冲正',
      handled: true,
      handledAt: '2026-07-17T00:00:00.000Z',
    })
  })

  it('self-hides (available:false) on a transport error — migration not deployed', async () => {
    expect(await loadNote(failingRpc, 'txn-1')).toEqual({
      available: false,
      note: '',
      handled: false,
      handledAt: null,
    })
  })

  it('self-hides on a thrown error', async () => {
    const res = await loadNote(throwingRpc, 'txn-1')
    expect(res.available).toBe(false)
  })
})

describe('saveNote', () => {
  it('persists a note and echoes the server row', async () => {
    const { rpc, rows } = makeFakeDb()
    const patch = await saveNote(rpc, { transactionId: 'txn-1', note: 'hello', handled: false })
    expect(patch).toEqual({ status: 'saved', note: 'hello', handled: false, handledAt: null })
    expect(rows.get('txn-1').note).toBe('hello')
  })

  it('stamps handled_at on the transition into handled', async () => {
    const { rpc } = makeFakeDb()
    const patch = await saveNote(rpc, { transactionId: 'txn-1', note: '', handled: true })
    expect(patch.handled).toBe(true)
    expect(patch.handledAt).toBe('2026-07-17T00:00:00.000Z')
  })

  it('keeps handled_at stable across an edit that stays handled', async () => {
    const { rpc } = makeFakeDb({ now: '2026-07-17T00:00:00.000Z' })
    await saveNote(rpc, { transactionId: 'txn-1', note: 'a', handled: true })
    const patch = await saveNote(rpc, { transactionId: 'txn-1', note: 'b', handled: true })
    expect(patch.note).toBe('b')
    expect(patch.handledAt).toBe('2026-07-17T00:00:00.000Z') // not re-stamped
  })

  it('clears handled_at when unmarked', async () => {
    const { rpc } = makeFakeDb()
    await saveNote(rpc, { transactionId: 'txn-1', note: 'a', handled: true })
    const patch = await saveNote(rpc, { transactionId: 'txn-1', note: 'a', handled: false })
    expect(patch.handled).toBe(false)
    expect(patch.handledAt).toBeNull()
  })

  it('returns error + keeps optimistic values on a transport error', async () => {
    const patch = await saveNote(failingRpc, { transactionId: 'txn-1', note: 'keep me', handled: true })
    expect(patch).toEqual({ status: 'error', note: 'keep me', handled: true, handledAt: null })
  })

  it('returns error on a thrown error', async () => {
    const patch = await saveNote(throwingRpc, { transactionId: 'txn-1', note: 'x', handled: false })
    expect(patch.status).toBe('error')
  })
})
