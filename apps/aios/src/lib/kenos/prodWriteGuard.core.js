/**
 * Production / Read-Canary write fail-closed guards.
 * Three layers: capability registry (surface), dispatcher (tools/commands),
 * and network (RPC / mutation deny-list). Hiding UI alone is not enough.
 */

/** Kenos / Plan write RPCs — never callable from Read Client Canary. */
export const KENOS_WRITE_RPC_DENYLIST = Object.freeze([
  'kenos_create_plan_task_action',
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
])

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
export function assertTableMutationAllowed(table, method, env = import.meta.env) {
  if (!areProductionWritesBlocked(env)) return { ok: true }
  const t = String(table || '')
  const m = String(method || '').toLowerCase()
  if (!KENOS_WRITE_TABLE_DENYLIST.includes(t)) return { ok: true }
  if (!['insert', 'update', 'upsert', 'delete'].includes(m)) return { ok: true }
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
        if (typeof value !== 'function') return value
        if (['insert', 'update', 'upsert', 'delete'].includes(String(prop))) {
          return (...args) => {
            const denied = assertTableMutationAllowed(table, String(prop), env)
            if (!denied.ok) {
              return Promise.resolve({ data: null, error: denied.error })
            }
            return value.apply(target, args)
          }
        }
        return (...args) => {
          const result = value.apply(target, args)
          // Chainable query builders
          if (result && typeof result === 'object' && typeof result.then !== 'function') {
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
          if (!denied.ok) return Promise.resolve({ data: null, error: denied.error })
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
