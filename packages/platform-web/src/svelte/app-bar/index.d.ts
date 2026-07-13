import type { Component, Snippet } from 'svelte'

export interface LifeOsAppBarProps {
  /** Leading content when there is no back affordance (typically the app brand). */
  leading?: Snippet
  /** Replaces the default `.appbar-titles` block entirely (snippet owns its wrapper markup). */
  titles?: Snippet
  /** Rendered inside the always-present `.appbar-trailing` container. */
  trailing?: Snippet
  title?: string
  subtitle?: string
  /** Renders the default back link in the leading region. */
  backHref?: string
  backLabel?: string
  /** Renders a back button instead of a link (e.g. `() => history.back()`); wins over `backHref`. */
  onBack?: () => void
  hidden?: boolean
  /** App-owned public classes forwarded to the `header.appbar` root (e.g. `music-appbar appbar--tools`). */
  barClass?: string
}

declare const LifeOsAppBar: Component<LifeOsAppBarProps>

export default LifeOsAppBar
export { LifeOsAppBar }
