import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ASK_SESSION_COPY,
  canClaimEmptyAttention,
  productSessionLabels,
  resolveProductSessionState,
} from './productSessionState.core.js'

describe('productSessionState.core', () => {
  it('maps signed-out to disconnected + locked surfaces (never synced)', () => {
    const session = resolveProductSessionState({
      cloudReady: true,
      cloudUser: null,
      cloudAuthorized: false,
      sources: {
        today: { status: 'permission_denied' },
        inbox: { status: 'permission_denied' },
      },
    })
    assert.equal(session.authenticationState, 'signed_out')
    assert.equal(session.accountSyncState, 'disconnected')
    assert.equal(session.crossSpaceSummaryState, 'locked')
    assert.equal(session.inboxSyncState, 'locked')
    assert.equal(session.needsSignIn, true)
    assert.equal(session.showTodaySkeleton, false)
    assert.equal(productSessionLabels(session).accountStatus, '未连接')
  })

  it('does not show Today skeleton while locked / signed out', () => {
    const session = resolveProductSessionState({
      cloudReady: true,
      cloudUser: null,
      cloudAuthorized: false,
      controlLoading: true,
      sources: {
        today: { status: 'loading' },
        inbox: { status: 'loading' },
      },
    })
    assert.equal(session.crossSpaceSummaryState, 'locked')
    assert.equal(session.showTodaySkeleton, false)
  })

  it('shows skeleton only while syncing with a readable auth path', () => {
    const session = resolveProductSessionState({
      cloudReady: true,
      cloudUser: { id: 'u1', email: 'owner@example.com' },
      cloudAuthorized: true,
      controlLoading: true,
      sources: {
        today: { status: 'loading' },
        inbox: { status: 'loading' },
      },
    })
    assert.equal(session.authenticationState, 'signed_in')
    assert.equal(session.accountSyncState, 'syncing')
    assert.equal(session.crossSpaceSummaryState, 'syncing')
    assert.equal(session.showTodaySkeleton, true)
    assert.equal(session.needsSignIn, false)
  })

  it('treats signed-in but unauthorized as partial, not synced', () => {
    const session = resolveProductSessionState({
      cloudReady: true,
      cloudUser: { id: 'u1', email: 'other@example.com' },
      cloudAuthorized: false,
      sources: {
        today: { status: 'permission_denied' },
        inbox: { status: 'permission_denied' },
      },
    })
    assert.equal(session.authenticationState, 'signed_in')
    assert.equal(session.accountSyncState, 'partial')
    assert.equal(session.needsSignIn, true)
    assert.notEqual(productSessionLabels(session).accountStatus, '已同步')
  })

  it('reports synced only when Continuity reads are ready', () => {
    const session = resolveProductSessionState({
      cloudReady: true,
      cloudUser: { id: 'u1', email: 'owner@example.com' },
      cloudAuthorized: true,
      cloudLastSyncAt: Date.now(),
      sources: {
        today: { status: 'ready' },
        inbox: { status: 'empty' },
      },
    })
    assert.equal(session.accountSyncState, 'synced')
    assert.equal(productSessionLabels(session).accountStatus, '已同步')
  })

  it('refuses empty-attention claims when data is unread', () => {
    assert.equal(
      canClaimEmptyAttention({
        summary: null,
        queue: { inboxOpen: null, approvalsOpen: null },
      }),
      false,
    )
    const locked = resolveProductSessionState({
      cloudReady: true,
      cloudUser: null,
      cloudAuthorized: false,
      sources: {
        today: { status: 'permission_denied' },
        inbox: { status: 'permission_denied' },
      },
    })
    assert.equal(
      canClaimEmptyAttention({ summary: null, queue: null, session: locked }),
      false,
    )
    assert.match(ASK_SESSION_COPY.unavailable, /连接 Korben 账户/)
    assert.match(ASK_SESSION_COPY.empty, /没有需要立即处理/)
  })
})
