/**
 * Process-scoped Kenos layout boot latch.
 * Native shell may remount the Svelte layout on Today↔Ask tab switches;
 * memory backfill / MCP seed must not re-run every time.
 */
let booted = false

/** @returns {boolean} true on the first call in this JS realm */
export function takeLayoutBoot() {
  if (booted) return false
  booted = true
  return true
}

/** @returns {boolean} */
export function hasLayoutBooted() {
  return booted
}

/** Test helper */
export function resetLayoutBootForTests() {
  booted = false
}
