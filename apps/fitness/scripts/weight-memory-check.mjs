#!/usr/bin/env node
import assert from 'node:assert/strict';
import { carryForwardWeight, carriesStartingWeight } from '../src/lib/weightMemory.js';

const sets = [
  { weight: 185 },
  { weight: 190 },
  { weight: 175 }
];

assert.equal(carryForwardWeight({ scheme: 'straight' }, sets), 175);
assert.equal(carryForwardWeight({ scheme: 'superset' }, sets), 175);
for (const scheme of ['ascending', 'descending', 'pyramid', 'reverse_pyramid', 'drop']) {
  assert.equal(carriesStartingWeight({ scheme }), true);
  assert.equal(carryForwardWeight({ scheme }, sets), 185, `${scheme} should retain its starting load`);
}
assert.equal(carriesStartingWeight({ scheme: 'straight' }), false);
assert.equal(carryForwardWeight({ scheme: 'straight' }, [null, { weight: 0 }]), 0);
assert.equal(carryForwardWeight({ scheme: 'straight' }, []), null);

console.log('✓ carry-forward weight semantics OK');
