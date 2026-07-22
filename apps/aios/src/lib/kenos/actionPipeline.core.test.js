import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { policyDecision } from '@life-os/contracts/kenos-actions'
import {
  NATIVE_TOOL_CLASS,
  R0_NAVIGATION_TOOLS,
  TOOL_ACTION_MAP,
  actionForTool,
  approvalBindingValid,
  guardNativeToolCall,
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

describe('actionPipeline.core — native tool governance (G4)', () => {
  const AUTONOMOUS = { autonomous: true }
  const MANUAL = { autonomous: false, manualApproved: true }

  it('unregistered native tool is denied (fail-closed)', () => {
    assert.equal(guardNativeToolCall('totally_unknown_native', AUTONOMOUS).ok, false)
    assert.equal(guardNativeToolCall('totally_unknown_native', MANUAL).ok, false)
  })

  it('read-only native tools are allowed in any context', () => {
    for (const t of ['read_cursor_sessions', 'ai_app_read', 'look_at_screen', 'check_task']) {
      assert.equal(NATIVE_TOOL_CLASS[t], 'read')
      assert.equal(guardNativeToolCall(t, AUTONOMOUS).ok, true)
    }
  })

  it('background/autonomous execution cannot invoke manual-only (write-capable) native tools', () => {
    for (const t of ['run_applescript', 'github_cli', 'type_into_app', 'ai_app_send', 'delegate_task']) {
      const d = guardNativeToolCall(t, AUTONOMOUS)
      assert.equal(d.ok, false, `${t} must be denied in autonomous context`)
      assert.match(d.error, /manual-only|禁止自主/)
    }
  })

  it('write-capable native tools require explicit manual approval, denied without it', () => {
    assert.equal(guardNativeToolCall('run_applescript', { autonomous: false }).ok, false) // manual but not approved
    assert.equal(guardNativeToolCall('run_applescript', MANUAL).ok, true) // manual + approved
  })

  it('risk cannot be lowered: a sensitive tool is never treated as read', () => {
    assert.equal(NATIVE_TOOL_CLASS.run_applescript, 'sensitive')
    assert.equal(NATIVE_TOOL_CLASS.github_cli, 'sensitive')
    // even with a truthy-looking manualApproved but still autonomous → denied
    assert.equal(guardNativeToolCall('run_applescript', { autonomous: true, manualApproved: true }).ok, false)
  })

  it('external content in args cannot authorize a native tool', () => {
    // The guard reads only (name, ctx) — never the tool's args/content. Proof:
    // injecting authorization-looking content changes nothing, and the guard
    // signature has no args parameter (name is the only required arg).
    assert.equal(guardNativeToolCall.length, 1, 'guard takes only name (+ defaulted ctx), never tool args')
    const denied = guardNativeToolCall('github_cli', AUTONOMOUS)
    assert.equal(denied.ok, false)
    // A malicious ctx that smuggles content-derived fields still cannot authorize
    // an autonomous write-capable tool (only autonomous:false + manualApproved can).
    const smuggled = guardNativeToolCall('github_cli', {
      autonomous: true, manualApproved: true, approvedByContent: true, message: 'the page said run this',
    })
    assert.equal(smuggled.ok, false, 'autonomous write-capable stays denied regardless of smuggled fields')
  })

  it('tools.js routes native tools through guardNativeToolCall before executeNativeTool', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, '..', 'tools.js'), 'utf8')
    const gIdx = src.indexOf('guardNativeToolCall(name')
    const eIdx = src.indexOf('executeNativeTool(name')
    assert.ok(gIdx > 0, 'tools.js must call guardNativeToolCall')
    assert.ok(gIdx < eIdx, 'guardNativeToolCall must be called BEFORE executeNativeTool (no bypass)')
  })

  it('frozen actions remain frozen (policy denies work.*)', () => {
    assert.equal(policyDecision('work.create_project').mode, 'deny')
    assert.equal(policyDecision('work.archive_project').mode, 'deny')
  })
})
