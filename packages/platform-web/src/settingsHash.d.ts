export function scrollToSettingsHash(
  hash?: string,
  opts?: {
    delayMs?: number
    retryMs?: number
    retries?: number
    behavior?: ScrollBehavior
    block?: ScrollLogicalPosition
  },
): () => void
