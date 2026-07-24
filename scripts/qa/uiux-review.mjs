/**
 * 统一 UI/UX 审核截图 — 抓一个 app 的 6~8 个核心页面，加标题标注，合成为单张 PNG。
 *
 * 设计：每个核心页面截一张视口图（buffer），再用 Playwright 渲染一张 HTML 联系表
 * （标题条 + 网格缩略图），整页截图得到唯一一张审核图。不引入新依赖（sharp/canvas）。
 *
 * 用法（repo 根，脚本会自起 preview 并在结束时关掉）：
 *   node scripts/qa/uiux-review.mjs                    # 默认集合（planner/finance/fitness/music）
 *   node scripts/qa/uiux-review.mjs --app planner      # 单个 app
 *   node scripts/qa/uiux-review.mjs --app music,home   # 多个
 *   node scripts/qa/uiux-review.mjs --app all          # 全部登记的 app
 *   node scripts/qa/uiux-review.mjs --changed          # 仅本次改动触及的 app（版本收口自动更新）
 *   node scripts/qa/uiux-review.mjs --app planner --theme dark --mobile
 *
 * 产物：docs/ui-qa-screenshots/{app}/uiux-review/latest/{app}-uiux-review-{theme}-{viewport}.png
 *      （+ QA_RUN_ID 存档、manifest.json）。目录已 gitignore，属临时证据。
 */
import { chromium, devices } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  UIUX_REVIEW_APPS,
  UIUX_REVIEW_DEFAULT_IDS,
  getReviewApp,
} from './uiux-review.config.mjs'
import {
  resolveScreenshotDir,
  resolveRepoRoot,
  writeManifest,
} from './screenshot-output.mjs'
import {
  computeStyleDebt,
  computeSharedAdoption,
  computeHealth,
  systemicFindings,
  grade,
} from './uiux-metrics.mjs'

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
/** @param {string} flag */
const flagValue = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const hasFlag = (/** @type {string} */ f) => argv.includes(f)

const THEME = /** @type {'light'|'dark'} */ (flagValue('--theme') ?? '')
const MOBILE = hasFlag('--mobile')
// --gallery：额外产出压缩 JPEG + manifest 到画廊站 public/（tracked，供 Netlify 发布）。
const GALLERY = hasFlag('--gallery')
const REPO_ROOT = resolveRepoRoot(import.meta.url)
const GALLERY_DIR = join(REPO_ROOT, 'apps/uiux-review-gallery/public')

