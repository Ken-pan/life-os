/**
 * 动态占用包络单测(规范 §2.6/§3, 评审 B7)。不需要 dev server。
 *   node scripts/envelopes-unit.mjs
 *
 * 锁死:三类分开、随 rotation 转到正确一侧(误报/漏报)、clearanceIn 覆写。
 */
import assert from 'node:assert/strict'
import {
  envelopeRects,
  egressEnvelopeRects,
  accessEnvelopeRects,
  comfortEnvelopeRects,
} from '../src/lib/spatial/envelopes.js'

const IN = 3 // PX_PER_IN
const cab = (over = {}) => ({ id: 'c', kind: 'cabinet', label: '柜', x: 0, y: 0, w: 36 * IN, h: 24 * IN, rotation: 0, ...over })

// 三类归类
{
  assert.equal(accessEnvelopeRects(cab())[0].type, 'access')
  assert.equal(egressEnvelopeRects({ id: 'b', kind: 'bed_king', label: '床', x: 0, y: 0, w: 200, h: 200, rotation: 0 })[0].type, 'egress')
  assert.equal(comfortEnvelopeRects({ id: 'oc', kind: 'office_chair', label: '椅', x: 0, y: 0, w: 60, h: 60, rotation: 0 })[0].type, 'comfort')
  // 无包络的家具 → 空
  assert.deepEqual(envelopeRects({ id: 's', kind: 'sofa', label: '沙发', x: 0, y: 0, w: 100, h: 40, rotation: 0 }), [])
  assert.deepEqual(envelopeRects(null), [])
}

// rotation:柜门包络转到正确一侧(cabinet swing depthIn=24 → 72px)
{
  // rotation 0 → 正面朝下:rect 在 y = h 处
  const down = accessEnvelopeRects(cab({ rotation: 0 }))[0]
  assert.deepEqual({ x: down.x, y: down.y, w: down.w, h: down.h }, { x: 0, y: 24 * IN, w: 36 * IN, h: 24 * IN })
  // rotation 90 → 正面朝左:rect 在 x = -depth
  const left = accessEnvelopeRects(cab({ rotation: 90 }))[0]
  assert.deepEqual({ x: left.x, y: left.y, w: left.w, h: left.h }, { x: -24 * IN, y: 0, w: 24 * IN, h: 24 * IN })
  // rotation 180 → 正面朝上
  const up = accessEnvelopeRects(cab({ rotation: 180 }))[0]
  assert.deepEqual({ x: up.x, y: up.y, w: up.w, h: up.h }, { x: 0, y: -24 * IN, w: 36 * IN, h: 24 * IN })
  // rotation 270 → 正面朝右
  const right = accessEnvelopeRects(cab({ rotation: 270 }))[0]
  assert.deepEqual({ x: right.x, y: right.y, w: right.w, h: right.h }, { x: 36 * IN, y: 0, w: 24 * IN, h: 24 * IN })
}

// clearanceIn 实测覆写深度
{
  const measured = accessEnvelopeRects(cab({ attrs: { clearanceIn: 30 } }))[0]
  assert.equal(measured.h, 30 * IN, '实测净空应覆写词表深度')
}

// office_chair:四周旋转+滚动包络(margin 18in=54px 外扩四周)
{
  const oc = { id: 'oc', kind: 'office_chair', label: '椅', x: 100, y: 100, w: 60, h: 60, rotation: 0 }
  const env = comfortEnvelopeRects(oc)[0]
  assert.deepEqual({ x: env.x, y: env.y, w: env.w, h: env.h }, { x: 100 - 54, y: 100 - 54, w: 60 + 108, h: 60 + 108 })
}

console.log('envelopes-unit: ok')
