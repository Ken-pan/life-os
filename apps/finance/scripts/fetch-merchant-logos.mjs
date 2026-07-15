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

  // ── 扩展批次：Simple Icons（离线、无限流，未命中的商户不会请求它们）──────
  instacart: { kind: 'simple', slug: 'instacart' },
  ebay: { kind: 'simple', slug: 'ebay' },
  etsy: { kind: 'simple', slug: 'etsy' },
  aliexpress: { kind: 'simple', slug: 'aliexpress' },
  lidl: { kind: 'simple', slug: 'lidl' },
  macys: { kind: 'simple', slug: 'macys' },
  zara: { kind: 'simple', slug: 'zara' },
  hm: { kind: 'simple', slug: 'handm' },
  'burger-king': { kind: 'simple', slug: 'burgerking' },
  'taco-bell': { kind: 'simple', slug: 'tacobell' },
  kfc: { kind: 'simple', slug: 'kfc' },
  'the-north-face': { kind: 'simple', slug: 'thenorthface' },
  'new-balance': { kind: 'simple', slug: 'newbalance' },
  puma: { kind: 'simple', slug: 'puma' },
  'under-armour': { kind: 'simple', slug: 'underarmour' },
  reebok: { kind: 'simple', slug: 'reebok' },
  'american-airlines': { kind: 'simple', slug: 'americanairlines' },
  southwest: { kind: 'simple', slug: 'southwestairlines' },
  jetblue: { kind: 'simple', slug: 'jetblue' },
  hilton: { kind: 'simple', slug: 'hilton' },
  marriott: { kind: 'simple', slug: 'marriott' },
  expedia: { kind: 'simple', slug: 'expedia' },
  booking: { kind: 'simple', slug: 'bookingdotcom' },
  tripadvisor: { kind: 'simple', slug: 'tripadvisor' },
  sony: { kind: 'simple', slug: 'sony' },
  samsung: { kind: 'simple', slug: 'samsung' },
  dell: { kind: 'simple', slug: 'dell' },
  playstation: { kind: 'simple', slug: 'playstation' },
  steam: { kind: 'simple', slug: 'steam' },
  tesla: { kind: 'simple', slug: 'tesla' },
  shell: { kind: 'simple', slug: 'shell' },
  audible: { kind: 'simple', slug: 'audible' },
  twitch: { kind: 'simple', slug: 'twitch' },
  discord: { kind: 'simple', slug: 'discord' },
  reddit: { kind: 'simple', slug: 'reddit' },
  zoom: { kind: 'simple', slug: 'zoom' },
  dropbox: { kind: 'simple', slug: 'dropbox' },
  duolingo: { kind: 'simple', slug: 'duolingo' },
  coursera: { kind: 'simple', slug: 'coursera' },
  patreon: { kind: 'simple', slug: 'patreon' },
  substack: { kind: 'simple', slug: 'substack' },
  strava: { kind: 'simple', slug: 'strava' },
  peloton: { kind: 'simple', slug: 'peloton' },
  fitbit: { kind: 'simple', slug: 'fitbit' },
  garmin: { kind: 'simple', slug: 'garmin' },
  cashapp: { kind: 'simple', slug: 'cashapp' },
  stripe: { kind: 'simple', slug: 'stripe' },
  coinbase: { kind: 'simple', slug: 'coinbase' },
  amex: { kind: 'simple', slug: 'americanexpress' },
  discover: { kind: 'simple', slug: 'discover' },
  verizon: { kind: 'simple', slug: 'verizon' },
  att: { kind: 'simple', slug: 'atandt' },
  spectrum: { kind: 'simple', slug: 'spectrum' },
  perplexity: { kind: 'simple', slug: 'perplexity' },
  vercel: { kind: 'simple', slug: 'vercel' },
  supabase: { kind: 'simple', slug: 'supabase' },
  cloudflare: { kind: 'simple', slug: 'cloudflare' },
  namecheap: { kind: 'simple', slug: 'namecheap' },
  shopify: { kind: 'simple', slug: 'shopify' },
  obsidian: { kind: 'simple', slug: 'obsidian' },
  todoist: { kind: 'simple', slug: 'todoist' },
  mta: { kind: 'simple', slug: 'mta' },
  // 第三轮：账本里已有规则、之前缺图的
  cursor: { kind: 'simple', slug: 'cursor' },
  godaddy: { kind: 'simple', slug: 'godaddy' },
  google: { kind: 'simple', slug: 'google' },
  'uber-eats': { kind: 'simple', slug: 'ubereats' },

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
  // 扩展批次：文件名逐个用 Commons 搜索核过，不猜。
  sephora: { kind: 'wiki', file: 'Sephora logo.svg' },
  dominos: { kind: 'wiki', file: "Domino's pizza logo.svg" },
  chewy: { kind: 'wiki', file: 'Chewy pet food logo.svg' },
  tjmaxx: { kind: 'wiki', file: 'TJ Maxx Logo.svg' },
  'five-guys': { kind: 'wiki', file: 'Five Guys logo.svg' },
  'shake-shack': { kind: 'wiki', file: 'Shake Shack logo.svg' },
  kiehls: { kind: 'wiki', file: "Kiehl's SVG logo.svg" },
  daiso: { kind: 'wiki', file: 'ダイソー.svg' },
  'h-mart': { kind: 'wiki', file: 'H Mart logo.svg' },
  panera: { kind: 'wiki', file: 'Panera Bread wordmark.svg' },

  // ── 官方 CDN ────────────────────────────────────────────────────────────
  'rocket-money': {
    kind: 'url',
    url: 'https://framerusercontent.com/images/ZOA99UIp1h5v4nfGMfga0fZ49Zg.svg',
  },
  // 官方方形 app icon（PNG）：这两家没有自由版权矢量标识，但自己发布了规范的
  // 方形图标，而它们分别是账本里第 8 / 第 28 高频商户，值得单独处理。
  fantuan: { kind: 'png', url: 'https://www.fantuan.ca/icons/icon-192x192.png' },
  chipotle: {
    kind: 'png',
    url: 'https://www.chipotle.com/etc.clientlibs/cmgaemacs/clientlibs/clientlib-base/resources/apple-touch-icon-180x180.png',
  },
  'paris-baguette': {
    kind: 'png',
    url: 'https://parisbaguette.com/wp-content/uploads/2024/04/cropped-paris-baguette-favicon-192x192.png',
  },
  // 只有 32px，在 28px 显示位上够用（视网膜下略软），但确实是官方「99」花环标识。
  '99-ranch': { kind: 'png', url: 'https://www.99ranch.com/apple-touch-icon.png' },
  // 查过但**不采用**：
  // - westin：官网 favicon 是灰方块+黄条，根本不是标识
  // - hungrypanda(43 笔)：官网那张是地图针 map-icon-y.png
  // - king-county-metro：Commons 只有 RapidRide（旗下另一品牌）
  // - mod-pizza：Commons 的 "Mod Logo.svg" 来路不明
  // - rei / qfc / arcteryx / dicks / panda-express / supercuts：均无可用官方方形图
  // 放错 logo 比留占位符更糟，宁缺毋滥。
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

