/**
 * 从照片 EXIF 里榨出机位线索：视锥张角、朝向、拍摄时间。
 *
 * 能榨到什么、可信度如何：
 * - 张角：由 35mm 等效焦距精确算出，可信。
 * - 时间：DateTimeOriginal，可信。
 * - 朝向：GPSImgDirection 是罗盘读数。室内受钢结构/冰箱/音箱磁铁干扰，
 *   偏 20–40° 很常见 —— 只能当初值，必须让人再拧一下。
 */

import exifr from 'exifr'

/** 全画幅感光元件尺寸（mm）—— 35mm 等效焦距的基准。 */
const FRAME_LONG_MM = 36
const FRAME_SHORT_MM = 24
/** 35mm 画幅对角 43.267mm —— `FocalLengthIn35mmFilm` 的定义基准就是「等效对角」。 */
const FRAME_DIAG_MM = Math.hypot(FRAME_LONG_MM, FRAME_SHORT_MM)

/**
 * 水平张角 = f(35mm 等效焦距, 交付画幅宽高比)。
 *
 * `FocalLengthIn35mmFilm` 的定义是「在 36×24 画幅上给出**相同对角视角**的焦距」。
 * 所以把交付画幅按其自身宽高比、等对角地映射回 35mm 画幅，取其宽边即可 ——
 * **不需要传感器尺寸、不需要 Orientation、也不需要判断裁没裁**。
 *
 * 关键：Apple **按交付画幅重算 f35**。同一颗超广角，4:3 出图 f35=13（对角 120°，
 * 官方宣传值），设成 16:9 拍则 f35=14（对角 115.7°）—— 实测用户照片正是 14。
 * 所以 f35 已经把画幅算进去了，再按传感器像素比做「裁剪修正」会**重复扣一次**。
 *
 * 自洽性：3:2 画幅代入本式得 2·atan(18/f35)，与经典 36mm 公式完全一致。
 *
 * @param {number} f35
 * @param {number} aspect 交付图 宽/高
 * @returns {number} 度
 */
export function horizontalFovDeg(f35, aspect) {
  const wMm = (FRAME_DIAG_MM * aspect) / Math.hypot(aspect, 1)
  return deg(2 * Math.atan(wMm / (2 * f35)))
}

const PICK = [
  'FocalLengthIn35mmFormat',
  'FocalLength',
  'GPSImgDirection',
  'GPSImgDirectionRef',
  'DateTimeOriginal',
  'CreateDate',
  'OffsetTimeOriginal',
  'Orientation',
  'ExifImageWidth',
  'ExifImageHeight',
  'Make',
  'Model',
]

/**
 * ⚠️ translateValues:false 是必须的，不是优化。
 * exifr 默认把 Orientation 翻成人类可读串（6 → 'Rotate 90 CW'），
 * 数值判断会静默失效 → 真实 iPhone 竖拍被当成横拍 → 视锥宽 38%。
 * 关掉翻译后 Orientation 回到数字，其余字段（Make/时间/GPSImgDirectionRef）不受影响。
 */
const EXIF_OPTS = {
  tiff: true,
  exif: true,
  gps: true,
  pick: PICK,
  translateValues: false,
}

/**
 * 解码前只能靠 EXIF 猜画幅比：取 EXIF 尺寸，按 Orientation 决定要不要转 90°。
 * 拿不到尺寸就退回 3:2（35mm 画幅本身的比例，最中性的假设）。
 * @param {any} tags
 * @param {boolean} portrait
 */
function exifAspect(tags, portrait) {
  const w = Number(tags.ExifImageWidth)
  const h = Number(tags.ExifImageHeight)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return portrait ? FRAME_SHORT_MM / FRAME_LONG_MM : FRAME_LONG_MM / FRAME_SHORT_MM
  }
  const long = Math.max(w, h)
  const short = Math.min(w, h)
  return portrait ? short / long : long / short
}

/**
 * 成像是否为竖构图。
 *
 * iPhone 的关键签名：竖拍照片的像素维度**仍是传感器横向**（4032×3024），
 * 靠 Orientation=6（Rotate 90 CW）表示要转。只比像素会把每张竖拍都判成横拍。
 * Orientation 5–8 才是转 90/270（3 是转 180，长短边不变，不算）。
 *
 * @param {number|string|undefined} orientation
 * @param {number|undefined} w
 * @param {number|undefined} h
 * @returns {boolean}
 */
function isPortrait(orientation, w, h) {
  const swapped = orientationSwapsAxes(orientation)
  if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
    const portraitByPixels = h > w
    return swapped ? !portraitByPixels : portraitByPixels
  }
  return swapped
}

/**
 * 兼容数字与 exifr 翻译后的字符串两种形态 —— 即便哪天 EXIF_OPTS 被人改回默认，
 * 也不至于静默退化成「全部当横拍」。
 * @param {number|string|undefined} orientation
 */
function orientationSwapsAxes(orientation) {
  if (typeof orientation === 'number') return orientation >= 5 && orientation <= 8
  if (typeof orientation === 'string') return /rotate\s*(90|270)/i.test(orientation)
  return false
}

