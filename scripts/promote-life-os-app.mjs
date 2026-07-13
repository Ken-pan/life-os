#!/usr/bin/env node
/**
 * PLAT.SHELL.6 + PLAT.GEN.1/4 — 按 AppManifest 晋升/同步 Life OS app。
 *
 *   node scripts/promote-life-os-app.mjs <app-id>            # 晋升/同步（幂等）
 *   node scripts/promote-life-os-app.mjs <app-id> --check    # 漂移守卫：只报告，不写
 *
 * manifest（apps/<id>/app.manifest.json）是 single source of truth。
 * PLAT.GEN.4 之后 siteMeta / launcher / brand / PWA 矩阵由
 * scripts/build-app-registry.mjs 直接从 manifest 生成（本脚本代跑）；
 * 这里只剩注册表之外的接线：
 *   design-tokens（brands json + BRAND_APPS + theme exports）· app.css 品牌
 *   @import · preview case · 根 scripts · launch.json · netlify.toml · shell spec。
 * 文件类产物（brands json / netlify.toml / spec）只创建从不覆盖——晋升后归 app 所有。
 * 注意：本脚本面向 starter 派生的新 app；六个存量 app 的 launch.json 端口等
 * 属历史约定，不要对它们跑写模式。全仓漂移守卫走 npm run check:app-manifests。
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadManifest } from './lib/app-manifest.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const id = argv.find((a) => !a.startsWith('--'))

if (!id) {
  console.error('用法：node scripts/promote-life-os-app.mjs <app-id> [--check]')
  process.exit(1)
}
if (id === 'starter') {
  console.error('starter 是模板本体，不晋升。')
  process.exit(1)
}

const read = (p) => readFileSync(p, 'utf8')
/** 单引号 JS 字符串字面量（内含引号时退回 JSON 双引号） */
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 文本接线步骤。约定：locator 含前导 \n；block 不含前导 \n。
 * @param {{ label: string, path: string, block: string, locator: RegExp,
 *           insert: (s: string, block: string) => string|null }} o
 */
