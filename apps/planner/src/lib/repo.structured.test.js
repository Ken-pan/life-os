import { describe, expect, it } from 'vitest';
import { buildListSyncRows, buildTaskSyncRows } from './repo.js';

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

  it('buildTaskSyncRows keeps tombstoned tasks as rows', () => {
    const rows = buildTaskSyncRows('user-1', [
      { id: 't1', title: 'A', updatedAt: 200, deletedAt: 200 }
    ]);
    expect(rows[0].data.deletedAt).toBe(200);
  });

  it('buildListSyncRows uses the list updatedAt for the row timestamp', () => {
    const rows = buildListSyncRows('user-1', [
      { id: 'inbox', title: 'Inbox', updatedAt: 1_700_000_000_000 }
    ]);
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      id: 'inbox',
      updated_at: new Date(1_700_000_000_000).toISOString()
    });
  });

  it('buildListSyncRows falls back to now when list has no updatedAt', () => {
    const rows = buildListSyncRows('user-1', [{ id: 'inbox', title: 'Inbox' }]);
    expect(rows[0].updated_at).toBeTruthy();
  });
});
