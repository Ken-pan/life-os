import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  validateApprovalRecordForRead,
  validateApprovalTransition,
} from './approvalReadModel.mjs'

const corpus = JSON.parse(readFileSync(new URL('../../../../packages/contracts/fixtures/kenos/v1/corpus.json', import.meta.url)))
const validById = new Map(corpus.valid.map((fixture) => [fixture.id, fixture.value]))

function materialize(fixture) {
  if (fixture.value) return structuredClone(fixture.value)
  return { ...structuredClone(validById.get(fixture.valueFrom)), ...structuredClone(fixture.patch) }
}

for (const fixture of corpus.valid.filter(({ contract }) => contract === 'approvalRecord')) {
  const result = validateApprovalRecordForRead(fixture.value, {
    authOwnerId: fixture.value.ownerId,
    expectedActionId: fixture.value.actionId,
  })
  assert.equal(result.ok, true, `${fixture.id} must pass the server read boundary`)
  assert.equal('executedAt' in result.record, false, 'Approval must not imply execution state')
}

for (const fixture of corpus.invalid.filter(({ contract }) => contract === 'serverApproval')) {
  const result = validateApprovalRecordForRead(materialize(fixture), fixture.validationContext)
  assert.equal(result.ok, false, `${fixture.id} must fail the server read boundary`)
  assert.equal(result.error.code, fixture.expectedError)
}

const illegal = corpus.invalid.find(({ id }) => id === 'approval-illegal-transition')
assert.equal(validateApprovalTransition(illegal.value).ok, false)

console.log('approvalReadModel.test.mjs: canonical owner/action/transition boundary PASS')
