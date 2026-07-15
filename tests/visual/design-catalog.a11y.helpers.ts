import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** WCAG 2.1 — large / UI text & components (AA). */
export const WCAG_AA_UI = 3
/** WCAG 2.1 — normal body text (AA). */
export const WCAG_AA_TEXT = 4.5
/** Apple HIG / MD3 primary touch target. */
export const MIN_TOUCH_PX = 44

type Rgb = { r: number; g: number; b: number }
type Rgba = Rgb & { a: number }

/**
 * 解析 computed color。必须同时认两种语法：
 *  - `rgb(r, g, b)` / `rgba(r, g, b, a)`
 *  - `color(srgb r g b / a)` —— 现代浏览器对 `color-mix()` 的返回格式；theme 里
 *    `.btn-danger` 一类的 tint 底色就是 color-mix 出来的。
 * 旧实现只认 rgb()，遇到 color(srgb …) 直接返回 null → contrastRatio 返回 0 →
 * 报成「contrast 0.00:1」的假失败（2026-07-14 CI 红的真因之一）。
 */
export function parseColor(color: string): Rgba | null {
  const c = color.trim()
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  const rgb = c.match(
    /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?/,
  )
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: parseAlpha(rgb[4]) }

  // color(srgb 0.72 0.21 0.31 / 0.08) —— 分量是 0–1
  const srgb = c.match(
    /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?/,
  )
  if (srgb) {
    return {
      r: +srgb[1] * 255,
      g: +srgb[2] * 255,
      b: +srgb[3] * 255,
      a: parseAlpha(srgb[4]),
    }
  }
  return null
}

function parseAlpha(raw: string | undefined) {
  if (raw == null) return 1
  return raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
}

/** 源色按 alpha 合成到背景色之上（both 需已为不透明或先行合成）。 */
export function compositeOver(src: Rgba, backdrop: Rgb): Rgb {
  const a = Math.min(Math.max(src.a, 0), 1)
  return {
    r: src.r * a + backdrop.r * (1 - a),
    g: src.g * a + backdrop.g * (1 - a),
    b: src.b * a + backdrop.b * (1 - a),
  }
}

/** @deprecated 用 parseColor；保留以免外部引用断裂。 */
export function parseRgb(color: string): Rgb | null {
  const c = parseColor(color)
  return c && { r: c.r, g: c.g, b: c.b }
}

function channelLuminance(c: number) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance({ r, g, b }: Rgb) {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  )
}

/**
 * WCAG 对比度。bg 若带 alpha，会先合成到白底（保守兜底）——正常路径上
 * `readPairContrast` 已把 bg 合成成不透明，这里只是防御。fg 带 alpha 时合成到 bg 之上。
 */
export function contrastRatio(fg: string, bg: string) {
  const f = parseColor(fg)
  const b = parseColor(bg)
  if (!f || !b) return 0
  const bgSolid = b.a >= 1 ? b : compositeOver(b, { r: 255, g: 255, b: 255 })
  const fgSolid = f.a >= 1 ? f : compositeOver(f, bgSolid)
  const l1 = luminance(fgSolid)
  const l2 = luminance(bgSolid)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 读前景色 + **有效背景色**。
 *
 * 元素自身的 background 可能是半透明 tint（例：`.btn-danger` 是 8% 红 color-mix），
 * 直接拿 computed backgroundColor 去算对比度是错的 —— 必须沿祖先链向上合成，
 * 直到遇到不透明底色，才是用户真正看到的背景。
 */
export async function readPairContrast(locator: Locator) {
  return locator.evaluate((el) => {
    // 页面内独立实现一份解析/合成（evaluate 无法闭包引用 Node 侧函数）
    const parse = (color: string) => {
      const c = color.trim()
      if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
      const alpha = (raw?: string) =>
        raw == null ? 1 : raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
      const rgb = c.match(
        /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?/,
      )
      if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: alpha(rgb[4]) }
      const srgb = c.match(
        /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?/,
      )
      if (srgb)
        return {
          r: +srgb[1] * 255,
          g: +srgb[2] * 255,
          b: +srgb[3] * 255,
          a: alpha(srgb[4]),
        }
      return null
    }

    // 自底向上收集背景层，直到某层不透明为止
    const layers: Array<{ r: number; g: number; b: number; a: number }> = []
    let node: Element | null = el
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a >= 1) break
      }
      node = node.parentElement
    }
    // 没找到不透明底 → 兜底用画布底色（body/html），再不行按白
    if (!layers.length || layers[layers.length - 1].a < 1) {
      const canvas =
        parse(getComputedStyle(document.body).backgroundColor) ??
        { r: 255, g: 255, b: 255, a: 1 }
      layers.push(canvas.a >= 1 ? canvas : { r: 255, g: 255, b: 255, a: 1 })
    }

    // 从最底层往上合成
    let acc = layers[layers.length - 1]
    for (let i = layers.length - 2; i >= 0; i--) {
      const src = layers[i]
      acc = {
        r: src.r * src.a + acc.r * (1 - src.a),
        g: src.g * src.a + acc.g * (1 - src.a),
        b: src.b * src.a + acc.b * (1 - src.a),
        a: 1,
      }
    }

    return {
      color: getComputedStyle(el).color,
      backgroundColor: `rgb(${Math.round(acc.r)}, ${Math.round(acc.g)}, ${Math.round(acc.b)})`,
    }
  })
}

