/**
 * CIELAB 主色聚合单测:转换往返、ΔE 语义、主色抗高光、聚合抗离群视角。
 * Usage: node apps/home/scripts/color-lab-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  aggregateLabs,
  COLOR_SPREAD_UNSTABLE,
  deltaE,
  dominantFromPixels,
  labToHex,
  srgbToLab,
} from '../src/lib/spatial/color-lab.js'

/* ---- 转换往返与 ΔE 语义 ---- */
{
  // 已知锚点:纯白 L≈100,纯黑 L≈0
  assert.ok(Math.abs(srgbToLab(255, 255, 255).L - 100) < 0.5)
  assert.ok(srgbToLab(0, 0, 0).L < 0.5)
  // 往返:Lab→hex→Lab 误差应在量化级(每通道 ±1)
  for (const [r, g, b] of [[122, 90, 60], [30, 144, 255], [200, 200, 195]]) {
    const lab = srgbToLab(r, g, b)
    const hex = labToHex(lab)
    const back = srgbToLab(
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    )
    assert.ok(deltaE(lab, back) < 1.5, `${hex} 往返 ΔE=${deltaE(lab, back)}`)
  }
  assert.equal(deltaE(srgbToLab(100, 80, 60), srgbToLab(100, 80, 60)), 0)
  assert.ok(deltaE(srgbToLab(0, 0, 0), srgbToLab(255, 255, 255)) > 90, '黑白 ΔE 要大')
}

/* ---- 主色提取:多数簇赢,高光阴影不算数 ---- */
{
  // 70% 棕沙发 + 20% 反光高光(250+) + 10% 阴影(<16)
  const px = []
  const push = (rgb, n) => {
    for (let i = 0; i < n; i++) px.push(rgb[0], rgb[1], rgb[2], 255)
  }
  push([122, 90, 60], 70)
  push([252, 252, 250], 20)
  push([8, 8, 8], 10)
  const dom = dominantFromPixels(px)
  assert.ok(dom, '要能提出主色')
  assert.ok(Math.abs(dom.r - 122) < 8 && Math.abs(dom.g - 90) < 8, `高光阴影不该污染主色(got ${JSON.stringify(dom)})`)
  // 像素太少 → null
  assert.equal(dominantFromPixels([1, 2, 3, 255]), null)
}

/* ---- 多视角聚合:一个偏色视角拽不动,离散度如实报 ---- */
{
  const brown = srgbToLab(122, 90, 60)
  const brown2 = srgbToLab(126, 93, 62) // 正常视角差
  const brown3 = srgbToLab(118, 88, 59)
  const blueCast = srgbToLab(95, 95, 110) // 一个方位白平衡偏蓝
  const agg = aggregateLabs([brown, brown2, brown3, blueCast])
  assert.ok(agg)
  // 中位数聚合:结果仍是棕(离 brown 近,离偏蓝远)
  assert.ok(deltaE(agg.lab, brown) < deltaE(agg.lab, blueCast), '聚合色站在多数一边')
  assert.ok(deltaE(agg.lab, brown) < 5, `聚合色贴近多数视角(ΔE=${deltaE(agg.lab, brown)})`)
  // 离散度报出偏蓝那口锅
  assert.ok(agg.spreadE > 10, `有离群视角时 spread 要大(got ${agg.spreadE})`)

  // 三个视角全稳:spread 小,颜色可信
  const stable = aggregateLabs([brown, brown2, brown3])
  assert.ok(stable.spreadE < COLOR_SPREAD_UNSTABLE, `稳定光线 spread 小(got ${stable.spreadE})`)
  assert.equal(aggregateLabs([]), null)
}

console.log('color-lab-unit: all assertions passed')
