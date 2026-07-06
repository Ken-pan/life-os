import { S, save, uid } from '../state.svelte.js';
import { SYSTEM_LIST_INBOX } from '../types.js';

/** @param {{ title: string, icon?: string, color?: string }} input */
export function createList(input) {
  const maxOrder = S.lists.reduce((m, l) => Math.max(m, l.sortOrder), 0);
  const now = Date.now();
  const list = {
    id: uid(),
    title: input.title.trim(),
    icon: input.icon || 'list',
    color: input.color || '#F5A623',
    sortOrder: maxOrder + 1,
    updatedAt: now,
    deletedAt: null
  };
  S.lists = [...S.lists, list];
  save();
  return list;
}

/** @param {string} id @param {Partial<import('../types.js').TaskList>} patch */
export function updateList(id, patch) {
  S.lists = S.lists.map((l) =>
    l.id === id ? { ...l, ...patch, id: l.id, updatedAt: Date.now() } : l
  );
  save();
}

/**
 * 删除清单：清单写墓碑，其下任务迁回收件箱并打上新 updatedAt（跨设备可传播）。
 * @param {string} id
 */
export function deleteList(id) {
  if (id === SYSTEM_LIST_INBOX) return false;
  const list = S.lists.find((l) => l.id === id && !l.deletedAt);
  if (!list || list.system) return false;
  const now = Date.now();
  S.tasks = S.tasks.map((t) =>
    t.listId === id ? { ...t, listId: SYSTEM_LIST_INBOX, updatedAt: now } : t
  );
  S.lists = S.lists.map((l) => (l.id === id ? { ...l, deletedAt: now, updatedAt: now } : l));
  save();
  return true;
}

export function inboxList() {
  return S.lists.find((l) => l.id === SYSTEM_LIST_INBOX && !l.deletedAt);
}

export function sortedLists() {
  return S.lists.filter((l) => !l.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function listTitle(list) {
  if (!list) return '';
  if (list.system === 'inbox') return list.title;
  return list.title;
}
