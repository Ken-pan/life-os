/**
 * 组次方案逻辑冒烟测试（纯函数层）
 * 运行: node scripts/verify-schemes.mjs
 */
import {
  SET_SCHEMES,
  SCHEME_OPTIONS,
  schemeMeta,
  schemeLabel,
  schemeCoachHint
} from '../src/lib/data/setSchemes.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('=== setSchemes.js ===\n');

for (const id of SCHEME_OPTIONS) {
  const meta = SET_SCHEMES[id];
  assert(meta?.id === id, `SET_SCHEMES[${id}] has id, label, description`);
  assert(typeof meta.label === 'string' && meta.label.length > 0, `${id} label non-empty`);
  assert(typeof meta.description === 'string', `${id} description exists`);
  assert('hint' in meta, `${id} has hint field`);
}

assert(schemeMeta(null).id === 'straight', 'schemeMeta(null) → straight');
assert(schemeMeta('bogus').id === 'straight', 'schemeMeta(unknown) → straight');
assert(schemeLabel('straight') === null, 'schemeLabel(straight) → null');
assert(schemeLabel(undefined) === null, 'schemeLabel(undefined) → null');
assert(schemeLabel('drop') === 'Drop', 'schemeLabel(drop) → short label');

assert(schemeCoachHint({ scheme: 'straight' }) === null, 'straight → no hint');
assert(
  schemeCoachHint({ scheme: 'ascending' })?.includes('递增'),
  'ascending hint mentions 递增'
);
assert(
  schemeCoachHint({ scheme: 'superset' })?.includes('配对动作'),
  'superset without pair → fallback hint'
);

const day = [
  { id: 'c_bench', name: '杠铃卧推' },
  { id: 'c_fly', name: '龙门架夹胸' }
];
assert(
  schemeCoachHint({ scheme: 'superset', pairWith: 'c_fly' }, day)?.includes('龙门架夹胸'),
  'superset with valid pair → pair name in hint'
);
assert(
  schemeCoachHint({ scheme: 'superset', pairWith: 'c_fly' }, [{ id: 'c_bench', name: '杠铃卧推' }])?.includes(
    '不在本日计划'
  ),
  'superset with orphan pair → orphan message'
);

console.log('\n=== prune logic (inline) ===\n');

function baseFieldValue(base, key) {
  if (key === 'scheme') return base[key] ?? 'straight';
  if (key === 'pairWith') return base[key] ?? undefined;
  return base[key];
}

function pruneExerciseOverride(base, merged) {
  const PATCH_KEYS = ['name', 'sets', 'reps', 'rest', 'rir', 'w', 'hidden', 'scheme', 'pairWith'];
  if (base) {
    PATCH_KEYS.forEach((k) => {
      if (k === 'hidden') return;
      if (merged[k] === undefined) return;
      if (merged[k] === baseFieldValue(base, k)) delete merged[k];
    });
  }
  if (!merged.hidden) delete merged.hidden;
  if (!merged.scheme || merged.scheme === 'straight') delete merged.scheme;
  if (!merged.pairWith || merged.scheme !== 'superset') delete merged.pairWith;
  return merged;
}

const baseEx = { id: 'c_bench', name: '杠铃卧推', sets: 4, reps: '6-8', rest: 150 };

let r = pruneExerciseOverride(baseEx, { scheme: 'straight' });
assert(Object.keys(r).length === 0, 'straight scheme pruned → empty override');

r = pruneExerciseOverride(baseEx, { scheme: 'drop' });
assert(r.scheme === 'drop' && !r.pairWith, 'drop scheme kept, no pairWith');

r = pruneExerciseOverride(baseEx, { scheme: 'superset', pairWith: 'c_fly' });
assert(r.scheme === 'superset' && r.pairWith === 'c_fly', 'superset + pair kept');

r = pruneExerciseOverride(baseEx, { scheme: 'ascending', pairWith: 'c_fly' });
assert(r.scheme === 'ascending' && !r.pairWith, 'non-superset clears pairWith');

r = pruneExerciseOverride(baseEx, { sets: 4 });
assert(Object.keys(r).length === 0, 'sets matching base pruned');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
