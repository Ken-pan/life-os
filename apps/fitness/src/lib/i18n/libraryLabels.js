import { S } from '../state.svelte.js';
import { resolveLocale } from './index.js';
import libraryEn from './messages/library-en.js';
import libraryBodyEn from './messages/library-body-en.js';

/** @param {import('../data/library.js').LibraryEntry | null | undefined} entry */
export function localizeLibraryEntry(entry) {
  if (!entry || resolveLocale(S.settings.locale) === 'zh') return entry;
  const meta = libraryEn[entry.id];
  const body = libraryBodyEn[entry.id];
  if (!meta && !body) return entry;
  return {
    ...entry,
    title: meta?.title ?? entry.title,
    tag: meta?.tag ?? entry.tag,
    cite: body?.cite ?? meta?.cite ?? entry.cite,
    html: body?.html ?? entry.html,
    table: body?.table ?? entry.table,
    rules: body?.rules ?? entry.rules
  };
}

/** @param {string} id */
export function libraryEntryTitle(id) {
  const en = libraryEn[id];
  if (resolveLocale(S.settings.locale) === 'zh' || !en?.title) return null;
  return en.title;
}