async function fetchBinary(url, label) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Wrap a brand's official square app icon (PNG) as a full-bleed rounded tile.
 *
 * Used only where no free vector mark exists but the brand publishes a proper
 * square icon (Fantuan, Chipotle). Unlike wrapAsAppIcon these are NOT padded onto a
 * white card — the icon already carries its own background, so it fills the tile and
 * is clipped to the same 8px radius. Inlined as a data: URI so the file stays a
 * single self-contained .svg (an <img>-loaded SVG may not fetch external refs).
 */
function wrapPngAsAppIcon(buf, id) {
  const b64 = buf.toString('base64')
  const clip = `clip-${id.replace(/[^a-z0-9]/gi, '')}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-hidden="true">
  <defs><clipPath id="${clip}"><rect width="32" height="32" rx="8"/></clipPath></defs>
  <image width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" href="data:image/png;base64,${b64}"/>
</svg>`
}

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

/** WCAG contrast ratio between two hex colours (1 = identical, 21 = black/white). */
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const NEAR_BLACK = '#101010'

/**
 * Pick tile + glyph colours for a single-colour Simple Icons mark.
 *
 * Always keep the glyph in the brand colour and move the *tile* instead — that way
 * the brand stays recognisable (you know Spotify by green, McDonald's by yellow)
 * and contrast is never at risk:
 *  - light brand colour (McDonald's #FBC817, Shell #FFD500, Robinhood #CCFF00, and
 *    Sony which is literally #FFFFFF) → it vanishes on white, so use a near-black
 *    tile. This is the standard dark app-icon treatment.
 *  - everything else → white tile, brand glyph (the brands' own on-white usage).
 *
 * An earlier version flipped pale marks to a *white glyph on the brand tile*, which
 * produced 1.5:1 mud for the yellows and an entirely invisible white-on-white Sony.
 */
function tileColorsFor(hex) {
  const brand = `#${hex}`
  if (luminance(hex) > 0.6) return { bg: NEAR_BLACK, fill: brand }
  return { bg: '#ffffff', fill: brand }
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
        const { bg: tile, fill } = tileColorsFor(icon.hex)
        bg = tile
        // Guard against an *invisible* logo, not merely a low-contrast one: plenty
        // of brands legitimately sit near-tonal on white (Spotify/Supabase green
        // land ~1.9:1) and are recognised by shape. Only near-identical colours,
        // like the old white-on-white Sony at 1.0:1, are a real defect.
        const ratio = contrast(fill.slice(1), tile.slice(1))
        if (ratio < 1.3) {
          throw new Error(
            `glyph/tile contrast ${ratio.toFixed(2)} (${fill} on ${tile})`,
          )
        }
        raw = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="${fill}" d="${icon.path}"/></svg>`
      } else if (src.kind === 'png') {
        // Cache the raw PNG (base64 in a sidecar) so re-wraps stay offline too.
        let buf
        if (fs.existsSync(cached + '.png')) {
          buf = fs.readFileSync(cached + '.png')
        } else {
          buf = await fetchBinary(src.url, id)
          fs.writeFileSync(cached + '.png', buf)
        }
        const out = wrapPngAsAppIcon(buf, id)
        assertRenderableAsImg(out, id)
        fs.writeFileSync(dest, out)
        console.log(`✓ ${id.padEnd(18)} (${src.kind})`)
        ok++
        continue
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
