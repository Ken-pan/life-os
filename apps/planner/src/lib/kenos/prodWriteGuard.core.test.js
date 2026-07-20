import { describe, expect, it } from 'vitest'
import {
  areKenosWritersBlocked,
  assertKenosTableMutationAllowed,
  assertKenosWriteRpcAllowed,
  guardPlannerKenosWriters,
  isPlannerCompatCanaryMode,
} from './prodWriteGuard.core.js'

describe('planner Kenos write guard', () => {
  it('compat canary blocks Kenos writers', () => {
    const env = { VITE_KENOS_COMPAT_CANARY: '1' }
    expect(isPlannerCompatCanaryMode(env)).toBe(true)
    expect(areKenosWritersBlocked(env)).toBe(true)
    expect(assertKenosWriteRpcAllowed('kenos_create_plan_task_action', env).ok).toBe(false)
    expect(assertKenosTableMutationAllowed('kenos_work_projects', env).ok).toBe(false)
    expect(assertKenosTableMutationAllowed('planner_tasks', env).ok).toBe(true)
  })

  it('allows legacy planner_tasks upsert while blocking Kenos RPC', async () => {
    const calls = []
    const fake = {
      rpc: async (fn, args) => {
        calls.push(['rpc', fn])
        return { data: { ok: true }, error: null }
      },
      from(table) {
        calls.push(['from', table])
        return {
          upsert: async (rows) => {
            calls.push(['upsert', table, rows?.length ?? 0])
            return { data: rows, error: null }
          },
          select() {
            return this
          },
        }
      },
    }
    const guarded = guardPlannerKenosWriters(fake, { VITE_KENOS_COMPAT_CANARY: '1' })
    const blocked = await guarded.rpc('kenos_create_plan_task_action', {})
    expect(blocked.error?.code).toBe('KENOS_WRITE_BLOCKED')
    const legacy = await guarded.from('planner_tasks').upsert([{ id: 't1' }])
    expect(legacy.error).toBeNull()
    expect(calls.some((c) => c[0] === 'upsert' && c[1] === 'planner_tasks')).toBe(true)
  })

  it('compat matrix: legacy tables allowed, Kenos mutations forbidden', async () => {
    const env = { VITE_KENOS_COMPAT_CANARY: '1' }
    const legacyTables = [
      'planner_tasks',
      'planner_lists',
      'planner_projects',
      'planner_attachments',
      'planner_user_state',
    ]
    for (const table of legacyTables) {
      expect(assertKenosTableMutationAllowed(table, env).ok).toBe(true)
    }
    const kenosRpcs = [
      'kenos_create_plan_task_action',
      'kenos_store_action_approval',
      'kenos_transition_action_approval',
      'kenos_store_work_project',
      'kenos_store_work_action_proposal',
      'kenos_transition_plan_outbox',
    ]
    for (const rpc of kenosRpcs) {
      expect(assertKenosWriteRpcAllowed(rpc, env).ok).toBe(false)
    }
    const kenosTables = [
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
    ]
    for (const table of kenosTables) {
      expect(assertKenosTableMutationAllowed(table, env).ok).toBe(false)
    }
  })
})
