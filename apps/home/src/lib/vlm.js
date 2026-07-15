/**
 * 本机 local-ai VLM —— 读一张实拍照片，回答三件事：
 *
 * 1. **在哪个分区** —— 室内罗盘给不了位置，EXIF 也给不了；这是 VLM 唯一能补的洞。
 * 2. **画面正中是哪件固定设施** —— 这是定位的锚点。它在平面图上的坐标是已知的
 *    （`fixtures[]`），所以「朝向 = 机位 → 该设施的方向」，**完全绕开室内罗盘**
 *    （罗盘受钢结构/家电磁铁干扰，偏 20–40° 常见）。
 *
 *    ⚠️ **只认 `fixtures[]`（灶台/水槽/马桶这类装死的），绝不用 `placements[]`**。
 *    后者是用户随手摆的家具 —— 沙发挪一下，所有以它为基准的机位就全错，而且**静默错**：
 *    平面图上看不出任何异常，你也不会知道该重算。
 * 3. **这块地方是什么状态** —— 整洁/杂乱/堆满/空 + 一句话 + 看到的东西。
 *
 * 走 /upstream/vlm（vite dev 代理 → 127.0.0.1:18888）而非硬编码地址：网关只绑
 * 本机回环，手机连局域网上的 dev server 时也能经代理用上。生产静态站没有这个
 * 路径，probeVlm() 会失败，调用方据此隐藏入口。
 */

const ENDPOINT = '/upstream/vlm/v1/chat/completions'
const MODELS_URL = '/upstream/vlm/v1/models'

/** 首选 8B：认房间够用，比 32B 快得多，也不会把 32B 顶进内存。 */
const MODEL = 'qwen3-vl-8b'

/** 状态取值，跟提示词里的枚举一致 —— 自由文本没法聚合。 */
export const ROOM_STATES = /** @type {const} */ ([
  '整洁',
  '一般',
  '杂乱',
  '堆满',
  '空置',
])

/** @type {boolean | null} */
let available = null

/**
 * 探活（结果缓存）。生产环境 404 → false。
 *
 * 不止看网关活着，还要确认 MODEL 真的在清单里 —— 否则按钮会亮着，
 * 点下去 describeScene 静默返回 null，用户只看到「认不出」，查不到是模型没装。
 * @returns {Promise<boolean>}
 */
export async function probeVlm() {
  if (available !== null) return available
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 2500)
    const res = await fetch(MODELS_URL, { signal: ctl.signal })
    clearTimeout(t)
    if (!res.ok) {
      available = false
      return available
    }
    const data = await res.json()
    available = (data?.data ?? []).some((m) => m?.id === MODEL)
  } catch {
    available = false
  }
  return available
}

/** @param {Blob} blob */
function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

/**
 * @typedef {object} SceneZone
 * @property {string} id
 * @property {string} nameZh
 * @property {{ id: string, label: string }[]} anchors 该分区内的**固定物**（带 id，供锚点回指）
 *
 * ⚠️ 只能放 `fixtures[]`（灶台/水槽/马桶/冰箱这类钉死在户型里的），
 * **不能放 `placements[]`** —— 那是用户随手摆的家具，沙发今天挪一下，
 * 所有以它为基准的机位就全错了，而且是静默错：平面图上看不出任何异常。
 */

/**
 * @typedef {object} SceneResult
 * @property {string | null} zoneId
 * @property {number} confidence
 * @property {string | null} anchorId 画面正中那件**固定物**的 fixture id
 * @property {number} anchorConfidence
 * @property {string} state ROOM_STATES 之一
 * @property {string} summary 一句话
 * @property {string[]} items 看到的东西
 * @property {string} reason
 */

/**
 * 一次调用拿齐：分区 + 画面中心锚点 + 状态。
 *
 * 关键约束：**只让它从给定清单里选 id、并各自给 confidence**，不让它自由发挥 ——
 * 自由生成的名字没法跟 zones/fixtures 对上，等于白算。
 *
 * @param {Blob} photo
 * @param {SceneZone[]} zones
 * @returns {Promise<SceneResult | null>}
 */
