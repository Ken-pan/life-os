#!/usr/bin/env node
/**
 * Life OS 样式质量护栏（棘轮模式）。
 *
 * 规则（violation 类型）：
 *   raw-hex             属性位直接写 hex 色（token 定义行 `--x: #hex` 与 generated/ 豁免）
 *   raw-font-size       font-size 写裸 px（应走 --text-*）
 *   raw-motion          transition 里写 20–380ms 字面量时长（应走 --dur-*；≥400ms 视为功能性时长豁免）
 *   svelte-custom-media .svelte 组件样式里出现 @custom-media 断点（postcss 不处理组件样式，
 *                       会原样进产物被浏览器忽略——必须写字面量断点）
 *   reserved-ds-class   app 组件在自己 scoped <style> 里重定义设计系统保留组件类
 *                       （.steps/.chip/.stat/.tabs…，清单从 theme/components.css 自动派生）。
 *                       Svelte 只提升 scope 特异性、不覆盖你没写的属性，于是全局那份组件样式
 *                       的 display/flex 等会漏进来——.steps 竖清单被压成横排 3 列即此（2026-07）。
 *                       页面自有元素请换个不占用保留名的类名（如 .task-steps）。
 *
 * 棘轮：存量违规记录在 scripts/lifeos-styles-baseline.json。
 *   当前计数 > 基线 → 失败（阻止新增劣化）
 *   当前计数 < 基线 → 提示运行 --update 收紧基线
 *
 * Usage:
 *   node scripts/check-lifeos-styles.mjs
 *   node scripts/check-lifeos-styles.mjs --update   # 重写基线
 *   node scripts/check-lifeos-styles.mjs --list <rule>  # 列出某规则全部违规位置
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BASELINE_PATH = join(ROOT, 'scripts/lifeos-styles-baseline.json')
const UPDATE = process.argv.includes('--update')
const LIST_RULE = process.argv.includes('--list')
  ? process.argv[process.argv.indexOf('--list') + 1]
  : null

const SCAN_ROOTS = [
  'apps/planner/src',
  'apps/fitness/src',
  'apps/finance/src',
  'apps/music/src',
  'apps/portal/src',
  'apps/home/src',
  'apps/health/src',
  'apps/aios/src',
  'apps/starter/src',
  'apps/design-catalog/src',
  'packages/theme/src',
  'packages/platform-web/src',
]
const EXCLUDE_DIR_NAMES = new Set([
  'node_modules', '.svelte-kit', 'build', 'dist', 'generated',
  '.netlify', 'coverage', 'test-results',
])

/**
 * 设计系统保留组件类：从 theme/components.css 顶层选择器派生（取 BEM 基名），零漂移。
 * app 组件在 scoped <style> 里重定义这些 = reserved-ds-class 违规。
 */
function loadReservedDsClasses() {
  const css = readFileSync(join(ROOT, 'packages/theme/src/components.css'), 'utf8')
  const set = new Set()
  for (const m of css.matchAll(/^\.([a-z][a-zA-Z0-9_-]*)/gm)) {
    set.add(m[1].replace(/(__|--).*/, ''))
  }
  return set
}
const RESERVED_DS = loadReservedDsClasses()
/** 拥有/演示设计系统的目录，不受 reserved-ds-class 约束 */
const DS_OWNER_PREFIXES = ['packages/theme/', 'packages/platform-web/', 'apps/design-catalog/']

/** 收集文件 */
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (EXCLUDE_DIR_NAMES.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.(css|svelte)$/.test(name)) files.push(p)
  }
}
for (const r of SCAN_ROOTS) {
  const abs = join(ROOT, r)
  if (existsSync(abs)) walk(abs)
}

