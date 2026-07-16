// Life OS charts — 纯函数工具层(比例尺/刻度/路径),无 DOM 依赖,可单测。

/** 四舍五入到 0.5px,压缩 path 字符串体积 */
export function px(n) {
  return Math.round(n * 2) / 2
}

/**
 * 线性比例尺
 * @param {number} d0 @param {number} d1 @param {number} r0 @param {number} r1
 * @returns {(v: number) => number}
 */
export function linearScale(d0, d1, r0, r1) {
  const span = d1 - d0 || 1
  return (v) => r0 + ((v - d0) / span) * (r1 - r0)
}

/**
 * "好看"的轴刻度:1/2/5 步长,覆盖 [min, max]。
 * @param {number} min @param {number} max @param {number} [count]
 * @returns {{ ticks: number[], niceMin: number, niceMax: number }}
 */
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { ticks: [0, 1], niceMin: 0, niceMax: 1 }
  }
  if (min === max) {
    if (min === 0) return { ticks: [0, 1], niceMin: 0, niceMax: 1 }
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  const span = max - min
  const step0 = span / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(step0))
  const norm = step0 / mag
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks = []
  // 用整数步进避免 0.1+0.2 式漂移
  const n = Math.round((niceMax - niceMin) / step)
  for (let i = 0; i <= n; i++) ticks.push(niceMin + i * step)
  return { ticks, niceMin, niceMax }
}

/**
 * 数值紧凑显示:1,284 / 12.9K / 4.2M。图表轴与直接标注共用。
 * @param {number} v
 */
export function compactNumber(v) {
  if (!Number.isFinite(v)) return ''
  const abs = Math.abs(v)
  if (abs >= 1e9) return trimZero(v / 1e9) + 'B'
  if (abs >= 1e6) return trimZero(v / 1e6) + 'M'
  if (abs >= 1e4) return trimZero(v / 1e3) + 'K'
  // 整千也走 K:轴刻度(0/5,000/10,000)会与 10K 混排,统一成 5K/10K
  if (abs >= 1e3 && v % 500 === 0) return trimZero(v / 1e3) + 'K'
  if (Number.isInteger(v)) return v.toLocaleString('en-US')
  return String(Math.round(v * 100) / 100)
}

function trimZero(n) {
  const s = (Math.round(n * 10) / 10).toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/**
 * 折线 path(直线段)。points: [{x,y}],已过滤 null。
 */
export function linePath(points) {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x)},${px(p.y)}`)
    .join('')
}

/**
 * 单调三次插值(Fritsch–Carlson)——平滑但不过冲,金额曲线不会凹出负值。
 * @param {{x:number,y:number}[]} points
 */
export function monotonePath(points) {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M${px(points[0].x)},${px(points[0].y)}`
  if (n === 2) return linePath(points)
  const dx = []
  const m = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x || 1e-6
    m[i] = (points[i + 1].y - points[i].y) / dx[i]
  }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  }
  t[n - 1] = m[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const s = a * a + b * b
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      t[i] = tau * a * m[i]
      t[i + 1] = tau * b * m[i]
    }
  }
  let d = `M${px(points[0].x)},${px(points[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${px(points[i].x + h)},${px(points[i].y + t[i] * h)} ${px(points[i + 1].x - h)},${px(points[i + 1].y - t[i + 1] * h)} ${px(points[i + 1].x)},${px(points[i + 1].y)}`
  }
  return d
}

/**
 * 柱条 path:数据端 4px 圆角、基线端直角(dataviz 规范)。
 * @param {number} x 左 @param {number} y 上 @param {number} w @param {number} h
 * @param {number} r 圆角 @param {'up'|'down'|'left'|'right'} dataEnd 数据端方向
 */
export function barPath(x, y, w, h, r, dataEnd = 'up') {
  if (w <= 0 || h <= 0) return ''
  const rr = Math.min(r, dataEnd === 'up' || dataEnd === 'down' ? w / 2 : h / 2, dataEnd === 'up' || dataEnd === 'down' ? h : w)
  const R = px(rr)
  const [X, Y, W, H] = [px(x), px(y), px(w), px(h)]
  if (R <= 0) return `M${X},${Y}h${W}v${H}h${-W}Z`
  switch (dataEnd) {
    case 'up':
      return `M${X},${Y + H}V${Y + R}q0,${-R} ${R},${-R}h${W - 2 * R}q${R},0 ${R},${R}V${Y + H}Z`
    case 'down':
      return `M${X},${Y}h${W}v${H - R}q0,${R} ${-R},${R}h${-(W - 2 * R)}q${-R},0 ${-R},${-R}Z`
    case 'right':
      return `M${X},${Y}h${W - R}q${R},0 ${R},${R}v${H - 2 * R}q0,${R} ${-R},${R}h${-(W - R)}Z`
    case 'left':
      return `M${X + W},${Y}v${H}h${-(W - R)}q${-R},0 ${-R},${-R}v${-(H - 2 * R)}q0,${-R} ${R},${-R}Z`
    default:
      return `M${X},${Y}h${W}v${H}h${-W}Z`
  }
}

