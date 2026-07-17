import assert from 'node:assert/strict'
import {
  isTrustworthyScan,
  resolveFurnitureColor,
} from '../src/lib/spatial/floor-materials.js'
import { tamedColor } from '../src/lib/spatial/furniture-tint.js'

// 贴图模式家具定色:把「一刀切忽略扫描」改成「软兜底 symbol 才让位可信淡中性扫描」。
// 锁住三头:该救回的白/浅要救回;该压住的红/黑不能翻;硬身份(白柜/银架/瓷洁具)不受影响。
// scan 值取自真实 scan-ce72b155(localStorage homeos_spatial_v1)。

/** @returns {{h:number,s:number,l:number}} 与 furniture-tint 同款 HSL,便于断言色类 */
function hslOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return { h, s, l }
}

// resolveFurnitureColor 的原始产物会被 render-svg 过一遍 trusted 驯化(furnitureVars(hex,true))。
// 「渲染出来是什么色类」得看驯化后的结果。
const rendered = (kind, symbol, scanHex) => {
  const raw = resolveFurnitureColor(kind, symbol, scanHex)
  return raw == null ? null : tamedColor(raw, { minLight: 0.32, maxLight: 0.93 })
}
// 带 colorConfidence 的版本(第 6 节用)
const rendered2 = (kind, symbol, scanHex, conf) => {
  const raw = resolveFurnitureColor(kind, symbol, scanHex, conf)
  return raw == null ? null : tamedColor(raw, { minLight: 0.32, maxLight: 0.93 })
}
const isWhitish = (hex) => hslOf(hex).l >= 0.8 && hslOf(hex).s <= 0.12
const isDark = (hex) => hslOf(hex).l <= 0.4
// 「木色」= WOOD_MED(#c79d70,饱和度 ≈0.44)那一档暖色;门槛压到 0.28 才算,
// 免得把 #D7CBBC 这种饱和度只 0.25 的暖近白也误判成木色。
const isWoody = (hex) => {
  const { h, s, l } = hslOf(hex)
  return h >= 20 && h <= 55 && s >= 0.28 && l >= 0.45 && l <= 0.8
}
const WOOD_MED = tamedColor('#c79d70', { minLight: 0.32, maxLight: 0.93 }) // SYMBOL_HEX.table/shelf

// ——————————————————————————————————————————————————————————
// 1. isTrustworthyScan:淡中性可信,高饱和/发黑不可信
// ——————————————————————————————————————————————————————————
assert.equal(isTrustworthyScan('#FFFFFF'), true, '纯白:浴室三层随手架真实色,可信')
assert.equal(isTrustworthyScan('#D7CBBC'), true, '暖近白:电视边小架真实色,可信')
assert.equal(isTrustworthyScan('#928372'), true, '浅木暖中性:升降边桌真实色,可信')
assert.equal(isTrustworthyScan('#95806C'), true, '主办公椅暖灰:可信')
assert.equal(isTrustworthyScan('#D8CFC3'), true, '副办公椅浅灰:可信')

assert.equal(isTrustworthyScan('#330000'), false, '暗红鸟笼:高饱和 + 发黑,不可信')
assert.equal(isTrustworthyScan('#3A2E24'), false, 'espresso 折叠桌:发黑,不可信')
assert.equal(isTrustworthyScan('#c79d70'), false, '真木 WOOD_MED:饱和度 0.44,不算淡中性')
assert.equal(isTrustworthyScan('#7A1FA2'), false, '紫罩布:高饱和,不可信')
for (const bad of ['', '#12', null, undefined, 42, {}]) {
  assert.equal(isTrustworthyScan(bad), false, `${JSON.stringify(bad)} 无色 → 不可信`)
}

// ——————————————————————————————————————————————————————————
// 2. 回归红线 A:该压住的不能翻(硬锁 kind + 发黑回落材质色)
// ——————————————————————————————————————————————————————————
{
  const out = rendered('bird_cage', undefined, '#330000') // 扫描暗红,硬锁白笼
  assert.ok(isWhitish(out), `鸟笼应渲染成白,得到 ${out}`)
  assert.ok(hslOf(out).s <= 0.12, `鸟笼不能带红(饱和度 ${hslOf(out).s.toFixed(2)})`)
}
{
  const out = rendered('table', 'table', '#3A2E24') // 折叠长桌:espresso 扫描发黑 → 不信 → 木
  assert.ok(!isDark(out), `折叠长桌不能是 espresso 深棕,得到 ${out}`)
  assert.equal(out, WOOD_MED, '折叠长桌回落 WOOD_MED,不采信 espresso')
}
// 工作桌:kind=desk/standing_desk 硬锁炭黑,连淡中性扫描(灯光反光洗白)也不许翻。
assert.ok(isDark(rendered('standing_desk', 'table', '#FFFFFF')), '升降工作桌硬锁炭黑,扫描发白也不翻')
assert.ok(isDark(rendered('desk', 'table', undefined)), '书桌无扫描也炭黑')
assert.ok(isDark(rendered('tv', 'cabinet', undefined)), '电视黑屏,不落 cabinet 白')

