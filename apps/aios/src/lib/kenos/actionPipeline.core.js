/**
 * Kenos assistant action pipeline (Phase A canary wiring).
 *
 *   executeTool → normalizeAction → actionRegistry → policyDecision
 *              → approval when required → executor → activity
 *
 * Every side-effecting assistant tool MUST be declared here — either mapped to
 * a registry action (guarded by guardToolAction) or explicitly listed as R0
 * navigation. The approval-bypass test (actionPipeline.core.test.js) fails the
 * build when a write tool is missing from both lists.
 */

import {
  canonicalParametersJson,
  getAction,
  policyDecision,
} from '@life-os/contracts/kenos-actions'
import { assertDispatcherWriteAllowed } from './prodWriteGuard.core.js'

/**
 * Assistant tool name → registry action type. Tools listed here are
 * side-effecting and must pass the registry policy before executing.
 */
export const TOOL_ACTION_MAP = Object.freeze({
  planner_add_task: 'plan.create_task',
  save_memory: 'assistant.save_memory',
  start_focus: 'focus.start_context',
  end_focus: 'focus.end_context',
})

/**
 * Native (Tauri-only) tool governance (G4). Every native tool is classified.
 * Write-capable tools are the assistant's highest-capability surface
 * (arbitrary AppleScript, gh CLI, typing into apps, spawning agents) and were
 * previously executed with NO registry/approval governance. Until they are
 * fully routed through Approval + an executor, write-capable native tools are
 * hard-disabled for autonomous/background execution and require an explicit
 * human-in-the-loop manual approval flag to run at all.
 */
export const NATIVE_TOOL_CLASS = Object.freeze({
  // read-only (safe in any context)
  check_task: 'read',
  read_cursor_sessions: 'read',
  read_cursor_thread: 'read',
  search_cursor_sessions: 'read',
  ai_app_read: 'read',
  look_at_screen: 'read',
  // external write (side-effecting on other apps / spawns work)
  ai_app_send: 'external_write',
  type_into_app: 'external_write',
  open_mac_app: 'external_write',
  delegate_task: 'external_write',
  cancel_task: 'external_write',
  // sensitive / destructive (arbitrary capability)
  run_applescript: 'sensitive',
  github_cli: 'sensitive',
})

/**
 * Gate for a native tool call.
 * @param {string} name
 * @param {{ autonomous?: boolean, manualApproved?: boolean }} ctx
 *   autonomous defaults TRUE (fail-closed) — the assistant loop is autonomous.
 *   manualApproved is set ONLY by an explicit human-in-the-loop UI confirmation.
 * @returns {{ ok: true, class: string } | { ok: false, error: string }}
 */
export function guardNativeToolCall(name, ctx = {}) {
  const autonomous = ctx.autonomous !== false // default fail-closed
  const manualApproved = ctx.manualApproved === true
  const cls = NATIVE_TOOL_CLASS[name]
  if (!cls) {
    return { ok: false, error: `原生工具 ${name} 未在治理表声明(fail-closed 拒绝)。` }
  }
  if (cls === 'read') return { ok: true, class: cls }
  // write-capable (external_write | sensitive)
  if (autonomous) {
    return {
      ok: false,
      error: `原生工具 ${name}(${cls})为 manual-only:禁止自主/后台执行。不要声称已执行。`,
    }
  }
  if (!manualApproved) {
    return {
      ok: false,
      error: `原生工具 ${name}(${cls})需人工在 UI 显式确认(manualApproved)后方可执行。`,
    }
  }
  // manual + explicitly approved: allowed as an interim measure until the tool
  // is routed through the full Approval executor. Sensitive tools should still
  // surface a normalized preview in the UI before this point.
  return { ok: true, class: cls }
}

/**
 * Side-effect-free navigation / read tools that intentionally bypass the
 * registry (risk R0: they open a surface or read state, never write a domain).
 */
export const R0_NAVIGATION_TOOLS = Object.freeze([
  'open_space',
  'compose_library_note', // deep link with prefilled draft; Knowledge owns the write
  'open_browser_page',
  'browser_interact', // sandboxed browser surface, guarded by toolEgressGuard
])