export async function describeScene(photo, zones) {
  if (!zones.length) return null
  if (!(await probeVlm())) return null

  const menu = zones
    .map((z, i) => {
      const f = z.anchors.length
        ? z.anchors.map((p, j) => `${i + 1}.${j + 1} ${p.label}`).join('、')
        : '（无固定设施）'
      return `${i + 1}. ${z.nameZh}\n   固定设施：${f}`
    })
    .join('\n')

  const dataUrl = await toDataUrl(photo)

  const body = {
    model: MODEL,
    max_tokens: 400,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          {
            type: 'text',
            text:
              `这是一张住宅室内实拍照片。房子的分区与**固定设施**（灶台/水槽/马桶这类装死的）如下：\n${menu}\n\n` +
              `回答四件事：\n` +
              `1. 照片拍的是哪个分区（只能选列表里的序号，认不出填 0）\n` +
              `2. 画面**正中央**最显著的那件**固定设施**是列表里的哪一件（填 "序号.子序号"，` +
              `如 "2.1"；画面中央不是列表里的固定设施、或看不清，填 null）\n` +
              `3. 这块地方的状态，只能从这五个里选一个：整洁 / 一般 / 杂乱 / 堆满 / 空置\n` +
              `4. 看到的主要物品（最多 6 个词）\n\n` +
              `只输出 JSON，不要解释、不要代码块：\n` +
              `{"zone": <序号，认不出填 0>, "zoneConfidence": <0-1>, ` +
              `"anchor": "<序号.子序号 或 null>", "anchorConfidence": <0-1>, ` +
              `"state": "<五选一>", "summary": "<不超过20字>", ` +
              `"items": ["..."], "reason": "<不超过15字>"}`,
          },
        ],
      },
    ],
  }

  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 90000)
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return null
    const data = await res.json()
    const parsed = parseJsonLoose(data?.choices?.[0]?.message?.content ?? '')
    if (!parsed) return null
    return normalizeScene(parsed, zones)
  } catch {
    return null
  }
}

/**
 * 把模型的原始输出收敛成可信的结构 —— 越界的序号一律当「认不出」，不硬凑。
 * @param {any} raw
 * @param {SceneZone[]} zones
 * @returns {SceneResult}
 */
function normalizeScene(raw, zones) {
  const zi = Number(raw.zone)
  const zone = Number.isFinite(zi) && zi >= 1 && zi <= zones.length ? zones[zi - 1] : null

  /** @type {string | null} */
  let anchorId = null
  if (zone && typeof raw.anchor === 'string') {
    const m = /^(\d+)\.(\d+)$/.exec(raw.anchor.trim())
    if (m) {
      const z = zones[Number(m[1]) - 1]
      const p = z?.anchors[Number(m[2]) - 1]
      // 锚点必须落在它自己判定的那个分区里，否则自相矛盾 —— 宁可丢掉。
      if (z && p && z.id === zone.id) anchorId = p.id
    }
  }

  const state = ROOM_STATES.includes(raw.state) ? raw.state : '一般'

  return {
    zoneId: zone?.id ?? null,
    confidence: clamp01(raw.zoneConfidence),
    anchorId,
    anchorConfidence: clamp01(raw.anchorConfidence),
    state,
    summary: String(raw.summary ?? '').slice(0, 40),
    items: Array.isArray(raw.items)
      ? raw.items.map((s) => String(s).slice(0, 12)).slice(0, 6)
      : [],
    reason: String(raw.reason ?? '').slice(0, 40),
  }
}

function clamp01(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}

/**
 * 逐件问出**固定设施**在画面里的边界框 —— 三边定位的输入。
 *
 * ⚠️ 必须一件一问。实测让它「一次返回所有物体的 JSON 数组」会被截断、格式崩坏；
 * 逐件问稳定且快（qwen3-vl-8b 约 700ms/件）。
 *
 * 坐标：Qwen 系列输出 **0–1000 归一化**，本函数换回「占图宽/高的比例」，
 * 调用方乘以自己的像素宽即可，不必关心模型内部分辨率。
 *
 * 实测精度（合成厨房图）：框中心 1–4px/1024（**方位角几乎无损**），
 * 框宽 1.9–5%（**距离误差的主要来源**）。
 *
 * @param {Blob} photo
 * @param {{ id: string, label: string }[]} targets
 * @returns {Promise<Map<string, { cx: number, w: number }>>} id → 中心/宽度（0–1 比例）
 */