// ——————————————————————————————————————————————————————————
// 3. 回归红线 B:硬身份 symbol 不采信扫描(白柜/银架/瓷洁具「不受影响」)
// ——————————————————————————————————————————————————————————
// 即便扫描是可信的淡中性暖灰,cabinet / wireRack / 洁具也保持策展材质色。
assert.equal(
  resolveFurnitureColor('cabinet', 'cabinet', '#DBD6CA'),
  resolveFurnitureColor('cabinet', 'cabinet', undefined),
  '白柜:暖灰扫描不采信,保持 WHITE_CABINET(不发灰)',
)
assert.equal(
  resolveFurnitureColor('wire_rack', 'wireRack', '#D7D1C6'),
  resolveFurnitureColor('wire_rack', 'wireRack', undefined),
  '银架:暖扫描不采信,保持 METAL_CHROME(不发黄)',
)
assert.equal(
  resolveFurnitureColor('toilet', 'toilet', '#BFB4A4'),
  resolveFurnitureColor('toilet', 'toilet', undefined),
  '马桶:暖灰扫描不采信,保持 PORCELAIN 瓷白',
)
// 银架保持冷银:确认它是冷调(蓝相),没被扫描的暖调带跑
{
  const rack = rendered('wire_rack', 'wireRack', '#D7D1C6')
  assert.ok(hslOf(rack).h >= 180 && hslOf(rack).h <= 260, `银架应保持冷银蓝相,得到 ${rack}`)
}

// ——————————————————————————————————————————————————————————
// 4. 该救回的白/浅:软兜底 symbol + 可信淡中性扫描 → 用扫描
// ——————————————————————————————————————————————————————————
{
  const out = rendered('shelf', 'shelf', '#FFFFFF') // 浴室三层随手架
  assert.ok(isWhitish(out), `浴室层架该白,得到 ${out}`)
  assert.ok(!isWoody(out), `浴室层架不该木色,得到 ${out}`)
}
{
  const out = rendered('shelf', 'shelf', '#D7CBBC') // 电视边小架
  assert.ok(hslOf(out).l >= 0.75, `电视边小架该近白,明度 ${hslOf(out).l.toFixed(2)}`)
  assert.ok(!isWoody(out), `电视边小架不该木色,得到 ${out}`)
  assert.notEqual(out, WOOD_MED, '电视边小架不再一刀切木色')
}
{
  const out = rendered('table', 'table', '#928372') // 升降边桌
  assert.notEqual(out, WOOD_MED, '升降边桌用自己的扫描色,而非一刀切木色')
  assert.ok(hslOf(out).s < 0.28, `升降边桌该是低饱和中性,得到 ${out}`)
}

// ——————————————————————————————————————————————————————————
// 5. 兜底不变 & 同款多件分色
// ——————————————————————————————————————————————————————————
assert.ok(isWoody(rendered('shelf', 'shelf', undefined)), '无扫描 shelf 仍浅木默认(书架/木架不受影响)')
assert.ok(isWoody(rendered('shelf', 'shelf', '#3A2E24')), 'shelf 遇发黑扫描回落浅木,不采信')
assert.equal(resolveFurnitureColor('mystery_thing', undefined, undefined), undefined, '无类型色手绘件 → undefined 兜底')
// 同款办公椅:两把各带可信扫描 → 各用自己的色,主浅副深自然分开
{
  const main = rendered('office_chair', 'officeChair', '#D8CFC3') // 主/副哪把浅取决于数据,这里取两支不同扫描
  const sub = rendered('office_chair', 'officeChair', '#95806C')
  assert.ok(Math.abs(hslOf(main).l - hslOf(sub).l) >= 0.15, `两把办公椅该分色:${main} vs ${sub}`)
  assert.notEqual(main, sub, '同款办公椅不再同色')
}

// ——————————————————————————————————————————————————————————
// 6. colorConfidence 闸(iOS 设备侧抓色置信度,加法式;区分「可信的白」与「猜的罩布色」)
// ——————————————————————————————————————————————————————————
// 色本身淡中性,但设备置信度低(罩布/反光把物体搅花)→ 不采信。
assert.equal(isTrustworthyScan('#FFFFFF', 0.9), true, '纯白 + 高置信:采信')
assert.equal(isTrustworthyScan('#FFFFFF', 0.3), false, '纯白但低置信(疑似罩布/反光):不采信')
assert.equal(isTrustworthyScan('#FFFFFF', 0.5), true, '恰好 0.5 阈值:采信')
assert.equal(isTrustworthyScan('#FFFFFF'), true, '无置信字段(老扫描):按纯色相判断,向后兼容')
assert.equal(isTrustworthyScan('#FFFFFF', undefined), true, 'undefined 置信:同老扫描,不设闸')
// 发黑色 + 高置信:仍不可信(置信度不能救高饱和/发黑)
assert.equal(isTrustworthyScan('#330000', 0.99), false, '暗红即便高置信也不可信(色相闸先拦)')

// 落到 resolveFurnitureColor:软兜底 shelf + 纯白扫描,低置信 → 不采信 → 回落浅木默认
assert.equal(
  resolveFurnitureColor('shelf', 'shelf', '#FFFFFF', 0.3),
  resolveFurnitureColor('shelf', 'shelf', undefined),
  '低置信的白层架扫描 → 回落 shelf 默认(不把罩布反光的假白当真白)',
)
// 高置信的白层架照旧救回
assert.ok(
  isWhitish(rendered2('shelf', 'shelf', '#FFFFFF', 0.9)),
  '高置信白层架:仍救回白',
)

// colorSpreadE 闸(网页派生的多视角色离散度 ΔE76;>12 = 光线不稳,色别当真)
assert.equal(isTrustworthyScan('#FFFFFF', undefined, 5), true, '纯白 + 低离散(色稳):采信')
assert.equal(isTrustworthyScan('#FFFFFF', undefined, 20), false, '纯白但高离散(跨视角色乱跳):不采信')
assert.equal(isTrustworthyScan('#FFFFFF', 0.9, 20), false, '置信高但离散高:任一道判不可信即不可信')
assert.equal(isTrustworthyScan('#FFFFFF', undefined, undefined), true, '两信号都缺:退回纯色相,向后兼容')

console.log('furniture-color-unit: ok')
