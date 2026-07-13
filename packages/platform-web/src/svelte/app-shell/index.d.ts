import type { Component, Snippet } from 'svelte'

export type LifeOsNavigationProjection = 'desktop' | 'mobile'
export type LifeOsScrollMode = 'content' | 'document'
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
  skipLinkLabel?: string
  testIdPrefix?: string
}

declare const LifeOsAppShell: Component<LifeOsAppShellProps>

export default LifeOsAppShell
export { LifeOsAppShell }
