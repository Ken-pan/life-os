import { describe, it, expect } from 'vitest';
import { migrate, mergeTasksByUpdatedAt, migrateTask, SCHEMA_VERSION } from './migrate.js';

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
});
