import { S } from '../.svelte-kit/output/server/chunks/state.js';
import { recommendNextWeight } from '../.svelte-kit/output/server/chunks/progression.js';

S.weights['c_bench'] = 185;
S.logs['2026-07-03|push_a'] = {
  'c_bench': {
    sets: [
      { weight: 185, reps: 12, rir: 2 },
      { weight: 185, reps: 12, rir: 2 },
      { weight: 185, reps: 12, rir: 1 }
    ]
  }
};

const res = recommendNextWeight('c_bench');
console.log('Result:', res);
