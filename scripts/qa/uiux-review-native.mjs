/**
 * UI/UX 审核截图 — Kenos 原生壳（iOS 模拟器 + Mac 窗口）。
 *
 * 与 uiux-review.mjs（Web 端）配套：产出同样式的联系表 PNG/JPEG，并把
 * `kenos-ios` / `kenos-mac` 条目合并进画廊 manifest（标记 native:true，
 * 不参与 Web 静态治理指标）。
 *
 * 用法（repo 根）：
 *   node scripts/qa/uiux-review-native.mjs                     # ios + mac
 *   node scripts/qa/uiux-review-native.mjs --platform ios      # 仅 iOS
 *   node scripts/qa/uiux-review-native.mjs --gallery           # 额外写画廊 shots + manifest
 *   node scripts/qa/uiux-review-native.mjs --skip-build        # 复用已构建的 .app
 *
 * 依赖与降级：
 * - iOS：xcodegen + xcodebuild + 模拟器（headless，`simctl io screenshot`），无系统权限要求。
 * - Mac：`screencapture -l<windowID>` 需要「屏幕录制」权限（系统设置 → 隐私与安全性 →
 *   屏幕录制 → 勾选运行本脚本的终端）。无权限时跳过 Mac 并给出指引，不让整条管线失败。
 */
import { execSync, execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
import {
  buildContactSheetHtml,
  nativeSheetLayout,
  sheetWidth,
  pngSize,
  gitInfo,
  buildLlmsTxt,
  buildSitemap,
} from './uiux-review.mjs'
import { resolveScreenshotDir, resolveRepoRoot, writeManifest } from './screenshot-output.mjs'
import { LIFE_OS_APP_WORDMARK_ACCENT } from '../../packages/theme/src/generated/appRegistry.js'

const argv = process.argv.slice(2)
const flagValue = (/** @type {string} */ f) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const hasFlag = (/** @type {string} */ f) => argv.includes(f)

const PLATFORMS = (flagValue('--platform') ?? 'ios,mac')
  .split(',')
  .map((s) => s.trim())
  .filter((p) => p === 'ios' || p === 'mac')
const GALLERY = hasFlag('--gallery')
const SKIP_BUILD = hasFlag('--skip-build')

const REPO_ROOT = resolveRepoRoot(import.meta.url)
const APPS_DIR = join(REPO_ROOT, 'clients/apple/Apps')
const GALLERY_DIR = join(REPO_ROOT, 'apps/uiux-review-gallery/public')
const ACCENT = LIFE_OS_APP_WORDMARK_ACCENT.aios ?? { light: '#5c7cfa', dark: '#8aa3ff' }

/** 原生壳「页面」= 深链驱动的界面状态。settle 为截图前静置毫秒。 */
const NATIVE_SCREENS = Object.freeze({
  ios: [
    { link: 'kenos://today', title: '今日', path: 'kenos://today', settle: 5000 },
    { link: 'kenos://assistant', title: '问答', path: 'kenos://assistant', settle: 3500 },
    { link: 'kenos://inbox', title: '收件箱', path: 'kenos://inbox', settle: 3500 },
    { link: 'kenos://shelf', title: '空间 Shelf', path: 'kenos://shelf', settle: 2200 },
    // settings 会顺带压掉 shelf（实测）；之后回 today 复位，再截 compose。
    { link: 'kenos://settings', title: '设置', path: 'kenos://settings', settle: 2200 },
    { link: 'kenos://today', reset: true, settle: 1500 },
    { link: 'kenos://compose', title: '快速捕获', path: 'kenos://compose', settle: 2200 },
  ],
  mac: [
    { link: 'kenos://today', title: '今日', path: 'kenos://today', settle: 5000 },
    { link: 'kenos://assistant', title: '问答', path: 'kenos://assistant', settle: 3500 },
    { link: 'kenos://inbox', title: '收件箱', path: 'kenos://inbox', settle: 3500 },
    { link: 'kenos://shelf', title: 'Space Shelf', path: 'kenos://shelf', settle: 2200 },
    { link: 'kenos://settings', title: '设置', path: 'kenos://settings', settle: 2200 },
  ],
})

const NATIVE_APPS = Object.freeze({
  ios: {
    id: 'kenos-ios',
    name: 'Kenos iOS',
    description: 'Kenos 原生 iOS 壳（模拟器实截）：Dock · Space Shelf · 今日/问答/收件箱',
    theme: /** @type {'dark'} */ ('dark'), // Info.plist 强制 Dark
    viewportKey: 'ios',
    viewportLabel: 'iOS 原生壳',
  },
  mac: {
    id: 'kenos-mac',
    name: 'Kenos Mac',
    description: 'Kenos Mac Command Center（真实窗口截图）：侧栏 + 详情 · Spaces · Capture',
    theme: /** @type {'dark'} */ ('dark'),
    viewportKey: 'mac',
    viewportLabel: 'Mac 原生壳',
  },
})

const sh = (/** @type {string} */ cmd, /** @type {object} */ opts = {}) =>
  execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms))

