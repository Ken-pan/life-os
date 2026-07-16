// Life OS charts — 通用数据图表族。
// 色彩规则:单系列 = 品牌 accent(--chart-line);多系列 = 固定槽位
// categorical 色板(--chart-series-1..8,已过 CVD 六项验证,禁止循环)。
export { default as LineChart } from './LineChart.svelte'
export { default as BarChart } from './BarChart.svelte'
export { default as DonutChart } from './DonutChart.svelte'
export { default as Sparkline } from './Sparkline.svelte'
export { default as Heatmap } from './Heatmap.svelte'
export { default as Treemap } from './Treemap.svelte'
export { default as MindMap } from './MindMap.svelte'
export { default as TimelineChart } from './TimelineChart.svelte'
export { default as ChartLegend } from './ChartLegend.svelte'
export {
  compactNumber,
  niceTicks,
  seriesColor,
  MAX_SERIES,
} from './chartUtils.js'