/**
 * Normalize one assistant tool call into an action instance.
 * @returns {{ actionType: string, parameters: object } | null} null when the
 * tool is not action-backed (caller must then check R0_NAVIGATION_TOOLS).
 */
export function normalizeAction(toolName, args = {}) {
  const actionType = TOOL_ACTION_MAP[toolName]
  if (!actionType) return null
  return { actionType, parameters: args && typeof args === 'object' ? args : {} }
}

/**
 * Synchronous gate for executeTool. Combines:
 *   1. normalizeAction + registry policyDecision (unknown/frozen → deny)
 *   2. the legacy env-flag dispatcher deny-list (fail-closed layers stack)
 * R0/R1 → allow (execute + activity via the action RPC / local store).
 * R2/R3 → block with an approval-required message: the assistant must create
 * an approval request (parameter-bound hash) and wait for the owner.
 *
 * @param {string} toolName
 * @param {object} args
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, mode: string, actionType: string } | { ok: false, error: string }}
 */
export function guardToolAction(toolName, args, env) {
  const normalized = normalizeAction(toolName, args)
  if (!normalized) {
    if (R0_NAVIGATION_TOOLS.includes(toolName)) {
      return { ok: true, mode: 'r0_navigation', actionType: null }
    }
    return {
      ok: false,
      error: `工具 ${toolName} 未在 Action Registry 声明,已按 fail-closed 拒绝执行。`,
    }
  }
  const decision = policyDecision(normalized.actionType)
  if (decision.mode === 'deny') {
    return {
      ok: false,
      error: `动作 ${normalized.actionType} 被策略拒绝(${decision.reason})。不要声称已执行成功。`,
    }
  }
  if (decision.mode !== 'auto') {
    return {
      ok: false,
      error: `动作 ${normalized.actionType} 风险等级 ${decision.risk},需要 Owner 审批(${decision.mode})。请先创建审批请求,不要声称已执行成功。`,
    }
  }
  // Legacy env-flag deny-list stays as the second fail-closed layer for tools
  // it covers (production write gating by deployment flags).
  const legacyGate = assertDispatcherWriteAllowed(toolName, env)
  if (legacyGate && legacyGate.ok === false && legacyGate.error) {
    return { ok: false, error: typeof legacyGate.error === 'string' ? legacyGate.error : '生产写入未开启。' }
  }
  return { ok: true, mode: decision.mode, actionType: normalized.actionType }
}

/**
 * sha256 hex of the canonical (sorted-key) parameter JSON — the value bound
 * into kenos_action_approvals.normalized_parameters_hash. Works in browser
 * and node (WebCrypto).
 */
export async function normalizedParametersHash(parameters) {
  const json = canonicalParametersJson(parameters)
  const bytes = new TextEncoder().encode(json)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Executor-side approval binding check. An approval only authorizes execution
 * when it is approved, unexpired, for the same action type, and the
 * recomputed parameter hash matches — a parameter change invalidates it.
 * @param {{ status?: string, action_type?: string, expires_at?: string, normalized_parameters_hash?: string | null }} approval
 * @param {{ actionType: string, parameters: object }} action
 */
export async function approvalBindingValid(approval, action, nowMs = Date.now()) {
  if (!approval || approval.status !== 'approved') return { valid: false, reason: 'not_approved' }
  if (approval.action_type !== action.actionType) return { valid: false, reason: 'action_type_mismatch' }
  const expires = Date.parse(approval.expires_at || '')
  if (!Number.isFinite(expires) || expires <= nowMs) return { valid: false, reason: 'expired' }
  const hash = await normalizedParametersHash(action.parameters)
  if (!approval.normalized_parameters_hash || approval.normalized_parameters_hash !== hash) {
    return { valid: false, reason: 'parameters_changed' }
  }
  return { valid: true, reason: 'bound' }
}

/**
 * Registry metadata for a tool (for activity/undo surfaces).
 */
export function actionForTool(toolName) {
  const actionType = TOOL_ACTION_MAP[toolName]
  return actionType ? getAction(actionType) : null
}