/** 解析要走查的 app id 列表。 @returns {string[]} */
function resolveTargetIds() {
  if (hasFlag('--changed')) return changedAppIds()
  const raw = flagValue('--app')
  if (!raw) return UIUX_REVIEW_DEFAULT_IDS
  if (raw === 'all') return Object.keys(UIUX_REVIEW_APPS)
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 从上一次提交的 diff 推断触及的 app（版本收口 hook 用）。 */
function changedAppIds() {
  let files = ''
  try {
    files = execSync('git diff --name-only HEAD~1 HEAD', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    const staged = execSync('git diff --name-only', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    files += `\n${staged}`
  } catch {
    /* 首个提交 / 无 HEAD~1 — 回退到默认集合 */
    return UIUX_REVIEW_DEFAULT_IDS
  }
  const touched = new Set()
  for (const line of files.split('\n')) {
    const m = line.match(/^apps\/([a-z-]+)\//)
    if (m && UIUX_REVIEW_APPS[m[1]]) touched.add(m[1])
    // 共享包变更影响全部 app
    if (/^packages\//.test(line)) {
      for (const id of UIUX_REVIEW_DEFAULT_IDS) touched.add(id)
    }
  }
  return touched.size ? [...touched] : []
}

// ── git 版本标签 ──────────────────────────────────────────────────────────
export function gitInfo() {
  const run = (/** @type {string} */ cmd) => {
    try {
      return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
    } catch {
      return ''
    }
  }
  return {
    sha: run('git rev-parse --short HEAD') || 'nogit',
    subject: run('git log -1 --pretty=%s') || '',
    branch: run('git rev-parse --abbrev-ref HEAD') || '',
  }
}

// ── preview 进程 ───────────────────────────────────────────────────────────
/** @type {import('child_process').ChildProcess[]} */
const servers = []

/**
 * 起 preview，并从 vite stdout 解析**实际**监听端口。用专属高端口区间（远离各 app 默认
 * 519x 端口，避开并发会话的 dev server），并读实际端口——首选被占时 vite 跳端口，读回真实值，
 * 绝不假设，避免打到别人的服务器（见 shared-worktree-concurrent-sessions）。
 * @param {import('./uiux-review.config.mjs').UiuxAppReview} app
 * @param {number} preferredPort 本次分配的首选端口（专属区间，间隔≥3）
 * @returns {Promise<number>} 实际监听端口
 */
function startPreview(app, preferredPort) {
  const child = spawn(
    'npm',
    [
      'run',
      'preview',
      '-w',
      app.workspace,
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      String(preferredPort),
    ],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: false },
  )
  servers.push(child)

  return new Promise((resolve) => {
    let settled = false
    const done = (/** @type {number} */ port) => {
      if (settled) return
      settled = true
      resolve(port)
    }
    const scan = (/** @type {Buffer} */ buf) => {
      const m = String(buf).match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/)
      if (m) done(Number(m[1]))
    }
    child.stdout?.on('data', scan)
    child.stderr?.on('data', scan)
    // 兜底：15s 内没解析到就按首选端口试。
    setTimeout(() => done(preferredPort), 15_000)
  })
}

/** @param {number} port */
async function waitForPort(port, ms = 90_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok || res.status < 500) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Preview 未就绪 :${port}`)
}

function killServers() {
  for (const child of servers) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* noop */
    }
  }
}

// ── 数据预置（best-effort，缺失则优雅降级为空态）────────────────────────────
/**
 * @param {import('playwright').Page} page
 * @param {import('./uiux-review.config.mjs').UiuxAppReview} app
 * @returns {Promise<string>} 状态说明（写入 manifest）
 */
async function seed(page, app) {
  if (app.seedKind === 'demo') return seedDemoFlag(page)
  if (app.seedKind === 'kenos') return seedKenosLocalDemo(page)
  if (app.seedKind === 'indexeddb' && app.id === 'music')
    return seedMusicLibrary(page)
  return 'default'
}

/**
 * finance 本地演示模式：置 localStorage.fos_demo=1，app 跳过登录直接注入模拟数据
 * （见 apps/finance/src/lib/demoMode.ts）。只在 localhost 生效，不碰云端。
 * @param {import('playwright').Page} page
 */
async function seedDemoFlag(page) {
  await page.evaluate(() => {
    localStorage.setItem('fos_demo', '1')
  })
  return 'demo'
}

/**
 * AIOS / Kenos local UIUX fixture — control-surface demo + chat demo flags.
 * Only meaningful when preview was built without VITE_AIOS_CLOUD=1 (auth wall off).
 * @param {import('playwright').Page} page
 */
async function seedKenosLocalDemo(page) {
  await page.evaluate(() => {
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
  })
  return 'kenos'
}

/** @param {import('playwright').Page} page */
async function seedMusicLibrary(page) {
  await page.evaluate(async () => {
    const req = indexedDB.open('musicos_library', 1)
    await new Promise((resolve, reject) => {
      req.onupgradeneeded = (e) => {
        const db = /** @type {IDBOpenDBRequest} */ (e.target).result
        for (const [name, keyPath] of [
          ['tracks', 'id'],
          ['recent', 'trackId'],
          ['playlists', 'id'],
        ]) {
          if (!db.objectStoreNames.contains(name))
            db.createObjectStore(name, { keyPath })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const db = req.result
    const now = Date.now()
    const samples = [
      ['qa-1', '夜曲', '周杰伦', '十一月的萧邦', 226, 12, 1],
      ['qa-2', '晴天', '周杰伦', '叶惠美', 269, 8, 0],
      ['qa-3', '稻香', '周杰伦', '魔杰座', 223, 3, 1],
      ['qa-4', '七里香', '周杰伦', '七里香', 299, 5, 0],
      ['qa-5', '告白气球', '周杰伦', '周杰伦的床边故事', 215, 20, 1],
    ].map(([id, title, artist, album, duration, playCount, liked], i) => ({
      id,
      title,
      artist,
      album,
      albumKey: album,
      artistKey: artist,
      duration,
      mime: 'audio/mpeg',
      size: 0,
      addedAt: now - i * 86_400_000,
      playCount,
      liked,
      words: [title, artist, album],
    }))
    const tx = db.transaction(['tracks', 'recent'], 'readwrite')
    for (const t of samples) tx.objectStore('tracks').put(t)
    tx.objectStore('recent').put({ trackId: 'qa-1', playedAt: now - 3_600_000 })
    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror = rej
    })
  })
  await page.evaluate(() => {
    localStorage.setItem(
      'musicos_v1',
      JSON.stringify({ settings: { locale: 'zh' } }),
    )
  })
  return 'seeded-library'
}

// ── 主题注入 ───────────────────────────────────────────────────────────────
/**
 * @param {import('playwright').Page} page
 * @param {import('./uiux-review.config.mjs').UiuxAppReview} app
 * @param {'light'|'dark'} theme
 */
async function applyTheme(page, app, theme) {
  // 站点普遍用 data-theme / class；两手都设，覆盖 auto。
  await page.evaluate((t) => {
    const root = document.documentElement
    root.setAttribute('data-theme', t)
    root.style.colorScheme = t
    root.classList.toggle('dark', t === 'dark')
    root.classList.toggle('light', t === 'light')
  }, theme)
}

// ── 抓单页 ────────────────────────────────────────────────────────────────
/**
 * @param {import('playwright').Page} page
 * @param {import('./uiux-review.config.mjs').UiuxAppReview} app
 * @param {import('./uiux-review.config.mjs').CorePage} pageSpec
 * @param {'light'|'dark'} theme
 * @param {number} port 实际监听端口
 * @returns {Promise<{ ok: boolean, buffer?: Buffer, note?: string }>}
 */
async function capturePage(page, app, pageSpec, theme, port, withA11y = false) {
  const url = `http://127.0.0.1:${port}${pageSpec.path}`
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await applyTheme(page, app, theme)
    await page
      .waitForSelector(pageSpec.waitSelector ?? app.waitSelector, {
        timeout: 20_000,
      })
      .catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})
    await page.waitForTimeout(pageSpec.settle ?? 450)
    // prep：截图前的交互（展示同一页面的不同功能态，如进入编辑、切换 tab）。best-effort。
    if (pageSpec.prep) await runPrep(page, pageSpec.prep)
    const a11y = withA11y ? await auditA11y(page).catch(() => null) : null
    const clip = MOBILE ? null : await contentClip(page, app)
    const buffer = await page.screenshot(clip ? { type: 'png', clip } : { type: 'png' })
    return { ok: true, buffer, a11y }
  } catch (err) {
    return { ok: false, note: String(err instanceof Error ? err.message : err) }
  }
}

/**
 * 轻量无障碍审计（真实、可复现）：图无 alt / 交互控件无可访问名 / 输入无标注。
 * 不是完整 WCAG 套件，只查这几类无歧义的硬失败；返回 { checked, pass, issues }。
 * @param {import('playwright').Page} page
 */
function auditA11y(page) {
  return page.evaluate(() => {
    const issues = { noAlt: 0, noName: 0, noLabel: 0 }
    let checked = 0
    const visible = (/** @type {Element} */ el) => {
      const r = el.getBoundingClientRect()
      return r.width >= 6 && r.height >= 6
    }
    const named = (/** @type {Element} */ el) =>
      !!(
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('title') ||
        (el.textContent || '').trim()
      )
    for (const img of document.querySelectorAll('img')) {
      if (!visible(img)) continue
      checked++
      if (!img.hasAttribute('alt')) issues.noAlt++
    }
    for (const el of document.querySelectorAll('button, a[href], [role="button"], select, textarea')) {
      if (!visible(el)) continue
      checked++
      if (!named(el)) issues.noName++
    }
    for (const inp of document.querySelectorAll('input:not([type="hidden"])')) {
      if (!visible(inp)) continue
      checked++
      const id = inp.getAttribute('id')
      const hasLabel =
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        inp.closest('label') ||
        inp.getAttribute('aria-label') ||
        inp.getAttribute('aria-labelledby') ||
        inp.getAttribute('placeholder')
      if (!hasLabel) issues.noLabel++
    }
    const fails = issues.noAlt + issues.noName + issues.noLabel
    return { checked, pass: checked - fails, issues }
  })
}

