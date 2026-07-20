/**
 * Production / Read-Canary write fail-closed guards.
 * Three layers: capability registry (surface), dispatcher (tools/commands),
 * and network (RPC / mutation deny-list). Hiding UI alone is not enough.
 */

/** Kenos / Plan write RPCs — never callable from Read Client Canary. */
export const KENOS_WRITE_RPC_DENYLIST = Object.freeze([
  'kenos_create_plan_task_action',
  'kenos_request_action_approval_action',
  'kenos_decide_action_approval_action',
  'kenos_dead_letter_plan_outbox_action',
  'kenos_start_focus_context_action',
  'kenos_end_focus_context_action',
])

/** Tables that must not receive client mutations during read canary. */
export const KENOS_WRITE_TABLE_DENYLIST = Object.freeze([
  'kenos_action_approvals',
  'kenos_focus_contexts',
  'kenos_deferred_items',
  'kenos_proactive_suggestions',
  'kenos_work_projects',
  'kenos_work_action_proposals',
  'kenos_work_deliverables',
  'kenos_work_meetings',
  'kenos_work_decisions',
  'kenos_plan_outbox',
  'kenos_plan_activity',
  'kenos_plan_action_idempotency',
  'planner_tasks',
  'planner_projects',
  'life_events',
  // AIOS cloud sync — conversation / memory / settings persistence
  'conversations',
  'memories',
  'user_state',
])

/**
 * Classify a network/storage write for mutation audit (redacted kinds only).
 * @param {{ kind?: string, table?: string, rpc?: string, tool?: string, storageKey?: string }} input
 * @returns {'model_read'|'conversation_persistence'|'domain_mutation'|'analytics_logging'|'local_only_storage'|'unknown'}
 */
export function classifyMutationKind(input = {}) {
  const kind = String(input.kind || '').toLowerCase()
  if (kind === 'model_read' || kind === 'read' || kind === 'rpc_read')
    return 'model_read'
  if (kind === 'analytics' || kind === 'logging') return 'analytics_logging'
  if (kind === 'local' || kind === 'local_only') return 'local_only_storage'

  const table = String(input.table || '')
  const storageKey = String(input.storageKey || '')
  if (
    table === 'conversations' ||
    storageKey === 'aios_chats_v1' ||
    storageKey === 'aios_active_chat_v1' ||
    storageKey === 'aios_drafts_v1'
  ) {
    return 'conversation_persistence'
  }
  if (table === 'memories' || table === 'user_state')
    return 'conversation_persistence'

  const rpc = String(input.rpc || '')
  const tool = String(input.tool || '')
  if (
    KENOS_WRITE_TABLE_DENYLIST.includes(table) ||
    KENOS_WRITE_RPC_DENYLIST.includes(rpc) ||
    [
      'planner_add_task',
      'plannerAddTask',
      'create_plan_task',
      'kenos_create_plan_task_action',
      'approve_action',
      'reject_action',
      'focus_write',
      'work_write',
      'executor_run',
    ].includes(tool)
  ) {
    return 'domain_mutation'
  }
  return 'unknown'
}

/**
 * Read Client Canary mode: production reads opt-in; all production writes fail closed.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isProdReadCanaryMode(env = import.meta.env) {
  return env?.VITE_KENOS_READ_CANARY === '1'
}

/**
 * Hard block for any production write surface (canary or default Off flags).
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function areProductionWritesBlocked(env = import.meta.env) {
  // Read canary always blocks. Outside canary, Kenos production writes remain
  // blocked until a separate writer-canary phrase enables them (never via this flag).
  if (isProdReadCanaryMode(env)) return true
  if (env?.VITE_KENOS_PROD_WRITES === '1') return false
  return true
}

/**
 * @param {string} rpcName
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function assertKenosWriteRpcAllowed(rpcName, env = import.meta.env) {
  const name = String(rpcName || '')
  if (!KENOS_WRITE_RPC_DENYLIST.includes(name)) return { ok: true }
  if (!areProductionWritesBlocked(env)) return { ok: true }
  return {
    ok: false,
    error: {
      message: `Write RPC blocked (read canary / writes fail-closed): ${name}`,
      code: 'KENOS_WRITE_BLOCKED',
    },
  }
}

/**
 * @param {string} table
 * @param {string} method
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
/** AIOS schema sync tables — fail-closed only on cloud / read-canary builds. */
const AIOS_CLOUD_SYNC_TABLES = Object.freeze([
  'conversations',
  'memories',
  'user_state',
])

