#!/usr/bin/env node
/**
 * Design catalog showcase 注册完整性校验。
 *
 * 新增一个 showcase 要同步四处（DESIGN.md「加一个 showcase 怎么加」），
 * 2026-07-15 曾漏掉 showcaseStates 注册（commit 79439f8d 补救）。本脚本把
 * 四处对账变成机器护栏：
 *
 *   1. catalogNav.js  CATALOG_SECTIONS ↔ App.svelte pages 映射 双向一致
 *   2. 每个 section id 有对应 showcases/*Showcase.svelte 文件（且无孤儿文件）
 *   3. MATRIX_SHOWCASES 的每个 id 在 SHOWCASE_STATE_REGISTRY 与
 *      MATRIX_IFRAME_HEIGHTS 都有显式注册
 *   4. SHOWCASE_STATE_REGISTRY / MATRIX_IFRAME_HEIGHTS 没有未知 key
 *      （防拼写漂移），且两者 key 集一致
 *
 * Usage: node scripts/check-design-catalog-registry.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_SRC = join(ROOT, 'apps', 'design-catalog', 'src')
const errors = []

const nav = await import(
  pathToFileURL(join(CATALOG_SRC, 'lib', 'catalogNav.js')).href
)
const sectionIds = nav.CATALOG_SECTIONS.map((s) => s.id)
const matrixIds = nav.MATRIX_SHOWCASES.map((s) => s.id)

// —— 1. CATALOG_SECTIONS ↔ App.svelte pages ——
const appSvelte = readFileSync(join(CATALOG_SRC, 'App.svelte'), 'utf8')
const pagesMatch = appSvelte.match(/const pages = \{([\s\S]*?)\n {2}\}/)
if (!pagesMatch) {
  errors.push('App.svelte: 找不到 `const pages = {…}` 映射')
} else {
  const pageIds = [...pagesMatch[1].matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:/gm)].map(
    (m) => m[1],
  )
  for (const id of sectionIds) {
    if (!pageIds.includes(id))
      errors.push(`App.svelte pages 缺 catalogNav section "${id}"`)
  }
  for (const id of pageIds) {
    if (!sectionIds.includes(id))
      errors.push(`App.svelte pages 有未注册进 catalogNav 的 "${id}"`)
  }
}

// —— 2. showcase 文件存在且无孤儿 ——
const showcaseFiles = readdirSync(join(CATALOG_SRC, 'showcases')).filter((f) =>
  f.endsWith('Showcase.svelte'),
)
// tokens → TokensShowcase.svelte · explain-panel → ExplainPanelShowcase.svelte
const idToFile = (id) =>
  id
    .split('-')
    .map((seg) => seg[0].toUpperCase() + seg.slice(1))
    .join('') + 'Showcase.svelte'
for (const id of sectionIds) {
  if (!showcaseFiles.includes(idToFile(id)))
    errors.push(`showcases/ 缺 ${idToFile(id)}（section "${id}"）`)
}
for (const f of showcaseFiles) {
  if (!sectionIds.some((id) => idToFile(id) === f))
    errors.push(`showcases/${f} 是孤儿文件（无 catalogNav section）`)
}

// —— 3+4. states / heights 注册对账 ——
const statesSrc = readFileSync(
  join(CATALOG_SRC, 'lib', 'showcaseStates.js'),
  'utf8',
)
// 两个 registry 都是顶层对象字面量；提取其顶层 key
function topLevelKeys(objectSrc) {
  const keys = []
  let depth = 0
  for (const line of objectSrc.split('\n')) {
    const open = (line.match(/[{[]/g) ?? []).length
    const close = (line.match(/[}\]]/g) ?? []).length
    if (depth === 1) {
      const m = line.match(/^\s{2}'?([a-z][a-z0-9-]*)'?:/)
      if (m) keys.push(m[1])
    }
    depth += open - close
  }
  return keys
}
function extractObject(src, marker) {
  const start = src.indexOf(marker)
  if (start === -1) return null
  const braceStart = src.indexOf('{', start)
  let depth = 0
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(braceStart, i + 1)
    }
  }
  return null
}
const stateRegistrySrc = extractObject(statesSrc, 'SHOWCASE_STATE_REGISTRY =')
const heightsSrc = extractObject(statesSrc, 'MATRIX_IFRAME_HEIGHTS =')
if (!stateRegistrySrc || !heightsSrc) {
  errors.push('showcaseStates.js: 找不到 SHOWCASE_STATE_REGISTRY / MATRIX_IFRAME_HEIGHTS')
} else {
  const stateKeys = topLevelKeys(stateRegistrySrc)
  const heightKeys = topLevelKeys(heightsSrc)
  for (const id of matrixIds) {
    if (!stateKeys.includes(id))
      errors.push(`SHOWCASE_STATE_REGISTRY 缺 matrix showcase "${id}"`)
    if (!heightKeys.includes(id))
      errors.push(`MATRIX_IFRAME_HEIGHTS 缺 matrix showcase "${id}"`)
  }
  for (const key of stateKeys) {
    if (!sectionIds.includes(key))
      errors.push(`SHOWCASE_STATE_REGISTRY 有未知 key "${key}"`)
    if (!matrixIds.includes(key))
      errors.push(
        `SHOWCASE_STATE_REGISTRY 的 "${key}" 不在 MATRIX_SHOWCASES（要么补 matrix 注册要么删状态）`,
      )
  }
  for (const key of heightKeys) {
    if (!stateKeys.includes(key))
      errors.push(`MATRIX_IFRAME_HEIGHTS 的 "${key}" 在 SHOWCASE_STATE_REGISTRY 缺席`)
  }
}

if (errors.length > 0) {
  console.error(`check:design-catalog-registry FAILED (${errors.length}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(
  `check:design-catalog-registry OK — ${sectionIds.length} sections · ${matrixIds.length} matrix showcases 四处注册一致`,
)
