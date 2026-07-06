/** @typedef {{ lockPortraitOnPhone?: boolean }} PwaSettings */

/** @type {Required<PwaSettings>} */
export const DEFAULT_PWA_SETTINGS = {
  lockPortraitOnPhone: true,
}

/**
 * @param {unknown} raw
 * @returns {Required<PwaSettings>}
 */
export function normalizePwaSettings(raw) {
  const input =
    raw && typeof raw === 'object' ? /** @type {PwaSettings} */ (raw) : {}
  return {
    lockPortraitOnPhone: input.lockPortraitOnPhone !== false,
  }
}

/**
 * @param {Partial<PwaSettings> | null | undefined} local
 * @param {Partial<PwaSettings> | null | undefined} incoming
 * @returns {Required<PwaSettings>}
 */
export function mergePwaSettings(local, incoming) {
  return normalizePwaSettings({ ...local, ...incoming })
}