// ── iOS（模拟器，headless）────────────────────────────────────────────────
function bootedSimUdid() {
  const out = sh('xcrun simctl list devices booted')
  const m = out.match(/iPhone[^(]*\(([0-9A-F-]{36})\)\s+\(Booted\)/)
  if (m) return m[1]
  // 没有已启动的 iPhone：boot 首选机型（阻塞到可用）。
  const list = sh('xcrun simctl list devices available')
  const pick = list.match(/iPhone 1[6-9][^(]*\(([0-9A-F-]{36})\)/)
  if (!pick) throw new Error('未找到可用 iPhone 模拟器')
  console.log('  启动模拟器…')
  sh(`xcrun simctl boot ${pick[1]}`)
  sh(`xcrun simctl bootstatus ${pick[1]} -b`, { stdio: 'ignore' })
  return pick[1]
}

function buildIOSApp() {
  const derived = join(APPS_DIR, 'build-sim-gallery')
  const app = join(derived, 'Build/Products/Debug-iphonesimulator/KenosIOS.app')
  if (SKIP_BUILD && existsSync(app)) return app
  const origin = localDailyBetaOrigin()
  console.log(`  构建 KenosIOS（模拟器，Daily Beta origin ${origin}）…`)
  sh('xcodegen generate', { cwd: APPS_DIR })
  // 与真机同款 mDNS 形态。别烘 https 生产站（会被当 LAN 主机重组）、
  // 也别烘 127.0.0.1（OriginResolver 判 invalid → iOS 自动翻到生产登录墙）。
  sh(
    `xcodebuild -project Kenos.xcodeproj -scheme KenosIOS -destination 'generic/platform=iOS Simulator' -derivedDataPath build-sim-gallery KENOS_DAILY_BETA_ORIGIN=${origin} build`,
    { cwd: APPS_DIR, stdio: 'ignore' },
  )
  if (!existsSync(app)) throw new Error(`iOS 构建产物缺失: ${app}`)
  return app
}

/**
 * 模拟器壳默认落到本机 kenos-ctl 静态服务（127.0.0.1:5219）。不重建的话它是
 * 上一次 release 的陈旧 bundle —— 截图会展示早已修掉的问题。采集前强制
 * build + restart，让画廊呈现当前代码的 Daily Beta dogfood 面。
 */
function rebuildDailyBetaOrigin() {
  if (hasFlag('--skip-ctl-build')) return
  const ctl = join(REPO_ROOT, 'scripts/kenos-daily-beta/kenos-ctl.sh')
  if (!existsSync(ctl)) return
  console.log('  重建本地 Daily Beta（kenos-ctl build + restart）…')
  sh(`bash "${ctl}" build`, { stdio: 'ignore' })
  // 绑全接口：模拟器经 <LocalHostName>.local 访问（回环 origin 会被 OriginResolver 判 invalid）。
  sh(`KENOS_STATIC_BIND=0.0.0.0 bash "${ctl}" restart`, { stdio: 'ignore' })
}

/** Mac 的 mDNS 主机名 origin —— 与真机 Daily Beta 同款、OriginResolver 认可的形态。 */
function localDailyBetaOrigin() {
  const host = sh('scutil --get LocalHostName').trim()
  if (!host) throw new Error('scutil LocalHostName 为空 — 无法构造 Daily Beta origin')
  return `http://${host}.local:5219`
}

async function captureIOS() {
  const udid = bootedSimUdid()
  const app = buildIOSApp()
  rebuildDailyBetaOrigin()
  // 先卸载：清掉 WKWebView/SW 缓存与残留登录态，保证抓的是干净首启状态。
  sh(`xcrun simctl uninstall ${udid} space.kenos.app.ios 2>/dev/null || true`)
  sh(`xcrun simctl install ${udid} "${app}"`)
  // 卸载清不掉 cfprefsd 层的 defaults（曾被 userOrigin 残留劫持到生产登录墙）——显式清域。
  sh(`xcrun simctl spawn ${udid} defaults delete space.kenos.app.ios 2>/dev/null || true`)
  sh(`xcrun simctl terminate ${udid} space.kenos.app.ios 2>/dev/null || true`)
  sh(`xcrun simctl launch ${udid} space.kenos.app.ios`)
  await sleep(4000)

  const cells = []
  const tmp = join(tmpdir(), `kenos-uiux-ios-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  for (const spec of NATIVE_SCREENS.ios) {
    sh(`xcrun simctl openurl ${udid} "${spec.link}"`)
    await sleep(spec.settle)
    if (spec.reset) continue
    const file = join(tmp, `${cells.length}.png`)
    try {
      sh(`xcrun simctl io ${udid} screenshot "${file}"`)
      const buffer = readFileSync(file)
      const size = pngSize(buffer)
      cells.push({ title: spec.title, path: spec.path, buffer, w: size.w, h: size.h })
      process.stdout.write('·')
    } catch (err) {
      cells.push({ title: spec.title, path: spec.path, note: String(err), w: 4, h: 8 })
      process.stdout.write('✗')
    }
  }
  process.stdout.write('\n')
  sh(`xcrun simctl terminate ${udid} space.kenos.app.ios 2>/dev/null || true`)
  rmSync(tmp, { recursive: true, force: true })
  return cells
}

// ── Mac（真实窗口；需要屏幕录制权限）──────────────────────────────────────
function macScreenPermissionOk() {
  const probe = join(tmpdir(), `kenos-uiux-mac-probe-${Date.now()}.png`)
  try {
    execFileSync('screencapture', ['-x', probe], { stdio: 'ignore' })
    const ok = existsSync(probe)
    rmSync(probe, { force: true })
    return ok
  } catch {
    return false
  }
}

function buildMacApp() {
  const derived = join(APPS_DIR, 'build-mac-ux')
  const app = join(derived, 'Build/Products/Debug/KenosMac.app')
  if (SKIP_BUILD && existsSync(app)) return app
  console.log('  构建 KenosMac…')
  sh('xcodegen generate', { cwd: APPS_DIR })
  sh(
    `xcodebuild -project Kenos.xcodeproj -scheme KenosMac -destination 'platform=macOS' -derivedDataPath build-mac-ux build`,
    { cwd: APPS_DIR, stdio: 'ignore' },
  )
  if (!existsSync(app)) throw new Error(`Mac 构建产物缺失: ${app}`)
  return app
}

/** CGWindowList 找 Kenos 主窗口 id（Swift 一行式，无权限要求——bounds/owner 可读）。 */
function macKenosWindowId() {
  const swift = `
import CoreGraphics
import Foundation
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list {
  let owner = (w[kCGWindowOwnerName as String] as? String) ?? ""
  guard owner == "KenosMac" || owner == "Kenos" else { continue }
  let bounds = (w[kCGWindowBounds as String] as? [String: Any]) ?? [:]
  let width = (bounds["Width"] as? Double) ?? 0
  guard width > 400 else { continue } // 跳过菜单栏 status item 等小窗
  if let id = w[kCGWindowNumber as String] as? Int { print(id); break }
}
`
  const file = join(tmpdir(), `kenos-winid-${Date.now()}.swift`)
  writeFileSync(file, swift)
  try {
    const out = execFileSync('swift', [file], { encoding: 'utf8', timeout: 60_000 }).trim()
    return out ? Number(out) : null
  } catch {
    return null
  } finally {
    rmSync(file, { force: true })
  }
}

async function captureMac() {
  if (!macScreenPermissionOk()) {
    console.warn(
      '⚠ Mac 截图跳过：当前终端没有「屏幕录制」权限。\n' +
        '  系统设置 → 隐私与安全性 → 屏幕录制 → 勾选你的终端，然后重跑：\n' +
        '  node scripts/qa/uiux-review-native.mjs --platform mac --gallery --skip-build',
    )
    return null
  }
  const app = buildMacApp()
  spawn('open', ['-n', app], { stdio: 'ignore', detached: true })
  await sleep(6000)
  const winId = macKenosWindowId()
  if (!winId) {
    console.warn('⚠ Mac 截图跳过：未找到 Kenos 窗口（app 未启动或被最小化）。')
    return null
  }
  const cells = []
  const tmp = join(tmpdir(), `kenos-uiux-mac-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  for (const spec of NATIVE_SCREENS.mac) {
    sh(`open -g "${spec.link}"`)
    await sleep(spec.settle)
    if (spec.reset) continue
    const file = join(tmp, `${cells.length}.png`)
    try {
      execFileSync('screencapture', ['-x', '-o', `-l${winId}`, file], { stdio: 'ignore' })
      const buffer = readFileSync(file)
      const size = pngSize(buffer)
      cells.push({ title: spec.title, path: spec.path, buffer, w: size.w, h: size.h })
      process.stdout.write('·')
    } catch (err) {
      cells.push({ title: spec.title, path: spec.path, note: String(err), w: 4, h: 3 })
      process.stdout.write('✗')
    }
  }
  process.stdout.write('\n')
  sh(`osascript -e 'tell application "KenosMac" to quit' 2>/dev/null || true`)
  rmSync(tmp, { recursive: true, force: true })
  return cells
}

// ── 合成 + 画廊合并 ───────────────────────────────────────────────────────
/**
 * @param {import('playwright').Browser} browser
 * @param {'ios'|'mac'} platform
 * @param {{ title?: string, path?: string, buffer?: Buffer, note?: string, w: number, h: number }[]} cells
 */
async function composeSheet(browser, platform, cells) {
  const meta = NATIVE_APPS[platform]
  const git = gitInfo()
  const layout = nativeSheetLayout(platform)
  const html = buildContactSheetHtml({
    app: { name: meta.name, accent: ACCENT },
    theme: meta.theme,
    viewportLabel: meta.viewportLabel,
    git,
    layout,
    cells: cells.map((c) => ({
      title: c.title ?? '',
      path: c.path ?? '',
      dataUri: c.buffer ? `data:image/png;base64,${c.buffer.toString('base64')}` : undefined,
      note: c.note,
      w: c.w,
      h: c.h,
    })),
  })
  const ctx = await browser.newContext({
    viewport: { width: sheetWidth(layout), height: 1000 },
    colorScheme: meta.theme,
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(200)

  const { dir } = resolveScreenshotDir({
    app: meta.id,
    suite: 'uiux-review',
    importMetaUrl: import.meta.url,
  })
  const fileName = `${meta.id}-uiux-review-${meta.theme}-${meta.viewportKey}.png`
  await page.screenshot({ path: join(dir, fileName), fullPage: true })

  /** @type {object | null} */
  let galleryEntry = null
  if (GALLERY) {
    const shotsDir = join(GALLERY_DIR, 'shots')
    mkdirSync(shotsDir, { recursive: true })
    const jpgName = `${meta.id}-${meta.theme}-${meta.viewportKey}.jpg`
    await page.screenshot({
      path: join(shotsDir, jpgName),
      fullPage: true,
      type: 'jpeg',
      quality: 90,
    })
    const ok = cells.filter((c) => c.buffer).length
    galleryEntry = {
      id: meta.id,
      native: true,
      name: meta.name,
      description: meta.description,
      pages: cells.map((c) => ({ path: c.path ?? '', title: c.title ?? '' })),
      file: `shots/${jpgName}`,
      generatedAt: new Date().toISOString(),
      screens: cells.length,
      theme: meta.theme,
      viewport: meta.viewportKey,
      git,
      capture: { ok, total: cells.length },
    }
  }

  writeManifest(dir, {
    app: meta.id,
    name: meta.name,
    theme: meta.theme,
    viewport: meta.viewportKey,
    git: gitInfo(),
    composite: fileName,
    pages: cells.map((c) => ({
      title: c.title ?? '',
      path: c.path ?? '',
      captured: Boolean(c.buffer),
      ...(c.note ? { note: c.note } : {}),
    })),
  })
  await ctx.close()
  const ok = cells.filter((c) => c.buffer).length
  console.log(`✓ ${meta.name} → docs/ui-qa-screenshots/${meta.id}/uiux-review/latest/${fileName} (${ok}/${cells.length} 屏)`)
  return galleryEntry
}

/** 把原生条目合并进画廊 manifest（保留 Web 条目与治理数据；重生成 llms.txt / sitemap）。 */
function mergeGalleryManifest(/** @type {object[]} */ entries) {
  if (!entries.length) return
  const manifestPath = join(GALLERY_DIR, 'manifest.json')
  /** @type {any} */
  let manifest = { schemaVersion: 1, apps: [] }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    /* 首次 */
  }
  const apps = new Map((manifest.apps ?? []).map((/** @type {any} */ a) => [a.id, a]))
  for (const e of entries) {
    const app = apps.get(e.id) ?? { id: e.id, variants: {} }
    app.native = true
    app.name = e.name
    app.description = e.description
    app.screens = e.screens
    app.pages = e.pages
    app.git = e.git
    app.variants = app.variants ?? {}
    app.variants[`${e.theme}-${e.viewport}`] = {
      file: e.file,
      generatedAt: e.generatedAt,
      screens: e.screens,
      capture: e.capture,
    }
    app.metrics = { coverage: { ok: e.capture.ok, total: e.capture.total, pct: e.capture.total ? Math.round((100 * e.capture.ok) / e.capture.total) : null } }
    apps.set(e.id, app)
  }
  // Web 条目保持原顺序，原生条目排最后。
  const webApps = [...apps.values()].filter((a) => !a.native)
  const nativeApps = [...apps.values()].filter((a) => a.native)
  manifest.apps = [...webApps, ...nativeApps]
  manifest.count = manifest.apps.length
  manifest.viewports = ['desktop', 'ios', 'mac']
  mkdirSync(GALLERY_DIR, { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  if (manifest.site) {
    writeFileSync(join(GALLERY_DIR, 'llms.txt'), buildLlmsTxt(manifest))
    writeFileSync(join(GALLERY_DIR, 'sitemap.xml'), buildSitemap(manifest))
  }
  console.log(`画廊 manifest 已合并原生条目: ${entries.map((e) => e.id).join(', ')}`)
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`原生壳 UI/UX 审核: ${PLATFORMS.join(', ')}`)
  const browser = await chromium.launch()
  const entries = []
  try {
    if (PLATFORMS.includes('ios')) {
      console.log('· iOS（模拟器）')
      const cells = await captureIOS()
      const entry = await composeSheet(browser, 'ios', cells)
      if (entry) entries.push(entry)
    }
    if (PLATFORMS.includes('mac')) {
      console.log('· Mac（真实窗口）')
      const cells = await captureMac()
      if (cells) {
        const entry = await composeSheet(browser, 'mac', cells)
        if (entry) entries.push(entry)
      }
    }
  } finally {
    await browser.close()
  }
  if (GALLERY) mergeGalleryManifest(entries)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
