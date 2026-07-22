import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveAssistantSurface,
  liveStateForAssistantSurface,
  conversationIdFromSearch,
  buildAssistantHref,
  buildAssistantNavManifest,
  composerPlaceholderKind,
  reconcileUrlToState,
  reconcileStateToUrl,
  readLocalModeAccepted,
  ASSISTANT_LOCAL_MODE_KEY,
} from './assistantShell.core.js'

describe('resolveAssistantSurface', () => {
  it('prefers conversation when messages exist', () => {
    assert.equal(
      resolveAssistantSurface({
        activeId: 'c1',
        messageCount: 2,
        signedOut: true,
      }),
      'conversation',
    )
  })

  it('treats streaming empty thread as conversation', () => {
    assert.equal(
      resolveAssistantSurface({
        activeId: 'c1',
        messageCount: 0,
        streaming: true,
      }),
      'conversation',
    )
  })

  it('locks only when signed out and local mode not accepted', () => {
    assert.equal(
      resolveAssistantSurface({ signedOut: true, localModeAccepted: false }),
      'locked',
    )
  })

  it('home when local mode accepted while signed out', () => {
    assert.equal(
      resolveAssistantSurface({ signedOut: true, localModeAccepted: true }),
      'home',
    )
  })
})

describe('reconcileUrlToState', () => {
  it('selects conversation from ?c=', () => {
    assert.equal(
      reconcileUrlToState({
        urlConversationId: 'c1',
        activeId: null,
        conversationExists: true,
      }),
      'select',
    )
  })

  it('clears active conversation when URL drops c (history.back)', () => {
    assert.equal(
      reconcileUrlToState({
        urlConversationId: null,
        activeId: 'c1',
        messageCount: 3,
        streaming: false,
      }),
      'clear',
    )
  })

  it('does not clear mid first-send before URL write', () => {
    assert.equal(
      reconcileUrlToState({
        urlConversationId: null,
        activeId: 'c1',
        messageCount: 0,
        streaming: true,
      }),
      'noop',
    )
  })

  it('strips unknown ?c= from the URL', () => {
    assert.equal(
      reconcileUrlToState({
        urlConversationId: 'missing',
        activeId: null,
        conversationExists: false,
      }),
      'clear-url',
    )
  })
})

describe('reconcileStateToUrl', () => {
  it('writes c when conversation becomes visible', () => {
    assert.equal(
      reconcileStateToUrl({
        activeId: 'c1',
        urlConversationId: null,
        messageCount: 1,
      }),
      'set',
    )
  })

  it('clears stale c on home', () => {
    assert.equal(
      reconcileStateToUrl({
        activeId: null,
        urlConversationId: 'c1',
        messageCount: 0,
      }),
      'clear',
    )
  })

  it('noops when already in sync', () => {
    assert.equal(
      reconcileStateToUrl({
        activeId: 'c1',
        urlConversationId: 'c1',
        messageCount: 2,
      }),
      'noop',
    )
  })
})

describe('liveStateForAssistantSurface', () => {
  it('maps conversation → conversation for native dock hide', () => {
    assert.equal(liveStateForAssistantSurface('conversation'), 'conversation')
    assert.equal(liveStateForAssistantSurface('home'), 'idle')
    assert.equal(liveStateForAssistantSurface('locked'), 'idle')
  })
})

describe('conversationIdFromSearch', () => {
  it('reads c then chat', () => {
    assert.equal(
      conversationIdFromSearch(new URLSearchParams('c=abc')),
      'abc',
    )
    assert.equal(
      conversationIdFromSearch(new URLSearchParams('chat=demo')),
      'demo',
    )
  })
})

describe('buildAssistantHref', () => {
  it('sets and clears c while preserving work scope', () => {
    assert.equal(
      buildAssistantHref({
        conversationId: 'x1',
        currentSearch: '?scope=work&entity=Alpha',
      }),
      '/assistant?scope=work&entity=Alpha&c=x1',
    )
    assert.equal(
      buildAssistantHref({
        conversationId: null,
        currentSearch: '?c=x1&scope=work',
      }),
      '/assistant?scope=work',
    )
  })

  it('preserves unrelated params and clears demo chat=', () => {
    assert.equal(
      buildAssistantHref({
        conversationId: 'x',
        currentSearch: '?foo=1&utm=a&chat=old',
      }),
      '/assistant?foo=1&utm=a&c=x',
    )
  })

  it('explicitly clears soft scope when scope=null', () => {
    assert.equal(
      buildAssistantHref({
        conversationId: 'x1',
        scope: null,
        currentSearch: '?scope=work&entity=A&c=old',
      }),
      '/assistant?c=x1',
    )
  })
})

describe('buildAssistantNavManifest', () => {
  it('publishes kenos domain + liveState', () => {
    const m = buildAssistantNavManifest({
      liveState: 'conversation',
      conversationId: 'c9',
      canGoBack: true,
    })
    assert.equal(m.domainId, 'kenos')
    assert.equal(m.liveState, 'conversation')
    assert.equal(m.currentEntity, 'c9')
    assert.equal(m.canGoBack, true)
  })
})

describe('composerPlaceholderKind', () => {
  it('detects work context', () => {
    assert.equal(composerPlaceholderKind('context', { space: '工作' }), 'work')
    assert.equal(composerPlaceholderKind('global'), 'all')
  })
})

describe('readLocalModeAccepted', () => {
  it('reads session flag', () => {
    const store = {
      getItem: (k) => (k === ASSISTANT_LOCAL_MODE_KEY ? '1' : null),
    }
    assert.equal(readLocalModeAccepted(store), true)
    assert.equal(readLocalModeAccepted(null), false)
  })
})
