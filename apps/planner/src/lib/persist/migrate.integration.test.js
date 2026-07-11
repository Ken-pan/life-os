import { describe, it, expect } from 'vitest';
import { migrate } from './migrate.js';
import { buildTaskIndex } from '../domain/taskIndex.js';
import { selectSearch } from '../domain/selectors.js';
import { computeDayScheduleStats } from '../domain/schedule.js';

describe('Migration Pipeline Integration', () => {
  it('safely processes legacy tasks with missing tags through schedule and search consumers', () => {
    const rawLegacyData = {
      tasks: [
        {
          id: 'legacy-1',
          title: 'Legacy task missing tags',
          listId: 'inbox',
          scheduledStart: '10:00',
          durationMinutes: 60,
          subtasks: []
          // no tags field
        },
        {
          id: 'legacy-2',
          title: 'Legacy task null tags',
          listId: 'inbox',
          scheduledStart: '11:00',
          durationMinutes: 30,
          tags: null,
          subtasks: []
        }
      ]
    };

    // 1. Migration Pipeline
    const state = migrate(rawLegacyData);

    // 2. Build index (commonly used by consumers)
    const index = buildTaskIndex(state.tasks);

    // 3. Schedule Consumer (Calendar / Timeline)
    expect(() => {
      const stats = computeDayScheduleStats(index.active);
      expect(stats.scheduled).toBe(2);
      expect(stats.plannedMinutes).toBe(90);
    }).not.toThrow();

    // 4. Search Consumer (Throws "tags is not iterable" if tags is missing/null and spread)
    expect(() => {
      const results = selectSearch(index, 'legacy');
      expect(results.length).toBe(2);
    }).not.toThrow();
  });
});
