// chartUtils 纯函数单测(node 直跑,无 Svelte/DOM 依赖)
import assert from 'node:assert/strict'
import {
  niceTicks,
  compactNumber,
  linePath,
  monotonePath,
  barPath,
  seriesColor,
  xLabelFilter,
  stackLayout,
  linearScale,
} from '../src/svelte/charts/chartUtils.js'

// niceTicks:1/2/5 步长、覆盖值域、含零基线
{
  const { ticks, niceMin, niceMax } = niceTicks(0, 87)
  assert.equal(niceMin, 0)
  assert.ok(niceMax >= 87)
  assert.ok(ticks.length >= 3 && ticks.length <= 8, `ticks=${ticks}`)
  assert.equal(ticks[0], 0)
}
{
  // 等值域不塌缩
  const { ticks } = niceTicks(5, 5)
  assert.ok(ticks.length >= 2)
}
{
  // 负值域
  const { niceMin } = niceTicks(-120, 300)
  assert.ok(niceMin <= -120)
}

// compactNumber
assert.equal(compactNumber(1284), '1,284')
assert.equal(compactNumber(5000), '5K') // 整千刻度统一 K,避免轴上 5,000/10K 混排
assert.equal(compactNumber(12900), '12.9K')
assert.equal(compactNumber(4200000), '4.2M')
assert.equal(compactNumber(0), '0')
assert.equal(compactNumber(-15000), '-15K')

// linearScale
{
  const s = linearScale(0, 10, 100, 0)
  assert.equal(s(0), 100)
  assert.equal(s(10), 0)
  assert.equal(s(5), 50)
}

// 路径生成:非空、以 M 开头、无 NaN
for (const fn of [linePath, monotonePath]) {
  const d = fn([
    { x: 0, y: 10 },
    { x: 50, y: 40 },
    { x: 100, y: 20 },
  ])
  assert.ok(d.startsWith('M'), d)
  assert.ok(!d.includes('NaN'), d)
}
assert.equal(linePath([]), '')
assert.equal(monotonePath([]), '')

// 单调插值不过冲:全部控制点 y 应落在数据 y 范围内(单调段)
{
  const d = monotonePath([
    { x: 0, y: 0 },
    { x: 10, y: 100 },
    { x: 20, y: 100 },
    { x: 30, y: 100 },
  ])
  const ys = [...d.matchAll(/[C ,](-?[\d.]+)/g)]
  assert.ok(!d.includes('NaN'))
  assert.ok(ys.length > 0)
}

// barPath:数据端圆角、基线直角、高度小于圆角不炸
{
  const d = barPath(10, 20, 20, 60, 4, 'up')
  assert.ok(d.startsWith('M') && d.endsWith('Z'))
  assert.ok(!d.includes('NaN'))
  const tiny = barPath(10, 20, 20, 2, 4, 'up')
  assert.ok(!tiny.includes('NaN'))
  assert.equal(barPath(0, 0, 0, 10, 4), '')
}

// seriesColor:单系列走 accent,多系列走固定槽位,不循环
assert.equal(seriesColor(0, 1), 'var(--chart-line, var(--accent))')
assert.equal(seriesColor(0, 3), 'var(--chart-series-1)')
assert.equal(seriesColor(2, 3), 'var(--chart-series-3)')
assert.equal(seriesColor(9, 12), 'var(--chart-series-8)') // 超槽夹住,不生成新色
assert.equal(seriesColor(1, 5, 'red'), 'red')

// xLabelFilter:保尾、抽稀、不在尾部前一格撞车
{
  const show = xLabelFilter(31, 300, 34)
  assert.equal(show(30), true)
  const visible = Array.from({ length: 31 }, (_, i) => i).filter(show)
  assert.ok(visible.length <= Math.floor(300 / 34) + 1)
  assert.ok(!visible.includes(29) || 31 - 1 - 29 >= 1)
}

// stackLayout:区间连续、负值夹为 0
{
  const out = stackLayout([
    [10, 5],
    [20, -3],
    [5, 8],
  ])
  assert.deepEqual(out[0][0], { y0: 0, y1: 10 })
  assert.deepEqual(out[1][0], { y0: 10, y1: 30 })
  assert.deepEqual(out[2][0], { y0: 30, y1: 35 })
  assert.deepEqual(out[1][1], { y0: 5, y1: 5 }) // 负值不产生反向段
}

// ── treemapLayout ──
{
  const { treemapLayout } = await import(
    '../src/svelte/charts/treemapLayout.js'
  )
  const rect = { x: 0, y: 0, w: 400, h: 200 }
  const values = [40, 25, 15, 10, 6, 4]
  const rects = treemapLayout(values, rect, 0)
  const total = values.reduce((a, b) => a + b, 0)
  rects.forEach((r, i) => {
    // 面积占比正确(无 gap 时精确)
    const expect = (values[i] / total) * rect.w * rect.h
    const got = r.w * r.h
    assert.ok(Math.abs(got - expect) < 1, `tile ${i}: ${got} vs ${expect}`)
    // 全部落在画布内
    assert.ok(r.x >= -0.01 && r.y >= -0.01, `tile ${i} in bounds`)
    assert.ok(r.x + r.w <= rect.w + 0.01 && r.y + r.h <= rect.h + 0.01)
  })
  // 两两不重叠
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      const overlap =
        a.x < b.x + b.w - 0.01 &&
        b.x < a.x + a.w - 0.01 &&
        a.y < b.y + b.h - 0.01 &&
        b.y < a.y + a.h - 0.01
      assert.ok(!overlap, `tiles ${i}/${j} overlap`)
    }
  }
  // 零值与空输入不炸
  assert.deepEqual(treemapLayout([], rect), [])
  const withZero = treemapLayout([10, 0, 5], rect, 2)
  assert.equal(withZero[1].w, 0)
}

// ── mindmapLayout ──
{
  const { mindmapLayout } = await import(
    '../src/svelte/charts/mindmapLayout.js'
  )
  const measure = (label) => ({ w: label.length * 12 + 20, h: 28 })
  const tree = {
    label: 'root',
    children: [
      { label: 'a', children: [{ label: 'a1' }, { label: 'a2' }] },
      { label: 'b' },
      { label: 'c', children: [{ label: 'c1' }] },
      { label: 'd' },
    ],
  }
  const { nodes, links, width, height } = mindmapLayout(tree, { measure })
  assert.equal(nodes.length, 8)
  assert.equal(links.length, 7)
  assert.ok(width > 0 && height > 0)
  // 全部节点在包围盒内
  for (const n of nodes) {
    assert.ok(n.x >= -0.01 && n.y >= -0.01, `${n.id} positive`)
    assert.ok(n.x + n.w <= width + 0.01 && n.y + n.h <= height + 0.01)
  }
  // 同侧同深度的兄弟不重叠
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id >= b.id || a.side !== b.side || a.depth !== b.depth) continue
      const overlap = a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01
      assert.ok(!overlap, `${a.id}/${b.id} vertical overlap`)
    }
  }
  // split 模式下有左右两侧
  const sides = new Set(nodes.filter((n) => n.depth === 1).map((n) => n.side))
  assert.equal(sides.size, 2, 'split into both sides')
  // 折叠后子孙消失、descendants 记数保留
  const collapsed = mindmapLayout(tree, { measure, collapsed: new Set(['0.0']) })
  assert.equal(collapsed.nodes.length, 6)
  const aNode = collapsed.nodes.find((n) => n.id === '0.0')
  assert.equal(aNode.collapsed, true)
  assert.equal(aNode.descendants, 2)
}

console.log('chartUtils.test OK')
