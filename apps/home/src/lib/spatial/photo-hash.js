/**
 * 家具照片的感知哈希(dHash)—— 跨扫描身份匹配的外观特征。
 *
 * 为什么是 dHash:RoomPlan 对扫不全的柜子包围盒抖 7-28in,尺寸+位置打分
 * 会把同一件拆成「消失+新增」;而两次扫描里同一件家具的照片**长得一样**。
 * dHash(梯度哈希)对亮度平移/轻微裁剪稳健,64 bit 汉明距离即相似度,
 * 几十行纯 JS,30 件家具的量级不需要神经网络。
 *
 * 纯函数核(node 单测直接跑)+ 浏览器包装(blob → 9×8 灰度 → 哈希)。
 * 哈希在网页端拉取照片时算好写进 attrs.photoHash(加法式契约),
 * 匹配端(scan-identity)同步可用 —— 不在匹配时解码图片。
 */

/** dHash 网格:9×8 → 64 bit */
export const DHASH_W = 9
export const DHASH_H = 8

/**
 * 9×8 RGBA 像素 → 16 位十六进制 dHash。
 * 每行相邻像素比较:左 > 右 记 1 —— 编码的是**梯度方向**,对整体
 * 亮度变化(灯开关了)天然免疫。
 * @param {{ data: Uint8ClampedArray | number[], width: number, height: number }} img
 * @returns {string | null} 尺寸不对返回 null
 */
export function dhashFromImageData(img) {
  if (!img || img.width !== DHASH_W || img.height !== DHASH_H) return null
  const d = img.data
  let bits = ''
  for (let y = 0; y < DHASH_H; y++) {
    for (let x = 0; x < DHASH_W - 1; x++) {
      const i = (y * DHASH_W + x) * 4
      const j = i + 4
      const la = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const lb = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]
      bits += la > lb ? '1' : '0'
    }
  }
  // 64 bit → 16 hex
  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

/**
 * 两个 dHash 的汉明距离(0-64;越小越像)。
 * @param {string | undefined | null} a
 * @param {string | undefined | null} b
 * @returns {number | null} 任一边缺失/格式不对返回 null(中立,不参与打分)
 */
export function hammingHex(a, b) {
  if (!a || !b || a.length !== 16 || b.length !== 16) return null
  let dist = 0
  for (let i = 0; i < 16; i++) {
    const xa = parseInt(a[i], 16)
    const xb = parseInt(b[i], 16)
    if (Number.isNaN(xa) || Number.isNaN(xb)) return null
    let x = xa ^ xb
    while (x) {
      dist += x & 1
      x >>= 1
    }
  }
  return dist
}

/** 判定阈值:≤SAME 视为同一件的强外观信号,≥DIFF 视为明显不同 */
export const HASH_SAME_MAX = 10
export const HASH_DIFF_MIN = 26

/**
 * 浏览器包装:照片 blob → dHash。解码失败返回 null(哈希是增强特征,
 * 缺了匹配退回尺寸+位置,不该让一张坏图拖垮拉取)。
 * @param {Blob} blob
 * @returns {Promise<string | null>}
 */
export async function dhashFromBlob(blob) {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return null
  }
  try {
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: DHASH_W,
      resizeHeight: DHASH_H,
      resizeQuality: 'medium',
    })
    const canvas = new OffscreenCanvas(DHASH_W, DHASH_H)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, DHASH_W, DHASH_H)
    bitmap.close?.()
    return dhashFromImageData(ctx.getImageData(0, 0, DHASH_W, DHASH_H))
  } catch {
    return null
  }
}