/**
 * 环图弧 path(含 2px 表面间隙的 padAngle 由调用方换算)。
 * 角度从 12 点钟方向顺时针,单位弧度。
 */
export function donutArcPath(cx, cy, rOuter, rInner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const p = (r, a) => `${px(cx + r * Math.sin(a))},${px(cy - r * Math.cos(a))}`
  return (
    `M${p(rOuter, a0)}` +
    `A${px(rOuter)},${px(rOuter)} 0 ${large} 1 ${p(rOuter, a1)}` +
    `L${p(rInner, a1)}` +
    `A${px(rInner)},${px(rInner)} 0 ${large} 0 ${p(rInner, a0)}Z`
  )
}

/**
 * 系列颜色:单系列走品牌 accent(--chart-line),多系列走验证过的
 * categorical 槽位(--chart-series-1..8),固定顺序、永不循环。
 * @param {number} index @param {number} total @param {string} [override]
 */
export function seriesColor(index, total, override) {
  if (override) return override
  if (total <= 1) return 'var(--chart-line, var(--accent))'
  return `var(--chart-series-${Math.min(index, 7) + 1})`
}

/** 图表能画的系列上限——超出应折叠为"其他",不生成新色相 */
export const MAX_SERIES = 8

/**
 * X 轴标签抽稀:按可用宽度预算,保尾(最后一个刻度带"截至"含义)。
 * @param {number} count 标签总数 @param {number} innerW 可用像素宽
 * @param {number} [labelW] 单个标签预算宽
 * @returns {(i: number) => boolean}
 */
export function xLabelFilter(count, innerW, labelW = 44) {
  const maxLabels = Math.max(2, Math.floor(innerW / labelW))
  const every = Math.max(1, Math.ceil(count / maxLabels))
  return (i) => {
    if (i === count - 1) return true
    return i % every === 0 && count - 1 - i >= every
  }
}

/**
 * 时间轴月刻度:返回落在 [start, end] 内的每月 1 号(本地时区),
 * 按可用宽度抽稀(每个标签预算 labelW 像素),始终保留首尾覆盖感。
 * @param {number} start ms @param {number} end ms
 * @param {number} innerW 可用像素宽 @param {number} [labelW]
 * @returns {{ at: number, label: string }[]}
 */
export function monthTicks(start, end, innerW, labelW = 56) {
  if (!(end > start)) return []
  const ticks = []
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  if (d.getTime() < start) d.setMonth(d.getMonth() + 1)
  while (d.getTime() <= end) {
    ticks.push({
      at: d.getTime(),
      label:
        d.getMonth() === 0
          ? `${d.getFullYear()}/1`
          : `${d.getMonth() + 1}月`,
    })
    d.setMonth(d.getMonth() + 1)
  }
  // 短域(不足两个月边界)回退为周刻度(每周一,M/D),否则轴上没有参照
  if (ticks.length < 2 && end - start < 90 * 86400000) {
    const w = new Date(start)
    w.setHours(0, 0, 0, 0)
    w.setDate(w.getDate() + ((8 - w.getDay()) % 7 || 7))
    const weekly = []
    while (w.getTime() <= end) {
      weekly.push({
        at: w.getTime(),
        label: `${w.getMonth() + 1}/${w.getDate()}`,
      })
      w.setDate(w.getDate() + 7)
    }
    if (weekly.length >= 2) {
      const maxW = Math.max(2, Math.floor(innerW / labelW))
      const everyW = Math.ceil(weekly.length / maxW)
      return weekly.filter((_, i) => i % everyW === 0)
    }
    return ticks
  }
  const maxLabels = Math.max(2, Math.floor(innerW / labelW))
  if (ticks.length <= maxLabels) return ticks
  const every = Math.ceil(ticks.length / maxLabels)
  return ticks.filter((_, i) => i % every === 0)
}

/**
 * 堆叠布局:每个 label 位置把各系列值(≥0)叠成 [y0, y1) 区间。
 * @param {number[][]} rows rows[seriesIdx][labelIdx]
 * @returns {{ y0: number, y1: number }[][]} [seriesIdx][labelIdx]
 */
export function stackLayout(rows) {
  const nLabels = rows[0]?.length ?? 0
  const out = rows.map(() => new Array(nLabels))
  for (let j = 0; j < nLabels; j++) {
    let acc = 0
    for (let s = 0; s < rows.length; s++) {
      const v = Math.max(0, rows[s][j] ?? 0)
      out[s][j] = { y0: acc, y1: acc + v }
      acc += v
    }
  }
  return out
}
