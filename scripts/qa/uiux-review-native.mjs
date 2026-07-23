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

/**
 * 原生画廊条目 —— 像 Web 端一样「一个条目 = 一张卡」：Kenos 壳一张，
 * 每个可达 Domain（Daily Beta 伴侣）各一张。screens 的 link 为深链，
 * settle 为截图前静置毫秒；leave 在条目截完后发送（退出 Domain 复位）。
 *
 * 全部 Domain 走 kenos-ctl 本地伴侣；空库域用「私网显式 ?demo=1」通道灌演示数据
 * （见各 app demoMode 的 isPrivateLanExplicitDemo —— 真机不带参数永不激活）。
 */
function nativeEntries(/** @type {'ios'|'mac'} */ platform) {
  const V = platform
  const L = platform === 'ios' ? 'iOS' : 'Mac'
  const shellSettle = platform === 'mac' ? 4500 : 3500
  return [
    {
      id: `kenos-${V}`,
      name: `Kenos ${L}`,
      accentId: 'aios',
      description:
        platform === 'ios'
          ? 'Kenos 原生 iOS 壳（模拟器实截）：Dock · Shelf · 今日/问答/收件箱 + Korben 壳 V2 预览'
          : 'Kenos Mac Command Center（真实窗口截图）：侧栏 + 详情 · Spaces · Capture',
      screens: [
        { link: 'kenos://today', title: '今日', path: 'kenos://today', settle: 5000 },
        { link: 'kenos://assistant', title: '问答', path: 'kenos://assistant', settle: shellSettle },
        { link: 'kenos://inbox', title: '收件箱', path: 'kenos://inbox', settle: shellSettle },
        { link: 'kenos://shelf', title: '空间 Shelf', path: 'kenos://shelf', settle: 2200 },
        // settings 会顺带压掉 shelf（实测）；之后回 today 复位,再截 compose。
        { link: 'kenos://settings', title: '设置', path: 'kenos://settings', settle: 2200 },
        { link: 'kenos://today', reset: true, settle: 1500 },
        ...(platform === 'ios'
          ? [
              { link: 'kenos://compose', title: '快速捕获', path: 'kenos://compose', settle: 2200 },
              // compose 的 web 弹窗会残留到下一屏 —— 回 today 复位再截 continue。
              { link: 'kenos://today', reset: true, settle: 1800 },
              { link: 'kenos://continue', title: '继续', path: 'kenos://continue', settle: 2200 },
              // ── Korben Shell V2 预览(feature flag 重启;截完回旧壳)──
              { link: 'relaunch:-korbenShellV2 -kenosDevMode', reset: true, settle: 7000 },
              { link: 'kenos://today', title: 'Korben 壳 · 今日', path: 'kenos://today', settle: 4000 },
              {
                link: 'kenos://domain/plan?path=%2F%3Fdemo%3D1',
                title: 'Korben 壳 · 计划域',
                path: 'kenos://domain/plan',
                settle: 7000,
              },
              // 回旧壳 —— 仍带 -kenosDevMode 保持 HealthKit sheet 被抑制。
              { link: 'relaunch:-kenosDevMode', reset: true, settle: 6000 },
            ]
          : []),
      ],
    },
    {
      id: `plan-${V}`,
      name: `计划 · ${L}`,
      accentId: 'planner',
      description: `Planner 在 Kenos ${L} Domain 模式（Daily Beta 伴侣实截）：任务 · 日历`,
      screens: [
        { link: 'kenos://domain/plan?path=%2F%3Fdemo%3D1', title: '任务', path: 'kenos://domain/plan', settle: 7000 },
        { link: 'kenos://domain/plan?path=/calendar', title: '日历', path: 'kenos://domain/plan?path=/calendar', settle: 4000 },
      ],
      leave: 'kenos://return',
    },
    {
      id: `training-${V}`,
      name: `训练 · ${L}`,
      accentId: 'fitness',
      description: `Fitness 在 Kenos ${L} Domain 模式（Daily Beta 伴侣实截）：今日训练 · 计划 · 资源库`,
      screens: [
        { link: 'kenos://domain/training', title: '今日训练', path: 'kenos://domain/training', settle: 7000 },
        { link: 'kenos://domain/training?path=/program', title: '训练计划', path: 'kenos://domain/training?path=/program', settle: 4000 },
        { link: 'kenos://domain/training?path=/discover', title: '资源库', path: 'kenos://domain/training?path=/discover', settle: 4000 },
      ],
      leave: 'kenos://return',
    },
    {
      id: `music-${V}`,
      name: `音乐 · ${L}`,
      accentId: 'music',
      description: `Music 在 Kenos ${L} Domain 模式（Daily Beta 伴侣实截）：播放 · 音乐库`,
      screens: [
        { link: 'kenos://domain/music?path=%2F%3Fdemo%3D1', title: '播放', path: 'kenos://domain/music', settle: 7000 },
        { link: 'kenos://domain/music?path=/library', title: '音乐库', path: 'kenos://domain/music?path=/library', settle: 4000 },
      ],
      leave: 'kenos://return',
    },
    {
      id: `money-${V}`,
      name: `财务 · ${L}`,
      accentId: 'finance',
      description: `Finance 在 Kenos ${L} Domain 模式（Daily Beta 伴侣实截）：今日财务 · 账户`,
      screens: [
        { link: 'kenos://domain/money?path=%2Fhome%2Ftoday%3Fdemo%3D1', title: '今日财务', path: 'kenos://domain/money', settle: 8000 },
      ],
      leave: 'kenos://return',
    },
    {
      id: `home-${V}`,
      name: `家 · ${L}`,
      accentId: 'home',
      description: `Home 在 Kenos ${L} Domain 模式（Daily Beta 伴侣实截）：户型 · 储物`,
      screens: [
        { link: 'kenos://domain/home', title: '户型规划', path: 'kenos://domain/home', settle: 7000 },
        { link: 'kenos://domain/home?path=/storage', title: '储物', path: 'kenos://domain/home?path=/storage', settle: 4000 },
      ],
      leave: 'kenos://return',
    },
    {
      id: `library-${V}`,
      name: `知识库 · ${L}`,
      accentId: 'knowledge',
      description: `Knowledge 在 Kenos ${L} Domain 模式（Daily Beta 伴侣实截）：书库 · 项目`,
      screens: [
        { link: 'kenos://domain/library?path=%2Flibrary%3Fdemo%3D1', title: '书库', path: 'kenos://domain/library', settle: 7000 },
        { link: 'kenos://domain/library?path=/projects', title: '项目现状', path: 'kenos://domain/library?path=/projects', settle: 4000 },
      ],
      leave: 'kenos://return',
    },
    {
      id: `code-${V}`,
      name: `Code · ${L}`,
      accentId: 'aios',
      description: `Code 在 Kenos ${L} Domain 模式（AIOS 壳路由实截）：Cursor 对话`,
      screens: [
        { link: 'kenos://domain/code', title: 'Cursor 对话', path: 'kenos://domain/code', settle: 6000 },
      ],
      leave: 'kenos://return',
    },
    {
      id: `health-${V}`,
      name: `健康 · ${L}`,
      accentId: 'health',
      description: `Health 在 Kenos ${L} Domain 模式（Daily Beta 伴侣实截）：状态 · 趋势`,
      screens: [
        { link: 'kenos://domain/health?path=%2F%3Fdemo%3D1', title: '状态', path: 'kenos://domain/health', settle: 7000 },
        { link: 'kenos://domain/health?path=/trends', title: '趋势', path: 'kenos://domain/health?path=/trends', settle: 4000 },
      ],
      leave: 'kenos://return',
    },
  ]
}

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

