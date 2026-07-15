/**
 * 家具真实主色 → 平面图可用的填充色。
 *
 * 颜色哪来的：iOS HomeScan 抓拍每件家具时顺手聚类了一个主色(见
 * Services/ObjectShotCapture.swift 的 dominantColorHex),一路写进
 * `attrs.colorHex`。这里只负责把它驯化成图纸能用的样子。
 *
 * 为什么不直接填原色 —— 平面图首先得看得懂。原色直填有两个死法:
 *   1. 深色家具(黑电视柜、深棕沙发)变成大块暗斑,压过墙体,上面的标签也读不了;
 *   2. 高饱和的沙发/地毯会把视线从户型本身拽走,图纸变效果图。
 * 所以驯化两步:先夹住饱和度与明度,再把结果**混进主题的家具底色**。
 *
 * 混色用 CSS color-mix 而不是在 JS 里算死,是因为平面图有浅色纸/深色纸两套
 * (见 app.css:`--plan-furn` 在 :root、[data-theme=dark]、.plan-shell 下各不同),
 * 而 SVG 是一次性生成的字符串。交给 color-mix 就地混,一份产物两套主题都对;
 * 算死颜色会让深色纸下的家具全变亮斑。
 */

/** 混入比例 —— 真实色占几成。太低看不出是自家沙发,太高就压过图纸了。 */
const MIX_PCT = 45

/** 饱和度上限:留得住"什么色系",留不住刺眼。 */
const MAX_SAT = 0.5

/**
 * 填充的明度夹取区间。
 *
 * 下限 0.5 不是随手定的:家具上面压着标签(--plan-text-soft,明度约 0.3)。
 * 底色再暗下去,"沙发"两个字就读不出来了 —— 那还不如不上色。
 * 上限 0.9 同理,再亮就融进图纸(--plan-paper #eef1f4)里没了。
 *
 * 代价是明度被压窄:黑电视柜和白柜的差别变小,只靠色相区分。这是"淡染色"
 * 自愿付的价 —— 平面图首先得看得懂。
 */
const MIN_LIGHT = 0.5
const MAX_LIGHT = 0.9

/**
 * 描边的明度。**固定值,不跟随填充** —— 这正是它存在的意义。
 *
 * 描边原本写死成中灰 (--plan-furn-stroke #8a929c,明度约 0.58)。填充是主题底色
 * 时没问题,但一旦染上深色家具的颜色,填充和描边撞进同一个明度带,灶眼、面板、
 * 抽屉线全部消失 —— 上了色反而把信息画没了。所以描边改为跟着这件家具自己的
 * 色相走、但明度压到 0.32:与 0.5 起步的填充始终拉开一档,深棕沙发就得到
 * 浅棕的面 + 深棕的边。
 */
const STROKE_LIGHT = 0.32
const STROKE_MIX_PCT = 55

/**
 * #RGB / #RRGGBB → {r,g,b} 0..1,认不出返回 null。
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number } | null}
 */
function parseHex(hex) {
  if (typeof hex !== 'string') return null
  const s = hex.trim().replace(/^#/, '')
  const full = s.length === 3 ? s.replace(/./g, (c) => c + c) : s
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  }
}

/** @returns {{ h: number, s: number, l: number }} h 0..360,s/l 0..1 */
function rgbToHsl({ r, g, b }) {
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

/** @param {{ h: number, s: number, l: number }} hsl */
function hslToHex({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = l - c / 2
  const to255 = (v) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to255(r1)}${to255(g1)}${to255(b1)}`
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * 驯化后的真实色(还没混主题底色)。导出给测试与"颜色是否可用"的判断,
 * 渲染请用 {@link furnitureFill}。
 * @param {string | undefined} colorHex
 * @returns {string | null} #RRGGBB,或 null = 这件家具没有可用的颜色
 */
export function tamedColor(colorHex) {
  const rgb = parseHex(colorHex ?? '')
  if (!rgb) return null
  const hsl = rgbToHsl(rgb)
  return hslToHex({
    h: hsl.h,
    s: clamp(hsl.s, 0, MAX_SAT),
    l: clamp(hsl.l, MIN_LIGHT, MAX_LIGHT),
  })
}

/**
 * 这件家具在平面图上该用的填充色。
 *
 * 返回的是 color-mix 表达式而非定色 —— 见文件头:一份 SVG 要在两套纸色下都对。
 * 没颜色(手摆的家具、旧扫描)返回 null,调用方回落到主题底色,视觉上与改动前一致。
 *
 * @param {string | undefined} colorHex `attrs.colorHex`
 * @returns {string | null} 可直接写进 SVG fill 的值
 */
export function furnitureFill(colorHex) {
  const tamed = tamedColor(colorHex)
  if (!tamed) return null
  return `color-mix(in srgb, ${tamed} ${MIX_PCT}%, var(--plan-furn, #c5ced8))`
}

/**
 * 配套的描边色 —— 同色相、压暗,保证内部细节在染色的面上仍读得出来。见
 * {@link STROKE_LIGHT}。同样混进主题的描边色,这样深色纸下也不会翻车。
 * @param {string | undefined} colorHex
 * @returns {string | null}
 */
export function furnitureStroke(colorHex) {
  const rgb = parseHex(colorHex ?? '')
  if (!rgb) return null
  const hsl = rgbToHsl(rgb)
  const ink = hslToHex({ h: hsl.h, s: clamp(hsl.s, 0, MAX_SAT), l: STROKE_LIGHT })
  return `color-mix(in srgb, ${ink} ${STROKE_MIX_PCT}%, var(--plan-furn-stroke, #8a929c))`
}

/**
 * 这件家具的配色,给调用方直接塞进 style。
 *
 * 走的是 **CSS 自定义属性** 而不是直接写 fill/stroke —— 这不是风格问题。内联
 * 的 fill 会盖过 .placement-clash(压在别的家具上时标红)和 .placement-on
 * (选中高亮)这些类规则,让警告态被家具颜色吃掉。自定义属性只是给类规则喂值,
 * 类规则照常按层叠顺序覆盖,选中和冲突态一个都不丢。
 *
 * @param {string | undefined} colorHex `attrs.colorHex`
 * @returns {string} style 属性的值;没颜色时为空串(调用方回落主题底色)
 */
export function furnitureVars(colorHex) {
  const fill = furnitureFill(colorHex)
  if (!fill) return ''
  return `--furn-fill:${fill};--furn-stroke:${furnitureStroke(colorHex)}`
}
