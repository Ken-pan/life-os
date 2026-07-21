/**
 * Page-owned Library note editor session for Kenos leave-guard / nav manifest.
 * NoteEditor binds while a note is open; adapter probes without importing Svelte.
 */

/** @typedef {{
 *   isDirty: () => boolean,
 *   title: () => string,
 *   flush: () => void,
 *   discard: () => void,
 *   cleanupIfBlank?: () => void,
 * }} LibraryEditorSession */

/** @type {LibraryEditorSession | null} */
let session = null

/** @param {LibraryEditorSession | null} next */
export function setLibraryEditorSession(next) {
  session = next
}

/** @param {LibraryEditorSession | null} [expected] */
export function clearLibraryEditorSession(expected = null) {
  if (expected == null || session === expected) session = null
}

export function getLibraryEditorSession() {
  return session
}

/** @returns {{ dirty: boolean, summary: string }} */
export function probeLibraryEditor() {
  if (!session) return { dirty: false, summary: '' }
  let dirty = false
  try {
    dirty = Boolean(session.isDirty())
  } catch {
    dirty = false
  }
  let title = ''
  try {
    title = String(session.title?.() || '').trim()
  } catch {
    title = ''
  }
  return {
    dirty,
    summary: dirty ? title || 'Unsaved note' : '',
  }
}

export function flushLibraryEditor() {
  try {
    session?.flush?.()
  } catch {
    /* ignore */
  }
}

export function discardLibraryEditor() {
  try {
    session?.discard?.()
  } catch {
    /* ignore */
  }
}
