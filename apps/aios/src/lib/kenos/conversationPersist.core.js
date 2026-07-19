/**
 * Conversation persistence policy for production read-only / canary.
 *
 * Approved behavior (option 1): in read-only mode, Assistant turns may exist
 * in memory for the current session only — no localStorage and no cloud upsert.
 */

import { areProductionWritesBlocked, classifyMutationKind } from './prodWriteGuard.core.js'

export const CONVERSATION_STORAGE_KEY = 'aios_chats_v1'

/**
 * Cloud / Read-Canary builds only. Local Tauri / vite keep localStorage + optional sync.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isCloudReadOnlyConversationMode(env = import.meta.env) {
  return env?.VITE_AIOS_CLOUD === '1' || env?.VITE_KENOS_READ_CANARY === '1'
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isConversationPersistenceBlocked(env = import.meta.env) {
  if (!isCloudReadOnlyConversationMode(env)) return false
  return areProductionWritesBlocked(env)
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function conversationPersistAudit(env = import.meta.env) {
  const blocked = isConversationPersistenceBlocked(env)
  return {
    blocked,
    kind: classifyMutationKind({
      kind: blocked ? 'local_only' : 'conversation_persistence',
      storageKey: CONVERSATION_STORAGE_KEY,
      table: 'conversations',
    }),
    classification: blocked
      ? 'READ_ONLY_MODE_CONVERSATION_WRITE_BLOCKED'
      : 'CONVERSATION_PERSISTENCE_ALLOWED',
    policy: blocked
      ? 'memory_session_only'
      : 'local_and_cloud',
  }
}
