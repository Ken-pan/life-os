import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  R0_NAVIGATION_TOOLS,
  TOOL_ACTION_MAP,
  actionForTool,
  approvalBindingValid,
  guardToolAction,
  normalizeAction,
  normalizedParametersHash,
} from './actionPipeline.core.js'

const OPEN_ENV = { VITE_KENOS_PROD_WRITES: '1' }
const CLOSED_ENV = {}

describe('actionPipeline.core — normalize + policy', () => {
  it('maps write tools onto registry actions', () => {
    assert.deepEqual(normalizeAction('planner_add_task', { title: 'x' }), {
      actionType: 'plan.create_task',
      parameters: { title: 'x' },
    })
    assert.equal(normalizeAction('web_search', {}), null)
  })

  it('R1 canary actions pass when production writes are open', () => {
    const gate = guardToolAction('planner_add_task', { title: 'x' }, OPEN_ENV)
    assert.equal(gate.ok, true)
    assert.equal(gate.actionType, 'plan.create_task')
  })

  it('stays fail-closed under default env (legacy deny-list layer)', () => {
    const gate = guardToolAction('planner_add_task', { title: 'x' }, CLOSED_ENV)
    assert.equal(gate.ok, false)
    assert.match(gate.error, /不要声称已添加成功|不要声称已执行成功/)
  })

  it('unknown side-effecting tools are denied, R0 navigation passes', () => {
    assert.equal(guardToolAction('mystery_write_tool', {}, OPEN_ENV).ok, false)
    assert.equal(guardToolAction('open_space', { space: 'money' }, OPEN_ENV).ok, true)
  })

  it('exposes registry metadata for tools', () => {
    assert.equal(actionForTool('planner_add_task').riskLevel, 'R1')
    assert.equal(actionForTool('web_search'), null)
  })
})

describe('actionPipeline.core — approval parameter binding', () => {
  const params = { title: '部署到生产', target: 'www' }

  it('hash is stable across key order', async () => {
    const a = await normalizedParametersHash({ b: 1, a: 2 })
    const b = await normalizedParametersHash({ a: 2, b: 1 })
    assert.equal(a, b)
    assert.match(a, /^[0-9a-f]{64}$/)
  })

  it('binds only approved + unexpired + hash-matching approvals', async () => {
    const hash = await normalizedParametersHash(params)
    const approval = {
      status: 'approved',
      action_type: 'plan.create_task',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      normalized_parameters_hash: hash,
    }
    const action = { actionType: 'plan.create_task', parameters: params }
    assert.deepEqual(await approvalBindingValid(approval, action), { valid: true, reason: 'bound' })

    assert.equal((await approvalBindingValid({ ...approval, status: 'pending' }, action)).valid, false)
    assert.equal(
      (await approvalBindingValid({ ...approval, expires_at: new Date(Date.now() - 1000).toISOString() }, action)).reason,
      'expired',
    )
    // Parameter change invalidates the old approval.
    const changed = { actionType: 'plan.create_task', parameters: { ...params, target: 'ALL' } }
    assert.equal((await approvalBindingValid(approval, changed)).reason, 'parameters_changed')
    assert.equal(
      (await approvalBindingValid({ ...approval, normalized_parameters_hash: null }, action)).reason,
      'parameters_changed',
    )
  })
})

describe('actionPipeline.core — approval bypass guardrail', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const toolsSource = readFileSync(join(here, '..', 'tools.js'), 'utf8')

  it('every mapped write tool routes through guardToolAction in executeTool', () => {
    for (const toolName of Object.keys(TOOL_ACTION_MAP)) {
      assert.ok(
        toolsSource.includes(`guardToolAction('${toolName}'`),
        `tools.js: ${toolName} 必须经 guardToolAction 管线,不得绕过 Action Registry`,
      )
    }
  })

  it('declared R0 navigation tools exist and are not also action-mapped', () => {
    for (const toolName of R0_NAVIGATION_TOOLS) {
      assert.equal(TOOL_ACTION_MAP[toolName], undefined, `${toolName} 不能同时声明为 R0 与 action`)
    }
  })
})
