import { S, save, uid } from '../state.svelte.js';
import { SYSTEM_LIST_INBOX } from '../types.js';

/** @param {{ title: string, icon?: string, color?: string }} input */
export function createList(input) {
  const maxOrder = S.lists.reduce((m, l) => Math.max(m, l.sortOrder), 0);
  const list = {
    id: uid(),
    title: input.title.trim(),
    icon: input.icon || 'list',
    color: input.color || '#F5A623',
    sortOrder: maxOrder + 1
  };
  S.lists = [...S.lists, list];
  save();
  return list;
}

/** @param {string} id @param {Partial<import('../types.js').TaskList>} patch */
export function updateList(id, patch) {
  S.lists = S.lists.map((l) => (l.id === id ? { ...l, ...patch } : l));
  save();
}

/** @param {string} id */
export function deleteList(id) {
  if (id === SYSTEM_LIST_INBOX) return false;
  const list = S.lists.find((l) => l.id === id);
  if (!list || list.system) return false;
  S.tasks = S.tasks.map((t) => (t.listId === id ? { ...t, listId: SYSTEM_LIST_INBOX } : t));
  S.lists = S.lists.filter((l) => l.id !== id);
  save();
  return true;
}

export function inboxList() {
  return S.lists.find((l) => l.id === SYSTEM_LIST_INBOX);
}

export function sortedLists() {
  return [...S.lists].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function listTitle(list) {
  if (!list) return '';
  if (list.system === 'inbox') return list.title;
  return list.title;
}