function textStep(o) {
  return {
    label: o.label,
    run(write) {
      const s = read(o.path)
      if (s.includes(`\n${o.block}`)) return { status: 'ok' }
      if (o.locator.test(s)) {
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
    run(write) {
      if (existsSync(path)) return { status: 'ok' }
      if (write) writeFileSync(path, content())
      return { status: 'missing' }
    },
  }
}

// —— manifest 校验 ——
const { manifest: m, errors } = loadManifest(ROOT, id)
if (errors.length) {
  console.error(`✖ ${id} manifest 校验失败：\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}
const previewPort = m.previewPort ?? m.devPort

// —— 端口冲突（排除自身；launch.json 的存量端口是历史约定，只查撞车） ——
const appsConfigUrl = `${pathToFileURL(join(ROOT, 'scripts', 'pwa', 'apps.config.mjs')).href}?t=${Date.now()}`
const { PWA_APPS } = await import(appsConfigUrl)
const launchPath = join(ROOT, '.claude', 'launch.json')
const portClash =
  Object.values(PWA_APPS).find((a) => a.id !== id && a.port === previewPort) ??
  JSON.parse(read(launchPath)).configurations.find((c) => c.name !== id && c.port === m.devPort)
if (portClash) {
  console.error(`✖ ${id}：端口已被 "${portClash.id ?? portClash.name}" 占用，改 manifest.devPort/previewPort。`)
  process.exit(1)
}

// —— 1. app 注册表（siteMeta/launcher/brand/PWA 矩阵，PLAT.GEN.4 生成物） ——
const registryStep = {
  label: 'app registry（siteMeta/launcher/brand/PWA）',
  run(write) {
    try {
      execSync(`node scripts/build-app-registry.mjs${write ? '' : ' --check'}`, {
        cwd: ROOT,
        stdio: 'pipe',
      })
      return { status: 'ok' }
    } catch (err) {
      if (!write) return { status: 'drift', detail: 'appRegistry.js 过期，跑 npm run build:app-registry' }
      return { status: 'missing', detail: String(err.stderr ?? err.message).trim() }
    }
  },
}

const steps = [
  registryStep,
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
    run(write) {
      const p = join(ROOT, 'packages', 'design-tokens', 'scripts', 'lib', 'tokens.mjs')
      const s = read(p)
      const re = /export const BRAND_APPS = \[([^\]]*)\]/
      const list = s.match(re)?.[1]
      if (list == null) return { status: 'missing', detail: '找不到 BRAND_APPS 数组' }
      if (list.includes(`'${id}'`)) return { status: 'ok' }
      if (write) writeFileSync(p, s.replace(re, `export const BRAND_APPS = [${list}, '${id}']`))
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
    run(write) {
      const p = join(ROOT, 'apps', id, 'src', 'app.css')
      const s = read(p)
      const brandImport = `@import '@life-os/theme/brands/${id}.css';`
      if (s.includes(brandImport)) return { status: 'ok' }
      const re = /\/\* \[app-generator:brand-placeholder:start\][\s\S]*?\[app-generator:brand-placeholder:end\] \*\/\n?/
      if (!re.test(s)) return { status: 'missing', detail: `无占位标记，手动加 ${brandImport}` }
      if (write) writeFileSync(p, s.replace(re, `${brandImport}\n`))
      return { status: 'missing' }
    },
  },
  textStep({
    label: 'preview-app.sh case',
    path: join(ROOT, 'scripts', 'pwa', 'preview-app.sh'),
    block: `  ${id}) WORKSPACE="${m.workspace}"; PORT=${previewPort}; BUILD_DIR="apps/${id}/build" ;;`,
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
    path: launchPath,
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

const results = steps.map((st) => ({ label: st.label, ...st.run(!CHECK) }))

if (CHECK) {
  const missing = results.filter((r) => r.status === 'missing')
  const drift = results.filter((r) => r.status === 'drift')
  if (!missing.length && !drift.length) {
    console.log(`✓ ${id} — ${results.length} 个接线点全部与 manifest 一致`)
    process.exit(0)
  }
  console.error(`✖ ${id} — 与 manifest 漂移：`)
  for (const r of drift) console.error(`  drift    ${r.label}${r.detail ? `（${r.detail}）` : ''}`)
  for (const r of missing) console.error(`  missing  ${r.label}${r.detail ? `（${r.detail}）` : ''}`)
  console.error(`  修复：node scripts/promote-life-os-app.mjs ${id}`)
  process.exit(1)
}

const created = results.filter((r) => r.status === 'missing').map((r) => r.label)
const updated = results.filter((r) => r.status === 'drift').map((r) => r.label)
const bad = results.filter((r) => r.detail)
for (const r of bad) console.error(`✖ ${id} ${r.label}：${r.detail}`)

console.log(`✅ ${id} 同步完成
  新接线：${created.length ? created.join('、') : '无'}
  已更新（manifest 变更同步）：${updated.length ? updated.join('、') : '无'}
  未变：${results.length - created.length - updated.length} 项`)

if (created.length || updated.length) {
  console.log('\n→ npm run build:tokens && npm run validate:tokens')
  execSync('npm run build:tokens && npm run validate:tokens', { cwd: ROOT, stdio: 'inherit' })
  console.log(`
验证：
  npm install && npm run check --workspace=${m.workspace}
  npm run check:app-manifests && npm run check:lifeos-boundaries
  PWA_APP=${id} npx playwright test tests/pwa/${id}-app-shell.spec.ts

Day-2（首次晋升，PLAT.GEN.2 已自动化）：
  - 图标：python3 scripts/generate-life-os-brand-icons.py --bootstrap ${id}
  - 部署：node scripts/netlify-provision.mjs ${id} --apply（先 dry-run 看计划）
  - 品牌：改 packages/design-tokens/tokens/brands/${id}.json 配色 → npm run build:tokens
  - 上线后：manifest 设 production: true 再跑 npm run build:app-registry`)
}

process.exit(bad.length ? 1 : 0)
