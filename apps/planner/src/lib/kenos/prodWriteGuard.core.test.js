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
})
