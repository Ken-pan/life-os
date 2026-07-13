#!/usr/bin/env node
/**
 * PLAT.SHELL.6 — 按 AppManifest 把 starter 生成的 app 晋升为正式 Life OS app。
 *
 *   node scripts/promote-life-os-app.mjs <app-id>
 *
 * 读取 apps/<app-id>/app.manifest.json，自动接线全部注册表（幂等，可重复执行）：
 *   1. packages/theme/src/siteMeta.js      — LifeOsAppId typedef + LIFE_OS_SITE_META
 *   2. packages/theme/src/launcher.js      — LIFE_OS_APP_ORIGINS + LIFE_OS_SWITCHER_APPS
 *   3. packages/theme/src/brand.js         — LIFE_OS_APP_WORDMARK_ACCENT
 *   4. packages/design-tokens              — tokens/brands/<id>.json + BRAND_APPS + theme exports
 *   5. apps/<id>/src/app.css               — 占位品牌块 → @import '@life-os/theme/brands/<id>.css'
 *   6. scripts/pwa/apps.config.mjs         — PWA 矩阵
 *   7. scripts/pwa/preview-app.sh          — preview case
 *   8. 根 package.json                     — build:<id> / pwa:preview:<id>
 *   9. .claude/launch.json                 — dev server 配置
 *  10. apps/<id>/netlify.toml              — Netlify 构建配置
 *  11. tests/pwa/<id>-app-shell.spec.ts    — shell 合同测试（从 starter spec 派生）
 * 然后运行 build:tokens + validate:tokens，并打印剩余手动步骤。
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const [, , id] = process.argv
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('用法：node scripts/promote-life-os-app.mjs <app-id>')
  process.exit(1)
}
if (id === 'starter') {
  console.error('starter 是模板本体，不晋升。先用 create-life-os-app.mjs 生成新 app。')
  process.exit(1)
}

const manifestPath = join(ROOT, 'apps', id, 'app.manifest.json')
if (!existsSync(manifestPath)) {
  console.error(`缺少 ${manifestPath} — 先跑 node scripts/create-life-os-app.mjs ${id}`)
  process.exit(1)
}
/** @type {any} */
const m = JSON.parse(readFileSync(manifestPath, 'utf8'))

// —— manifest 校验 ——
const required = ['id', 'name', 'shortName', 'storageKey', 'devPort', 'domain', 'workspace', 'shellType', 'routes']
for (const k of required) {
  if (m[k] == null || (Array.isArray(m[k]) && m[k].length === 0)) {
    console.error(`app.manifest.json 缺少字段：${k}`)
    process.exit(1)
  }
}
if (m.id !== id) {
  console.error(`manifest.id (${m.id}) 与目录名 (${id}) 不一致`)
  process.exit(1)
}

// —— 端口冲突校验（apps.config + launch.json）——
const appsConfigPath = join(ROOT, 'scripts', 'pwa', 'apps.config.mjs')
const { PWA_APPS } = await import(pathToFileURL(appsConfigPath).href)
for (const app of Object.values(PWA_APPS)) {
  if (app.id !== id && app.port === m.devPort) {
    console.error(`端口 ${m.devPort} 已被 ${app.id} 占用（scripts/pwa/apps.config.mjs），改 manifest.devPort。`)
    process.exit(1)
  }
}
const launchPath = join(ROOT, '.claude', 'launch.json')
const launchJson = JSON.parse(readFileSync(launchPath, 'utf8'))
for (const cfg of launchJson.configurations) {
  if (cfg.name !== id && cfg.port === m.devPort) {
    console.error(`端口 ${m.devPort} 已被 launch.json 的 "${cfg.name}" 占用，改 manifest.devPort。`)
    process.exit(1)
  }
}

