#!/usr/bin/env node
/**
 * PLAT.SHELL.5 — 从 apps/starter 模板生成新的 Life OS app。
 *
 *   node scripts/create-life-os-app.mjs <app-id> [--name "READING.OS"] [--port 5876]
 *
 * <app-id>：小写字母/数字/连字符（如 reading）。生成 apps/<app-id>/，
 * workspace 名 <app-id>-os，并替换模板里的 starter 标识。
 * 注册表类接线（brand / site meta / portal switcher / netlify / PWA 矩阵）
 * 属于 PLAT.SHELL.6 generator 的范围，脚本最后会打印手动清单。
 */
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const [, , rawId, ...rest] = process.argv
if (!rawId || !/^[a-z][a-z0-9-]*$/.test(rawId)) {
  console.error('用法：node scripts/create-life-os-app.mjs <app-id> [--name "X.OS"] [--port 5876]')
  process.exit(1)
}
const id = rawId
const args = Object.fromEntries(
  rest.map((v, i, a) => (v.startsWith('--') ? [v.slice(2), a[i + 1]] : null)).filter(Boolean),
)
const displayName = args.name ?? `${id.toUpperCase()}.OS`
const port = Number(args.port ?? 5876)

const src = join(ROOT, 'apps', 'starter')
const dest = join(ROOT, 'apps', id)
if (existsSync(dest)) {
  console.error(`apps/${id} 已存在，中止。`)
  process.exit(1)
}

cpSync(src, dest, {
  recursive: true,
  filter: (p) => !/node_modules|\.svelte-kit|\/build\b/.test(p),
})

/** 递归替换文本文件里的模板标识 */
const TEXT_RE = /\.(js|ts|svelte|json|html|css|md|webmanifest)$/
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      walk(p)
    } else if (TEXT_RE.test(entry)) {
      let s = readFileSync(p, 'utf8')
      s = s
        .replaceAll('STARTER.OS', displayName)
        .replaceAll('Life OS starter', displayName)
        .replaceAll('starter-os', `${id}-os`)
        .replaceAll('starteros_v1', `${id}os_v1`)
        .replaceAll('starter-shell', `${id}-shell`)
        .replaceAll('data-app="starter"', `data-app="${id}"`)
        .replaceAll('5875', String(port))
      writeFileSync(p, s)
    }
  }
}
walk(dest)

console.log(`✅ apps/${id} 已生成（workspace ${id}-os · 端口 ${port} · ${displayName}）

下一步：
  1. npm install                       # 链接新 workspace
  2. npm run check --workspace=${id}-os
  3. npm exec --workspace ${id}-os -- vite dev

晋升为正式 app 时（暂属手动，PLAT.SHELL.6 generator 将自动化）：
  - 品牌 token → packages/design-tokens/tokens/brands/${id}.json + app.css 换 @import
  - site meta / wordmark → packages/theme/src/documentMeta.js · brand.js
  - Portal 切换器 → LIFE_OS_SWITCHER_APPS
  - PWA 矩阵 → scripts/pwa/apps.config.mjs（含图标 → scripts/generate-life-os-brand-icons.py）
  - 部署 → 根 netlify.toml + .claude/launch.json + docs/ops/netlify.md
`)