/** 通用逐屏采集：openurl 深链 → 静置 → 截图（shoot 回调产出 PNG buffer）。 */
async function captureEntryScreens(entry, { open, shoot }) {
  const cells = []
  for (const spec of entry.screens) {
    open(spec.link)
    await sleep(spec.settle)
    if (spec.reset) continue
    try {
      const buffer = shoot()
      const size = pngSize(buffer)
      cells.push({ title: spec.title, path: spec.path, buffer, w: size.w, h: size.h })
      process.stdout.write('·')
    } catch (err) {
      cells.push({ title: spec.title, path: spec.path, note: String(err), w: 4, h: 8 })
      process.stdout.write('✗')
    }
  }
  if (entry.leave) {
    open(entry.leave)
    await sleep(1800)
  }
  return cells
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
  // 开发后门:-kenosDevMode 一次跳过 HealthKit 授权 sheet（+ Face ID，模拟器本就跳）。
  // 比预写 authPrompted defaults 更干净：不污染持久化偏好、与真机测试同一机制。
  sh(`xcrun simctl terminate ${udid} space.kenos.app.ios 2>/dev/null || true`)
  sh(`xcrun simctl launch ${udid} space.kenos.app.ios -kenosDevMode`)
  await sleep(4000)

  const tmp = join(tmpdir(), `kenos-uiux-ios-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  let shot = 0
  const results = []
  for (const entry of nativeEntries('ios')) {
    process.stdout.write(`  ${entry.name} `)
    const cells = await captureEntryScreens(entry, {
      // `relaunch:<args>` — 用指定 launch args 重启 app(如 Korben 壳 V2 预览);
      // 空 args = 回默认旧壳。其余按 deep link openurl。
      open: (link) => {
        if (link.startsWith('relaunch:')) {
          const args = link.slice('relaunch:'.length).trim()
          sh(`xcrun simctl terminate ${udid} space.kenos.app.ios 2>/dev/null || true`)
          sh(`xcrun simctl launch ${udid} space.kenos.app.ios ${args}`)
          return
        }
        sh(`xcrun simctl openurl ${udid} "${link}"`)
      },
      shoot: () => {
        const file = join(tmp, `${shot++}.png`)
        sh(`xcrun simctl io ${udid} screenshot "${file}"`)
        return readFileSync(file)
      },
    })
    process.stdout.write('\n')
    results.push({ entry, cells })
  }
  sh(`xcrun simctl terminate ${udid} space.kenos.app.ios 2>/dev/null || true`)
  rmSync(tmp, { recursive: true, force: true })
  return results
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
  const tmp = join(tmpdir(), `kenos-uiux-mac-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  let shot = 0
  const results = []
  for (const entry of nativeEntries('mac')) {
    process.stdout.write(`  ${entry.name} `)
    const cells = await captureEntryScreens(entry, {
      open: (link) => sh(`open -g "${link}"`),
      shoot: () => {
        const file = join(tmp, `${shot++}.png`)
        execFileSync('screencapture', ['-x', '-o', `-l${winId}`, file], { stdio: 'ignore' })
        return readFileSync(file)
      },
    })
    process.stdout.write('\n')
    results.push({ entry, cells })
  }
  sh(`osascript -e 'tell application "KenosMac" to quit' 2>/dev/null || true`)
  rmSync(tmp, { recursive: true, force: true })
  return results
}

// ── 合成 + 画廊合并 ───────────────────────────────────────────────────────
/**
 * @param {import('playwright').Browser} browser
 * @param {'ios'|'mac'} platform
 * @param {{ id: string, name: string, description: string, accentId: string }} entry
 * @param {{ title?: string, path?: string, buffer?: Buffer, note?: string, w: number, h: number }[]} cells
 */
async function composeSheet(browser, platform, entry, cells) {
  const meta = {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    theme: /** @type {'dark'} */ ('dark'), // 壳 chrome 强制深色
    viewportKey: platform,
    viewportLabel: platform === 'ios' ? 'iOS 原生壳' : 'Mac 原生壳',
  }
  const accent = LIFE_OS_APP_WORDMARK_ACCENT[entry.accentId] ?? ACCENT
  const git = gitInfo()
  const layout = nativeSheetLayout(platform)
  const html = buildContactSheetHtml({
    app: { name: meta.name, accent },
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
  // CI（Linux Playwright 镜像）没有 Xcode/模拟器——静默跳过，保留上次提交的原生截图。
  if (process.platform !== 'darwin') {
    console.log('原生壳 UI/UX 审核跳过：非 macOS（沿用已提交的 kenos-ios/kenos-mac 截图）。')
    return
  }
  console.log(`原生壳 UI/UX 审核: ${PLATFORMS.join(', ')}`)
  const browser = await chromium.launch()
  const entries = []
  try {
    if (PLATFORMS.includes('ios')) {
      console.log('· iOS（模拟器）')
      for (const { entry, cells } of await captureIOS()) {
        const ge = await composeSheet(browser, 'ios', entry, cells)
        if (ge) entries.push(ge)
      }
    }
    if (PLATFORMS.includes('mac')) {
      console.log('· Mac（真实窗口）')
      const results = await captureMac()
      for (const { entry, cells } of results ?? []) {
        const ge = await composeSheet(browser, 'mac', entry, cells)
        if (ge) entries.push(ge)
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
