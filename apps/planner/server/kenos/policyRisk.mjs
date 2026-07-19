/**
 * Server-authoritative Kenos risk / policy classification for Plan create-task.
 * Client `requestedRisk` is a hint only — never the final authorization fact.
 */

const RISK_ORDER = { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 }

export function riskRank(risk) {
  return RISK_ORDER[risk] ?? Number.POSITIVE_INFINITY
}

export function maxRisk(a, b) {
  return riskRank(a) >= riskRank(b) ? a : b
}

/**
 * @param {object} action — Kenos v1 ActionRequest
 * @returns {{
 *   ok: true,
 *   evaluatedRisk: string,
 *   outcome: 'allow'|'deny',
 *   reasons: string[],
 *   policyVersion: string,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string, class: string, retryable: boolean },
 *   evaluatedRisk?: string,
 *   reasons: string[],
 * }}
 */
export function classifyCreateTaskPolicy(action) {
  const reasons = []
  const policyVersion = 'kenos-audit-remediation-2026-07-19'
  const requested = action?.requestedRisk

  if (!action || typeof action !== 'object') {
    return {
      ok: false,
      evaluatedRisk: 'R4',
      reasons: ['missing_action'],
      error: { code: 'bad_request', message: 'Action request is required for policy classification.', class: 'permanent', retryable: false },
    }
  }

  if (action.actionType !== 'plan.create_task') {
    reasons.push('unknown_or_unsupported_action_type')
    return {
      ok: false,
      evaluatedRisk: 'R4',
      reasons,
      error: { code: 'unsupported_action', message: 'Unknown action types fail closed at the policy boundary.', class: 'permanent', retryable: false },
    }
  }

  let evaluated = 'R1'

  if (action.producer === 'work' || action.payload?.workSource) {
    evaluated = maxRisk(evaluated, 'R3')
    reasons.push('work_sourced_payload')
  }
  if (action.producer === 'connector' || action.producer === 'proactive') {
    evaluated = maxRisk(evaluated, 'R3')
    reasons.push(`producer_${action.producer}`)
  }
  if (action.targetDomain && action.targetDomain !== 'plan') {
    evaluated = maxRisk(evaluated, 'R3')
    reasons.push('cross_domain_target')
  }
  if (action.securityDomain === 'work' || action.dataClassification === 'work_confidential' || action.dataClassification === 'restricted_local_only') {
    evaluated = maxRisk(evaluated, 'R3')
    reasons.push('elevated_classification')
  }
  if (action.dataClassification === 'sensitive') {
    evaluated = maxRisk(evaluated, 'R2')
    reasons.push('sensitive_classification')
  }
  if (action.payload?.bulk === true || (Array.isArray(action.payload?.items) && action.payload.items.length > 1)) {
    evaluated = maxRisk(evaluated, 'R2')
    reasons.push('bulk_scope')
  }
  if (action.payload?.externalSideEffect === true || action.payload?.productionScope === true) {
    evaluated = maxRisk(evaluated, 'R3')
    reasons.push('external_or_production_scope')
  }
  if (action.payload?.reversible === false) {
    evaluated = maxRisk(evaluated, 'R2')
    reasons.push('non_reversible')
  }

  // Single-user personal create-task with explicit producer remains R1 when no elevators fire.
  if (
    evaluated === 'R1' &&
    ['assistant', 'plan'].includes(action.producer) &&
    action.securityDomain === 'personal' &&
    action.dataClassification === 'personal' &&
    action.targetDomain === 'plan'
  ) {
    reasons.push('explicit_single_user_reversible_create_task')
  }

  if (typeof requested === 'string' && riskRank(requested) < riskRank(evaluated)) {
    reasons.push('client_understated_risk_rejected')
    return {
      ok: false,
      evaluatedRisk: evaluated,
      reasons,
      error: {
        code: 'risk_understated',
        message: `Client requestedRisk ${requested} understates authoritative risk ${evaluated}.`,
        class: 'permanent',
        retryable: false,
      },
    }
  }

  if (evaluated !== 'R1') {
    return {
      ok: false,
      evaluatedRisk: evaluated,
      reasons,
      error: {
        code: 'risk_not_allowed',
        message: `Authoritative policy risk ${evaluated} is not executable without Approval/Executor.`,
        class: 'permanent',
        retryable: false,
      },
    }
  }

  // Auto-execute path only accepts an R1 hint (or omitted hint). Higher client hints fail closed
  // so the request must enter Approval rather than silent R1 execution.
  if (typeof requested === 'string' && requested !== 'R1') {
    reasons.push('non_r1_request_hint_not_auto_executable')
    return {
      ok: false,
      evaluatedRisk: 'R1',
      reasons,
      error: {
        code: 'risk_not_allowed',
        message: `requestedRisk ${requested} is not auto-executable; only authoritative R1 create-task may run without Approval.`,
        class: 'permanent',
        retryable: false,
      },
    }
  }

  return {
    ok: true,
    evaluatedRisk: 'R1',
    outcome: 'allow',
    reasons: reasons.length ? reasons : ['policy_allow_r1_create_task'],
    policyVersion,
  }
}