/** 逐行规则。返回 violation 数组 { rule, file, line, text } */
function scanFile(file) {
  const rel = relative(ROOT, file)
  const src = readFileSync(file, 'utf8')
  const out = []
  // 粗粒度去注释（块注释整体置换为空行，保行号）
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const lines = noComments.split('\n')
  const isSvelte = file.endsWith('.svelte')
  const isDsOwner = DS_OWNER_PREFIXES.some((p) => rel.startsWith(p))

  lines.forEach((line, i) => {
    const t = line.trim()
    const loc = { file: rel, line: i + 1, text: t.slice(0, 90) }

    // raw-hex：属性位 hex（token 定义行豁免；url()/id 引用豁免）
    if (
      /#[0-9a-fA-F]{3,8}\b/.test(t) &&
      /[a-z-]+\s*:/.test(t) &&
      !/^--/.test(t) &&
      !/url\(/.test(t) &&
      !/href|xlink|fill="url|@import/.test(t)
    ) {
      out.push({ rule: 'raw-hex', ...loc })
    }

    // raw-font-size：font-size: 12px（var()/em/rem/% 豁免——rem 语义有别，此处只抓 px）
    if (/font-size\s*:\s*\d+(\.\d+)?px/.test(t)) {
      out.push({ rule: 'raw-font-size', ...loc })
    }

    // raw-motion：transition 内 20–380ms 字面量
    if (/transition[^;:]*:/.test(t) || /transition-duration\s*:/.test(t)) {
      const m = t.match(/(\d*\.?\d+)(ms|s)(?![\w-])/g) || []
      for (const dur of m) {
        const ms = dur.endsWith('ms') ? parseFloat(dur) : parseFloat(dur) * 1000
        if (ms >= 20 && ms <= 380) {
          out.push({ rule: 'raw-motion', ...loc })
          break
        }
      }
    }

    // svelte-custom-media：组件样式里的 @custom-media 断点静默失效
    if (isSvelte && /@media\s*\(\s*--life-os-|@custom-media/.test(t)) {
      out.push({ rule: 'svelte-custom-media', ...loc })
    }

    // reserved-ds-class：app 组件 scoped <style> 里**裸重定义**设计系统保留组件类。
    // 只抓 `.steps {` / `.chip,` 这种整条选择器就是一个保留裸类的规则头 ——
    // 这正是 .steps 竖清单被全局 display:flex 压横的形状。刻意放过带伪类/复合/后代的
    // 写法(.icon-btn:hover / .field.qty / .empty .btn-go)：那是给 DS 组件实例加
    // scoped 微调，全局基样式本就是想要的，不是冲突。模板 class="..." 不以 . 开头也天然排除。
    if (isSvelte && !isDsOwner) {
      const m = t.match(/^\.([a-z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*)\s*[,{]/)
      if (m && RESERVED_DS.has(m[1])) {
        out.push({ rule: 'reserved-ds-class', ...loc })
      }
    }
  })
  return out
}

const all = files.flatMap(scanFile)

/** 按 (scan root, rule) 聚合 */
function bucketOf(rel) {
  return SCAN_ROOTS.find((r) => rel.startsWith(r)) ?? 'other'
}
const counts = {}
for (const v of all) {
  const key = `${bucketOf(v.file)}|${v.rule}`
  counts[key] = (counts[key] ?? 0) + 1
}

if (LIST_RULE) {
  for (const v of all.filter((v) => v.rule === LIST_RULE)) {
    console.log(`${v.file}:${v.line}  ${v.text}`)
  }
  process.exit(0)
}

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + '\n')
  console.log(`check:lifeos-styles — baseline updated (${all.length} known violations)`)
  process.exit(0)
}

if (!existsSync(BASELINE_PATH)) {
  console.error('缺少基线文件，先运行: node scripts/check-lifeos-styles.mjs --update')
  process.exit(1)
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

let failed = false
const improved = []
for (const key of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
  const cur = counts[key] ?? 0
  const base = baseline[key] ?? 0
  if (cur > base) {
    failed = true
    const [root, rule] = key.split('|')
    console.error(`FAIL ${root} [${rule}]: ${cur} > 基线 ${base}（新增了 ${cur - base} 处）`)
    console.error(`     定位: node scripts/check-lifeos-styles.mjs --list ${rule} | grep '^${root}'`)
  } else if (cur < base) {
    improved.push(`${key}: ${base} → ${cur}`)
  }
}

if (improved.length) {
  console.log(`改善 ${improved.length} 项，可运行 --update 收紧基线：\n  ${improved.join('\n  ')}`)
}
if (failed) process.exit(1)
console.log(`check:lifeos-styles OK — ${all.length} 处存量违规（基线内），无新增`)
