import { describe, expect, it } from 'vitest';
import {
  buildAttachmentSyncRows,
  buildListSyncRows,
  buildProjectSyncRows,
  buildTaskSyncRows,
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

  it('buildTaskSyncRows keeps tombstoned tasks as rows', () => {
    const rows = buildTaskSyncRows('user-1', [
      { id: 't1', title: 'A', updatedAt: 200, deletedAt: 200 }
    ]);
    expect(rows[0].data.deletedAt).toBe(200);
  });

  it('buildTaskSyncRows skips Kenos create rows until legacyDirty', () => {
    const rows = buildTaskSyncRows('user-1', [
      {
        id: 'kenos-1',
        title: 'Canary',
        updatedAt: 100,
        meta: { kenosWriterCreate: true, legacyDirty: false },
      },
      {
        id: 'kenos-2',
        title: 'Edited',
        updatedAt: 200,
        meta: { kenosWriterCreate: true, legacyDirty: true },
      },
      { id: 'legacy-1', title: 'Legacy', updatedAt: 300 },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['kenos-2', 'legacy-1']);
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

  it('buildProjectSyncRows maps project fields for upsert', () => {
    const rows = buildProjectSyncRows('user-1', [
      { id: 'p1', title: 'Project', updatedAt: 1_700_000_000_000 }
    ]);
    expect(rows).toEqual([
      {
        user_id: 'user-1',
        id: 'p1',
        data: { id: 'p1', title: 'Project', updatedAt: 1_700_000_000_000 },
        updated_at: new Date(1_700_000_000_000).toISOString()
      }
    ]);
  });

  it('buildProjectSyncRows keeps tombstoned projects as rows', () => {
    const rows = buildProjectSyncRows('user-1', [
      { id: 'p1', title: 'Project', updatedAt: 200, deletedAt: 200 }
    ]);
    expect(rows[0].data.deletedAt).toBe(200);
  });

  it('buildAttachmentSyncRows maps owner fields for upsert', () => {
    const rows = buildAttachmentSyncRows('user-1', [
      {
        id: 'a1',
        ownerType: 'task',
        ownerId: 't1',
        kind: 'file',
        updatedAt: 1_700_000_000_000,
      },
    ]);
    expect(rows).toEqual([
      {
        user_id: 'user-1',
        id: 'a1',
        owner_type: 'task',
        owner_id: 't1',
        data: {
          id: 'a1',
          ownerType: 'task',
          ownerId: 't1',
          kind: 'file',
          updatedAt: 1_700_000_000_000,
        },
        updated_at: new Date(1_700_000_000_000).toISOString(),
      },
    ]);
  });
});
