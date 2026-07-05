import { describe, expect, it } from 'vitest';
import { getRecommendations } from './recommendations.js';

describe('getRecommendations', () => {
  it('includes taskId on schedule recommendation', async () => {
    const tasks = [
      { id: 'a', completed: false, dueDate: null, priority: 2, sortOrder: 1 },
      { id: 'b', completed: false, dueDate: null, priority: 1, sortOrder: 2 },
      { id: 'c', completed: false, dueDate: null, priority: 0, sortOrder: 3 }
    ];
    const recs = await getRecommendations({ tasks });
    const schedule = recs.find((r) => r.kind === 'schedule');
    expect(schedule?.taskId).toBe('b');
  });
});
