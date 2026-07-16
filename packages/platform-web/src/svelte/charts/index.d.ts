import type { Component } from 'svelte'

export interface ChartSeries {
  label: string
  values: (number | null)[]
  /** 覆写系列色(CSS 颜色或 var() 表达式);默认走固定槽位 */
  color?: string
}

export declare const LineChart: Component<{
  labels: string[]
  series: ChartSeries[]
  height?: number
  area?: boolean
  curve?: 'smooth' | 'linear'
  baseline?: 'zero' | 'auto'
  format?: (v: number) => string
  xFormat?: (label: string, index: number) => string
  endLabels?: boolean | 'auto'
  legend?: boolean | 'auto'
  ariaLabel?: string
}>

export declare const BarChart: Component<{
  labels: string[]
  series: ChartSeries[]
  stacked?: boolean
  horizontal?: boolean
  height?: number
  format?: (v: number) => string
  xFormat?: (label: string, index: number) => string
  showValues?: 'auto' | 'always' | 'never'
  legend?: boolean | 'auto'
  ariaLabel?: string
}>

export declare const DonutChart: Component<{
  items: { label: string; value: number; color?: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  format?: (v: number) => string
  otherLabel?: string
  ariaLabel?: string
}>

export declare const Sparkline: Component<{
  values: (number | null)[]
  width?: number
  height?: number
  area?: boolean
  curve?: 'smooth' | 'linear'
  color?: string
  endDot?: boolean
  ariaLabel?: string
}>

export declare const Heatmap: Component<{
  rows: string[]
  cols: string[]
  values: (number | null)[][]
  cellSize?: number
  format?: (v: number) => string
  colEvery?: number
  ariaLabel?: string
}>

export declare const Treemap: Component<{
  items: { label: string; value: number; color?: string; meta?: string }[]
  height?: number
  format?: (v: number) => string
  otherLabel?: string
  onSelect?: (item: { label: string; value: number }, index: number) => void
  ariaLabel?: string
}>

export interface MindMapNode {
  label: string
  children?: MindMapNode[]
}

export declare const MindMap: Component<{
  root: MindMapNode
  split?: boolean
  collapsible?: boolean
  defaultCollapsedDepth?: number
  onSelect?: (node: { id: string; label: string; depth: number }) => void
  ariaLabel?: string
}>

export declare const ChartLegend: Component<{
  items: { label: string; color: string; muted?: boolean }[]
  shape?: 'line' | 'rect'
  onHover?: (index: number | null) => void
}>

export declare function compactNumber(v: number): string
export declare function niceTicks(
  min: number,
  max: number,
  count?: number,
): { ticks: number[]; niceMin: number; niceMax: number }
export declare function seriesColor(
  index: number,
  total: number,
  override?: string,
): string
export declare const MAX_SERIES: number