/**
 * 执行 prep 交互序列（截图前）。best-effort：单步失败不中断，仅告警。
 * 步骤形如：{ click:sel } | {select:[sel,val]} | {fill:[sel,val]} | {press:key} | {wait:ms} | {waitFor:sel}
 * @param {import('playwright').Page} page
 * @param {Array<Record<string, any>>} steps
 */
async function runPrep(page, steps) {
  for (const step of steps) {
    try {
      if (step.wait != null) await page.waitForTimeout(step.wait)
      else if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 8000 })
      else if (step.click) await page.click(step.click, { timeout: 8000 })
      else if (step.select) await page.selectOption(step.select[0], step.select[1], { timeout: 8000 })
      else if (step.fill) await page.fill(step.fill[0], step.fill[1], { timeout: 8000 })
      else if (step.press) await page.keyboard.press(step.press)
      await page.waitForTimeout(step.settle ?? 250)
    } catch (e) {
      console.warn(`  prep 步骤跳过（${JSON.stringify(step)}）: ${e instanceof Error ? e.message : e}`)
    }
  }
}

/**
 * 量「真实内容高度」→ 裁掉主内容区下方的尾部空白，把有限像素预算集中到 UI 上。
 * 只在主滚动区内测（排除全高侧栏 / 底栏），取含文字/图/背景的叶子元素的最大 bottom。
 * 测不到就返回 null（不裁，回退整屏视口）。
 * @param {import('playwright').Page} page
 * @param {import('./uiux-review.config.mjs').UiuxAppReview} app
 * @returns {Promise<{ x: number, y: number, width: number, height: number } | null>}
 */
async function contentClip(page, app) {
  const vp = page.viewportSize()
  if (!vp) return null
  const bottom = await page
    .evaluate(
      ({ sel, vh }) => {
        const root =
          sel
            .split(',')
            .map((s) => s.trim())
            .map((s) => document.querySelector(s))
            .find(Boolean) ||
          document.querySelector('#main-content, main, .wrap') ||
          document.body
        if (!root) return 0
        let maxB = 0
        for (const el of root.querySelectorAll('*')) {
          if (el.childElementCount) continue // 只看叶子，避免整块空容器
          const r = el.getBoundingClientRect()
          if (r.width < 24 || r.height < 8 || r.top >= vh || r.bottom <= 0) continue
          const cs = getComputedStyle(el)
          const painted =
            (el.textContent && el.textContent.trim()) ||
            el.tagName === 'IMG' ||
            el.tagName === 'svg' ||
            cs.backgroundImage !== 'none'
          if (!painted) continue
          if (r.bottom > maxB) maxB = r.bottom
        }
        return maxB
      },
      { sel: app.scrollSelector || '', vh: vp.height },
    )
    .catch(() => 0)
  if (!bottom || bottom <= 0) return null
  const height = Math.max(520, Math.min(vp.height, Math.ceil(bottom) + 28))
  if (height >= vp.height - 8) return null // 内容基本占满，不必裁
  return { x: 0, y: 0, width: vp.width, height }
}

// ── 合成联系表 ─────────────────────────────────────────────────────────────
/**
 * 联系表布局常量（也用于设置渲染视口宽度，保证「所见即所截」）。
 * 桌面 2 列宽面板 — 契合宽屏 UI 长宽比，且经 AI 视觉下采样（长边≈1568px）后
 * 每格分辨率与 3 列几无差别，却更少相邻干扰、阅读顺序更清晰。
 * @returns {{ cols: number, shotW: number, gutter: number, pad: number }}
 */
function sheetLayout() {
  return MOBILE
    ? { cols: 3, shotW: 300, gutter: 18, pad: 24 }
    : { cols: 2, shotW: 660, gutter: 22, pad: 30 }
}

/** 竖屏原生截图（iOS）用窄格 3 列；Mac 宽窗用桌面 2 列。供 uiux-review-native.mjs 复用。 */
export function nativeSheetLayout(/** @type {'ios'|'mac'} */ platform) {
  return platform === 'ios'
    ? { cols: 3, shotW: 300, gutter: 18, pad: 24 }
    : { cols: 2, shotW: 660, gutter: 22, pad: 30 }
}

/** @param {ReturnType<typeof sheetLayout>} L */
export function sheetWidth(L) {
  return L.pad * 2 + L.cols * L.shotW + (L.cols - 1) * L.gutter
}

/**
 * 合成联系表 HTML。设计取向（面向 AI 识别与人工评审）：
 * - 安静中性画布：让 app UI 成为主角。
 * - 标注放在画布层（截图上方的纯文本 序号·标题·路由），不做成卡片工具条——
 *   审核者/AI 一眼看出那是标注、不会误当成 app 界面的一部分。
 * - 截图只包一条细边框做分隔，不加圆角/阴影等装饰。
 * - 两位序号：便于「第 3 屏 /calendar」式精确引用。
 *
 * @param {object} o
 * @param {{ name: string, accent: { light: string, dark: string } }} o.app
 * @param {'light'|'dark'} o.theme
 * @param {string} o.viewportLabel
 * @param {ReturnType<typeof gitInfo>} o.git
 * @param {{ title: string, path: string, dataUri?: string, note?: string, w: number, h: number }[]} o.cells
 * @param {ReturnType<typeof sheetLayout>} [o.layout] 默认取当前 CLI 视口的布局
 */
