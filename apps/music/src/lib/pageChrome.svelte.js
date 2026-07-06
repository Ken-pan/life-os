/** @typedef {{ label: string, href?: string, onClick?: () => void, variant?: 'primary' | 'secondary' | 'ghost', icon?: string }} PageChromeAction */
/** @typedef {{ title?: string | null, subtitle?: string | null, backHref?: string | null, backLabel?: string | null, action?: PageChromeAction | null, actions?: PageChromeAction[] }} PageChromePatch */

const EMPTY = {
  title: null,
  subtitle: null,
  backHref: null,
  backLabel: null,
  action: null,
  actions: /** @type {PageChromeAction[]} */ ([])
};

export const pageChrome = $state({ ...EMPTY });

/** @param {PageChromePatch} patch */
export function setPageChrome(patch) {
  if (patch.title !== undefined) pageChrome.title = patch.title ?? null;
  if (patch.subtitle !== undefined) pageChrome.subtitle = patch.subtitle ?? null;
  if (patch.backHref !== undefined) pageChrome.backHref = patch.backHref ?? null;
  if (patch.backLabel !== undefined) pageChrome.backLabel = patch.backLabel ?? null;
  if (patch.action !== undefined) pageChrome.action = patch.action ?? null;
  if (patch.actions !== undefined) pageChrome.actions = patch.actions ?? [];
}

export function resetPageChrome() {
  Object.assign(pageChrome, EMPTY);
}

/** @returns {PageChromeAction[]} */
export function getPageActions() {
  const list = [...(pageChrome.actions || [])];
  if (pageChrome.action) list.unshift(pageChrome.action);
  return list;
}
