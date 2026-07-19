import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  conversationPersistAudit,
  isConversationPersistenceBlocked,
} from './conversationPersist.core.js'
import { classifyMutationKind } from './prodWriteGuard.core.js'

describe('conversationPersist.core', () => {
  it('blocks conversation persistence in read canary', () => {
    const env = { VITE_KENOS_READ_CANARY: '1' }
    assert.equal(isConversationPersistenceBlocked(env), true)
    const audit = conversationPersistAudit(env)
    assert.equal(audit.policy, 'memory_session_only')
    assert.equal(audit.classification, 'READ_ONLY_MODE_CONVERSATION_WRITE_BLOCKED')
  })

  it('blocks cloud build by default until writer phrase', () => {
    assert.equal(isConversationPersistenceBlocked({ VITE_AIOS_CLOUD: '1' }), true)
  })

  it('allows local-first (non-cloud, non-canary) persistence', () => {
    assert.equal(isConversationPersistenceBlocked({}), false)
  })

  it('allows cloud when VITE_KENOS_PROD_WRITES=1 and not canary', () => {
    assert.equal(
      isConversationPersistenceBlocked({
        VITE_AIOS_CLOUD: '1',
        VITE_KENOS_PROD_WRITES: '1',
      }),
      false,
    )
  })

  it('classifies conversation vs domain mutations', () => {
    assert.equal(
      classifyMutationKind({ table: 'conversations', kind: 'upsert' }),
      'conversation_persistence',
    )
    assert.equal(
      classifyMutationKind({ storageKey: 'aios_chats_v1' }),
      'conversation_persistence',
    )
    assert.equal(
      classifyMutationKind({ table: 'planner_tasks', kind: 'insert' }),
      'domain_mutation',
    )
    assert.equal(classifyMutationKind({ kind: 'model_read' }), 'model_read')
    assert.equal(classifyMutationKind({ kind: 'local_only' }), 'local_only_storage')
  })
})
