import type { Component, Snippet } from 'svelte'

export type LifeOsNavigationProjection = 'desktop' | 'mobile'
export type LifeOsScrollMode = 'content' | 'document' | 'locked'
export type LifeOsFocusOnNavigate = 'main' | 'preserve'

export interface LifeOsAppShellProps {
  header?: Snippet
  navigation?: Snippet<[LifeOsNavigationProjection]>
  main?: Snippet
  children?: Snippet
  persistentOverlay?: Snippet
  transientOverlay?: Snippet
  scrollMode?: LifeOsScrollMode
  navigationKey?: string
  focusOnNavigate?: LifeOsFocusOnNavigate
  mainId?: string
  mainLabel?: string
  mainClass?: string
  /** App-owned public classes forwarded to the shell root (e.g. `music-app`). */
  shellClass?: string
  /**
   * App-owned root state exposed as `data-*` attributes on the shell root
   * (keys with or without the `data-` prefix; `undefined` values are omitted).
   * For CSS state selectors only — never for shell behavior.
   */
  shellDataset?: Record<string, string | undefined>
  skipLinkLabel?: string
  testIdPrefix?: string
}

declare const LifeOsAppShell: Component<LifeOsAppShellProps>

export default LifeOsAppShell
export { LifeOsAppShell }
