import type { Component, Snippet } from 'svelte'

export interface ExplainPanelProps {
  /** Toggle label shown when collapsed (e.g. "How is this calculated?"). */
  label: string
  /** Toggle label shown when expanded; falls back to `label`. */
  hideLabel?: string
  /** Bindable open state (default false). */
  open?: boolean
  /** App-owned classes forwarded to the toggle button. */
  class?: string
  /** The explanation content rendered inside the inline panel. */
  children: Snippet
}

declare const ExplainPanel: Component<ExplainPanelProps>

export default ExplainPanel
export { ExplainPanel }
