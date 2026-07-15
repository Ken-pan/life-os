/**
 * 视角几何 + EXIF 换算的纯函数单测。不需要 dev server。
 *   node scripts/viewpoint-unit.mjs
 */
import {
  clampFov,
  headingFromPoint,
  headingVector,
  normalizeHeading,
  viewpointConePath,
  viewpointHandlePoint,
} from '../src/lib/spatial/viewpoints.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  bearingToPlanHeading,
  readPhotoHints,
  horizontalFovDeg,
  refineFovDeg,
} from '../src/lib/photo-exif.js'
import { makeExifJpeg } from './lib/make-exif-jpeg.mjs'

let pass = 0
const fails = []

function ok(name, cond, detail = '') {
  if (cond) pass++
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function near(name, got, want, tol = 0.01) {
  ok(name, Math.abs(got - want) <= tol, `got=${got} want=${want}`)
}

// —— headingVector：0=上，顺时针 ——
{
  const up = headingVector(0)
  near('heading 0 → 正上 dx', up.dx, 0)
  near('heading 0 → 正上 dy', up.dy, -1)

  const right = headingVector(90)
  near('heading 90 → 正右 dx', right.dx, 1)
  near('heading 90 → 正右 dy', right.dy, 0)

  const down = headingVector(180)
  near('heading 180 → 正下 dy', down.dy, 1)

  const left = headingVector(270)
  near('heading 270 → 正左 dx', left.dx, -1)
}

// —— headingFromPoint 与 headingVector 互为逆 ——
{
  near('point 正上 → 0°', headingFromPoint(100, 100, 100, 40), 0)
  near('point 正右 → 90°', headingFromPoint(100, 100, 160, 100), 90)
  near('point 正下 → 180°', headingFromPoint(100, 100, 100, 160), 180)
  near('point 正左 → 270°', headingFromPoint(100, 100, 40, 100), 270)

  for (const deg of [0, 37, 90, 128, 180, 245, 300, 359]) {
    const v = headingVector(deg)
    const back = headingFromPoint(50, 50, 50 + v.dx * 30, 50 + v.dy * 30)
    near(`往返 ${deg}°`, back, deg, 0.02)
  }
}

// —— normalizeHeading 处理负数/超圈 ——
{
  near('normalize -90', normalizeHeading(-90), 270)
  near('normalize 450', normalizeHeading(450), 90)
  near('normalize -370', normalizeHeading(-370), 350)
}

// —— clampFov ——
{
  ok('clampFov 下限', clampFov(5) === 20, `got=${clampFov(5)}`)
  ok('clampFov 上限', clampFov(300) === 170, `got=${clampFov(300)}`)
  ok('clampFov 正常值不动', clampFov(69) === 69)
}

// —— 视锥 path 结构 ——
{
  const vp = { id: 'v', x: 100, y: 100, heading: 0, fovDeg: 69 }
  const d = viewpointConePath(vp, 36)
  ok('cone 从中心起笔', d.startsWith('M 100 100'), d.slice(0, 20))
  ok('cone 含圆弧', d.includes(' A '), d)
  ok('cone 闭合', d.trim().endsWith('Z'))

  // 窄角 largeArc=0，超过 180° 才置 1
  ok('fov 69 → largeArc 0', / A [\d.]+ [\d.]+ 0 0 1 /.test(d), d)
  const wide = viewpointConePath({ ...vp, fovDeg: 170 }, 36)
  ok('fov 170 → 仍 largeArc 0', / A [\d.]+ [\d.]+ 0 0 1 /.test(wide), wide)
}

// —— 手柄落在中轴上 ——
{
  const vp = { id: 'v', x: 100, y: 100, heading: 90, fovDeg: 69 }
  const h = viewpointHandlePoint(vp, 36)
  ok('handle 在正右方', h.x > 100 && Math.abs(h.y - 100) < 0.01, JSON.stringify(h))
}

// —— EXIF 方位角 → 平面朝向 ——
{
  near('北向已对齐：bearing 90 → 90', bearingToPlanHeading(90, 0), 90)
  // 图上方朝东(90)时，正北的照片在图上是朝左(270)
  near('图上方朝东：bearing 0 → 270', bearingToPlanHeading(0, 90), 270)
  near('图上方朝东：bearing 90 → 0', bearingToPlanHeading(90, 90), 0)
  near('图上方朝南：bearing 0 → 180', bearingToPlanHeading(0, 180), 180)
  near('跨零点不出负数', bearingToPlanHeading(10, 45), 325)
}

// —— horizontalFovDeg：等对角模型 ——
// f35 的定义是「在 36×24 上给出相同**对角**视角的焦距」，所以只需 f35 + 交付宽高比。
{
  // 自洽性：3:2 画幅代入应与经典 36mm 公式完全一致
  const classic = (2 * Math.atan(36 / (2 * 26)) * 180) / Math.PI
  near('3:2 画幅回归经典 36mm 公式', horizontalFovDeg(26, 1.5), classic, 0.01)

  // 4:3 比 3:2 窄（同对角下宽边更短）
  ok('4:3 窄于 3:2', horizontalFovDeg(26, 4 / 3) < horizontalFovDeg(26, 1.5))
  // 16:9 比 3:2 宽
  ok('16:9 宽于 3:2', horizontalFovDeg(26, 16 / 9) > horizontalFovDeg(26, 1.5))
  // 竖构图永远窄于同 f35 的横构图
  ok('9:16 窄于 16:9', horizontalFovDeg(26, 9 / 16) < horizontalFovDeg(26, 16 / 9))

  // 对着 Apple 公开规格：超广角 f35=13 → 对角 ~120°（宣传值）
  const diag13 = (2 * Math.atan(Math.hypot(36, 24) / (2 * 13)) * 180) / Math.PI
  ok('超广角 f35=13 对角 ≈118–120°', Math.round(diag13) === 118, `got=${Math.round(diag13)}`)
}

// —— 真实 iPhone EXIF 端到端 ——
// ⚠️ 用 iPhone 真实签名：竖拍照片的像素维度**仍是传感器横向**
// （4032×3024），靠 Orientation=6 表示要转。早先的测试用「Orientation=1 +
// 竖向像素」，那是蒙对的 —— 它根本没走 Orientation 分支，真机永远不这么写。
{
  const P = await readPhotoHints(
    makeExifJpeg({ orientation: 6, w: 4032, h: 3024, f35: 26, dirDeg: 137.5 }),
  )
  ok('iPhone 竖拍(Orientation=6) 判为竖构图', P.portrait === true, `portrait=${P.portrait}`)
  ok('iPhone 4:3 竖拍 → 53°（不是横拍的 67°）', P.fovDeg === 53, `fov=${P.fovDeg}`)
  near('iPhone 竖拍 方位角透传', P.bearing, 137.5)
  ok('iPhone 竖拍 真北 ref', P.bearingRef === 'T')
  ok('机型带出', P.camera === 'Apple iPhone 15 Pro', P.camera)

  const L = await readPhotoHints(
    makeExifJpeg({ orientation: 1, w: 4032, h: 3024, f35: 26, dirDeg: 137.5 }),
  )
  ok('iPhone 横拍(Orientation=1) 判为横构图', L.portrait === false)
  ok('iPhone 4:3 横拍 → 67°', L.fovDeg === 67, `fov=${L.fovDeg}`)

  // Orientation=3 是转 180，长短边不变，不能算竖拍
  const R180 = await readPhotoHints(
    makeExifJpeg({ orientation: 3, w: 4032, h: 3024, f35: 26 }),
  )
  ok('Orientation=3(转180) 仍是横构图', R180.portrait === false, `portrait=${R180.portrait}`)

  // 超广角 13mm → ~108°；长焦 77mm → ~26°
  const UW = await readPhotoHints(makeExifJpeg({ f35: 13, orientation: 1 }))
  ok('超广角 f35=13 · 4:3 → 106°', UW.fovDeg === 106, `fov=${UW.fovDeg}`)
  const TELE = await readPhotoHints(makeExifJpeg({ f35: 77, orientation: 1 }))
  ok('长焦 f35=77 · 4:3 → 25°', TELE.fovDeg === 25, `fov=${TELE.fovDeg}`)

  // 超广角竖拍：13mm + Orientation=6 → 4:3 竖 → 90°
  const UWP = await readPhotoHints(makeExifJpeg({ f35: 13, orientation: 6 }))
  ok('超广角 4:3 竖拍 → 90°', UWP.fovDeg === 90, `fov=${UWP.fovDeg}`)
}

// —— 相机定位关掉：EXIF 里没有方位角 ——
{
  const noGps = await readPhotoHints(makeExifJpeg({ dirDeg: null, orientation: 1 }))
  ok('无 GPS 时不编造朝向', noGps.bearing === undefined, `bearing=${noGps.bearing}`)
  ok('无 GPS 时张角仍可用', noGps.fovDeg === 67, `fov=${noGps.fovDeg}`)
  ok('有 EXIF 标记为 true', noGps.hasExif === true)
}

// —— 磁北 ——
{
  const mag = await readPhotoHints(makeExifJpeg({ dirDeg: 100, dirRef: 'M', orientation: 1 }))
  ok('磁北 ref 如实透传', mag.bearingRef === 'M', `ref=${mag.bearingRef}`)
}

// —— 无 EXIF（截图/被编辑过）——
{
  const bare = await readPhotoHints(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
  ok('无 EXIF 时 hasExif=false', bare.hasExif === false)
  ok('无 EXIF 时不编造张角', bare.fovDeg === undefined)
}

// —— 真 HEIC：EXIF 必须能穿过容器读出来 ——
// 夹具是 sips 造的真 HEIC（真 PNG → JPEG → 拼 EXIF → HEIC），带 iPhone 竖拍签名。
// 这条守的是「Mac 上传 HEIC」这条路：解不了图是一回事，读不出 EXIF 就等于没标注。
{
  const heic = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures/iphone-portrait.heic'),
  )
  const H = await readPhotoHints(heic)
  ok('HEIC 能读出 EXIF', H.hasExif === true)
  ok('HEIC 竖拍判定正确', H.portrait === true, `portrait=${H.portrait}`)
  ok('HEIC 4:3 竖拍张角 = 53°', H.fovDeg === 53, `fov=${H.fovDeg}`)
  near('HEIC 方位角', H.bearing, 137.5)
  ok('HEIC 机型', H.camera === 'Apple iPhone 15 Pro', H.camera)
}

// —— refineFovDeg：真实解码尺寸压过 EXIF 尺寸 ——
// 参数取自真机实拍（iPhone 17 Pro 超广角，相机设成 16:9 拍摄）：
// 交付 5712×3213 / 3213×5712，EXIF 却写 5712×4284（原始采集尺寸）+ Orientation=1。
// 只信 EXIF 会把那张竖图判成横拍、给 104°，真值 74°。合成夹具造不出这个。
//
// 注意 f35 已按**交付画幅**算过（同镜头 4:3 出图 f35=13、16:9 出图 f35=14），
// 所以不能再按传感器像素比做「裁剪修正」—— 那会重复扣一次。
{
  const base = { hasExif: true, f35: 14 }

  const land = refineFovDeg({ ...base, portrait: false, fovDeg: 0 }, 5712, 3213)
  ok('16:9 横 → 107°', land.fovDeg === 107, `fov=${land.fovDeg}`)
  ok('16:9 横判横构图', land.portrait === false)

  const port = refineFovDeg({ ...base, portrait: false, fovDeg: 0 }, 3213, 5712)
  ok('EXIF 说横、实际是竖 → 判竖构图', port.portrait === true, `portrait=${port.portrait}`)
  ok('9:16 竖 → 74°（不是 104°）', port.fovDeg === 74, `fov=${port.fovDeg}`)

  // 重采样只改绝对像素、不改宽高比 → 结果必须不变
  const resized = refineFovDeg({ ...base, portrait: false, fovDeg: 0 }, 1024, 576)
  ok('重采样后同比例 → 同张角', resized.fovDeg === land.fovDeg, `fov=${resized.fovDeg}`)

  // 满幅 4:3
  const full43 = refineFovDeg({ ...base, portrait: false, fovDeg: 0 }, 5712, 4284)
  ok('4:3 满幅 → 102°', full43.fovDeg === 102, `fov=${full43.fovDeg}`)

  // 无真实尺寸 → 退回 EXIF 初值
  const noDims = refineFovDeg({ ...base, portrait: true, fovDeg: 50 }, 0, 0)
  ok('无真实尺寸 → 用 EXIF 初值', noDims.fovDeg === 50, `fov=${noDims.fovDeg}`)

  // 没有 f35 → 不编造
  const noF35 = refineFovDeg({ hasExif: true, portrait: false }, 5712, 3213)
  ok('无 f35 → 不编造张角', noF35.fovDeg === undefined, `fov=${noF35.fovDeg}`)
}

// —— 锚点定朝向的几何 ——
// 这是绕开室内罗盘的关键：VLM 认出画面正中是哪件家具，家具坐标已知，
// 于是 heading = 机位 → 家具中心，纯几何、零罗盘。
// （state.svelte.js 的 describeViewpoint 用的就是 headingFromPoint + 距离守卫。）
{
  const anchorHeading = (px, py, a) =>
    headingFromPoint(px, py, a.x + a.w / 2, a.y + a.h / 2)

  const fridge = { x: 380, y: 220, w: 40, h: 40 } // 中心 (400,240)
  near('锚点在正右 → 90°', anchorHeading(240, 240, fridge), 90)
  near('锚点在正左 → 270°', anchorHeading(560, 240, fridge), 270)
  near('锚点在正上 → 0°', anchorHeading(400, 400, fridge), 0)
  near('锚点在正下 → 180°', anchorHeading(400, 80, fridge), 180)
  // 机位 (240,400)、锚点中心 (400,240)：dx=+160, dy=-160 → 正右上 45°
  near('锚点在右上 → 45°', anchorHeading(240, 400, fridge), 45)

  // 距离守卫：机位落在锚点上时方向是噪声，差几像素就翻 180°
  const pxPerFt = 36
  const minSep = 2 * pxPerFt // ANCHOR_MIN_SEPARATION_FT
  const bed = { x: 200, y: 580, w: 80, h: 80 } // 中心 (240,620)
  const d1 = Math.hypot(240 - 240, 620 - 630)
  ok('机位距床心 10px < 阈值 → 不该采信', d1 < minSep, `dist=${d1} min=${minSep}`)
  const d2 = Math.hypot(400 - 240, 240 - 240)
  ok('机位距冰箱 160px ≥ 阈值 → 可采信', d2 >= minSep, `dist=${d2} min=${minSep}`)

  // 噪声演示：机位在锚点附近抖 2px，朝向就翻转
  const a = anchorHeading(240, 622, bed)
  const b = anchorHeading(240, 618, bed)
  ok('贴着锚点时 ±2px 让朝向翻 180°', Math.abs(shortest(a, b)) > 170, `${a}° vs ${b}°`)
}

/** 两角最短夹角 */
function shortest(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180
}

// —— 时区：OffsetTimeOriginal ——
{
  // 同一串本地时间，配不同的拍摄地偏移，UTC 结果必须相差 3 小时
  const a = await readPhotoHints(
    makeExifJpeg({ dto: '2026:07:14 15:30:00', offsetTime: '+08:00', orientation: 1 }),
  )
  const b = await readPhotoHints(
    makeExifJpeg({ dto: '2026:07:14 15:30:00', offsetTime: '+05:00', orientation: 1 }),
  )
  ok('带 offset 时解析出 UTC', typeof a.takenAt === 'string', a.takenAt)
  const diffH = (new Date(b.takenAt) - new Date(a.takenAt)) / 3_600_000
  ok('不同拍摄地偏移 → UTC 差 3 小时', diffH === 3, `diff=${diffH}h`)
  ok('+08:00 的 15:30 → 07:30Z', a.takenAt === '2026-07-14T07:30:00.000Z', a.takenAt)
}

console.log(`\n${pass + fails.length} checks, ${fails.length} failures`)
if (fails.length) {
  for (const f of fails) console.log('FAIL ' + f)
  process.exit(1)
}
console.log('PASS 全部通过')