export function assertContrast(
  label: string,
  fg: string,
  bg: string,
  min: number,
) {
  const ratio = contrastRatio(fg, bg)
  expect(
    ratio,
    `${label}: contrast ${ratio.toFixed(2)}:1 (fg=${fg}, bg=${bg})`,
  ).toBeGreaterThanOrEqual(min)
}

export async function assertMinTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox()
  expect(box, `${label}: missing bounding box`).not.toBeNull()
  expect(box!.width, `${label}: width ${box!.width}px`).toBeGreaterThanOrEqual(
    MIN_TOUCH_PX,
  )
  expect(
    box!.height,
    `${label}: height ${box!.height}px`,
  ).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
}

export async function assertFocusRing(locator: Locator, label: string) {
  await locator.focus()
  const ring = await locator.evaluate((el) => {
    const s = getComputedStyle(el)
    const shadow = s.boxShadow
    const hasShadow =
      shadow !== 'none' && shadow !== '' && !/^0px 0px 0px 0px/.test(shadow)
    const outlineW = parseFloat(s.outlineWidth || '0')
    const hasOutline = s.outlineStyle !== 'none' && outlineW >= 2
    return { boxShadow: shadow, hasShadow, hasOutline, outlineWidth: outlineW }
  })
  expect(
    ring.hasShadow || ring.hasOutline,
    `${label}: focus ring (shadow=${ring.boxShadow}, outline=${ring.outlineWidth}px)`,
  ).toBeTruthy()
}

export function catalogDetailUrl(
  showcase: string,
  app: string,
  mode: string,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    showcase,
    app,
    mode,
    viewport: 'desktop',
    ...extra,
  })
  return `/?${params.toString()}`
}

export async function gotoCatalog(
  page: Page,
  showcase: string,
  app: string,
  mode: string,
) {
  await page.goto(catalogDetailUrl(showcase, app, mode), {
    waitUntil: 'domcontentloaded',
  })
  await page.evaluate(() => document.fonts.ready)
  await page.getByTestId(`showcase-${showcase}`).waitFor({ state: 'visible' })
}

/** Parses "0.01ms", "260ms", etc. Returns ms number. */
export function parseDurationMs(raw: string) {
  if (!raw || raw === 'none') return 0
  const first = raw.split(',')[0]?.trim() ?? raw
  if (first.endsWith('ms')) return parseFloat(first)
  if (first.endsWith('s')) return parseFloat(first) * 1000
  return parseFloat(first) || 0
}

export async function assertReducedMotion(page: Page, selector: string) {
  const ms = await page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      transition: s.transitionDuration,
      animation: s.animationDuration,
    }
  })
  expect(parseDurationMs(ms.transition)).toBeLessThanOrEqual(1)
  expect(parseDurationMs(ms.animation)).toBeLessThanOrEqual(1)
}