const changed = []
const skipped = []
const read = (p) => readFileSync(p, 'utf8')
const write = (p, s) => writeFileSync(p, s)
/** 单引号 JS 字符串字面量（内含引号时退回 JSON 双引号） */
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`)
const rel = (p) => p.slice(ROOT.length + 1)

/** 在锚点行前插入块；containsRe 命中则跳过（幂等） */
function insertAtAnchor(path, anchor, block, containsRe, label) {
  const s = read(path)
  if (containsRe.test(s)) {
    skipped.push(label)
    return
  }
  if (!s.includes(anchor)) {
    console.error(`${rel(path)} 缺少锚点 ${anchor}`)
    process.exit(1)
  }
  write(path, s.replace(anchor, `${block}\n${anchor}`))
  changed.push(label)
}

// —— 1. siteMeta.js：typedef + LIFE_OS_SITE_META ——
const siteMetaPath = join(ROOT, 'packages', 'theme', 'src', 'siteMeta.js')
{
  let s = read(siteMetaPath)
  if (!new RegExp(`'${id}'`).test(s.split('\n')[0])) {
    s = s.replace(/(@typedef \{[^}]*)(\} LifeOsAppId \*\/)/, `$1 | '${id}'$2`)
    write(siteMetaPath, s)
    changed.push('siteMeta typedef')
  } else {
    skipped.push('siteMeta typedef')
  }
}
insertAtAnchor(
  siteMetaPath,
  '  // [app-generator:site-meta]',
  `  ${id}: {
    id: ${q(id)},
    name: ${q(m.name)},
    shortName: ${q(m.shortName)},
    description: {
      zh: ${q(m.description?.zh ?? m.name)},
      en: ${q(m.description?.en ?? m.name)},
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
  new RegExp(`\\n  ${id}: \\{`),
  'siteMeta entry',
)

// —— 2. launcher.js：origins + switcher ——
const launcherPath = join(ROOT, 'packages', 'theme', 'src', 'launcher.js')
insertAtAnchor(
  launcherPath,
  '  // [app-generator:app-origins]',
  `  ${id}: { production: ${q(`https://${m.domain}`)}, devPort: ${m.devPort} },`,
  new RegExp(`\\n  ${id}: \\{ production:`),
  'launcher origins',
)
insertAtAnchor(
  launcherPath,
  '  // [app-generator:switcher-apps]',
  `  { id: ${q(id)}${m.experimental ? ', experimental: true' : ''} },`,
  new RegExp(`\\{ id: '${id}'`),
  'launcher switcher',
)

// —— 3. brand.js：wordmark accent ——
const accent = m.wordmarkAccent ?? { light: '#5b6a79', dark: '#a9b6c4' }
insertAtAnchor(
  join(ROOT, 'packages', 'theme', 'src', 'brand.js'),
  '  // [app-generator:wordmark-accent]',
  `  ${id}: { light: ${q(accent.light)}, dark: ${q(accent.dark)} },`,
  new RegExp(`\\n  ${id}: \\{ light:`),
  'brand wordmark accent',
)

// —— 4. design-tokens：brands/<id>.json + BRAND_APPS + theme exports ——
const brandJsonPath = join(ROOT, 'packages', 'design-tokens', 'tokens', 'brands', `${id}.json`)
if (!existsSync(brandJsonPath)) {
  const tpl = JSON.parse(read(join(ROOT, 'scripts', 'templates', 'life-os-brand-neutral.json')))
  delete tpl.$comment
  tpl.app = id
  tpl.defaultMode = m.defaultTheme === 'light' ? 'light' : 'dark'
  write(brandJsonPath, `${JSON.stringify(tpl, null, 2)}\n`)
  changed.push('brand tokens json')
} else {
  skipped.push('brand tokens json')
}
{
  const p = join(ROOT, 'packages', 'design-tokens', 'scripts', 'lib', 'tokens.mjs')
  const s = read(p)
  const re = /export const BRAND_APPS = \[([^\]]*)\]/
  const list = s.match(re)[1]
  if (!list.includes(`'${id}'`)) {
    write(p, s.replace(re, `export const BRAND_APPS = [${list}, '${id}']`))
    changed.push('BRAND_APPS')
  } else {
    skipped.push('BRAND_APPS')
  }
}
{
  const p = join(ROOT, 'packages', 'theme', 'package.json')
  const s = read(p)
  const exportLine = `    "./brands/${id}.css": "./src/generated/brands/${id}.css",`
  if (!s.includes(`"./brands/${id}.css"`)) {
    const lines = s.split('\n')
    const last = lines.findLastIndex((l) => /^\s*"\.\/brands\/.*\.css":/.test(l))
    lines.splice(last + 1, 0, exportLine)
    write(p, lines.join('\n'))
    changed.push('theme exports')
  } else {
    skipped.push('theme exports')
  }
}

// —— 5. app.css：占位块 → 品牌 @import ——
{
  const p = join(ROOT, 'apps', id, 'src', 'app.css')
  const s = read(p)
  const brandImport = `@import '@life-os/theme/brands/${id}.css';`
  if (s.includes(brandImport)) {
    skipped.push('app.css brand import')
  } else {
    const re = /\/\* \[app-generator:brand-placeholder:start\][\s\S]*?\[app-generator:brand-placeholder:end\] \*\/\n?/
    if (!re.test(s)) {
      console.error(`${rel(p)} 缺少 brand-placeholder 标记块，手动替换为 ${brandImport}`)
      process.exit(1)
    }
    write(p, s.replace(re, `${brandImport}\n`))
    changed.push('app.css brand import')
  }
}

// —— 6. PWA 矩阵 ——
const routesJs = m.routes
  .map((r) => `      { path: ${q(r.path)}, name: ${q(r.name)} },`)
  .join('\n')
insertAtAnchor(
  appsConfigPath,
  '  // [app-generator:pwa-apps]',
  `  ${id}: {
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
    production: false,
    pwaTestEnabled: true,
  },`,
  new RegExp(`\\n  ${id}: \\{`),
  'pwa apps.config',
)