export function buildContactSheetHtml({ app, theme, viewportLabel, git, cells, layout }) {
  const dark = theme === 'dark'
  const accent = app.accent[theme] ?? app.accent.light
  // 中性画布；品牌色仅作点缀。
  const canvas = dark ? '#0a0b0d' : '#eceef1'
  const shotBg = dark ? '#0f1013' : '#fbfbfc'
  const ink = dark ? '#eceef1' : '#16181c'
  const sub = dark ? '#8b9098' : '#697079'
  const faint = dark ? '#6a6f77' : '#9aa0a8'
  const border = dark ? '#2b2e34' : '#e2e5ea'
  const L = layout ?? sheetLayout()
  const sheetW = sheetWidth(L)
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)

  // 先给每格定序号，再贪心分列（真正均衡，无 CSS multicol 的失衡）。
  const numbered = cells.map((c, i) => ({ ...c, n: String(i + 1).padStart(2, '0') }))
  const columns = distributeColumns(numbered, L.cols, L.shotW, 34)
  const card = (/** @type {(typeof numbered)[number]} */ c) => {
    const body = c.dataUri
      ? `<img src="${c.dataUri}" alt="${escapeHtml(c.title)}" />`
      : `<div class="miss"><span class="miss-x">✕</span>未能加载<em>${escapeHtml(c.note ?? '')}</em></div>`
    return `<figure class="card">
        <figcaption class="cap"><span class="num">${c.n}</span><span class="ttl">${escapeHtml(c.title)}</span><span class="url">${escapeHtml(c.path)}</span></figcaption>
        <div class="shot">${body}</div>
      </figure>`
  }
  const gridHtml = columns
    .map((col) => `<div class="col">${col.map(card).join('\n')}</div>`)
    .join('\n')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { background: ${canvas}; color: ${ink};
      font: 15px/1.45 -apple-system, "PingFang SC", "Noto Sans CJK SC", "Segoe UI", system-ui, sans-serif;
      width: ${sheetW}px; padding: ${L.pad}px; -webkit-font-smoothing: antialiased; }

    header { display: flex; align-items: center; gap: 16px;
      padding-bottom: 18px; margin-bottom: ${L.gutter}px;
      border-bottom: 1px solid ${border}; }
    .brand-wrap { display: flex; align-items: center; gap: 12px; }
    .tick { width: 6px; height: 30px; border-radius: 3px; background: ${accent}; }
    .brand { font-size: 27px; font-weight: 800; letter-spacing: .2px; }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      color: ${sub}; border: 1px solid ${border}; border-radius: 999px; padding: 5px 12px; }
    .meta { margin-left: auto; text-align: right; color: ${sub}; font-size: 12.5px; line-height: 1.65; }
    .meta .sha { color: ${ink}; font-weight: 700; font-family: ui-monospace, SFMono-Regular, monospace; }
    .meta .subj { display: inline-block; max-width: 520px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }

    /* JS 贪心 masonry：变高卡片列内紧凑堆叠，两列高度均衡，像素预算尽量落在 UI 上 */
    .grid { display: flex; gap: ${L.gutter}px; align-items: flex-start; }
    .col { display: flex; flex-direction: column; gap: ${L.gutter}px; width: ${L.shotW}px; }
    .card { display: flex; flex-direction: column; }

    /* 标注：画布层纯文本，明确是标注而非界面的一部分 */
    .cap { display: flex; align-items: baseline; gap: 10px; padding: 0 2px 7px; }
    .num { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; font-weight: 700; color: ${accent}; }
    .ttl { font-weight: 700; font-size: 16px; color: ${ink}; }
    .url { margin-left: auto; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12.5px; color: ${faint};
      max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* 截图：细边框分隔，无圆角/阴影 */
    .shot { width: 100%; background: ${shotBg}; border: 1px solid ${border}; }
    .shot img { display: block; width: 100%; height: auto; }
    .miss { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
      padding: 64px 16px; color: ${sub}; font-size: 15px; font-weight: 600; text-align: center; }
    .miss-x { font-size: 22px; color: #ff5f57; }
    .miss em { font-style: normal; font-size: 12px; color: ${faint}; max-width: 90%; }
  </style></head><body>
    <header>
      <span class="brand-wrap"><span class="tick"></span><span class="brand">${escapeHtml(app.name)}</span></span>
      <span class="kicker">UI/UX 审核 · ${viewportLabel} · ${theme === 'dark' ? '深色' : '浅色'}</span>
      <span class="meta">
        <span class="sha">${git.sha}</span>${git.branch ? ` · ${escapeHtml(git.branch)}` : ''} · ${cells.length} 屏 · ${stamp}<br>
        <span class="subj">${escapeHtml(git.subject)}</span>
      </span>
    </header>
    <div class="grid">${gridHtml}</div>
  </body></html>`
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
}

/** 从 PNG 头读尺寸（8B 签名 + IHDR：len4+"IHDR"4+width4+height4）。 @param {Buffer} buf */
export function pngSize(buf) {
  try {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  } catch {
    return { w: 4, h: 3 }
  }
}

/**
 * 贪心 masonry：按估算卡片高度把 cells 依序分到最矮的列，得到真正均衡、无空档的多列。
 * 保留大致阅读顺序（先来的先落），序号标注保证可精确引用。
 * @template T
 * @param {(T & { w: number, h: number })[]} cells
 * @param {number} cols @param {number} shotW @param {number} barH
 * @returns {(T & { w: number, h: number })[][]}
 */
function distributeColumns(cells, cols, shotW, barH) {
  const columns = Array.from({ length: cols }, () => [])
  const heights = new Array(cols).fill(0)
  for (const c of cells) {
    const estH = barH + shotW * (c.h / Math.max(1, c.w))
    let t = 0
    for (let i = 1; i < cols; i++) if (heights[i] < heights[t]) t = i
    columns[t].push(c)
    heights[t] += estH + 22
  }
  return columns
}

// ── 单个 app 走查 ──────────────────────────────────────────────────────────
/**
 * @param {import('playwright').Browser} browser
 * @param {import('./uiux-review.config.mjs').UiuxAppReview} app
 * @param {'light'|'dark'} theme
 * @param {number} port 实际监听端口
 */
async function reviewApp(browser, app, theme, port) {
  const viewportLabel = MOBILE ? '移动' : '桌面'
  const viewport = MOBILE
    ? { width: 390, height: 844 }
    : { width: 1360, height: 864 }
  // 2× 采集：文字/描边更锐利，经 AI 视觉长边下采样后仍清晰可读。
  const ctxOpts = MOBILE
    ? { ...devices['iPhone 13'], colorScheme: theme }
    : { viewport, colorScheme: theme, deviceScaleFactor: 2 }
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()

  // 先落地一次 origin 以便预置 storage / 登录态
  await page
    .goto(`http://127.0.0.1:${port}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    .catch(() => {})
  const seedNote = await seed(page, app)

  // a11y 只在代表性变体（浅色桌面）跑一次，避免 4× 变体重复审计。
  const withA11y = theme === 'light' && !MOBILE
  const a11yAgg = { checked: 0, pass: 0, issues: { noAlt: 0, noName: 0, noLabel: 0 } }

  const cells = []
  // desktopOnly 的功能态（依赖桌面专属控件，如储物空间/清单切换）在移动端跳过，避免重复格。
  for (const spec of app.pages.filter((p) => !(p.desktopOnly && MOBILE))) {
    const res = await capturePage(page, app, spec, theme, port, withA11y)
    const size = res.ok ? pngSize(res.buffer) : { w: 4, h: 2.4 }
    if (res.a11y) {
      a11yAgg.checked += res.a11y.checked
      a11yAgg.pass += res.a11y.pass
      a11yAgg.issues.noAlt += res.a11y.issues.noAlt
      a11yAgg.issues.noName += res.a11y.issues.noName
      a11yAgg.issues.noLabel += res.a11y.issues.noLabel
    }
    cells.push({
      title: spec.title,
      path: spec.path,
      dataUri: res.ok
        ? `data:image/png;base64,${res.buffer.toString('base64')}`
        : undefined,
      note: res.note,
      w: size.w,
      h: size.h,
    })
    process.stdout.write(res.ok ? '·' : '✗')
  }
  process.stdout.write('\n')

  const git = gitInfo()
  const html = buildContactSheetHtml({
    app,
    theme,
    viewportLabel,
    git,
    cells,
  })

  // 用与联系表等宽的视口渲染，整页截图 → 单张 PNG（所见即所截，避免多余下采样）
  const sheetCtx = await browser.newContext({
    viewport: { width: sheetWidth(sheetLayout()), height: 1000 },
    colorScheme: theme,
    deviceScaleFactor: 2,
  })
  const sheetPage = await sheetCtx.newPage()
  await sheetPage.setContent(html, { waitUntil: 'load' })
  await sheetPage.waitForTimeout(200)

  const { dir } = resolveScreenshotDir({
    app: app.id,
    suite: 'uiux-review',
    importMetaUrl: import.meta.url,
  })
  const viewportKey = MOBILE ? 'mobile' : 'desktop'
  const fileName = `${app.id}-uiux-review-${theme}-${viewportKey}.png`
  const outPath = join(dir, fileName)
  await sheetPage.screenshot({ path: outPath, fullPage: true })

  // 画廊：额外产出压缩 JPEG（tracked，供 Netlify 发布），复用已渲染的联系表页面。
  /** @type {object | null} */
  let galleryEntry = null
  if (GALLERY) {
    const shotsDir = join(GALLERY_DIR, 'shots')
    mkdirSync(shotsDir, { recursive: true })
    const jpgName = `${app.id}-${theme}-${viewportKey}.jpg`
    await sheetPage.screenshot({
      path: join(shotsDir, jpgName),
      fullPage: true,
      type: 'jpeg',
      quality: 90,
    })
    galleryEntry = {
      id: app.id,
      name: app.name,
      description: app.description ?? '',
      pages: app.pages.map((p) => ({ path: p.path, title: p.title })),
      file: `shots/${jpgName}`,
      generatedAt: new Date().toISOString(),
      screens: cells.length,
      ok: cells.filter((c) => c.dataUri).length,
      theme,
      viewport: viewportKey,
      git,
      // 治理指标（真实）：本变体的捕获覆盖；a11y 仅浅色桌面跑一次。
      capture: { ok: cells.filter((c) => c.dataUri).length, total: cells.length },
      ...(withA11y ? { a11y: a11yAgg } : {}),
    }
  }

  writeManifest(dir, {
    app: app.id,
    name: app.name,
    theme,
    viewport: MOBILE ? 'mobile' : 'desktop',
    git,
    seed: seedNote,
    composite: fileName,
    pages: cells.map((c) => ({
      title: c.title,
      path: c.path,
      captured: Boolean(c.dataUri),
      ...(c.note ? { note: c.note } : {}),
    })),
  })

  await ctx.close()
  await sheetCtx.close()

  const okCount = cells.filter((c) => c.dataUri).length
  console.log(
    `✓ ${app.name} → ${join('docs/ui-qa-screenshots', app.id, 'uiux-review', 'latest', fileName)} (${okCount}/${cells.length} 屏, seed=${seedNote})`,
  )
  return { app: app.id, okCount, total: cells.length, outPath, galleryEntry }
}

/**
 * 合并写画廊 manifest.json：保留未在本次生成的 app 条目（支持 --changed --gallery 增量刷新），
 * 覆盖/新增本次生成的条目。按 app 注册顺序排序。
 * @param {{ galleryEntry: object | null }[]} results
 */
function writeGalleryManifest(results) {
  const fresh = results.map((r) => r.galleryEntry).filter(Boolean)
  if (!fresh.length) return
  const manifestPath = join(GALLERY_DIR, 'manifest.json')
  /** @type {{ apps?: any[] }} */
  let prev = {}
  try {
    prev = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    /* 首次生成 */
  }
  // 上一代生成时的 git.sha（算「本次改动影响哪些页面」的基准）。同一轮 4 变体进程里，
  // 第 1 个进程会把 git.sha 写成当前 HEAD，故第 2-4 进程读到的 prevSha==curSha → 沿用已算好的 codeImpact。
  const prevSha = prev.git?.sha ?? null
  const cur = gitInfo()
  const isRealPrevGen = Boolean(prevSha && prevSha !== cur.sha)
  const sharedChg = isRealPrevGen ? sharedImpact(prevSha) : prev.sharedImpact ?? { changed: false, packages: [] }

  // 嵌套式（每 app 一个对象，含 描述/页面清单/4 个变体 URL + 治理指标）——对 AI 友好、自解释。
  /** @type {Map<string, any>} */
  const apps = new Map()
  /** @type {Map<string, any>} 上一代 app 对象（沿用 codeImpact） */
  const prevApps = new Map((prev.apps ?? []).map((/** @type {any} */ a) => [a.id, a]))
  for (const a of prev.apps ?? []) if (a && a.variants) apps.set(a.id, a) // 只沿用新结构，忽略旧扁平数据
  for (const e of fresh) {
    let app = apps.get(e.id)
    if (!app) {
      app = { id: e.id, variants: {} }
      apps.set(e.id, app)
    }
    app.name = e.name
    app.description = e.description
    // app.screens 取各变体最大值（桌面通常比移动多，移动会跳过 desktopOnly 态）。
    app.screens = Math.max(app.screens ?? 0, e.screens)
    app.pages = e.pages
    app.git = e.git
    app.variants = app.variants || {}
    app.variants[`${e.theme}-${e.viewport}`] = {
      file: e.file,
      generatedAt: e.generatedAt,
      screens: e.screens,
      capture: e.capture, // { ok, total }
    }
    app.metrics = app.metrics || {}
    if (e.a11y) app.metrics.a11y = e.a11y // 仅浅色桌面变体带 a11y
  }
  // 静态 + git 治理指标（每 app 一次）：样式债务 · 共享采用率 · 代码变更影响。
  // 原生壳条目（kenos-ios / kenos-mac，由 uiux-review-native.mjs 写入）没有 apps/<id>/src，跳过静态指标。
  for (const app of apps.values()) {
    if (app.native) continue
    app.metrics = app.metrics || {}
    app.metrics.styleDebt = computeStyleDebt(REPO_ROOT, app.id)
    app.metrics.sharedAdoption = computeSharedAdoption(REPO_ROOT, app.id)
    app.metrics.codeImpact = isRealPrevGen
      ? codeImpact(app.id, prevSha)
      : prevApps.get(app.id)?.metrics?.codeImpact ?? { since: prevSha, files: 0, areas: [] }
  }
  const order = Object.keys(UIUX_REVIEW_APPS)
  // 原生壳条目排在 web app 之后（不在 UIUX_REVIEW_APPS 注册表里）。
  const rank = (/** @type {any} */ a) => {
    const i = order.indexOf(a.id)
    return i === -1 ? order.length : i
  }
  const list = [...apps.values()].sort((a, b) => rank(a) - rank(b))
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    git: cur,
    baselineGit: prevSha, // 上一代 sha（codeImpact 的基准）
    sharedImpact: sharedChg, // 共享包本次是否变更（影响多 app）
    site: 'https://kenos-uiux-review.netlify.app',
    imageUrlPattern: 'shots/{app}-{theme}-{viewport}.jpg',
    themes: ['light', 'dark'],
    viewports: ['desktop', 'ios', 'mac'],
    count: list.length,
    apps: list,
  }
  computeGovernance(manifest) // 健康分 + portfolio + findings + 趋势
  mkdirSync(GALLERY_DIR, { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(GALLERY_DIR, 'llms.txt'), buildLlmsTxt(manifest))
  writeFileSync(join(GALLERY_DIR, 'sitemap.xml'), buildSitemap(manifest))
  console.log(
    `画廊 manifest + llms.txt + sitemap: apps/uiux-review-gallery/public/ (${list.length} app, ${Object.keys(list[0]?.variants ?? {}).length} 变体/app)`,
  )
}

/**
 * 「本次改动影响了哪些页面」——git 层面的有意义 diff（比像素哈希稳，不受时钟/日期噪声干扰）。
 * 对比上一代生成时的 git.sha 到当前 HEAD，列出该 app src 变更文件，抽出路由/组件区域名。
 * @param {string} appId @param {string|null} baseSha 上一代 manifest 的 git.sha
 */
function codeImpact(appId, baseSha) {
  if (!baseSha) return { since: null, files: 0, areas: [] }
  try {
    const out = execSync(`git diff --name-only ${baseSha} HEAD -- apps/${appId}/src`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    const files = out.split('\n').filter(Boolean)
    /** @type {Set<string>} */
    const areas = new Set()
    for (const f of files) {
      const rm = f.match(/\/routes\/([^/]+)/)
      if (rm && rm[1] !== '+layout.svelte') areas.add(`/${rm[1]}`)
      const cm = f.match(/\/(?:components|lib)\/(?:.*\/)?([A-Za-z0-9_-]+)\.svelte$/)
      if (cm) areas.add(cm[1])
    }
    return { since: baseSha.slice(0, 9), files: files.length, areas: [...areas].slice(0, 5) }
  } catch {
    // 上一代 sha 不可达（如 CI 浅克隆）→ 返回未知，UI 不臆造。
    return { since: baseSha.slice(0, 9), files: null, areas: [] }
  }
}

// ── Design Governance：健康分 + 组合视图 + 趋势（行业惯例：单一健康信号 + 轨迹 + 可路由整改） ──
const HISTORY_PATH = join(REPO_ROOT, 'apps/uiux-review-gallery/history.json')

/** 一个 app 的覆盖率（跨全部已生成变体 ok/total；Web 现为 浅/深×桌面 两变体）。 */
function coverageOf(/** @type {any} */ a) {
  let ok = 0
  let total = 0
  for (const v of Object.values(a.variants ?? {})) {
    if (v.capture) {
      ok += v.capture.ok
      total += v.capture.total
    }
  }
  return { ok, total, pct: total > 0 ? Math.round((100 * ok) / total) : null }
}

/** 一个 app 的治理快照（存历史/算趋势用）。 */
function snapshotApp(/** @type {any} */ a) {
  const m = a.metrics ?? {}
  return {
    score: m.health?.score ?? null,
    debt: m.styleDebt?.total ?? 0,
    a11yFails: m.a11y ? m.a11y.checked - m.a11y.pass : 0,
    adoption: m.sharedAdoption?.pct ?? null,
    coverage: coverageOf(a).pct,
  }
}

/**
 * 给已算好 per-app 基础指标（a11y/debt/adoption/capture）的 manifest 补：
 * 每 app 健康分+等级+趋势，顶层 portfolio 组合视图 + systemic findings。可离线复算（不重抓）。
 * @param {any} manifest
 */
function computeGovernance(manifest) {
  // 1) 每 app 健康分（原生壳条目只记覆盖率，不参与 web 静态指标/健康分/组合）
  for (const a of manifest.apps) {
    if (a.native) {
      a.metrics = a.metrics ?? {}
      a.metrics.coverage = coverageOf(a)
      continue
    }
    const m = (a.metrics = a.metrics ?? {})
    const cov = coverageOf(a)
    m.health = computeHealth({
      a11yPass: m.a11y?.pass,
      a11yChecked: m.a11y?.checked,
      debt: m.styleDebt?.total,
      adoptionPct: m.sharedAdoption?.pct,
      coveragePct: cov.pct,
    })
    m.coverage = cov
  }
  // 2) 趋势（vs 上一代生成快照；同轮 4 进程按 sha 去重只 append 一次）
  const curSha = manifest.git?.sha ?? null
  /** @type {any[]} */
  let hist = []
  try {
    hist = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'))
  } catch {
    /* 首次 */
  }
  const prevEntry = [...hist].reverse().find((e) => e.sha !== curSha) ?? null
  for (const a of manifest.apps) {
    if (a.native) continue
    const cur = snapshotApp(a)
    const prev = prevEntry?.apps?.[a.id]
    a.metrics.trend =
      prev && cur.score != null && prev.score != null
        ? {
            score: cur.score - prev.score,
            debt: cur.debt - prev.debt,
            a11yFails: cur.a11yFails - prev.a11yFails,
            since: prevEntry.sha?.slice(0, 9) ?? null,
            sinceAt: prevEntry.ts ?? null,
          }
        : { score: null, debt: null, a11yFails: null, since: null }
  }
  // 3) 组合视图（仅 web app；原生壳没有可比的静态指标）
  const apps = manifest.apps.filter((/** @type {any} */ a) => !a.native)
  const scores = apps.map((/** @type {any} */ a) => a.metrics.health?.score).filter((s) => s != null)
  const overallScore = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null
  const totalDebt = apps.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + (a.metrics.styleDebt?.total ?? 0), 0)
  const a11yFails = apps.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + (a.metrics.a11y ? a.metrics.a11y.checked - a.metrics.a11y.pass : 0), 0)
  const a11yChecked = apps.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + (a.metrics.a11y?.checked ?? 0), 0)
  const adoptions = apps.map((/** @type {any} */ a) => a.metrics.sharedAdoption?.pct).filter((p) => p != null)
  const coverages = apps.map((/** @type {any} */ a) => a.metrics.coverage?.pct).filter((p) => p != null)
  const avg = (/** @type {number[]} */ arr) => (arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null)
  const ranked = [...apps].sort((a, b) => (a.metrics.health?.score ?? 999) - (b.metrics.health?.score ?? 999))
  const atRisk = apps
    .filter((/** @type {any} */ a) => (a.metrics.health?.score ?? 100) < 70 || (a.metrics.a11y && a.metrics.a11y.pass < a.metrics.a11y.checked) || (a.metrics.coverage?.pct ?? 100) < 100)
    .map((/** @type {any} */ a) => a.id)
  manifest.portfolio = {
    overall: { score: overallScore, grade: grade(overallScore) },
    totals: { styleDebt: totalDebt, a11yFails, a11yChecked, appsAudited: apps.length },
    averages: { adoption: avg(adoptions), coverage: avg(coverages) },
    worst: ranked.slice(0, 3).map((/** @type {any} */ a) => ({ id: a.id, name: a.name, score: a.metrics.health?.score, grade: a.metrics.health?.grade })),
    atRisk,
    // 预算/门禁：把治理目标写清楚（行业惯例：metric 要对齐目标）。
    budgets: [
      { name: '无障碍', target: '100% 通过', status: a11yFails === 0 ? 'pass' : 'fail', detail: a11yFails === 0 ? '全通过' : `${a11yFails} 项失败` },
      { name: '捕获覆盖', target: '全部页面截到', status: coverages.every((c) => c === 100) ? 'pass' : 'fail' },
      { name: '样式债务趋势', target: '不新增', status: prevEntry ? (totalDebt <= (prevEntry.portfolio?.debt ?? totalDebt) ? 'pass' : 'fail') : 'n/a', detail: prevEntry ? `${totalDebt - (prevEntry.portfolio?.debt ?? totalDebt) >= 0 ? '+' : ''}${totalDebt - (prevEntry.portfolio?.debt ?? totalDebt)}` : '无基线' },
      // 原生端覆盖：iOS/Mac 缺位要在仪表盘上可见（Mac 需要终端「屏幕录制」权限才能采集）。
      (() => {
        const nat = manifest.apps.filter((/** @type {any} */ a) => a.native)
        const has = (/** @type {string} */ vp) =>
          nat.some((/** @type {any} */ a) => Object.keys(a.variants ?? {}).some((k) => k.endsWith(`-${vp}`)))
        const iosOk = has('ios')
        const macOk = has('mac')
        return {
          name: '原生端覆盖',
          target: 'iOS + Mac 均有实截',
          status: iosOk && macOk ? 'pass' : 'fail',
          detail: `${iosOk ? 'iOS ✓' : 'iOS 缺失'} · ${macOk ? 'Mac ✓' : 'Mac 缺失（需屏幕录制权限）'}`,
        }
      })(),
    ],
  }
  manifest.findings = systemicFindings(REPO_ROOT)
  manifest.trendSince = prevEntry?.sha?.slice(0, 9) ?? null

  // 4) 追加历史快照（按 sha 去重，只每代一次）
  if (curSha && !hist.some((e) => e.sha === curSha)) {
    hist.push({
      ts: manifest.generatedAt,
      sha: curSha,
      apps: Object.fromEntries(apps.map((/** @type {any} */ a) => [a.id, snapshotApp(a)])),
      portfolio: { score: overallScore, debt: totalDebt, a11yFails },
    })
    writeFileSync(HISTORY_PATH, `${JSON.stringify(hist.slice(-40), null, 2)}\n`)
  }
}

