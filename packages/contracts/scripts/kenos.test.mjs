import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  KenosActionDecisionOutcomeValues,
  KenosActionDecisionSchema,
  KenosActionRequestSchema,
  KenosActionResultSchema,
  KenosActionResultStatusValues,
  KenosActivityRecordSchema,
  KenosActivityResultValues,
  KenosActorTypeValues,
  KenosApprovalDecisionSchema,
  KenosApprovalRecordSchema,
  KenosApprovalRequestSchema,
  KenosApprovalStatusValues,
  KenosApprovalTransitionSchema,
  KenosApprovalTransitions,
  KenosCaptureEnvelopeSchema,
  KenosClassificationValues,
  KenosDomainValues,
  KenosEntityRefSchema,
  KenosErrorClassValues,
  KenosCommandFailureSchema,
  KenosMutationEnvelopeSchema,
  KenosOutboxRecordSchema,
  KenosOutboxStatusValues,
  KenosOutboxTransitionSchema,
  KenosOutboxTransitions,
  KenosPhase1ActionTypeValues,
  KenosRiskLevelValues,
  KenosSecurityDomainValues,
} from '../src/kenos.ts'

const manifest = JSON.parse(readFileSync(new URL('../fixtures/kenos/v1/manifest.json', import.meta.url), 'utf8'))
const corpus = JSON.parse(readFileSync(new URL('../fixtures/kenos/v1/corpus.json', import.meta.url), 'utf8'))
const validById = new Map(corpus.valid.map((fixture) => [fixture.id, fixture.value]))

const schemaByContract = {
  entityRef: KenosEntityRefSchema,
  actionRequest: KenosActionRequestSchema,
  actionDecision: KenosActionDecisionSchema,
  actionResult: KenosActionResultSchema,
  approvalRequest: KenosApprovalRequestSchema,
  approvalDecision: KenosApprovalDecisionSchema,
  approvalRecord: KenosApprovalRecordSchema,
  activityRecord: KenosActivityRecordSchema,
  mutationEnvelope: KenosMutationEnvelopeSchema,
  outboxRecord: KenosOutboxRecordSchema,
  captureEnvelope: KenosCaptureEnvelopeSchema,
  commandFailure: KenosCommandFailureSchema,
}

function materialize(fixture) {
  if (fixture.value) return structuredClone(fixture.value)
  const base = structuredClone(validById.get(fixture.valueFrom))
  assert.ok(base, `unknown fixture base: ${fixture.valueFrom}`)
  return { ...base, ...fixture.patch }
}

assert.equal(manifest.contractVersion, '1')
assert.equal(manifest.freezeStatus, 'V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW')
assert.equal(manifest.unknownFields, 'ignore')
for (const [actual, expected, label] of [
  [KenosPhase1ActionTypeValues, manifest.actionTypes, 'action types'],
  [KenosDomainValues, manifest.domains, 'domains'],
  [KenosSecurityDomainValues, manifest.securityDomains, 'security domains'],
  [KenosClassificationValues, manifest.dataClassifications, 'classifications'],
  [KenosRiskLevelValues, manifest.riskValues, 'risk values'],
  [KenosActorTypeValues, manifest.actorTypes, 'actor types'],
  [KenosActionDecisionOutcomeValues, manifest.actionDecisionOutcomes, 'decision outcomes'],
  [KenosActionResultStatusValues, manifest.actionResultStatuses, 'action result statuses'],
  [KenosActivityResultValues, manifest.activityResults, 'activity results'],
  [KenosApprovalStatusValues, manifest.approvalStatuses, 'approval statuses'],
  [KenosOutboxStatusValues, manifest.outboxStatuses, 'outbox statuses'],
  [KenosErrorClassValues, manifest.errorClasses, 'error classes'],
]) {
  assert.deepEqual([...actual], expected, `manifest drift: ${label}`)
}
assert.deepEqual(KenosOutboxTransitions, manifest.outboxTransitions, 'manifest drift: Outbox transitions')
assert.deepEqual(KenosApprovalTransitions, manifest.approvalTransitions, 'manifest drift: Approval transitions')
assert.deepEqual(corpus.valid.map(({ id }) => id), manifest.validFixtureIds, 'valid fixture coverage drift')
assert.deepEqual(corpus.invalid.map(({ id }) => id), manifest.invalidFixtureIds, 'invalid fixture coverage drift')

for (const fixture of corpus.valid) {
  const schema = schemaByContract[fixture.contract]
  assert.ok(schema, `no TypeScript schema for valid fixture ${fixture.id}`)
  const parsed = schema.safeParse(fixture.value)
  assert.equal(parsed.success, true, `${fixture.id} should pass TypeScript validation: ${parsed.error || ''}`)
}

const unknownFieldFixture = corpus.valid.find(({ id }) => id === 'action-create-task-unknown-optional')
const unknownFieldResult = KenosActionRequestSchema.parse(unknownFieldFixture.value)
assert.equal('futureOptionalField' in unknownFieldResult, false, 'unknown additive fields must be accepted and ignored')

for (const fixture of corpus.invalid) {
  if (fixture.contract === 'serverAction' || fixture.contract === 'serverScenario' || fixture.contract === 'serverApproval') continue
  const value = materialize(fixture)
  const schema = fixture.contract === 'outboxTransition'
    ? KenosOutboxTransitionSchema
    : fixture.contract === 'approvalTransition'
      ? KenosApprovalTransitionSchema
    : schemaByContract[fixture.contract]
  assert.ok(schema, `no TypeScript schema for invalid fixture ${fixture.id}`)
  assert.equal(schema.safeParse(value).success, false, `${fixture.id} should fail TypeScript validation`)
}

console.log('kenos contracts: canonical v1 corpus ok')