/**
 * @typedef {object} PhotoExifHints
 * @property {number} [fovDeg] 水平视锥张角
 * @property {number} [bearing] 罗盘方位角（相对真北/磁北，0–360）
 * @property {'T'|'M'} [bearingRef] 真北还是磁北
 * @property {string} [takenAt] ISO
 * @property {string} [camera]
 * @property {boolean} portrait
 * @property {boolean} hasExif 有没有读到任何 EXIF（截图/被编辑过的图会被剥光）
 * @property {number} [f35] 35mm 等效焦距
 */

/**
 * @param {Blob|Uint8Array|ArrayBuffer} file
 * @returns {Promise<PhotoExifHints>}
 */
export async function readPhotoHints(file) {
  /** @type {any} */
  let tags = null
  try {
    tags = await exifr.parse(file, EXIF_OPTS)
  } catch {
    return { portrait: false, hasExif: false }
  }
  if (!tags) return { portrait: false, hasExif: false }

  const portrait = isPortrait(tags.Orientation, tags.ExifImageWidth, tags.ExifImageHeight)

  /** @type {PhotoExifHints} */
  const hints = { portrait, hasExif: true }

  const f35 = Number(tags.FocalLengthIn35mmFormat)
  if (Number.isFinite(f35) && f35 > 1) {
    hints.f35 = f35
    // 解码前的初值：只有 EXIF 尺寸可用（可能是陈旧的采集尺寸）。
    // refineFovDeg() 拿到真实解码尺寸后会覆盖它。
    hints.fovDeg = Math.round(horizontalFovDeg(f35, exifAspect(tags, portrait)))
  }

  const dir = Number(tags.GPSImgDirection)
  if (Number.isFinite(dir)) {
    hints.bearing = ((dir % 360) + 360) % 360
    const ref = tags.GPSImgDirectionRef
    if (ref === 'T' || ref === 'M') hints.bearingRef = ref
  }

  // DateTimeOriginal 本身不带时区，exifr 按**本机**时区解析。照片若在别的时区拍，
  // 直接 toISOString() 会整体偏几小时。iPhone 会写 OffsetTimeOriginal（如 "-07:00"），
  // 有它就按拍摄地时区还原。
  const when = tags.DateTimeOriginal ?? tags.CreateDate
  if (when instanceof Date && !Number.isNaN(when.valueOf())) {
    hints.takenAt = toIsoWithOffset(when, tags.OffsetTimeOriginal)
  }

  const camera = [tags.Make, tags.Model].filter(Boolean).join(' ').trim()
  if (camera) hints.camera = camera

  return hints
}

/**
 * 拿到**真实解码尺寸**后重算水平张角。
 *
 * 为什么不能只信 EXIF：`ExifImageWidth/Height` 记的是**原始采集**尺寸。实测真机图
 * 交付 3213×5712（竖），EXIF 仍写 5712×4284（横）+ Orientation=1 —— 只信 EXIF 会
 * 判成横拍、给 104°，真值 74°。真实解码尺寸才是唯一可信的画幅来源。
 *
 * 重采样（导出成 1024 宽）不影响：本式只用**宽高比**，不用绝对像素数。
 *
 * @param {PhotoExifHints} hints
 * @param {number} actualW 降采样前的真实解码宽
 * @param {number} actualH
 * @returns {{ fovDeg?: number, portrait: boolean }}
 */
export function refineFovDeg(hints, actualW, actualH) {
  if (!actualW || !actualH) {
    return { fovDeg: hints.fovDeg, portrait: hints.portrait }
  }
  const portrait = actualH > actualW
  if (!hints.f35) return { fovDeg: hints.fovDeg, portrait }
  return {
    fovDeg: Math.round(horizontalFovDeg(hints.f35, actualW / actualH)),
    portrait,
  }
}

/** @param {number} rad */
function deg(rad) {
  return (rad * 180) / Math.PI
}

/**
 * exifr 把无时区的 EXIF 时间按本机时区解析。已知拍摄地 UTC 偏移时，
 * 把「本机时区解析」纠正回「拍摄地时区解析」。
 * @param {Date} local exifr 按本机时区解出的 Date
 * @param {string|undefined} offset 形如 "+08:00" / "-07:00"
 */
function toIsoWithOffset(local, offset) {
  const m = typeof offset === 'string' && /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim())
  if (!m) return local.toISOString()
  const sign = m[1] === '-' ? -1 : 1
  const shootOffsetMin = sign * (Number(m[2]) * 60 + Number(m[3]))
  // getTimezoneOffset() 是「UTC - 本地」的分钟数，正负与 EXIF 偏移相反。
  const localOffsetMin = -local.getTimezoneOffset()
  const correctedMs = local.valueOf() + (localOffsetMin - shootOffsetMin) * 60_000
  return new Date(correctedMs).toISOString()
}

/**
 * 罗盘方位角 → 平面图朝向。
 * 平面图的「上」不是真北，靠 planNorthDeg 校准（见 spatial/north.js）。
 * @param {number} bearing
 * @param {number} planNorthDeg 平面图正上方对应的真实方位角
 */
export function bearingToPlanHeading(bearing, planNorthDeg) {
  return (((bearing - planNorthDeg) % 360) + 360) % 360
}
