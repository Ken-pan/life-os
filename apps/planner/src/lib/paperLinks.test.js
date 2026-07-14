import { describe, expect, it } from 'vitest';
import {
  normalizePaperLink,
  normalizePaperLinks,
  paperLinksForTask,
  serializePaperTask,
  taskHasPaperLink,
  upsertPaperLink,
} from './paperLinks.js';

const action = {
  noteId: 'note-20260714',
  pageId: 'page-stable-a',
  pageIndex: 3,
  noteTitle: 'Launch notes',
};

describe('PaperOS page links', () => {
  it('rejects partial links that cannot open an exact page', () => {
    expect(normalizePaperLink({ ...action, pageId: '' }, { deviceId: 'move-1' })).toBeNull();
    expect(normalizePaperLink({ ...action, pageIndex: 0 }, { deviceId: 'move-1' })).toBeNull();
  });

  it('uses stable page identity while retaining the current page index', () => {
    expect(normalizePaperLink(action, { deviceId: 'move-1', linkedAt: 42 })).toEqual({
      id: 'move-1:note-20260714:page-stable-a',
      deviceId: 'move-1', noteId: 'note-20260714', pageId: 'page-stable-a',
      pageIndex: 3, noteTitle: 'Launch notes', linkedAt: 42,
    });
  });

  it('upserts one page without losing existing task metadata or links', () => {
    const task = {
      id: 'task-1',
      meta: { kind: 'focus', paperLinks: [{ ...action, deviceId: 'move-1', linkedAt: 10 }] },
    };
    const updated = upsertPaperLink(task, { ...action, pageIndex: 5 }, 'move-1', 99);
    expect(updated.meta.kind).toBe('focus');
    expect(updated.meta.paperLinks).toHaveLength(1);
    expect(updated.meta.paperLinks[0]).toMatchObject({ pageId: 'page-stable-a', pageIndex: 5 });
    expect(taskHasPaperLink(updated, action, 'move-1')).toBe(false);
    expect(taskHasPaperLink(updated, { ...action, pageIndex: 5 }, 'move-1')).toBe(true);
  });

  it('deduplicates malformed legacy arrays and exposes links in device tasks', () => {
    const links = normalizePaperLinks([
      { ...action, deviceId: 'move-1', linkedAt: 10 },
      { ...action, deviceId: 'move-1', pageIndex: 4, linkedAt: 11 },
      { noteId: 'broken' },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0].pageIndex).toBe(4);
    const task = { id: 'task-1', title: 'Ship', meta: { paperLinks: links }, updatedAt: 12 };
    expect(paperLinksForTask(task)).toHaveLength(1);
    expect(serializePaperTask(task).paperLinks[0].noteTitle).toBe('Launch notes');
  });
});