// —— 7. preview-app.sh case ——
insertAtAnchor(
  join(ROOT, 'scripts', 'pwa', 'preview-app.sh'),
  '  # [app-generator:preview-case]',
  `  ${id}) WORKSPACE="${m.workspace}"; PORT=${m.devPort}; BUILD_DIR="apps/${id}/build" ;;`,
  new RegExp(`\\n  ${id}\\) WORKSPACE=`),
  'preview-app.sh case',
)

// —— 8. 根 package.json scripts ——
{
  const p = join(ROOT, 'package.json')
  let s = read(p)
  const pairs = [
    [`"build:${id}"`, '    "build:home": "npm run build -w home-os",', `    "build:${id}": "npm run build -w ${m.workspace}",`],
    [`"pwa:preview:${id}"`, '    "pwa:preview:home": "bash scripts/pwa/preview-app.sh home",', `    "pwa:preview:${id}": "bash scripts/pwa/preview-app.sh ${id}",`],
  ]
  for (const [key, after, line] of pairs) {
    if (s.includes(key)) {
      skipped.push(`package.json ${key}`)
      continue
    }
    if (!s.includes(after)) {
      console.error(`根 package.json 找不到插入参照行：${after.trim()}`)
      process.exit(1)
    }
    s = s.replace(after, `${after}\n${line}`)
    changed.push(`package.json ${key}`)
  }
  write(p, s)
}

// —— 9. .claude/launch.json ——
{
  const s = read(launchPath)
  if (launchJson.configurations.some((c) => c.name === id)) {
    skipped.push('launch.json')
  } else {
    const marker = /(    \{\n      "name": "design-catalog")/
    const entry = `    {
      "name": "${id}",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["exec", "--workspace", "${m.workspace}", "--", "vite", "dev", "--port", "${m.devPort}", "--strictPort", "--host", "127.0.0.1"],
      "port": ${m.devPort}
    },
`
    if (!marker.test(s)) {
      console.error('.claude/launch.json 找不到 design-catalog 插入参照，手动补 dev 配置。')
      process.exit(1)
    }
    write(launchPath, s.replace(marker, `${entry}$1`))
    changed.push('launch.json')
  }
}

// —— 10. netlify.toml ——
{
  const p = join(ROOT, 'apps', id, 'netlify.toml')
  if (existsSync(p)) {
    skipped.push('netlify.toml')
  } else {
    write(
      p,
      `[build]
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
    )
    changed.push('netlify.toml')
  }
}

// —— 11. shell 合同测试 ——
{
  const p = join(ROOT, 'tests', 'pwa', `${id}-app-shell.spec.ts`)
  if (existsSync(p)) {
    skipped.push('shell spec')
  } else {
    const proper = m.shortName.charAt(0).toUpperCase() + m.shortName.slice(1).toLowerCase()
    const spec = read(join(ROOT, 'tests', 'pwa', 'starter-app-shell.spec.ts'))
      .replaceAll('starter-shell', `${id}-shell`)
      .replaceAll("'starter'", `'${id}'`)
      .replaceAll('Starter template', m.name)
      .replaceAll('Starter', proper)
    write(p, spec)
    changed.push('shell spec')
  }
}

// —— 重建生成物 + 校验 ——
console.log('\n→ npm run build:tokens && npm run validate:tokens')
execSync('npm run build:tokens && npm run validate:tokens', { cwd: ROOT, stdio: 'inherit' })

console.log(`
✅ ${id} 晋升接线完成
  接线：${changed.length ? changed.join('、') : '（无 — 全部已就位）'}
  跳过（已存在）：${skipped.length ? skipped.join('、') : '无'}

验证：
  npm install && npm run check --workspace=${m.workspace}
  npm run check:lifeos-boundaries
  PWA_APP=${id} npx playwright test tests/pwa/${id}-app-shell.spec.ts

剩余手动步骤：
  - 品牌：改 packages/design-tokens/tokens/brands/${id}.json 配色 → npm run build:tokens；
    图标 scripts/generate-life-os-brand-icons.py（favicon-32 / apple-touch-icon / brand-circle-*）→ apps/${id}/static/
  - Netlify：新建 site（package dir apps/${id}，build "npm run build -w ${m.workspace}"，publish apps/${id}/build），
    环境变量 4 个（PUBLIC_/VITE_ SUPABASE），GoDaddy CNAME ${m.domain} → <site>.netlify.app
  - 记录：docs/ops/netlify.md 六站表加行；scripts/deploy-all-netlify.sh 加 deploy_one（需 site id）
  - 登录/云同步（如需）：接 @life-os/platform-web createLifeOsAuth（参考 fitness src/lib/auth.svelte.js）
  - 上线后：apps.config.mjs 该 app production: true
`)
