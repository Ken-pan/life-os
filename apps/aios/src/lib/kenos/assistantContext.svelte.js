/**
 * Soft Context Assistant scope (Work hub → Assistant) without Focus writes.
 * Cleared on logout / when leaving intentionally.
 */
export const ASSISTANT_CTX = $state({
  /** @type {{ space: string, title?: string } | null} */
  work: null,
})

/**
 * @param {{ title?: string } | null | undefined} work
 */
export function enterWorkAssistantContext(work = null) {
  const title = String(work?.title || '').trim()
  ASSISTANT_CTX.work = { space: 'Work', title: title || undefined }
}

export function clearAssistantContext() {
  ASSISTANT_CTX.work = null
}
