#!/usr/bin/env node
/** 动作 ID 迁移回归测试 */
import { EX_ID_ALIASES } from '../src/lib/data/exercises.js';

let failed = 0;
const assert = (ok, msg) => {
  if (!ok) {
    console.error('FAIL:', msg);
    failed++;
  }
};

function migrateWeights(weights) {
  const out = { ...weights };
  for (const [oldId, newId] of Object.entries(EX_ID_ALIASES)) {
    if (out[oldId] === undefined) continue;
    if (out[newId] === undefined) out[newId] = out[oldId];
    delete out[oldId];
  }
  return out;
}

function migrateProgramOverrides(overrides) {
  const resolve = (id) => EX_ID_ALIASES[id] ?? id;
  const out = {};
  for (const [key, val] of Object.entries(overrides || {})) {
    const newKey = key.startsWith('day:') ? key : resolve(key);
    let newVal = val;
    if (key.startsWith('day:') && val && typeof val === 'object') {
      newVal = { ...val };
      if (Array.isArray(newVal.addedEx)) {
        newVal.addedEx = [...new Set(newVal.addedEx.map((id) => resolve(id)))];
      }
      if (Array.isArray(newVal.exOrder)) {
        newVal.exOrder = newVal.exOrder.map((id) => resolve(id));
      }
    }
    if (newVal?.pairWith) newVal = { ...newVal, pairWith: resolve(newVal.pairWith) };
    if (!key.startsWith('day:') && out[newKey]) out[newKey] = { ...out[newKey], ...newVal };
    else out[newKey] = newVal;
  }
  return out;
}

const weights = migrateWeights({ c_dip: 25, c_bench: 185 });
assert(weights.ar_dip === 25, 'c_dip weight should merge into ar_dip when ar_dip absent');
assert(weights.c_dip === undefined, 'old c_dip key removed');

const weights2 = migrateWeights({ c_dip: 25, ar_dip: 30 });
assert(weights2.ar_dip === 30, 'existing ar_dip weight preserved over alias');

const ov = migrateProgramOverrides({
  c_dip: { sets: 4 },
  'day:chest': { addedEx: ['c_dip', 'sh_facepull_iso'], exOrder: ['c_bench', 'c_dip'] }
});
assert(ov.ar_dip?.sets === 4, 'override key migrated');
assert(ov.c_dip === undefined, 'old override key removed');
assert(ov['day:chest'].addedEx.includes('ar_dip'), 'addedEx migrated');
assert(ov['day:chest'].addedEx.includes('b_face'), 'sh_facepull_iso → b_face');

console.log(failed ? `${failed} migration tests failed` : 'migration tests passed');
process.exit(failed ? 1 : 0);
