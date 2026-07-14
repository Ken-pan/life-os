/**
 * 下载并规范化商户 Logo（Simple Icons 本地包 + Wikimedia Commons）。
 * 运行: node scripts/fetch-merchant-logos.mjs
 *
 * 与 fetch-institution-logos.mjs 同源：把任意 SVG 统一包成 32×32 圆角 app icon，
 * 自托管到 static/assets/merchants/，运行时不请求任何第三方（避免把「用户在哪消费」
 * 泄漏给 logo CDN）。
 *
 * 覆盖范围 = 用户消费笔数 Top 商户中能拿到官方矢量标识的那些；其余（本地餐馆等）
 * 在 UI 上回落到中性灰占位符，不在此处编造。
 *
 * 方形图标优先用「品牌符号」而非横版文字商标——28px 下 wordmark 会糊成一条。
 */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as simpleIcons from 'simple-icons'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'static/assets/merchants')
/** 远端原图缓存（gitignored）：修包装逻辑后可重跑而不再请求 Commons。 */
const CACHE = path.join(ROOT, '.logo-cache')

/**
 * brand id → 来源。id 必须与 finance-core merchantBrandKey() 的返回值一致。
 * @type {Record<string, { kind: 'simple' | 'wiki' | 'url', slug?: string, file?: string, url?: string, bg?: string }>}
 */
const SOURCES = {
  // ── Simple Icons（本地包，单色路径，按官方品牌色上色）────────────────
  target: { kind: 'simple', slug: 'target' },
  lyft: { kind: 'simple', slug: 'lyft' },
  apple: { kind: 'simple', slug: 'apple' },
  taobao: { kind: 'simple', slug: 'taobao' },
  mcdonalds: { kind: 'simple', slug: 'mcdonalds' },
  uber: { kind: 'simple', slug: 'uber' },
  wechat: { kind: 'simple', slug: 'wechat' },
  doordash: { kind: 'simple', slug: 'doordash' },
  facebook: { kind: 'simple', slug: 'facebook' },
  starbucks: { kind: 'simple', slug: 'starbucks' },
  netlify: { kind: 'simple', slug: 'netlify' },
  anthropic: { kind: 'simple', slug: 'anthropic' },
  github: { kind: 'simple', slug: 'github' },
  youtube: { kind: 'simple', slug: 'youtube' },
  airbnb: { kind: 'simple', slug: 'airbnb' },
  ikea: { kind: 'simple', slug: 'ikea' },
  paypal: { kind: 'simple', slug: 'paypal' },
  venmo: { kind: 'simple', slug: 'venmo' },
  spotify: { kind: 'simple', slug: 'spotify' },
  netflix: { kind: 'simple', slug: 'netflix' },
  notion: { kind: 'simple', slug: 'notion' },
  figma: { kind: 'simple', slug: 'figma' },
  nike: { kind: 'simple', slug: 'nike' },
  adidas: { kind: 'simple', slug: 'adidas' },
  delta: { kind: 'simple', slug: 'delta' },
  robinhood: { kind: 'simple', slug: 'robinhood' },
  chase: { kind: 'simple', slug: 'chase' },

  // ── Wikimedia Commons（全彩官方标识，保持原色）───────────────────────
  amazon: { kind: 'wiki', file: 'Amazon icon.svg' }, // 符号版，方形下可读
  'best-buy': { kind: 'wiki', file: 'Best Buy logo 2018.svg' },
  costco: { kind: 'wiki', file: 'Costco Wholesale logo 2010-10-26.svg' },
  walgreens: { kind: 'wiki', file: 'Walgreens 2020 primary logo.svg' },
  petco: { kind: 'wiki', file: 'Petco Logo.svg' },
  nordstrom: { kind: 'wiki', file: 'Nordstrom Logo 2019.svg' },
  'alaska-airlines': { kind: 'wiki', file: 'Alaska Airlines logo.svg' },
  safeway: { kind: 'wiki', file: 'Safeway logo.svg' },
  openai: { kind: 'wiki', file: 'OpenAI logo 2025 (symbol).svg' },
  lemonade: { kind: 'wiki', file: 'Logo of Lemonade, Inc.svg' },
  'jewel-osco': { kind: 'wiki', file: 'Jewel-Osco logo.svg' },
  '24-hour-fitness': { kind: 'wiki', file: '24 Hour Fitness logo.svg' },
  't-and-t': { kind: 'wiki', file: 'T&T Supermarket Logo.svg' },
  astound: { kind: 'wiki', file: "Astound Broadband's Logo.svg" },
  'seven-eleven': { kind: 'wiki', file: '7-Eleven logo 2021.svg' },
  bilt: { kind: 'wiki', file: 'Bilt Rewards logo.svg' },
  'trader-joes': { kind: 'wiki', file: 'Trader Joes Logo.svg' },
  uniqlo: { kind: 'wiki', file: 'UNIQLO logo.svg' },
  lululemon: { kind: 'wiki', file: 'Lululemon Athletica logo.svg' },
  walmart: { kind: 'wiki', file: 'Walmart logo.svg' },
  'home-depot': { kind: 'wiki', file: 'TheHomeDepot.svg' },
  cvs: { kind: 'wiki', file: 'CVS Health Logo.svg' },
  'whole-foods': { kind: 'wiki', file: 'Whole Foods Market logo.svg' },
  petsmart: { kind: 'wiki', file: 'PetSmart.svg' },

  // ── 官方 CDN ────────────────────────────────────────────────────────────
  'rocket-money': {
    kind: 'url',
    url: 'https://framerusercontent.com/images/ZOA99UIp1h5v4nfGMfga0fZ49Zg.svg',
  },
  // 无自由版权矢量标识（Commons 查无）：chipotle / supercuts / united-airlines /
  // fantuan / hungrypanda / asian-family-market —— 一律回落中性占位符，不编造。
}

