// Squarified treemap 布局(Bruls et al. 2000)——纯函数,无 DOM 依赖。
// 尽量把每块摆成接近 1:1 的方块,比 slice-and-dice 可读得多。

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 */

/**
 * 一行内的最差长宽比(越接近 1 越好)
 * @param {number[]} row 行内各块面积 @param {number} side 行铺设边长
 */
function worstRatio(row, side) {
  const sum = row.reduce((a, b) => a + b, 0)
  const max = Math.max(...row)
  const min = Math.min(...row)
  const s2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / s2, s2 / (side2 * min))
}

/**
 * squarified treemap:把 values 按面积占比铺进 rect。
 * 返回与输入同序的矩形数组;gap 为块间留白(表面色间隙,两侧各让 gap/2)。
 * 值 ≤0 的项返回零矩形(调用方应预先过滤,这里兜底)。
 * @param {number[]} values
 * @param {Rect} rect
 * @param {number} [gap]
 * @returns {Rect[]}
 */
export function treemapLayout(values, rect, gap = 2) {
  const out = values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))
  const total = values.reduce((a, v) => a + Math.max(0, v), 0)
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out

  const area = rect.w * rect.h
  // 按值降序处理(squarify 要求),记住原始下标以便按序返回
  const items = values
    .map((v, i) => ({ i, a: (Math.max(0, v) / total) * area }))
    .filter((d) => d.a > 0)
    .sort((a, b) => b.a - a.a)

  let { x, y, w, h } = rect
  let row = /** @type {{ i: number, a: number }[]} */ ([])

  /** 把当前行落位到 free 区域的短边上 */
  function layoutRow() {
    const sum = row.reduce((s, d) => s + d.a, 0)
    const horizontal = w < h // 短边是宽 → 行横着铺
    const side = horizontal ? w : h
    const thick = sum / side
    let offset = 0
    for (const d of row) {
      const len = d.a / thick
      out[d.i] = horizontal
        ? { x: x + offset, y, w: len, h: thick }
        : { x, y: y + offset, w: thick, h: len }
      offset += len
    }
    if (horizontal) {
      y += thick
      h -= thick
    } else {
      x += thick
      w -= thick
    }
  }

  for (const item of items) {
    const side = Math.min(w, h)
    if (row.length > 0) {
      const cur = row.map((d) => d.a)
      if (
        worstRatio([...cur, item.a], side) > worstRatio(cur, side)
      ) {
        layoutRow()
        row = []
      }
    }
    row.push(item)
  }
  if (row.length) layoutRow()

  // 块间隙:每块四周内缩 gap/2(外缘也内缩,视觉一致)
  if (gap > 0) {
    for (const r of out) {
      if (r.w <= 0 || r.h <= 0) continue
      const g = Math.min(gap / 2, r.w / 4, r.h / 4)
      r.x += g
      r.y += g
      r.w -= g * 2
      r.h -= g * 2
    }
  }
  return out
}