/** 共享包是否在本次改动中变更（变了则影响多 app）。 @param {string|null} baseSha */
function sharedImpact(baseSha) {
  if (!baseSha) return { changed: false, packages: [] }
  try {
    const out = execSync(
      `git diff --name-only ${baseSha} HEAD -- packages/platform-web packages/theme`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
    const pkgs = new Set()
    for (const f of out.split('\n').filter(Boolean)) {
      const m = f.match(/^packages\/([^/]+)/)
      if (m) pkgs.add(m[1])
    }
    return { changed: pkgs.size > 0, packages: [...pkgs] }
  } catch {
    return { changed: false, packages: [] }
  }
}

/** sitemap.xml —— 列出页面与全部截图 URL，供爬虫/agent 发现。 */
function buildSitemap(/** @type {any} */ m) {
  const urls = [m.site + '/', m.site + '/manifest.json', m.site + '/llms.txt']
  for (const a of m.apps) for (const k of Object.keys(a.variants)) urls.push(`${m.site}/${a.variants[k].file}`)
  const body = urls
    .map((u) => `  <url><loc>${u}</loc><lastmod>${m.generatedAt.slice(0, 10)}</lastmod></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

/**
 * 生成 llms.txt —— 遵循 llmstxt.org 规范：H1 标题 + blockquote 摘要 + 若干 ## 小节，
 * 每项是 [标题](链接): 说明。给 AI agent 的机器可读入口与内容清单。
 */
function buildLlmsTxt(/** @type {any} */ m) {
  const S = m.site
  const L = []
  L.push('# LifeOS · UI/UX 审核画廊')
  L.push('')
  L.push(
    '> LifeOS 核心页面的 UI/UX 审核截图集，供人工与 AI 走查。每个 app 一张「联系表」——把 6~8 个核心页面各截一屏拼成一张，每屏顶部标注「序号 · 中文标题 · 路由」。Web app 有 浅色/深色 × 桌面 变体（移动形态由 Korben 原生壳覆盖）；另有 Korben iOS / Mac 原生壳条目（模拟器 / 真实窗口截图）。图为本地演示 / 种子数据，非真实账户内容。',
  )
  L.push('')
  L.push(
    `机器可读入口首选 [manifest.json](${S}/manifest.json)（结构化：每 app 的描述、页面清单、变体图片 URL）。图片直链规则 \`${m.imageUrlPattern}\`（theme: light|dark, viewport: desktop|ios|mac）。CORS 全开，可跨源 fetch。`,
  )
  L.push('')
  L.push('## AI 审核工作流')
  L.push(`- [manifest.json](${S}/manifest.json): 完整结构化数据，优先读取。`)
  L.push('- 1) 从 apps[] 按 description / pages 选要审的 app 与变体（theme/viewport）。')
  L.push('- 2) GET 该变体 `variants["{theme}-{viewport}"].file` 的 JPEG，逐屏分析布局 / 一致性 / 空态 / 可读性 / 对齐 / 明暗对比。')
  L.push('- 3) 需对比明暗或 Web/原生端时，取同一 app 的其它变体或 kenos-ios / kenos-mac 条目。')
  L.push('')
  L.push(`## 应用（生成于 ${m.generatedAt} · git ${m.git?.sha ?? ''}）`)
  for (const a of m.apps) {
    const titles = (a.pages ?? []).map((/** @type {any} */ p) => p.title).join(' / ')
    const def = a.variants['light-desktop'] ?? a.variants[Object.keys(a.variants)[0]]
    L.push(`- [${a.name}](${S}/${def.file}): ${a.description} · ${a.screens} 屏 · 页面: ${titles}`)
  }
  L.push('')
  L.push('## 设计治理指标（每 app，见 manifest.json 的 apps[].metrics / variants[].capture|diff）')
  L.push('字段：capture=捕获覆盖(ok/total) · a11y=无障碍(pass/checked, 查图无alt/控件无名/输入无标注) · sharedAdoption=共享UI import占比 · styleDebt=样式债务(棘轮基线, byRule+triage整改方向) · diff=视觉变更(vs上次基线, 哪些屏变了)。')
  for (const a of m.apps) {
    const mm = a.metrics ?? {}
    const parts = []
    if (mm.styleDebt) parts.push(`样式债务 ${mm.styleDebt.total}（${mm.styleDebt.triage}）`)
    if (mm.a11y) parts.push(`a11y ${mm.a11y.pass}/${mm.a11y.checked}`)
    if (mm.sharedAdoption?.pct != null) parts.push(`共享 ${mm.sharedAdoption.pct}%`)
    L.push(`- ${a.name}: ${parts.join(' · ')}`)
  }
  L.push('')
  L.push('## 全部变体')
  for (const a of m.apps) {
    L.push(`### ${a.name}`)
    for (const key of Object.keys(a.variants)) {
      L.push(`- [${a.name} · ${key}](${S}/${a.variants[key].file})`)
    }
  }
  L.push('')
  return L.join('\n')
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const ids = resolveTargetIds()
  if (!ids.length) {
    console.log('无目标 app（--changed 未检测到改动）。')
    return
  }
  const apps = ids.map(getReviewApp)
  const theme = /** @type {'light'|'dark'} */ (
    THEME || (apps[0].defaultTheme === 'dark' ? 'dark' : 'light')
  )

  console.log(
    `UI/UX 审核: ${apps.map((a) => a.id).join(', ')} · ${theme} · ${MOBILE ? '移动' : '桌面'}`,
  )

  // 起 preview 并解析各自的实际端口。**串行**启动：首选端口被别的会话占用时 vite 会跳端口，
  // 并发启动会让两个 app 抢同一个跳转端口（如 home 5196→5197 撞上 aios 5197），导致抓到别的 app。
  // 串行确保每个 vite 先绑定并打印真实端口，下一个再启动。
  // 专属高端口区间（5300 起、间隔 5），远离各 app 默认 519x 端口与并发会话的 dev server，
  // 从根上避免「preview 跳端口撞上另一个 app」导致抓错 app。
  /** @type {Record<string, number>} */
  const ports = {}
  for (let i = 0; i < apps.length; i++) {
    ports[apps[i].id] = await startPreview(apps[i], 5300 + i * 5)
    await waitForPort(ports[apps[i].id])
  }

  const browser = await chromium.launch()
  const results = []
  try {
    for (const app of apps) {
      results.push(await reviewApp(browser, app, theme, ports[app.id]))
    }
  } finally {
    await browser.close()
    killServers()
  }

  if (GALLERY) writeGalleryManifest(results)

  const totalOk = results.reduce((n, r) => n + r.okCount, 0)
  const total = results.reduce((n, r) => n + r.total, 0)
  console.log(`\n完成: ${results.length} 个 app, ${totalOk}/${total} 屏成功。`)
}

// 直接执行才跑抓图 main()；被 import（如元数据/治理重建工具）时只暴露纯函数。
export { buildLlmsTxt, buildSitemap, computeGovernance }

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    killServers()
    process.exit(1)
  })
}
