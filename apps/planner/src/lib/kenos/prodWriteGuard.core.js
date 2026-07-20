/**
 * Planner Compatibility Canary — Kenos writer fail-closed.
 * Legacy planner_tasks / lists / projects upserts remain allowed.
 * Kenos command / outbox / approval / focus / work writers stay blocked.
 */

export const KENOS_WRITE_RPC_DENYLIST = Object.freeze([
  'kenos_create_plan_task_action',
  'kenos_update_plan_task_title_action',
  'kenos_update_plan_task_due_date_action',
  'kenos_update_plan_task_schedule_action',
  'kenos_update_plan_task_project_action',
  'kenos_complete_plan_task_action',
  'kenos_reopen_plan_task_action',
  'kenos_archive_plan_task_action',
  'kenos_request_action_approval_action',
  'kenos_decide_action_approval_action',
  'kenos_dead_letter_plan_outbox_action',
  'kenos_start_focus_context_action',
  'kenos_end_focus_context_action',
  'kenos_create_work_project_action',
  'kenos_archive_work_project_action',
  'kenos_ingest_capture_envelope_action',
  'kenos_convert_capture_to_plan_task_action',
  'kenos_store_action_approval',
  'kenos_transition_action_approval',
  'kenos_store_work_project',
  'kenos_store_work_action_proposal',
  'kenos_transition_plan_outbox',
])

export const KENOS_MUTATION_TABLE_DENYLIST = Object.freeze([
  'kenos_action_approvals',
  'kenos_focus_contexts',
  'kenos_deferred_items',
  'kenos_proactive_suggestions',
  'kenos_work_projects',
  'kenos_work_action_proposals',
  'kenos_work_decisions',
  'kenos_work_deliverables',
  'kenos_work_meetings',
  'kenos_plan_outbox',
])

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function isPlannerCompatCanaryMode(env = import.meta.env) {
  return env?.VITE_KENOS_COMPAT_CANARY === '1' || env?.VITE_KENOS_READ_CANARY === '1'
}

/**
 * Kenos writers stay closed unless BOTH prod-writes and a plan writer flag are set.
 * Compat / read canary never enables Kenos writes.
 * Create and title-edit share the dual-flag unlock for Owner-limited cohort builds.
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function areKenosWritersBlocked(env = import.meta.env) {
  if (isPlannerCompatCanaryMode(env)) return true
  if (env?.VITE_KENOS_PROD_WRITES === '1') {
    if (
      env?.VITE_KENOS_PLAN_CREATE_TASK_WRITER === '1' ||
      env?.VITE_KENOS_PLAN_UPDATE_TASK_TITLE_WRITER === '1' ||
      env?.VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER === '1' ||
      env?.VITE_KENOS_PLAN_UPDATE_TASK_SCHEDULE_WRITER === '1' ||
      env?.VITE_KENOS_PLAN_UPDATE_TASK_PROJECT_WRITER === '1' ||
      env?.VITE_KENOS_PLAN_COMPLETE_TASK_WRITER === '1' ||
      env?.VITE_KENOS_PLAN_REOPEN_TASK_WRITER === '1' ||
      env?.VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER === '1'
    ) {
      return false
    }
  }
  // Default: block Kenos writers even outside canary (legacy path unaffected).
  return true
}

/**
 * @param {string} rpc
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function assertKenosWriteRpcAllowed(rpc, env = import.meta.env) {
  if (!areKenosWritersBlocked(env)) return { ok: true }
  if (!KENOS_WRITE_RPC_DENYLIST.includes(rpc)) return { ok: true }
  return {
    ok: false,
    code: 'KENOS_WRITE_BLOCKED',
    message: `Kenos write RPC blocked on Planner compat path: ${rpc}`,
  }
}

/**
 * @param {string} table
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function assertKenosTableMutationAllowed(table, env = import.meta.env) {
  if (!areKenosWritersBlocked(env)) return { ok: true }
  if (!KENOS_MUTATION_TABLE_DENYLIST.includes(table)) return { ok: true }
  return {
    ok: false,
    code: 'KENOS_WRITE_BLOCKED',
    message: `Kenos table mutation blocked on Planner compat path: ${table}`,
  }
}

/**
 * Wrap Supabase client: block Kenos write RPCs / Kenos table mutations; leave legacy planner_* alone.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {ImportMetaEnv | Record<string, string | undefined> | undefined} env
 */
export function guardPlannerKenosWriters(client, env = import.meta.env) {
  if (!client || !areKenosWritersBlocked(env)) return client
  const origRpc = client.rpc.bind(client)
  const origFrom = client.from.bind(client)

  client.rpc = (fn, args, opts) => {
    const gate = assertKenosWriteRpcAllowed(String(fn), env)
    if (!gate.ok) {
      return Promise.resolve({ data: null, error: { message: gate.message, code: gate.code } })
    }
    return origRpc(fn, args, opts)
  }

  client.from = (table) => {
    const builder = origFrom(table)
    const gate = assertKenosTableMutationAllowed(String(table), env)
    if (gate.ok) return builder
    const block = () => Promise.resolve({ data: null, error: { message: gate.message, code: gate.code } })
    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (['insert', 'upsert', 'update', 'delete'].includes(String(prop))) {
          return () => ({
            select: block,
            then: (resolve, reject) => Promise.resolve(block()).then(resolve, reject),
          })
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  return client
}
