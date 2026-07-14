export interface KeepPopoverInViewportOptions {
  /** CSS selector for the popover within the trigger node (default '[data-popover]'). */
  selector?: string
  /** Min gap kept from each viewport edge, in px (default 8). */
  margin?: number
}

/**
 * Svelte action: keep a trigger's absolutely-positioned popover child within the
 * horizontal viewport (shifts it via inline `left` on hover/focus).
 */
export declare function keepPopoverInViewport(
  node: HTMLElement,
  options?: KeepPopoverInViewportOptions,
): { update(options: KeepPopoverInViewportOptions): void; destroy(): void } | void
