#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  KenosActionDecisionSchema,
  KenosActionRequestSchema,
  KenosActionResultSchema,
  KenosActivityRecordSchema,
  KenosApprovalDecisionSchema,
  KenosApprovalRecordSchema,
  KenosApprovalRequestSchema,
  KenosCaptureEnvelopeSchema,
  KenosCommandFailureSchema,
  KenosEntityRefSchema,
  KenosOutboxRecordSchema,
  KenosMutationEnvelopeSchema,
} from '../packages/contracts/src/kenos.ts'

const root = process.cwd()
const fixtureRoot = join(root, 'packages/contracts/fixtures/kenos/v1')
const manifest = JSON.parse(readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8'))
const corpus = JSON.parse(readFileSync(join(fixtureRoot, 'corpus.json'), 'utf8'))
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

assert.equal(manifest.contractVersion, '1')
assert.equal(manifest.freezeStatus, 'V1_FROZEN_FOR_PHASE_1_PRODUCTION_REVIEW')
assert.equal(manifest.unknownFields, 'ignore')
assert.deepEqual(corpus.valid.map(({ id }) => id), manifest.validFixtureIds)
assert.deepEqual(corpus.invalid.map(({ id }) => id), manifest.invalidFixtureIds)

for (const fixture of corpus.valid) {
  const required = manifest.requiredFields[fixture.contract] || []
  for (const field of required) assert.ok(field in fixture.value, `${fixture.id} is missing required field ${field}`)
  assert.equal(schemaByContract[fixture.contract].safeParse(fixture.value).success, true, `${fixture.id} failed TypeScript validation`)
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'kenos-contract-parity-'))
const swiftOutput = join(temporaryDirectory, 'swift-encoded.json')
try {
  execFileSync('swift', ['test', '--package-path', 'clients/apple/Packages/KenosContracts'], {
    cwd: root,
    env: { ...process.env, KENOS_SWIFT_PARITY_OUTPUT: swiftOutput },
    stdio: 'inherit',
  })
  const encoded = JSON.parse(readFileSync(swiftOutput, 'utf8'))
  assert.deepEqual(Object.keys(encoded).sort(), manifest.validFixtureIds.toSorted(), 'Swift fixture output coverage drift')
  for (const fixture of corpus.valid) {
    const parsed = schemaByContract[fixture.contract].safeParse(encoded[fixture.id])
    assert.equal(parsed.success, true, `Swift-encoded ${fixture.id} failed TypeScript validation: ${parsed.error || ''}`)
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}

console.log('check-kenos-contract-parity — OK')
