/**
 * 家具主色的 CIELAB 多视角聚合(能力8)。
 *
 * iOS 端主色来自**单张**最佳照的 sRGB k-means —— 白平衡漂一下颜色就变。
 * 网页端有每件家具 4 个方位桶的照片:各自提主色转 CIELAB(感知均匀,
 * 距离即 ΔE),分量中位数聚合 —— 一个方位偏色拽不动结果;同时报出
 * 视角间离散度(spreadE):大 = 光线不稳,这件的颜色别太当真(能力18)。
 *
 * 纯函数核(node 单测);浏览器包装在文件底部(blob → 主色)。
 */

/** sRGB(0-255) → CIELAB(D65)。标准两段式:线性化 → XYZ → Lab */
export function srgbToLab(r, g, b) {
  const lin = (v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)]
  // sRGB D65 矩阵
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

/** CIELAB → sRGB hex(聚合后的展示色) */
export function labToHex(lab) {
  const fy = (lab.L + 16) / 116
  const fx = fy + lab.a / 500
  const fz = fy - lab.b / 200
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787)
  const x = inv(fx) * 0.95047
  const y = inv(fy)
  const z = inv(fz) * 1.08883
  let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  let g = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  let b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  const gam = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(Math.max(0, Math.min(1, v)) * 255)
  }
  const hex = (v) => v.toString(16).padStart(2, '0')
  return `#${hex(gam(r))}${hex(gam(g))}${hex(gam(b))}`.toUpperCase()
}

/** ΔE76(CIELAB 欧氏距离)。够用:我们比的是同一件家具的多视角,不做色度学 */
export function deltaE(a, b) {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b)
}

/**
 * RGBA 像素堆 → 主色 {r,g,b}(与 iOS ObjectShotCapture 同思路):
 * 过滤过曝/欠曝(反光高光和阴影不是家具的颜色),确定性 3-means
 * (最远点初始化)取最大簇。像素太少返回 null。
 * @param {Uint8ClampedArray | number[]} data RGBA
 */
export function dominantFromPixels(data) {
  /** @type {Array<[number, number, number]>} */
  const all = []
  for (let i = 0; i + 3 < data.length; i += 4) {
    all.push([data[i], data[i + 1], data[i + 2]])
  }
  if (all.length < 16) return null
  const luma = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
  const usable = all.filter((p) => luma(p) > 16 && luma(p) < 240)
  const samples = usable.length >= (all.length * 3) / 10 ? usable : all

  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const centers = [samples[0]]
  while (centers.length < 3) {
    let far = samples[0]
    let farD = -1
    for (const s of samples) {
      const d = Math.min(...centers.map((c) => d2(s, c)))
      if (d > farD) {
        farD = d
        far = s
      }
    }
    centers.push(far)
  }
  const assign = new Array(samples.length).fill(0)
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < samples.length; i++) {
      let bi = 0
      let bd = Infinity
      for (let c = 0; c < 3; c++) {
        const d = d2(samples[i], centers[c])
        if (d < bd) {
          bd = d
          bi = c
        }
      }
      assign[i] = bi
    }
    const sums = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    for (let i = 0; i < samples.length; i++) {
      const s = sums[assign[i]]
      s[0] += samples[i][0]
      s[1] += samples[i][1]
      s[2] += samples[i][2]
      s[3] += 1
    }
    for (let c = 0; c < 3; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]]
      }
    }
  }
  const counts = [0, 0, 0]
  for (const a of assign) counts[a] += 1
  const biggest = counts.indexOf(Math.max(...counts))
  const c = centers[biggest]
  return { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) }
}

/**
 * 多视角主色聚合:各视角 Lab 的**分量中位数**(一个偏色视角拽不动),
 * spreadE = 各视角到聚合色的最大 ΔE(光线稳定度;>12 就别太信这颜色)。
 * @param {Array<{ L: number, a: number, b: number }>} labs ≥1 个
 */
export function aggregateLabs(labs) {
  if (!labs.length) return null
  const median = (nums) => {
    const s = [...nums].sort((x, y) => x - y)
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  const lab = {
    L: median(labs.map((l) => l.L)),
    a: median(labs.map((l) => l.a)),
    b: median(labs.map((l) => l.b)),
  }
  const spreadE = Math.max(...labs.map((l) => deltaE(l, lab)))
  return { lab, hex: labToHex(lab), spreadE: Math.round(spreadE * 10) / 10 }
}

/** 光线不稳的门槛(ΔE):超过它,聚合色标「不确定」,识别匹配也降权 */
export const COLOR_SPREAD_UNSTABLE = 12

// ---- 浏览器包装 ----

/**
 * 照片 blob → 主色 Lab(中央 72% 区域采样,与 iOS 同一取景纪律)。
 * 解码失败返回 null(颜色是增强特征,不拖垮拉取)。
 * @param {Blob} blob
 * @returns {Promise<{ L: number, a: number, b: number } | null>}
 */
export async function dominantLabFromBlob(blob) {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return null
  }
  try {
    const bitmap = await createImageBitmap(blob)
    const side = 24
    const canvas = new OffscreenCanvas(side, side)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // 中央 72%:裁剪图带 12% 外扩,四周多半是背景
    const inset = 0.14
    ctx.drawImage(
      bitmap,
      bitmap.width * inset,
      bitmap.height * inset,
      bitmap.width * (1 - 2 * inset),
      bitmap.height * (1 - 2 * inset),
      0,
      0,
      side,
      side,
    )
    bitmap.close?.()
    const rgb = dominantFromPixels(ctx.getImageData(0, 0, side, side).data)
    return rgb ? srgbToLab(rgb.r, rgb.g, rgb.b) : null
  } catch {
    return null
  }
}