const UA = 'FinanceOS-LogoFetcher/1.0 (personal finance app; self-hosted icons)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Commons throttles bursts with 429 — back off and retry rather than losing the icon. */
async function fetchText(url, label, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (res.status === 429 && attempt <= 4) {
    const wait = 3000 * attempt
    console.log(`  … ${label}: 429, retrying in ${wait / 1000}s`)
    await sleep(wait)
    return fetchText(url, label, attempt + 1)
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`)
  const text = await res.text()
  if (!/<svg/i.test(text)) throw new Error(`${label}: not SVG`)
  return text
}

const fetchWikiSvg = (filename) =>
  fetchText(
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`,
    filename,
  )

function simpleIconFor(slug) {
  const key = 'si' + slug.charAt(0).toUpperCase() + slug.slice(1)
  const icon = simpleIcons[key]
  if (!icon) throw new Error(`Simple Icons missing: ${slug}`)
  return icon // { title, hex, path, svg }
}

function parseViewBox(svg) {
  const vb = svg.match(/viewBox=["']([^"']+)["']/i)
  if (vb) return vb[1]
  const w = parseFloat(svg.match(/\bwidth=["']([\d.]+)/i)?.[1] ?? '')
  const h = parseFloat(svg.match(/\bheight=["']([\d.]+)/i)?.[1] ?? '')
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return `0 0 ${w} ${h}`
  return '0 0 24 24'
}

/** WCAG relative luminance — decides whether a brand colour survives on white. */
function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/**
 * 把任意 SVG 包成 32×32 圆角 app icon，保留 viewBox 比例。
 *
 * 关键：浏览器把 <img src="*.svg"> 当**独立 XML 文档**严格解析，任何未声明的命名
 * 空间前缀都会让整张图渲染失败（内联进 HTML 时反而宽容，会给出假阳性）。Commons /
 * Inkscape 导出的 SVG 把 xmlns:sodipodi / xmlns:rdf / xmlns:xlink 声明在根 <svg>
 * 上，而我们要换掉根标签，所以必须：① 把这些声明搬到新根上；② 顺手删掉纯元数据
 * （<metadata>/<sodipodi:namedview>/<title>/<desc>）——它们不参与渲染，却是
 * rdf/cc/dc/sodipodi 前缀的主要使用者，删掉后文件也更小。
 */
function wrapAsAppIcon(rawSvg, bg = '#ffffff') {
  const inner = rawSvg
    .replace(/<\?xml[^?]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()

  const rootTag = inner.match(/^<svg[^>]*>/i)?.[0] ?? ''
  // Carry over every xmlns:* the body may still reference (notably xlink for <use>).
  const nsDecls = [...rootTag.matchAll(/\sxmlns:([a-zA-Z0-9]+)\s*=\s*"([^"]*)"/g)]
    .map((m) => `xmlns:${m[1]}="${m[2]}"`)
    .join(' ')

  const viewBox = parseViewBox(inner)
  const content = inner
    .replace(/^<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    // namedview may carry children (<inkscape:grid/>), so strip the paired form
    // first — a lazy "up to the next />" would stop inside a child and orphan the
    // closing tag, producing invalid XML that <img> silently refuses to render.
    .replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/gi, '')
    .replace(/<sodipodi:namedview[^>]*\/>/gi, '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .trim()

  const pad = 5
  const size = 32 - pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg"${nsDecls ? ' ' + nsDecls : ''} viewBox="0 0 32 32" role="img" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="${bg}"/>
  <svg x="${pad}" y="${pad}" width="${size}" height="${size}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
    ${content}
  </svg>
</svg>`
}

/**
 * <img src="*.svg"> 是严格 XML 解析：格式不良或未声明的前缀都会静默变成破图。
 * 生成阶段就挡住，别等到 UI 上才发现。
 */
function assertRenderableAsImg(svg, id) {
  const declared = new Set([...svg.matchAll(/xmlns:([a-zA-Z0-9]+)\s*=/g)].map((m) => m[1]))
  const used = new Set([
    ...[...svg.matchAll(/<([a-zA-Z0-9]+):/g)].map((m) => m[1]),
    ...[...svg.matchAll(/\s([a-zA-Z0-9]+):[a-zA-Z-]+\s*=/g)].map((m) => m[1]),
  ])
  const undef = [...used].filter((p) => p !== 'xmlns' && !declared.has(p))
  if (undef.length) throw new Error(`undefined ns prefix: ${undef.join(',')}`)

  // Well-formedness: xmllint ships with macOS/most CI images. If it isn't there we
  // skip rather than fail the run — the prefix check above still applies.
  const tmp = path.join(CACHE, `.validate-${id}.svg`)
  try {
    fs.writeFileSync(tmp, svg)
    execFileSync('xmllint', ['--noout', tmp], { stdio: 'pipe' })
  } catch (e) {
    if (e?.code === 'ENOENT') return // no xmllint on this machine
    throw new Error(`malformed XML: ${String(e.stderr ?? e.message).split('\n')[0].slice(0, 90)}`)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  let ok = 0
  const failed = []

  fs.mkdirSync(CACHE, { recursive: true })

  for (const [id, src] of Object.entries(SOURCES)) {
    const dest = path.join(OUT, `${id}.svg`)
    const cached = path.join(CACHE, `${id}.svg`)
    try {
      let raw
      let bg = src.bg ?? '#ffffff'
      // Remote sources are cached raw, so re-wrapping (e.g. after fixing the
      // wrapper) never re-downloads. Only a missing cache entry hits the network.
      if (src.kind !== 'simple' && fs.existsSync(cached)) {
        raw = fs.readFileSync(cached, 'utf8')
      } else if (src.kind === 'simple') {
        const icon = simpleIconFor(src.slug)
        // A pale brand colour (McDonald's yellow) vanishes on white — flip to the
        // brand colour as the tile and punch the glyph out in white.
        const pale = luminance(icon.hex) > 0.6
        const fill = pale ? '#ffffff' : `#${icon.hex}`
        if (pale) bg = `#${icon.hex}`
        raw = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="${fill}" d="${icon.path}"/></svg>`
      } else if (src.kind === 'url') {
        raw = await fetchText(src.url, id)
        fs.writeFileSync(cached, raw)
      } else {
        await sleep(1500) // Commons is a shared free service — stay polite.
        raw = await fetchWikiSvg(src.file)
        fs.writeFileSync(cached, raw)
      }
      const out = wrapAsAppIcon(raw, bg)
      assertRenderableAsImg(out, id)
      fs.writeFileSync(dest, out)
      console.log(`✓ ${id.padEnd(18)} (${src.kind})`)
      ok++
    } catch (e) {
      console.warn(`✗ ${id.padEnd(18)} ${e.message}`)
      failed.push(id)
    }
  }

  // Ship the id list so the UI knows which brands have art without probing for
  // 404s at render time. Generated, not hand-maintained — it can't drift.
  const ids = fs
    .readdirSync(OUT)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.replace(/\.svg$/, ''))
    .sort()
  fs.writeFileSync(
    path.join(ROOT, 'src/lib/merchantLogoIds.js'),
    `// AUTO-GENERATED by scripts/fetch-merchant-logos.mjs — do not edit by hand.\n` +
      `/** Brand ids that have a logo asset in static/assets/merchants/. */\n` +
      `export const MERCHANT_LOGO_IDS = new Set(${JSON.stringify(ids, null, 2)})\n`,
  )
  console.log(`\nmanifest: src/lib/merchantLogoIds.js (${ids.length} ids)`)

  console.log(`\nDone: ${ok} ok, ${failed.length} failed → ${OUT}`)
  if (failed.length) console.log(`Failed (fall back to placeholder): ${failed.join(', ')}`)
}

main()
