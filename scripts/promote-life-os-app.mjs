#!/usr/bin/env node
/**
 * PLAT.SHELL.6 + PLAT.GEN.1 — 按 AppManifest 接线/同步 Life OS app 注册表。
 *
 *   node scripts/promote-life-os-app.mjs <app-id>            # 接线/同步（upsert，幂等）
 *   node scripts/promote-life-os-app.mjs <app-id> --check    # 漂移守卫：只报告，不写
 *   node scripts/promote-life-os-app.mjs --check --all       # 扫描全部带 manifest 的 app（CI 用）
 *
 * manifest（apps/<id>/app.manifest.json）是 single source of truth：
 * 改 manifest（端口/文案/路由/production…）后重跑本脚本即把注册表同步过去；
 * `--check` 在任何注册表条目与 manifest 重算结果不一致时非零退出（Nx sync:check 模式）。
 *
 * 接线点：siteMeta（typedef+entry）· launcher（origins+switcher）· brand accent ·
 * design-tokens（brands json + BRAND_APPS + theme exports）· app.css 品牌 @import ·
 * PWA 矩阵 · preview case · 根 scripts · launch.json · netlify.toml · shell spec。
 * 文件类产物（brands json / netlify.toml / spec）只创建从不覆盖——它们晋升后归 app 所有。
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadManifest, listManifestApps } from './lib/app-manifest.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const ALL = argv.includes('--all')
const ids = argv.filter((a) => !a.startsWith('--'))

if (ALL && ids.length) {
  console.error('--all 与显式 <app-id> 互斥')
  process.exit(1)
}
const targets = ALL ? listManifestApps(ROOT) : ids
if (!targets.length) {
  if (ALL) {
    console.log('check:app-manifests — 无带 manifest 的 app，跳过。')
    process.exit(0)
  }
  console.error('用法：node scripts/promote-life-os-app.mjs <app-id> [--check] | --check --all')
  process.exit(1)
}
if (targets.includes('starter')) {
  console.error('starter 是模板本体，不晋升。')
  process.exit(1)
}

const read = (p) => readFileSync(p, 'utf8')
/** 单引号 JS 字符串字面量（内含引号时退回 JSON 双引号） */
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`)
const rel = (p) => p.slice(ROOT.length + 1)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @typedef {{ label: string, path: string, status: 'ok'|'drift'|'missing'|'unpromoted', detail?: string }} StepResult
 */

/**
 * 文本接线步骤。约定：locator 含前导 \n；block 不含前导 \n；
 * present ⇔ 文件含 '\n'+block；drift ⇔ locator 命中但 block 不同；missing ⇔ 都没有。
 * @param {object} o
 * @param {string} o.label
 * @param {string} o.path
 * @param {string} o.block
 * @param {RegExp} o.locator
 * @param {(s: string, block: string) => string|null} o.insert 缺失时的插入（返回 null = 找不到插入点）
 */
function textStep(o) {
  return {
    label: o.label,
    path: o.path,
    run(write) {
      const s = read(o.path)
      if (s.includes(`\n${o.block}`)) return { status: 'ok' }
      if (o.locator.test(s)) {
        // 函数式替换，避免 block 内 $ 被当作特殊替换符
        if (write) writeFileSync(o.path, s.replace(o.locator, () => `\n${o.block}`))
        return { status: 'drift' }
      }
      if (write) {
        const next = o.insert(s, o.block)
        if (next == null) return { status: 'missing', detail: '找不到插入锚点' }
        writeFileSync(o.path, next)
      }
      return { status: 'missing' }
    },
  }
}

/** 锚点行前插入 */
const beforeAnchor = (anchor) => (s, block) =>
  s.includes(anchor) ? s.replace(anchor, () => `${block}\n${anchor}`) : null
/** 参照行后插入 */
const afterLine = (line) => (s, block) =>
  s.includes(line) ? s.replace(line, () => `${line}\n${block}`) : null

/** 文件产物步骤：只创建从不覆盖；--check 仅验存在。 */
function fileStep(label, path, content) {
  return {
    label,
    path,
    run(write) {
      if (existsSync(path)) return { status: 'ok' }
      if (write) writeFileSync(path, content())
      return { status: 'missing' }
    },
  }
}

/** @param {any} m @returns {Array<{label: string, path: string, run(write: boolean): Omit<StepResult,'label'|'path'>}>} */
function buildSteps(m) {
  const id = m.id
  const siteMetaPath = join(ROOT, 'packages', 'theme', 'src', 'siteMeta.js')
  const launcherPath = join(ROOT, 'packages', 'theme', 'src', 'launcher.js')
  const appsConfigPath = join(ROOT, 'scripts', 'pwa', 'apps.config.mjs')
  const accent = m.wordmarkAccent ?? { light: '#5b6a79', dark: '#a9b6c4' }

  const routesJs = m.routes.map((r) => `      { path: ${q(r.path)}, name: ${q(r.name)} },`).join('\n')
  const optLines = [
    m.moreButton ? `    moreButton: ${q(m.moreButton)},` : null,
    m.moreClose ? `    moreClose: ${q(m.moreClose)},` : null,
    m.authGate ? `    authGate: true,` : null,
  ].filter(Boolean)

  return [
    {
      label: 'siteMeta typedef',
      path: siteMetaPath,
      run(write) {
        const s = read(siteMetaPath)
        const typedef = s.match(/@typedef \{[^}]*\} LifeOsAppId/)?.[0] ?? ''
        if (typedef.includes(`'${id}'`)) return { status: 'ok' }
        if (write)
          writeFileSync(siteMetaPath, s.replace(/(@typedef \{[^}]*)(\} LifeOsAppId \*\/)/, `$1 | '${id}'$2`))
        return { status: 'missing' }
      },
    },
    textStep({
      label: 'siteMeta entry',
      path: siteMetaPath,
      block: `  ${id}: {
    id: ${q(id)},
    name: ${q(m.name)},
    shortName: ${q(m.shortName)},
    description: {
      zh: ${q(m.description.zh)},
      en: ${q(m.description.en)},
    },
    themeColor: { light: ${q(m.themeColor.light)}, dark: ${q(m.themeColor.dark)} },
    defaultTheme: ${q(m.defaultTheme ?? 'auto')},
    locale: ${q(m.locale ?? 'zh-CN')},
    storageKey: ${q(m.storageKey)},
    storageKind: ${q(m.storageKind ?? 'nested')},
    settingsThemePath: [${(m.settingsThemePath ?? ['settings', 'theme']).map(q).join(', ')}],
    favicon: {
      id: 'app-favicon',
      light: '/favicon-32.png',
      dark: '/favicon-32.png',
    },
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/apple-touch-icon.png',
    categories: [${(m.categories ?? ['utilities']).map(q).join(', ')}],
  },`,
      locator: new RegExp(`\\n  ${esc(id)}: \\{[\\s\\S]*?\\n  \\},`),
      insert: beforeAnchor('  // [app-generator:site-meta]'),
    }),
    textStep({
      label: 'launcher origins',
      path: launcherPath,
      block: `  ${id}: { production: ${q(`https://${m.domain}`)}, devPort: ${m.devPort} },`,
      locator: new RegExp(`\\n  ${esc(id)}: \\{ production:[^\\n]*`),
      insert: beforeAnchor('  // [app-generator:app-origins]'),
    }),
    textStep({
      label: 'launcher switcher',
      path: launcherPath,
      block: `  { id: ${q(id)}${m.experimental ? ', experimental: true' : ''} },`,
      locator: new RegExp(`\\n  \\{ id: '${esc(id)}'[^\\n]*`),
      insert: beforeAnchor('  // [app-generator:switcher-apps]'),
    }),
    textStep({
      label: 'brand wordmark accent',
      path: join(ROOT, 'packages', 'theme', 'src', 'brand.js'),
      block: `  ${id}: { light: ${q(accent.light)}, dark: ${q(accent.dark)} },`,
      locator: new RegExp(`\\n  ${esc(id)}: \\{ light:[^\\n]*`),
      insert: beforeAnchor('  // [app-generator:wordmark-accent]'),
    }),
    fileStep(
      'brand tokens json',
      join(ROOT, 'packages', 'design-tokens', 'tokens', 'brands', `${id}.json`),
      () => {
        const tpl = JSON.parse(read(join(ROOT, 'scripts', 'templates', 'life-os-brand-neutral.json')))
        delete tpl.$comment
        tpl.app = id
        tpl.defaultMode = m.defaultTheme === 'light' ? 'light' : 'dark'
        return `${JSON.stringify(tpl, null, 2)}\n`
      },
    ),
    {
      label: 'BRAND_APPS',
      path: join(ROOT, 'packages', 'design-tokens', 'scripts', 'lib', 'tokens.mjs'),
      run(write) {
        const s = read(this.path)
        const re = /export const BRAND_APPS = \[([^\]]*)\]/
        const list = s.match(re)?.[1]
        if (list == null) return { status: 'missing', detail: '找不到 BRAND_APPS 数组' }
        if (list.includes(`'${id}'`)) return { status: 'ok' }
        if (write) writeFileSync(this.path, s.replace(re, `export const BRAND_APPS = [${list}, '${id}']`))
        return { status: 'missing' }
      },
    },
    textStep({
      label: 'theme exports',
      path: join(ROOT, 'packages', 'theme', 'package.json'),
      block: `    "./brands/${id}.css": "./src/generated/brands/${id}.css",`,
      locator: new RegExp(`\\n    "\\./brands/${esc(id)}\\.css":[^\\n]*`),
      insert: (s, block) => {
        const lines = s.split('\n')
        const last = lines.findLastIndex((l) => /^\s*"\.\/brands\/.*\.css":/.test(l))
        if (last < 0) return null
        lines.splice(last + 1, 0, block)
        return lines.join('\n')
      },
    }),
    {
      label: 'app.css brand import',
      path: join(ROOT, 'apps', id, 'src', 'app.css'),
      run(write) {
        const s = read(this.path)
        const brandImport = `@import '@life-os/theme/brands/${id}.css';`
        if (s.includes(brandImport)) return { status: 'ok' }
        const re = /\/\* \[app-generator:brand-placeholder:start\][\s\S]*?\[app-generator:brand-placeholder:end\] \*\/\n?/
        if (!re.test(s)) return { status: 'missing', detail: `无占位标记，手动加 ${brandImport}` }
        if (write) writeFileSync(this.path, s.replace(re, `${brandImport}\n`))
        return { status: 'missing' }
      },
    },
    textStep({
      label: 'pwa apps.config',
      path: appsConfigPath,
      block: `  ${id}: {
    id: ${q(id)},
    name: ${q(m.name)},
    workspace: ${q(m.workspace)},
    port: ${m.devPort},
    shellType: ${q(m.shellType)},
    waitSelector: '.app-shell',
    ...scrollSelectorsFor(${q(m.shellType)}),
    nestedWrapInMain: ${m.shellType === 'main-wrap-main'},
    routes: [
${routesJs}
    ],
    clipPaths: [${(m.clipPaths ?? ['/']).map(q).join(', ')}],
    scrollQaPath: ${q(m.scrollQaPath ?? '/settings')},
${optLines.map((l) => `${l}\n`).join('')}    production: ${m.production === true},
    pwaTestEnabled: ${m.pwaTestEnabled !== false},
  },`,
      locator: new RegExp(`\\n  ${esc(id)}: \\{[\\s\\S]*?\\n  \\},`),
      insert: beforeAnchor('  // [app-generator:pwa-apps]'),
    }),
    textStep({
      label: 'preview-app.sh case',
      path: join(ROOT, 'scripts', 'pwa', 'preview-app.sh'),
      block: `  ${id}) WORKSPACE="${m.workspace}"; PORT=${m.devPort}; BUILD_DIR="apps/${id}/build" ;;`,
      locator: new RegExp(`\\n  ${esc(id)}\\) WORKSPACE=[^\\n]*`),
      insert: beforeAnchor('  # [app-generator:preview-case]'),
    }),
    textStep({
      label: `package.json build:${id}`,
      path: join(ROOT, 'package.json'),
      block: `    "build:${id}": "npm run build -w ${m.workspace}",`,
      locator: new RegExp(`\\n    "build:${esc(id)}":[^\\n]*`),
      insert: afterLine('    "build:home": "npm run build -w home-os",'),
    }),
    textStep({
      label: `package.json pwa:preview:${id}`,
      path: join(ROOT, 'package.json'),
      block: `    "pwa:preview:${id}": "bash scripts/pwa/preview-app.sh ${id}",`,
      locator: new RegExp(`\\n    "pwa:preview:${esc(id)}":[^\\n]*`),
      insert: afterLine('    "pwa:preview:home": "bash scripts/pwa/preview-app.sh home",'),
    }),
    textStep({
      label: 'launch.json',
      path: join(ROOT, '.claude', 'launch.json'),
      block: `    {
      "name": "${id}",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["exec", "--workspace", "${m.workspace}", "--", "vite", "dev", "--port", "${m.devPort}", "--strictPort", "--host", "127.0.0.1"],
      "port": ${m.devPort}
    },`,
      locator: new RegExp(`\\n    \\{\\n      "name": "${esc(id)}"[\\s\\S]*?\\n    \\},`),
      insert: (s, block) => {
        const anchor = '    {\n      "name": "design-catalog"'
        return s.includes(anchor) ? s.replace(anchor, () => `${block}\n${anchor}`) : null
      },
    }),
    fileStep(
      'netlify.toml',
      join(ROOT, 'apps', id, 'netlify.toml'),
      () => `[build]
  command = "npm run build -w ${m.workspace}"
  publish = "apps/${id}/build"
  ignore = "bash ./scripts/netlify-ignore-if-changed.sh apps/${id} packages/theme packages/sync"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`,
    ),
    fileStep('shell spec', join(ROOT, 'tests', 'pwa', `${id}-app-shell.spec.ts`), () => {
      const proper = m.shortName.charAt(0).toUpperCase() + m.shortName.slice(1).toLowerCase()
      return read(join(ROOT, 'tests', 'pwa', 'starter-app-shell.spec.ts'))
        .replaceAll('starter-shell', `${id}-shell`)
        .replaceAll("'starter'", `'${id}'`)
        .replaceAll('Starter template', m.name)
        .replaceAll('Starter', proper)
    }),
  ]
}

// —— 主流程 ——
let failed = false
let touchedRegistries = false

for (const [i, id] of targets.entries()) {
  const { manifest: m, errors } = loadManifest(ROOT, id)
  if (errors.length) {
    console.error(`✖ ${id} manifest 校验失败：\n  - ${errors.join('\n  - ')}`)
    failed = true
    continue
  }

  // 端口冲突（cache-busting 重新 import，write 模式下前一个 app 可能已改文件）
  const appsConfigUrl = `${pathToFileURL(join(ROOT, 'scripts', 'pwa', 'apps.config.mjs')).href}?v=${i}-${Date.now()}`
  const { PWA_APPS } = await import(appsConfigUrl)
  const portClash =
    Object.values(PWA_APPS).find((a) => a.id !== id && a.port === m.devPort) ??
    JSON.parse(read(join(ROOT, '.claude', 'launch.json'))).configurations.find(
      (c) => c.name !== id && c.port === m.devPort,
    )
  if (portClash) {
    console.error(`✖ ${id}：端口 ${m.devPort} 已被 "${portClash.id ?? portClash.name}" 占用，改 manifest.devPort。`)
    failed = true
    continue
  }

  const steps = buildSteps(m)
  const results = steps.map((st) => ({ label: st.label, ...st.run(!CHECK) }))

  if (CHECK) {
    const missing = results.filter((r) => r.status === 'missing')
    const drift = results.filter((r) => r.status === 'drift')
    if (missing.length === results.length) {
      console.log(`○ ${id} — 未晋升（manifest 存在但注册表无接线），跳过`)
      continue
    }
    if (!missing.length && !drift.length) {
      console.log(`✓ ${id} — ${results.length} 个接线点全部与 manifest 一致`)
      continue
    }
    failed = true
    console.error(`✖ ${id} — 注册表与 manifest 漂移：`)
    for (const r of drift) console.error(`  drift    ${r.label}${r.detail ? `（${r.detail}）` : ''}`)
    for (const r of missing) console.error(`  missing  ${r.label}${r.detail ? `（${r.detail}）` : ''}`)
    console.error(`  修复：node scripts/promote-life-os-app.mjs ${id}`)
  } else {
    const created = results.filter((r) => r.status === 'missing').map((r) => r.label)
    const updated = results.filter((r) => r.status === 'drift').map((r) => r.label)
    const bad = results.filter((r) => r.detail)
    if (bad.length) {
      failed = true
      for (const r of bad) console.error(`✖ ${id} ${r.label}：${r.detail}`)
    }
    if (created.length || updated.length) touchedRegistries = true
    console.log(`✅ ${id} 同步完成
  新接线：${created.length ? created.join('、') : '无'}
  已更新（manifest 变更同步）：${updated.length ? updated.join('、') : '无'}
  未变：${results.length - created.length - updated.length} 项`)
  }
}

if (!CHECK && touchedRegistries) {
  console.log('\n→ npm run build:tokens && npm run validate:tokens')
  execSync('npm run build:tokens && npm run validate:tokens', { cwd: ROOT, stdio: 'inherit' })
  console.log(`
验证：
  npm install && npm run check --workspace=<id>-os
  npm run check:app-manifests && npm run check:lifeos-boundaries
  PWA_APP=<id> npx playwright test tests/pwa/<id>-app-shell.spec.ts

剩余手动步骤（首次晋升）：
  - 品牌：改 packages/design-tokens/tokens/brands/<id>.json 配色 → npm run build:tokens；
    图标 scripts/generate-life-os-brand-icons.py → apps/<id>/static/
  - Netlify：新建 site（package dir apps/<id>）+ 4 个 Supabase env + GoDaddy CNAME；
    记录 docs/ops/netlify.md 六站表 + scripts/deploy-all-netlify.sh deploy_one
  - 登录/云同步（如需）：@life-os/platform-web createLifeOsAuth（参考 fitness）
  - 上线后：manifest 设 production: true 再重跑本脚本`)
}

process.exit(failed ? 1 : 0)
