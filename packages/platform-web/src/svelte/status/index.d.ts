import type { Component, Snippet } from 'svelte'

export interface EmptyStateProps {
  /** Icon-registry name; ignored when `media` is provided. */
  icon?: string
  iconSize?: number
  title?: string
  description?: string
  /** Critical tint on the icon (used by ErrorState). */
  error?: boolean
  /** Custom leading visual (inline SVG / illustration); replaces `icon`. */
  media?: Snippet
  children?: Snippet
  /** Rendered inside a centered `.empty-actions` row. */
  actions?: Snippet
}

export interface ErrorStateProps extends Omit<EmptyStateProps, 'error'> {
  /** Convenience retry button (btn-secondary) when no `actions` snippet given. */
  retryLabel?: string
  onRetry?: () => void
}

export declare const EmptyState: Component<EmptyStateProps>
export declare const ErrorState: Component<ErrorStateProps>
