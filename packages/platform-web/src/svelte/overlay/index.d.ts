import type { Component, Snippet } from 'svelte'

export interface LifeOsSheetProps {
  open?: boolean
  /** Rendered as the default `.sheet-title`; omit and use `header` for custom markup. */
  title?: string
  onClose?: () => void
  /** Click on the `.sheet-bg` backdrop closes the sheet (default true). */
  closeOnBackdrop?: boolean
  /** Activate the shared focus trap while open (default true). */
  manageFocus?: boolean
  /** Lock background scroll while open (default true; catalog previews pass false). */
  lockBackgroundScroll?: boolean
  /** Show the `.sheet-handle` grab affordance (default true). */
  showHandle?: boolean
  /** Accessible name when there is no visible title. */
  ariaLabel?: string
  /** App-owned classes forwarded to the `.sheet` element. */
  sheetClass?: string
  /** App-owned classes forwarded to the `.sheet-bg` backdrop. */
  bgClass?: string
  /** Optional inline style on `.sheet` (e.g. anchored desktop panel). */
  sheetStyle?: string
  /** `bottom` = theme default; `auto` = host may restyle via data-placement. */
  placement?: 'bottom' | 'auto'
  /** Replaces the default title block entirely. */
  header?: Snippet
  children?: Snippet
  /** Rendered inside a `.sheet-actions` row. */
  actions?: Snippet
}

export interface LifeOsDialogProps {
  open?: boolean
  title?: string
  /** Rendered as `.modal-sub` under the title. */
  subtitle?: string
  onClose?: () => void
  closeOnBackdrop?: boolean
  manageFocus?: boolean
  /** Lock background scroll while open (default true; catalog previews pass false). */
  lockBackgroundScroll?: boolean
  /** Use role="alertdialog" for destructive confirmations. */
  destructive?: boolean
  ariaLabel?: string
  /** App-owned classes forwarded to the `.modal` element. */
  dialogClass?: string
  /** Replaces the default title/subtitle block entirely. */
  header?: Snippet
  children?: Snippet
  /** Rendered inside a `.modal-actions` row. */
  actions?: Snippet
}

export declare const LifeOsSheet: Component<LifeOsSheetProps>
export declare const LifeOsDialog: Component<LifeOsDialogProps>

/** RAF-gated `.show` for `.kenos-sheet-motion` (custom sheets that are not LifeOsSheet). */
export declare function useSheetEnterShown(isOpen: () => boolean): {
  readonly shown: boolean
}