export function assertTableMutationAllowed(
  table,
  method,
  env = import.meta.env,
) {
  if (!areProductionWritesBlocked(env)) return { ok: true }
  const t = String(table || '')
  const m = String(method || '').toLowerCase()
  if (!KENOS_WRITE_TABLE_DENYLIST.includes(t)) return { ok: true }
  if (!['insert', 'update', 'upsert', 'delete'].includes(m)) return { ok: true }
  // Local-first AIOS (Tauri / vite) may still sync aios.* — Kenos domain tables stay blocked.
  if (
    AIOS_CLOUD_SYNC_TABLES.includes(t) &&
    env?.VITE_AIOS_CLOUD !== '1' &&
    env?.VITE_KENOS_READ_CANARY !== '1'
  ) {
    return { ok: true }
  }
  return {
    ok: false,
    error: {
      message: `Table mutation blocked (read canary / writes fail-closed): ${t}.${m}`,
      code: 'KENOS_WRITE_BLOCKED',
    },
  }
}

/**
 * Wrap a Supabase-like client so denied RPCs / mutations never leave the browser.
 * @param {any} client
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function guardReadOnlyClient(client, env = import.meta.env) {
  if (!client || !areProductionWritesBlocked(env)) return client

  const wrapBuilder = (table, builder) => {
    if (!builder || typeof builder !== 'object') return builder
    return new Proxy(builder, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (['insert', 'update', 'upsert', 'delete'].includes(String(prop))) {
          return (...args) => {
            const denied = assertTableMutationAllowed(table, String(prop), env)
            if (!denied.ok) {
              return Promise.resolve({ data: null, error: denied.error })
            }
            if (typeof value !== 'function') {
              return Promise.resolve({
                data: null,
                error: {
                  message: `${String(prop)} unavailable`,
                  code: 'KENOS_WRITE_UNAVAILABLE',
                },
              })
            }
            return value.apply(target, args)
          }
        }
        if (typeof value !== 'function') return value
        return (...args) => {
          const result = value.apply(target, args)
          // Chainable query builders
          if (
            result &&
            typeof result === 'object' &&
            typeof result.then !== 'function'
          ) {
            return wrapBuilder(table, result)
          }
          return result
        }
      },
    })
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'rpc' && typeof value === 'function') {
        return (fnName, args, options) => {
          const denied = assertKenosWriteRpcAllowed(fnName, env)
          if (!denied.ok)
            return Promise.resolve({ data: null, error: denied.error })
          return value.call(target, fnName, args, options)
        }
      }
      if (prop === 'from' && typeof value === 'function') {
        return (table) => wrapBuilder(table, value.call(target, table))
      }
      if (prop === 'schema' && typeof value === 'function') {
        return (schema) => guardReadOnlyClient(value.call(target, schema), env)
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * Dispatcher-layer deny for Assistant / tool write intents.
 * @param {string} toolName
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function assertDispatcherWriteAllowed(toolName, env = import.meta.env) {
  if (!areProductionWritesBlocked(env)) return { ok: true }
  const deniedTools = new Set([
    'planner_add_task',
    'plannerAddTask',
    'create_plan_task',
    'kenos_create_plan_task_action',
    'approve_action',
    'reject_action',
    'focus_write',
    'work_write',
    'executor_run',
  ])
  if (!deniedTools.has(String(toolName || ''))) return { ok: true }
  return {
    ok: false,
    error: `生产写入已关闭（Read Client Canary fail-closed）：${toolName}`,
  }
}
