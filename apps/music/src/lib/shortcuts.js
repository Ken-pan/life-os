import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { player, togglePlay } from './player.svelte.js';
import { openQueueDrawer, toggleUtilityPane } from './ui.svelte.js';
import { buildPrimaryNavItems } from './nav.js';
import { t } from './i18n/index.js';

/** @type {(() => void) | null} */
let cleanup = null;

/** @type {{ focusSearch?: () => void; searchInput?: HTMLInputElement | null }} */
const registry = {
  focusSearch: null,
  searchInput: null
};

/** @param {{ focusSearch?: () => void; searchInput?: HTMLInputElement | null }} handlers */
export function registerShortcutHandlers(handlers) {
  Object.assign(registry, handlers);
}

/** @param {(key: string) => string} tr */
export function bindGlobalShortcuts(tr = t) {
  if (!browser || cleanup) return () => {};

  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    const target = e.target;
    const inInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      registry.searchInput?.focus();
      registry.focusSearch?.();
      return;
    }

    if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (window.matchMedia('(min-width: 861px)').matches) toggleUtilityPane('queue');
      else openQueueDrawer();
      return;
    }

    if (mod && !e.shiftKey && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      const items = buildPrimaryNavItems(tr);
      const item = items[Number(e.key) - 1];
      if (item) goto(item.href);
      return;
    }

    if (inInput) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    }
  };

  window.addEventListener('keydown', onKey);
  cleanup = () => window.removeEventListener('keydown', onKey);
  return cleanup;
}

export function unbindGlobalShortcuts() {
  cleanup?.();
  cleanup = null;
}
