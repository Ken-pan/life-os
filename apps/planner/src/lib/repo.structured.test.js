import { describe, expect, it } from 'vitest';
import {
  buildListSyncRows,
  buildTaskSyncRows,
  remoteIdsToDelete
} from './repo.js';

describe('structured sync row builders', () => {
  it('buildTaskSyncRows maps task fields for upsert', () => {
    const rows = buildTaskSyncRows('user-1', [
      { id: 't1', title: 'A', updatedAt: 1_700_000_000_000 }
    ]);
    expect(rows).toEqual([
      {
        user_id: 'user-1',
        id: 't1',
        data: { id: 't1', title: 'A', updatedAt: 1_700_000_000_000 },
        updated_at: new Date(1_700_000_000_000).toISOString()
      }
    ]);
  });

  it('buildListSyncRows maps list fields for upsert', () => {
    const rows = buildListSyncRows('user-1', [{ id: 'inbox', name: 'Inbox' }]);
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      id: 'inbox',
      data: { id: 'inbox', name: 'Inbox' }
    });
    expect(rows[0].updated_at).toBeTruthy();
  });

  it('remoteIdsToDelete returns ids missing locally', () => {
    expect(remoteIdsToDelete(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
    expect(remoteIdsToDelete([], ['a'])).toEqual([]);
  });
});
