import assert from 'node:assert/strict'
import {
  furnitureFill,
  furnitureStroke,
  furnitureVars,
  tamedColor,
} from '../src/lib/spatial/furniture-tint.js'

// —— 认色 ——
assert.equal(tamedColor('#808080'), '#808080', '中性灰原样通过')
assert.equal(tamedColor('808080'), '#808080', '不带 # 也认')
assert.equal(tamedColor('#888'), tamedColor('#888888'), '三位简写等价于展开')

// 认不出的一律 null —— 不能猜,猜错就是给家具编了个颜色。
for (const bad of ['', '#12', '#12345', 'rebeccapurple', '#gggggg', null, undefined, 42, {}]) {
  assert.equal(tamedColor(bad), null, `${JSON.stringify(bad)} 不该被当成颜色`)
  assert.equal(furnitureFill(bad), null, `${JSON.stringify(bad)} 不该产出填充色`)
  assert.equal(furnitureStroke(bad), null, `${JSON.stringify(bad)} 不该产出描边色`)
  // 空串 = 不写 style,回落主题底色,与上色前视觉一致。
  assert.equal(furnitureVars(bad), '', `${JSON.stringify(bad)} 不该产出 style`)
}

/** @returns {{h:number,s:number,l:number}} */
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

// 夹取在浮点里做,产物是 8 位色 —— 往返必然有一格的取整误差,容差按此。
const Q = 1 / 255

// —— 驯化:夹住饱和度与明度,但别动色相 ——
// 色相是唯一的信息量("这是棕沙发还是白柜"),夹掉它这个功能就没意义了。
for (const [name, hex] of [
  ['正红', '#ff0000'],
  ['荧光绿', '#00ff00'],
  ['纯黑', '#000000'],
  ['纯白', '#ffffff'],
  ['深棕沙发', '#4a2c17'],
  ['米白柜', '#f2ede4'],
]) {
  const out = tamedColor(hex)
  const hsl = hslOf(out)
  assert.ok(hsl.s <= 0.5 + Q, `${name}: 饱和度没夹住 (${hsl.s})`)
  assert.ok(hsl.l >= 0.5 - Q, `${name}: 太暗,压在上面的标签会读不出来 (${hsl.l})`)
  assert.ok(hsl.l <= 0.9 + Q, `${name}: 太亮,家具会消失在纸上 (${hsl.l})`)

  // 描边必须比填充**明显**暗 —— 这条是整个描边跟色方案存在的理由:
  // 写死中灰的描边压在染过色的深色家具上会消失,灶眼、抽屉线一起没。
  const ink = hslOf(/** @type {string} */ (furnitureStroke(hex).match(/#[0-9a-f]{6}/)[0]))
  assert.ok(
    hsl.l - ink.l >= 0.15,
    `${name}: 描边(${ink.l.toFixed(2)})与填充(${hsl.l.toFixed(2)})拉不开,细节会糊掉`,
  )
}

// 纯黑/纯白是无彩色,夹明度后仍应是灰 —— 不能凭空长出色相。
for (const hex of ['#000000', '#ffffff']) {
  assert.equal(hslOf(tamedColor(hex)).s, 0, `${hex}: 无彩色不该被染上色`)
}

// 色相必须活下来:正红夹完还得是红的。
assert.ok(Math.abs(hslOf(tamedColor('#ff0000')).h) < 1, '红色的色相被改掉了')
assert.ok(Math.abs(hslOf(tamedColor('#00ff00')).h - 120) < 1, '绿色的色相被改掉了')

// 明度的相对关系要留住 —— 深色家具画出来就该比浅色家具深,
// 不然「真实颜色」只剩色相,一屋子东西全一个亮度。
assert.ok(
  hslOf(tamedColor('#2b1a0f')).l < hslOf(tamedColor('#f2ede4')).l,
  '深棕沙发应比米白柜暗',
)

// —— 产出:必须是 color-mix 表达式,不是定色 ——
// 平面图有浅色纸/深色纸两套(app.css 的 --plan-furn),而 SVG 只生成一次。
// 算死颜色会让深色纸下的家具全变亮斑,所以这里锁死交给 CSS 就地混。
const fill = furnitureFill('#7A8CA3')
assert.match(fill, /^color-mix\(in srgb, #[0-9a-f]{6} \d+%, var\(--plan-furn, #c5ced8\)\)$/, fill)
assert.ok(fill.includes('var(--plan-furn'), '必须混进主题底色,否则深色纸下会翻车')
assert.ok(
  furnitureStroke('#7A8CA3').includes('var(--plan-furn-stroke'),
  '描边同样要混进主题描边色',
)

// —— style 产出:只能是自定义属性 ——
// 直接写 fill/stroke 会盖过 .placement-clash(标红)与 .placement-on(选中),
// 让家具颜色吃掉警告态。自定义属性只喂值,类规则照常按层叠覆盖。
const vars = furnitureVars('#7A8CA3')
assert.ok(vars.startsWith('--furn-fill:'), vars)
assert.ok(vars.includes('--furn-stroke:'), vars)
assert.ok(
  !/(^|;)\s*(fill|stroke)\s*:/.test(vars),
  'style 里不许出现裸 fill/stroke —— 会压掉选中态和冲突标红',
)

console.log('furniture-tint-unit: ok')
