import type { Component } from 'svelte'
import type { Snippet } from 'svelte'

export interface LifeOsTabsProps {
  items: Array<{ id: string; label: string }>
  activeId: string
  onChange: (id: string) => void
  ariaLabel: string
  class?: string
  tablistWrapperClass?: string
  /** Passed to .life-os-scroll-fade as --life-os-scroll-fade-bg. */
  scrollFadeBg?: string
  children?: Snippet
}

export interface LifeOsTabPanelProps {
  tabId: string
  active: boolean
  class?: string
  children?: Snippet
}

export declare const LifeOsTabs: Component<LifeOsTabsProps>
export declare const LifeOsTabPanel: Component<LifeOsTabPanelProps>
