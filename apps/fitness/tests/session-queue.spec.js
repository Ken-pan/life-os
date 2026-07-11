import { test, expect } from '@playwright/test';
import { buildSessionQueue } from '../src/lib/sessionQueue.js';

const registry = {
  bench: { id: 'bench', name: 'Bench', sets: 4 },
  decline: { id: 'decline', name: 'Decline press', sets: 3 },
  lateral: { id: 'lateral', name: 'Cable lateral raise', sets: 3 }
};

test('stable slots do not deduplicate legitimate repeated planned exercises', () => {
  const queue = buildSessionQueue('push', [registry.lateral, registry.lateral], {}, registry);
  expect(queue).toHaveLength(2);
  expect(queue.map((slot) => slot.slotKey)).toEqual(['push:0:lateral', 'push:1:lateral']);
  expect(queue.map((slot) => slot.performedExerciseId)).toEqual(['lateral', 'lateral']);
});

test('substitution does not remove a later slot with the same performed exercise', () => {
  const bench = { ...registry.bench, alternatives: [{ id: 'decline' }] };
  const queue = buildSessionQueue('push', [bench, registry.decline], {
    bench: { skipped: { substituteId: 'decline', reason: 'equipment' } }
  }, registry);
  expect(queue).toHaveLength(2);
  expect(queue.map((slot) => slot.slotKey)).toEqual(['push:0:bench', 'push:1:decline']);
  expect(queue.map((slot) => slot.plannedExerciseId)).toEqual(['bench', 'decline']);
  expect(queue.map((slot) => slot.performedExerciseId)).toEqual(['decline', 'decline']);
});

test('same-as-planned and missing substitutes do not create fake attribution', () => {
  const bench = { ...registry.bench, alternatives: [{ id: 'bench' }, { id: 'missing' }] };
  for (const substituteId of ['bench', 'missing']) {
    const [slot] = buildSessionQueue('push', [bench], {
      bench: { skipped: { substituteId } }
    }, registry);
    expect(slot.plannedExerciseId).toBe('bench');
    expect(slot.performedExerciseId).toBe('bench');
    expect(slot.substitution).toBeNull();
  }
});