export async function locateObjects(photo, targets) {
  /** @type {Map<string, { cx: number, w: number }>} */
  const found = new Map()
  if (!targets.length || !(await probeVlm())) return found
  const dataUrl = await toDataUrl(photo)

  for (const t of targets) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 30000)
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 120,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: dataUrl } },
                {
                  type: 'text',
                  text: `输出图中「${t.label}」的边界框。看不到就输出 {"bbox_2d":null}。只输出 JSON：{"bbox_2d":[x1,y1,x2,y2]}`,
                },
              ],
            },
          ],
        }),
        signal: ctl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const data = await res.json()
      const txt = data?.choices?.[0]?.message?.content ?? ''
      const m = /\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/.exec(txt)
      if (!m) continue
      const x1 = Number(m[1]) / 1000
      const x2 = Number(m[3]) / 1000
      const w = x2 - x1
      // 退化框（零宽或反了）没有意义，丢掉 —— 宁可少一件也不能喂垃圾给解算。
      if (!(w > 0.01) || x1 < 0 || x2 > 1.001) continue
      found.set(t.id, { cx: (x1 + x2) / 2, w })
    } catch {
      /* 单件失败不影响其余 */
    }
  }
  return found
}

/**
 * @typedef {object} FurnitureLook
 * @property {string | null} colorHex 主色 #RRGGBB
 * @property {string | null} colorZh 颜色的人话（深棕/米白…，≤6 字）
 * @property {string | null} material 材质（布艺/皮革/实木/金属/塑料…，≤6 字）
 * @property {string | null} styleZh 款式一句话（≤14 字）
 * @property {number} confidence
 */

/**
 * 读**家具特写**（iOS 扫描自动抓拍的裁剪图），回答外观三件事：
 * 颜色、材质、款式。设备端 k-means 主色会被墙面/阴影污染，VLM 认的
 * 「这件家具本身」更准 —— 有 VLM 就让它覆盖。
 * 支持多视角证据包：传数组时最多取 3 张不同方位一起看 ——
 * 一张照片看不出 L 形沙发的另一侧、分不清材质还是反光。
 * @param {Blob | Blob[]} photos 单张或多视角照片
 * @param {string} label 家具名（给模型上下文，如「L形沙发」）
 * @returns {Promise<FurnitureLook | null>}
 */
export async function describeFurniture(photos, label) {
  if (!(await probeVlm())) return null
  const list = (Array.isArray(photos) ? photos : [photos]).filter(Boolean).slice(0, 3)
  if (!list.length) return null
  const dataUrls = await Promise.all(list.map(toDataUrl))
  const multi = dataUrls.length > 1
  const body = {
    model: MODEL,
    max_tokens: 200,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          ...dataUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
          {
            type: 'text',
            text:
              (multi
                ? `这 ${dataUrls.length} 张照片是**同一件家具（${label}）**从不同方位拍的，画面可能带少量背景。综合所有角度，`
                : `这是从住宅扫描里裁出的一件家具（${label}）的照片，画面可能带少量背景。`) +
              `只看这件家具本身，回答：\n` +
              `1. 主色（十六进制 #RRGGBB，取家具主体面料/板材的颜色，别取阴影或背景）\n` +
              `2. 颜色的人话（如 深棕/米白/浅灰，不超过 6 字）\n` +
              `3. 材质（布艺/皮革/实木/板材/金属/塑料/藤编 之一，认不出填 null）\n` +
              `4. 款式一句话（不超过 12 字，如「三人位直排布艺沙发」）\n\n` +
              `只输出 JSON，不要解释、不要代码块：\n` +
              `{"colorHex": "#RRGGBB", "colorZh": "...", "material": "...", ` +
              `"styleZh": "...", "confidence": <0-1>}`,
          },
        ],
      },
    ],
  }
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 60000)
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return null
    const data = await res.json()
    const raw = parseJsonLoose(data?.choices?.[0]?.message?.content ?? '')
    if (!raw) return null
    const hex = /^#[0-9a-fA-F]{6}$/.test(String(raw.colorHex ?? ''))
      ? String(raw.colorHex).toUpperCase()
      : null
    const trim = (v, n) => {
      const s = String(v ?? '').trim()
      return s && s !== 'null' ? s.slice(0, n) : null
    }
    return {
      colorHex: hex,
      colorZh: trim(raw.colorZh, 6),
      material: trim(raw.material, 6),
      styleZh: trim(raw.styleZh, 14),
      confidence: clamp01(raw.confidence),
    }
  } catch {
    return null
  }
}

/** 模型偶尔会裹 ```json 或前后带话，容错抠出第一个 JSON 对象。 */
function parseJsonLoose(text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}
