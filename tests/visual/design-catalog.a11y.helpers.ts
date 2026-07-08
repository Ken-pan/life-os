import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** WCAG 2.1 — large / UI text & components (AA). */
export const WCAG_AA_UI = 3
/** WCAG 2.1 — normal body text (AA). */
export const WCAG_AA_TEXT = 4.5
/** Apple HIG / MD3 primary touch target. */
export const MIN_TOUCH_PX = 44

type Rgb = { r: number; g: number; b: number }

export function parseRgb(color: string): Rgb | null {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return null
  return { r: +m[1], g: +m[2], b: +m[3] }
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

export function contrastRatio(fg: string, bg: string) {
  const f = parseRgb(fg)
  const b = parseRgb(bg)
  if (!f || !b) return 0
  const l1 = luminance(f)
  const l2 = luminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export async function readPairContrast(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      color: s.color,
      backgroundColor: s.backgroundColor,
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
