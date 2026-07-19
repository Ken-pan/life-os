import assert from 'node:assert/strict'
import { classifyCreateTaskPolicy } from './policyRisk.mjs'

const base = {
  schemaVersion: '1',
  id: '10000000-0000-4000-8000-000000000001',
  actionType: 'plan.create_task',
  producer: 'assistant',
  targetDomain: 'plan',
  actor: { type: 'assistant', id: '20000000-0000-4000-8000-000000000001' },
  deviceId: '30000000-0000-4000-8000-000000000001',
  securityDomain: 'personal',
  dataClassification: 'personal',
  requestedRisk: 'R1',
  payload: { title: 'ok', reversible: true },
}

{
  const allow = classifyCreateTaskPolicy(base)
  assert.equal(allow.ok, true)
  assert.equal(allow.evaluatedRisk, 'R1')
}

{
  const understated = classifyCreateTaskPolicy({
    ...base,
    requestedRisk: 'R1',
    payload: { title: 'bulk', bulk: true, items: ['a', 'b'] },
  })
  assert.equal(understated.ok, false)
  assert.equal(understated.evaluatedRisk, 'R2')
  assert.equal(understated.error.code, 'risk_understated')
}

{
  const work = classifyCreateTaskPolicy({
    ...base,
    producer: 'work',
    requestedRisk: 'R1',
    payload: { title: 'x', workSource: { id: 'w1' } },
  })
  assert.equal(work.ok, false)
  assert.equal(work.evaluatedRisk, 'R3')
}

{
  const proactive = classifyCreateTaskPolicy({
    ...base,
    producer: 'proactive',
    requestedRisk: 'R3',
  })
  assert.equal(proactive.ok, false)
  assert.equal(proactive.evaluatedRisk, 'R3')
  assert.equal(proactive.error.code, 'risk_not_allowed')
}

{
  const unknown = classifyCreateTaskPolicy({ ...base, actionType: 'plan.delete_everything' })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.evaluatedRisk, 'R4')
  assert.equal(unknown.error.code, 'unsupported_action')
}

{
  const clientClaimsR1ForR3 = classifyCreateTaskPolicy({
    ...base,
    requestedRisk: 'R1',
    dataClassification: 'work_confidential',
  })
  assert.equal(clientClaimsR1ForR3.ok, false)
  assert.equal(clientClaimsR1ForR3.error.code, 'risk_understated')
}

console.log('policyRisk.test.mjs: ok')
