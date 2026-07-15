/**
 * 照片感知哈希单测:dHash 编码、汉明距离、外观项救回尺寸抖动的柜子。
 * Usage: node apps/home/scripts/photo-hash-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  DHASH_H,
  DHASH_W,
  dhashFromImageData,
  hammingHex,
  HASH_DIFF_MIN,
  HASH_SAME_MAX,
} from '../src/lib/spatial/photo-hash.js'
import { matchScanObjects } from '../src/lib/spatial/scan-identity.js'

/** 9×8 灰度图 → RGBA(node 里手搓 ImageData 形状) */
function img(fn) {
  const data = new Uint8ClampedArray(DHASH_W * DHASH_H * 4)
  for (let y = 0; y < DHASH_H; y++) {
    for (let x = 0; x < DHASH_W; x++) {
      const v = fn(x, y)
      const i = (y * DHASH_W + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width: DHASH_W, height: DHASH_H }
}

/* ---- dHash 编码 ---- */
{
  // 水平渐变(左亮右暗,不碰 0/255 截断):每行 8 个比较全是 1 → ff…
  const grad = dhashFromImageData(img((x) => 200 - x * 15))
  assert.equal(grad, 'f'.repeat(16))
  // 反向渐变 → 00…
  const anti = dhashFromImageData(img((x) => 40 + x * 15))
  assert.equal(anti, '0'.repeat(16))
  assert.equal(hammingHex(grad, anti), 64, '完全相反 → 64')
  assert.equal(hammingHex(grad, grad), 0)

  // 亮度整体平移不变(灯开关了,梯度方向不变;前提是不进截断区)
  const bright = dhashFromImageData(img((x) => 200 - x * 15 + 30))
  assert.equal(hammingHex(grad, bright), 0, '亮度平移不动哈希')

  // 尺寸不对 / 缺失 → null(中立)
  assert.equal(dhashFromImageData({ data: [], width: 8, height: 8 }), null)
  assert.equal(hammingHex(undefined, 'f'.repeat(16)), null)
  assert.equal(hammingHex('xyz', 'f'.repeat(16)), null)
}

/* ---- 身份匹配:外观救回尺寸抖动的柜子 ---- */
{
  const hashA = 'a5a5a5a5a5a5a5a5'
  // 508 真扫的病:低置信度柜子尺寸抖 + 位置漂,基分卡在 0.5 门槛下面一点
  // (差得离谱的照样拒 —— 哈希只救临界,这正是想要的保守行为)
  const prev = [
    { id: 'old', kind: 'cabinet', label: '柜', x: 100, y: 100, w: 90, h: 45, rotation: 0,
      attrs: { confidence: 'low', photoHash: hashA } },
  ]
  const nextNoHash = [
    { id: 'new', kind: 'cabinet', label: '柜', x: 180, y: 105, w: 112, h: 47, rotation: 0,
      attrs: { confidence: 'low' } },
  ]
  const without = matchScanObjects(prev, nextNoHash)
  assert.equal(without.pairs.length, 0, `前置:没照片时这件配不上(${JSON.stringify(without.pairs)})`)
  // 同一场景 + 几乎相同的照片哈希(汉明 1)
  const nextWithHash = [
    { ...nextNoHash[0], attrs: { confidence: 'low', photoHash: 'a5a5a5a5a5a5a5a7' } },
  ]
  const withHash = matchScanObjects(prev, nextWithHash)
  assert.ok(withHash.pairs.some((p) => p.prevId === 'old' && p.nextId === 'new'), '抖尺寸的柜子靠照片认回来')

  // 外观明显不同(汉明 64):轻罚不一票否决 —— 原本稳配的仍配得上
  const prevSolid = [
    { id: 'o2', kind: 'sofa', label: '沙发', x: 100, y: 100, w: 216, h: 90, rotation: 0,
      attrs: { photoHash: 'f'.repeat(16) } },
  ]
  const nextSolid = [
    { id: 'n2', kind: 'sofa', label: '沙发', x: 106, y: 103, w: 217, h: 91, rotation: 0,
      attrs: { photoHash: '0'.repeat(16) } },
  ]
  const solid = matchScanObjects(prevSolid, nextSolid)
  assert.ok(solid.pairs.length === 1, '尺寸位置几乎全同时,哈希不同只是轻罚,不拆散')

  // 没有哈希的老数据:行为与从前一致(中立)
  const legacy = matchScanObjects(
    [{ id: 'a', kind: 'bed', label: '床', x: 0, y: 0, w: 180, h: 240, rotation: 0 }],
    [{ id: 'b', kind: 'bed', label: '床', x: 6, y: 3, w: 181, h: 240, rotation: 0 }],
  )
  assert.equal(legacy.pairs.length, 1)
}

/* ---- 阈值卫生 ---- */
assert.ok(HASH_SAME_MAX < HASH_DIFF_MIN)

console.log('photo-hash-unit: all assertions passed')
