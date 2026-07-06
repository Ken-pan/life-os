import { describe, it, expect } from 'vitest';
import {
  migrate,
  mergeTasksByUpdatedAt,
  mergeListsByUpdatedAt,
  mergeSettingsByUpdatedAt,
  migrateTask,
  splitExpiredTombstones,
  TOMBSTONE_TTL_MS,
  SCHEMA_VERSION
} from './migrate.js';

describe('migrate', () => {
  it('returns default state for null input', () => {
    const state = migrate(null);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.tasks).toEqual([]);
    expect(state.lists.length).toBeGreaterThan(0);
  });

  it('migrates tasks with reminder and recurrence defaults', () => {
    const state = migrate({
      tasks: [{ id: '1', title: 'A', listId: 'inbox', completed: false }],
      settings: { locale: 'en' }
    });
    expect(state.tasks[0].reminderMinutes).toBeNull();
    expect(state.tasks[0].recurrence).toBeNull();
    expect(state.settings.locale).toBe('en');
  });

  it('rejects invalid task rows', () => {
    const state = migrate({ tasks: [null, 'bad', { id: '2', title: 'ok', listId: 'inbox' }] });
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe('2');
  });
});

describe('mergeTasksByUpdatedAt', () => {
  const base = (id, updatedAt, title) =>
    migrateTask({ id, title, listId: 'inbox', updatedAt, completed: false });

  it('keeps newer updatedAt on conflict', () => {
    const local = [base('a', 100, 'old')];
    const incoming = [base('a', 200, 'new')];
    const merged = mergeTasksByUpdatedAt(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('new');
  });

  it('preserves local when local is newer', () => {
    const local = [base('a', 300, 'local')];
    const incoming = [base('a', 100, 'remote')];
    const merged = mergeTasksByUpdatedAt(local, incoming);
    expect(merged[0].title).toBe('local');
  });

  it('adds tasks only present remotely', () => {
    const merged = mergeTasksByUpdatedAt([], [base('b', 1, 'remote')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('b');
  });

  it('propagates newer tombstones instead of reviving tasks', () => {
    const local = [base('a', 100, 'alive')];
    const incoming = [{ ...base('a', 200, 'alive'), deletedAt: 200 }];
    const merged = mergeTasksByUpdatedAt(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].deletedAt).toBe(200);
  });

  it('keeps a newer local edit over an older remote tombstone', () => {
    const local = [base('a', 300, 'edited')];
    const incoming = [{ ...base('a', 100, 'old'), deletedAt: 100 }];
    const merged = mergeTasksByUpdatedAt(local, incoming);
    expect(merged[0].deletedAt).toBeNull();
    expect(merged[0].title).toBe('edited');
  });
});

describe('mergeListsByUpdatedAt', () => {
  it('keeps the newer list version by updatedAt', () => {
    const local = [{ id: 'l1', title: 'old', updatedAt: 100 }];
    const incoming = [{ id: 'l1', title: 'new', updatedAt: 200 }];
    expect(mergeListsByUpdatedAt(local, incoming)[0].title).toBe('new');
  });

  it('does not overwrite a newer local list with stale remote data', () => {
    const local = [{ id: 'l1', title: 'local', updatedAt: 300 }];
    const incoming = [{ id: 'l1', title: 'stale', updatedAt: 100 }];
    expect(mergeListsByUpdatedAt(local, incoming)[0].title).toBe('local');
  });

  it('propagates list tombstones', () => {
    const local = [{ id: 'l1', title: 'x', updatedAt: 100 }];
    const incoming = [{ id: 'l1', title: 'x', updatedAt: 200, deletedAt: 200 }];
    expect(mergeListsByUpdatedAt(local, incoming)[0].deletedAt).toBe(200);
  });
});

describe('mergeSettingsByUpdatedAt', () => {
  it('applies incoming settings only when newer', () => {
    const local = { theme: 'light', updatedAt: 100 };
    expect(mergeSettingsByUpdatedAt(local, { theme: 'dark', updatedAt: 200 }).theme).toBe('dark');
    expect(mergeSettingsByUpdatedAt(local, { theme: 'dark', updatedAt: 50 }).theme).toBe('light');
  });

  it('keeps local settings for legacy data without timestamps', () => {
    const local = { theme: 'light', updatedAt: 0 };
    expect(mergeSettingsByUpdatedAt(local, { theme: 'dark' }).theme).toBe('light');
  });
});

describe('tombstone lifecycle', () => {
  it('splitExpiredTombstones separates expired tombstones', () => {
    const now = Date.now();
    const items = [
      { id: 'live', deletedAt: null },
      { id: 'fresh-tombstone', deletedAt: now - 1000 },
      { id: 'expired-tombstone', deletedAt: now - TOMBSTONE_TTL_MS - 1000 }
    ];
    const { live, expiredIds } = splitExpiredTombstones(items, now);
    expect(live.map((i) => i.id)).toEqual(['live', 'fresh-tombstone']);
    expect(expiredIds).toEqual(['expired-tombstone']);
  });

  it('migrate drops expired tombstones but keeps fresh ones', () => {
    const now = Date.now();
    const state = migrate({
      tasks: [
        { id: 'a', title: 'x', listId: 'inbox', deletedAt: now - 1000 },
        { id: 'b', title: 'y', listId: 'inbox', deletedAt: now - TOMBSTONE_TTL_MS - 1000 }
      ]
    });
    expect(state.tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('migrate restores inbox if it was tombstoned', () => {
    const state = migrate({
      lists: [{ id: 'inbox', title: 'inbox', deletedAt: Date.now() }]
    });
    const inbox = state.lists.find((l) => l.id === 'inbox');
    expect(inbox.deletedAt).toBeNull();
  });
});
