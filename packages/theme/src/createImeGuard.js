/** @typedef {(value: string) => void} ImeCommitHandler */

/**
 * Cross-browser IME composition guard for search inputs and Enter-to-submit.
 *
 * Priority: self-maintained flag → KeyboardEvent.isComposing → keyCode 229 (deprecated fallback).
 * compositionend delays clearing the flag until the next event loop so Safari Enter-to-confirm
 * IME does not fall through to submit handlers.
 */
export function createImeGuard() {
  let composing = false
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let clearTimer

  function compositionstart() {
    if (clearTimer !== undefined) {
      clearTimeout(clearTimer)
      clearTimer = undefined
    }
    composing = true
  }

  function compositioncancel() {
    if (clearTimer !== undefined) {
      clearTimeout(clearTimer)
      clearTimer = undefined
    }
    composing = false
  }

  /**
   * @param {CompositionEvent} event
   * @param {ImeCommitHandler} [onCommit]
   */
  function compositionend(event, onCommit) {
    const target = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (
      event.target
    )
    const value = target?.value ?? ''

    onCommit?.(value)

    clearTimer = setTimeout(() => {
      composing = false
      clearTimer = undefined
    }, 0)
  }

  /** @param {KeyboardEvent | InputEvent} [event] */
  function isComposing(event) {
    const keyboardEvent = /** @type {KeyboardEvent | undefined} */ (event)
    return Boolean(
      composing || event?.isComposing || keyboardEvent?.keyCode === 229,
    )
  }

  return {
    compositionstart,
    compositioncancel,
    compositionend,
    isComposing,
  }
}
