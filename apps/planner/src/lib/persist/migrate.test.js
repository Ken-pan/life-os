import { describe, it, expect } from 'vitest';
import { buildTaskIndex } from '../domain/taskIndex.js';
import {
  migrate,
  mergeTasksByUpdatedAt,
  mergeListsByUpdatedAt,
  mergeProjectsByUpdatedAt,
  mergeSettingsByUpdatedAt,
  migrateTask,
  migrateProject,
  splitExpiredTombstones,
  TOMBSTONE_TTL_MS,
  SCHEMA_VERSION
} from './migrate.js';

describe('migrate', () => {
  it('returns default state for null input', () => {
    const state = migrate(null);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.tasks).toEqual([]);
    expect(state.projects).toEqual([]);
    expect(state.attachments).toEqual([]);
    expect(state.lists.length).toBeGreaterThan(0);
  });

  it('migrates attachments with safe defaults', () => {
    const state = migrate({
      attachments: [{ id: 'att-1', ownerId: 't-1' }]
    });
    expect(state.attachments[0]).toMatchObject({
      id: 'att-1',
      ownerType: 'task',
      ownerId: 't-1',
      kind: 'file',
      status: 'pending',
    });
  });

  it('migrates tasks with reminder and recurrence defaults', () => {
    const state = migrate({
      tasks: [{ id: '1', title: 'A', listId: 'inbox', completed: false }],
      settings: { locale: 'en' }
    });
    expect(state.tasks[0].reminderMinutes).toBeNull();
    expect(state.tasks[0].recurrence).toBeNull();
    expect(state.tasks[0].tags).toEqual([]);
    expect(state.tasks[0].subtasks).toEqual([]);
    expect(state.settings.locale).toBe('en');
  });

  it('normalizes missing or invalid tags to an empty array', () => {
    const state = migrate({
      tasks: [
        { id: '1', title: 'A', tags: null },
        { id: '2', title: 'B', tags: 'invalid' },
        { id: '3', title: 'C' },
        { id: '4', title: 'D', tags: ['valid'] }
      ]
    });
    expect(state.tasks[0].tags).toEqual([]);
    expect(state.tasks[1].tags).toEqual([]);
    expect(state.tasks[2].tags).toEqual([]);
    expect(state.tasks[3].tags).toEqual(['valid']);
  });

  it('normalizes legacy task collections once at the migration boundary', () => {
    const state = migrate({
      schemaVersion: 2,
      tasks: [
        {
          id: 'legacy',
          title: 'Legacy task',
          listId: 'inbox',
          tags: 'not-an-array',
          subtasks: null,
        },
      ],
    });

    expect(state.tasks[0]).toMatchObject({ tags: [], subtasks: [] });
  });

  it('rejects invalid task rows', () => {
    const state = migrate({ tasks: [null, 'bad', { id: '2', title: 'ok', listId: 'inbox' }] });
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe('2');
    expect(state.tasks[0].tags).toEqual([]);
  });

  it('migrates projects with safe defaults and references', () => {
    const state = migrate({
      projects: [
        {
          id: 'proj-1',
          title: 'Paper OS',
          status: 'bad',
          priority: 'p1',
          progressMode: 'manual',
          manualProgress: 150,
          roadmapRefs: [
            {
              id: 'ref-1',
              roadmapItemId: 'P-MOVE-3',
              sourcePath: 'docs/roadmap/apps/planner.md',
              isPrimary: true
            },
            { id: 'bad' }
          ],
          repoRefs: [
            {
              id: 'repo-1',
              kind: 'repo',
              label: 'life-os',
              url: 'https://github.com/Ken-pan/life-os'
            },
            { id: 'bad', kind: 'unknown' }
          ]
        }
      ]
    });
    expect(state.projects[0]).toMatchObject({
      id: 'proj-1',
      title: 'Paper OS',
      slug: 'paper-os',
      status: 'active',
      priority: 'p1',
      progressMode: 'manual',
      manualProgress: 100
    });
    expect(state.projects[0].roadmapRefs).toHaveLength(1);
    expect(state.projects[0].repoRefs).toHaveLength(1);
  });
});

describe('migrateTask tags', () => {
  const legacy = { id: 't1', title: 'Legacy', listId: 'inbox', completed: false };

  it('defaults missing tags to an empty array', () => {
    expect(migrateTask(legacy)?.tags).toEqual([]);
  });

  it('preserves valid string tags', () => {
    const task = migrateTask({ ...legacy, tags: ['work', 'urgent'] });
    expect(task?.tags).toEqual(['work', 'urgent']);
  });

  it('normalizes whitespace and drops invalid tag entries', () => {
    const task = migrateTask({
      ...legacy,
      tags: [' work ', '', '  ', 42, null, 'home']
    });
    expect(task?.tags).toEqual(['work', 'home']);
  });

  it('is idempotent when migration runs repeatedly', () => {
    const once = migrateTask(legacy);
    const twice = migrateTask(once);
    expect(twice?.tags).toEqual([]);
    expect(twice).toEqual(once);
  });

  it('feeds taskIndex tag iteration without throwing', () => {
    const tasks = [migrateTask(legacy), migrateTask({ ...legacy, id: 't2', tags: ['a'] })].filter(Boolean);
    const index = buildTaskIndex(tasks);
    expect(index.tagSet).toEqual(new Set(['a']));
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

describe('mergeProjectsByUpdatedAt', () => {
  const base = (id, updatedAt, title = 'Project') =>
    migrateProject({ id, title, updatedAt, status: 'active' });

  it('keeps the newer project version by updatedAt', () => {
    const local = [base('p1', 100, 'old')];
    const incoming = [base('p1', 200, 'new')];
    expect(mergeProjectsByUpdatedAt(local, incoming)[0].title).toBe('new');
  });

  it('does not overwrite a newer local project with stale remote data', () => {
    const local = [base('p1', 300, 'local')];
    const incoming = [base('p1', 100, 'remote')];
    expect(mergeProjectsByUpdatedAt(local, incoming)[0].title).toBe('local');
  });

  it('propagates project tombstones', () => {
    const local = [base('p1', 100, 'alive')];
    const incoming = [{ ...base('p1', 200, 'alive'), deletedAt: 200 }];
    expect(mergeProjectsByUpdatedAt(local, incoming)[0].deletedAt).toBe(200);
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

  it('migrate drops expired project tombstones but keeps fresh ones', () => {
    const now = Date.now();
    const state = migrate({
      projects: [
        { id: 'a', title: 'A', deletedAt: now - 1000 },
        { id: 'b', title: 'B', deletedAt: now - TOMBSTONE_TTL_MS - 1000 }
      ]
    });
    expect(state.projects.map((p) => p.id)).toEqual(['a']);
  });

  it('migrate restores inbox if it was tombstoned', () => {
    const state = migrate({
      lists: [{ id: 'inbox', title: 'inbox', deletedAt: Date.now() }]
    });
    const inbox = state.lists.find((l) => l.id === 'inbox');
    expect(inbox.deletedAt).toBeNull();
  });
});
