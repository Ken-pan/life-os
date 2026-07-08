import { createI18n } from '@life-os/platform-web';
import { S, updateSettings } from '$lib/state.svelte.js';
import { messages } from './messages/index.js';

export const { resolveLocale, localeTag, t, applyLocale, setLocale } =
  createI18n({
    messages,
    getLocale: () => S.settings.locale,
    persistLocale: (locale) => updateSettings({ locale }),
  });

/** @param {import('$lib/types.js').TaskList} list */
export function listLabel(list) {
  if (!list) return '';
  if (list.system === 'inbox') return t('nav.inbox');
  const label = String(list.title || list.name || '').trim();
  return label || t('nav.lists');
}
