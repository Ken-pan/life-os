/**
 * 机位反解的精度实测。不需要 dev server / VLM。
 *   node scripts/localize-unit.mjs
 *
 * 做法：**正向模型 → 反解 → 比真值**。
 * 给定真实机位与朝向，按理想针孔算出每件家具「应该」出现在画面的哪里、占多宽，
 * 把这些喂给 solveFix，看它能不能把机位解回来、差多少。
 *
 * 然后逐项注入真实世界的误差源（VLM 框误差、家具尺寸与目录不符、朝向未知），
 * 量出各自贡献多少厘米 —— 这才是「能不能到厘米级」的答案，不是拍脑袋。
 */
import {
  apparentWidth,
  bearingOffsetDeg,
  distanceFromWidth,
  focalPx,
  solveFix,
} from '../src/lib/spatial/localize.js'

let pass = 0
const fails = []
const ok = (n, c, d = '') => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ''}`))
const near = (n, got, want, tol) =>
  ok(n, Math.abs(got - want) <= tol, `got=${round(got)} want=${want} tol=${tol}`)
const round = (v) => Math.round(v * 100) / 100

const PX_PER_FT = 36
const CM_PER_FT = 30.48
/** 平面 px → 厘米 */
const toCm = (px) => (px / PX_PER_FT) * CM_PER_FT

const IMG_W = 4032
const HFOV = 69 // iPhone 主摄 3:2 近似

/** 平面坐标系方位角：0=上，顺时针 */
function bearing(a, b) {
  const d = (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI
  return ((d % 360) + 360) % 360
}
const centerOf = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })

/**
 * 正向模型：真实机位/朝向下，这件家具在画面里的框。
 * @param {{x:number,y:number}} cam
 * @param {number} headingDeg
 * @param {any} p
 * @param {{ widthScale?: number, boxNoise?: number, centerNoise?: number }} [err]
 */
function project(cam, headingDeg, p, err = {}) {
  const c = centerOf(p)
  const b = bearing(cam, c)
  let alpha = b - headingDeg
  alpha = (((alpha + 180) % 360) + 360) % 360 - 180 // → [-180,180)
  const f = focalPx(IMG_W, HFOV)
  const boxCenterX = IMG_W / 2 + f * Math.tan((alpha * Math.PI) / 180)
  const d = Math.hypot(c.x - cam.x, c.y - cam.y)
  // widthScale：模拟「目录尺寸 ≠ 你家实物」
  const wApp = apparentWidth(p, b) * (err.widthScale ?? 1)
  let boxWidthPx = (f * wApp) / d
  if (err.boxNoise) boxWidthPx *= 1 + err.boxNoise
  return {
    placement: p,
    boxCenterX: boxCenterX + (err.centerNoise ?? 0) * IMG_W,
    boxWidthPx,
    _alpha: alpha,
    _d: d,
  }
}

// —— 场景：一间 12×10 ft 的厨房，三件家具 ——
const KITCHEN = { x: 40, y: 40, w: 12 * PX_PER_FT, h: 10 * PX_PER_FT }
const inKitchen = (pt) =>
  pt.x >= KITCHEN.x && pt.x <= KITCHEN.x + KITCHEN.w && pt.y >= KITCHEN.y && pt.y <= KITCHEN.y + KITCHEN.h
/** 冰箱 32"×32"、灶台 30"×24"、水槽 30"×20"，单位换成平面 px */
const IN = PX_PER_FT / 12
const FRIDGE = { x: 40 + 10 * PX_PER_FT, y: 40 + 1 * PX_PER_FT, w: 32 * IN, h: 32 * IN, rotation: 0 }
const STOVE = { x: 40 + 1 * PX_PER_FT, y: 40 + 0.5 * PX_PER_FT, w: 30 * IN, h: 24 * IN, rotation: 0 }
const SINK = { x: 40 + 5 * PX_PER_FT, y: 40 + 0.5 * PX_PER_FT, w: 30 * IN, h: 20 * IN, rotation: 0 }

const CAM = { x: 40 + 6 * PX_PER_FT, y: 40 + 8 * PX_PER_FT } // 站在厨房靠下
const HEADING = 350 // 大致朝上

// —— A. 无噪声：求解器本身准不准 ——
{
  const sights = [FRIDGE, STOVE, SINK].map((p) => project(CAM, HEADING, p))
  const fix = solveFix(sights, IMG_W, HFOV, { x: KITCHEN.x + KITCHEN.w / 2, y: KITCHEN.y + KITCHEN.h / 2 }, inKitchen)
  ok('无噪声：能解出', !!fix)
  if (fix) {
    const errPx = Math.hypot(fix.x - CAM.x, fix.y - CAM.y)
    near('无噪声：位置误差 < 1cm', toCm(errPx), 0, 1)
    near('无噪声：朝向误差 < 1°', Math.abs((((fix.heading - HEADING + 540) % 360) - 180)), 0, 1)
    console.log(`  A 无噪声        位置误差 ${round(toCm(errPx))}cm  残差 ${round(toCm(fix.residual))}cm`)
  }
}

// —— B. 只有 VLM 框宽误差（实测 1.9–5%）——
{
  const sights = [
    project(CAM, HEADING, FRIDGE, { boxNoise: 0.050 }),
    project(CAM, HEADING, STOVE, { boxNoise: 0.019 }),
    project(CAM, HEADING, SINK, { boxNoise: 0.035 }),
  ]
  const fix = solveFix(sights, IMG_W, HFOV, { x: KITCHEN.x + KITCHEN.w / 2, y: KITCHEN.y + KITCHEN.h / 2 }, inKitchen)
  ok('VLM 框宽噪声：能解出', !!fix)
  if (fix) {
    const errCm = toCm(Math.hypot(fix.x - CAM.x, fix.y - CAM.y))
    ok('VLM 框宽噪声 → 位置误差 < 30cm', errCm < 30, `${round(errCm)}cm`)
    console.log(`  B VLM框宽(实测)  位置误差 ${round(errCm)}cm  残差 ${round(toCm(fix.residual))}cm`)
  }
}

// —— C. 家具尺寸与目录差 5%（你家的床不是标准 Queen）——
{
  const sights = [
    project(CAM, HEADING, FRIDGE, { widthScale: 1.05 }),
    project(CAM, HEADING, STOVE, { widthScale: 0.95 }),
    project(CAM, HEADING, SINK, { widthScale: 1.05 }),
  ]
  const fix = solveFix(sights, IMG_W, HFOV, { x: KITCHEN.x + KITCHEN.w / 2, y: KITCHEN.y + KITCHEN.h / 2 }, inKitchen)
  if (fix) {
    const errCm = toCm(Math.hypot(fix.x - CAM.x, fix.y - CAM.y))
    ok('尺寸差 5%：能解出', true)
    console.log(`  C 尺寸±5%       位置误差 ${round(errCm)}cm  残差 ${round(toCm(fix.residual))}cm`)
  }
}

// —— D. 真实叠加：用**实测**的 VLM 误差（框宽 1.9–5%，框中心 1–4px/1024）+ 目录尺寸偏差 5%
// 实测来源：qwen3-vl-8b 对合成厨房图逐件问框，冰箱 5.0%/1px、灶台 1.9%/1px、水槽 3.5%/4px。
{
  const CENTER_ERR = 4 / 1024 // 实测最差的框中心偏差，占图宽的比例
  const sights = [
    project(CAM, HEADING, FRIDGE, { boxNoise: 0.050, widthScale: 1.05, centerNoise: 1 / 1024 }),
    project(CAM, HEADING, STOVE, { boxNoise: 0.019, widthScale: 0.95, centerNoise: -1 / 1024 }),
    project(CAM, HEADING, SINK, { boxNoise: 0.035, widthScale: 1.03, centerNoise: CENTER_ERR }),
  ]
  const fix = solveFix(sights, IMG_W, HFOV, { x: KITCHEN.x + KITCHEN.w / 2, y: KITCHEN.y + KITCHEN.h / 2 }, inKitchen)
  ok('真实叠加：能解出', !!fix)
  if (fix) {
    const errCm = toCm(Math.hypot(fix.x - CAM.x, fix.y - CAM.y))
    const hErr = Math.abs((((fix.heading - HEADING + 540) % 360) - 180))
    ok('真实叠加 → 位置误差 < 50cm', errCm < 50, `${round(errCm)}cm`)
    console.log(`  D 实测叠加      位置误差 ${round(errCm)}cm  朝向误差 ${round(hErr)}°  残差 ${round(toCm(fix.residual))}cm`)
  }
}

// —— D2. 若家具尺寸是实测的（用户在 UI 里量过填过），只剩 VLM 误差 → 精度下限 ——
{
  const sights = [
    project(CAM, HEADING, FRIDGE, { boxNoise: 0.050, centerNoise: 1 / 1024 }),
    project(CAM, HEADING, STOVE, { boxNoise: 0.019, centerNoise: -1 / 1024 }),
    project(CAM, HEADING, SINK, { boxNoise: 0.035, centerNoise: 4 / 1024 }),
  ]
  const fix = solveFix(sights, IMG_W, HFOV, { x: KITCHEN.x + KITCHEN.w / 2, y: KITCHEN.y + KITCHEN.h / 2 }, inKitchen)
  if (fix) {
    const errCm = toCm(Math.hypot(fix.x - CAM.x, fix.y - CAM.y))
    const hErr = Math.abs((((fix.heading - HEADING + 540) % 360) - 180))
    ok('尺寸精确时能解出', true)
    console.log(`  D2 尺寸精确     位置误差 ${round(errCm)}cm  朝向误差 ${round(hErr)}°  ← 本方法的下限`)
  }
}

// —— E. 只有一件家具：不该给答案（欠定）——
{
  const fix = solveFix([project(CAM, HEADING, FRIDGE)], IMG_W, HFOV, { x: 200, y: 200 }, inKitchen)
  ok('只有 1 件家具 → 拒绝解算（欠定）', fix === null)
}

// —— F. 斜看的家具：轮廓宽必须随视角变 ——
{
  const p = { x: 0, y: 0, w: 100, h: 40, rotation: 0 }
  near('正对看 → 轮廓宽 = w', apparentWidth(p, 0), 100, 0.01)
  near('侧对看 → 轮廓宽 = h', apparentWidth(p, 90), 40, 0.01)
  // 100×40 斜 45°：0.707·100 + 0.707·40 = 99 —— 比正对(100)略窄。
  // 只有近正方形的家具斜看才会变宽（正方形 45° = 边长·√2）。
  const at45 = apparentWidth(p, 45)
  near('长方形斜 45° → 99（略窄于正对）', at45, 99, 0.1)
  const sq = { x: 0, y: 0, w: 100, h: 100, rotation: 0 }
  near('正方形斜 45° → 边长·√2（更宽）', apparentWidth(sq, 45), 141.42, 0.1)
  ok('不算轮廓宽 → 斜看的家具距离会算错', apparentWidth(p, 90) !== apparentWidth(p, 0))
}

// —— G. 像素 ↔ 角度 自洽 ——
{
  near('画面中心 → 偏角 0', bearingOffsetDeg(IMG_W / 2, IMG_W, HFOV), 0, 0.001)
  near('画面右缘 → 偏角 = +hFov/2', bearingOffsetDeg(IMG_W, IMG_W, HFOV), HFOV / 2, 0.01)
  near('画面左缘 → 偏角 = -hFov/2', bearingOffsetDeg(0, IMG_W, HFOV), -HFOV / 2, 0.01)
  // 距离公式自洽：物体占满画面宽 → 距离 = (W/2)/tan(hFov/2)
  const d = distanceFromWidth(100, IMG_W, IMG_W, HFOV)
  near('占满画面 → 距离 = (W/2)/tan(半FOV)', d, 50 / Math.tan((HFOV * Math.PI) / 360), 0.01)
}

// —— H. 锚点尺寸:实测真值优先(定位精度上限所在) ——
{
  const { preferMeasuredDims } = await import('../src/lib/spatial/localize.js')
  // 无实测 → 原样
  const noAttrs = preferMeasuredDims({ w: 90, h: 60 }, undefined)
  ok('无实测退回 bounds', noAttrs.w === 90 && noAttrs.h === 60)
  // 有实测(英寸×3=px):32in×24in → 96×72px,bounds 被拖歪成 90×60 → 用实测
  const measured = preferMeasuredDims({ w: 90, h: 60 }, { measuredWIn: 32, measuredHIn: 24 })
  ok('实测覆盖拖改后的 bounds', measured.w === 96 && measured.h === 72)
  // 旋转 90° 后 bounds 变 60×90:实测按就近朝向交换
  const rotated = preferMeasuredDims({ w: 60, h: 90 }, { measuredWIn: 32, measuredHIn: 24 })
  ok('旋转后实测就近交换', rotated.w === 72 && rotated.h === 96)
  // 半残实测(只有 w)不用 —— 宁可退回 bounds 也不混搭
  const partial = preferMeasuredDims({ w: 90, h: 60 }, { measuredWIn: 32 })
  ok('半残实测不混搭', partial.w === 90 && partial.h === 60)
}

console.log(`\n${pass + fails.length} checks, ${fails.length} failures`)
if (fails.length) {
  for (const f of fails) console.log('FAIL ' + f)
  process.exit(1)
}
console.log('PASS 全部通过')
