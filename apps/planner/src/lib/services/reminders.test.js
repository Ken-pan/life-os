import { describe, it, expect, vi, afterEach } from 'vitest';
import { reminderFireAt } from './reminders.js';

const baseTask = {
  id: '1',
  title: 'Test',
  notes: '',
  listId: 'inbox',
  priority: 0,
  dueDate: '2026-07-05',
  dueTime: '09:00',
  reminderMinutes: 15,
  recurrence: null,
  tags: [],
  subtasks: [],
  completed: false,
  completedAt: null,
  createdAt: 1,
  updatedAt: 1,
  sortOrder: 1,
  meta: {}
};

describe('reminderFireAt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when reminder already passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 5, 9, 0, 0));
    expect(reminderFireAt(baseTask)).toBeNull();
  });

  it('computes fire time before due', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 5, 8, 0, 0));
    const fireAt = reminderFireAt(baseTask);
    expect(fireAt).toBe(new Date(2026, 6, 5, 8, 45, 0).getTime());
  });

  it('uses 9:00 default when no dueTime', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 5, 8, 0, 0));
    const fireAt = reminderFireAt({ ...baseTask, dueTime: null, reminderMinutes: 0 });
    expect(fireAt).toBe(new Date(2026, 6, 5, 9, 0, 0).getTime());
  });
});
