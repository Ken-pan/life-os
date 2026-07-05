import { describe, expect, it } from 'vitest';
import { scheduleUndatedTasks, sortUndatedTasks, suggestDueDate } from './scheduling.js';

describe('suggestDueDate', () => {
  it('returns existing due date when set', () => {
    const result = suggestDueDate({ dueDate: '2026-07-10', priority: 0 });
    expect(result).toEqual({ date: '2026-07-10', reason: 'existing', confidence: 1 });
  });

  it('skips busy dates within 14 days', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = suggestDueDate(
      { dueDate: null, priority: 2 },
      { busyDates: [today] }
    );
    expect(result.date).not.toBe(today);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('prefers high priority slot reason', () => {
    const result = suggestDueDate({ dueDate: null, priority: 1 }, { busyDates: [] });
    expect(result.reason).toBe('high_priority_slot');
  });
});

describe('scheduleUndatedTasks', () => {
  it('schedules up to limit tasks on distinct free days', () => {
    const today = new Date().toISOString().slice(0, 10);
    const tasks = [
      { id: 'a', dueDate: null, priority: 1, sortOrder: 1 },
      { id: 'b', dueDate: null, priority: 2, sortOrder: 2 },
      { id: 'c', dueDate: null, priority: 0, sortOrder: 3 },
      { id: 'd', dueDate: null, priority: 0, sortOrder: 4 }
    ];
    const results = scheduleUndatedTasks(sortUndatedTasks(tasks), {
      busyDates: [today],
      limit: 3
    });
    expect(results).toHaveLength(3);
    expect(new Set(results.map((r) => r.date)).size).toBe(3);
    expect(results[0].task.id).toBe('a');
  });
});
