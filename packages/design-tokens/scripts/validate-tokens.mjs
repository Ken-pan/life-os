// Validate token sources:
//  1. every {ref} resolves against primitive.json (no cycles)
//  2. $type:color values look like colors
//  3. no duplicate var keys inside a brand mode (raw-text scan; JSON.parse hides dupes)
//  4. each brand's default mode satisfies the semantic contract in semantic.json
//  5. drift guard: primitive/semantic values still match packages/theme/src/tokens.css
//     (tokens.css stays authored until P2 flips it to generated)
//  6. staleness guard: packages/theme/src/generated/*.css matches a fresh rebuild
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BRAND_APPS,
  GENERATED_DIR,
  THEME_SRC,
  TOKENS_DIR,
  loadBrand,
  loadComponent,
  loadPrimitive,
  loadSemantic,
  resolveValue,
  walkTokens,
} from './lib/tokens.mjs'
import { aggregateCss, brandCss, componentCss } from './lib/generate.mjs'

const primitive = loadPrimitive()
const semantic = loadSemantic()
const component = loadComponent()
const errors = []

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}\b|rgba?\(|color-mix\(|var\(--|transparent\b|currentColor\b|inherit\b)/

function checkTree(label, tree) {
  walkTokens(tree, (path, token) => {
    const { value, error } = resolveValue(token.$value, primitive)
    if (error) {
      errors.push(`${label}.${path}: ${error}`)
      return
    }
    if (token.$type === 'color' && !COLOR_RE.test(value)) {
      errors.push(`${label}.${path}: $type is color but value is "${value}"`)
    }
  })
}

// 1+2 — refs and color formats
checkTree('primitive', primitive)
checkTree('semantic', semantic.status)
checkTree('component', component)
for (const app of BRAND_APPS) checkTree(app, loadBrand(app).modes)

// 3 — duplicate var keys per "vars" block in the raw brand JSON
function checkDuplicateVars(app) {
  const raw = readFileSync(join(TOKENS_DIR, 'brands', `${app}.json`), 'utf8')
  const varsRe = /"vars":\s*\{/g
  let m
  while ((m = varsRe.exec(raw))) {
    let depth = 1
    let i = varsRe.lastIndex
    const seen = new Set()
    while (i < raw.length && depth > 0) {
      const ch = raw[i]
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      else if (ch === '"' && depth === 1) {
        const key = raw.slice(i + 1, raw.indexOf('"', i + 1))
        if (seen.has(key)) errors.push(`${app}: duplicate var "${key}" in a vars block`)
        seen.add(key)
        // skip past this token's value object
        i = raw.indexOf('{', i)
        depth += 1
      }
      i += 1
    }
  }
}
BRAND_APPS.forEach(checkDuplicateVars)

// 4 — semantic contract
const { requiredBrandVars, requiredTextVars } = semantic.contract
for (const app of BRAND_APPS) {
  const doc = loadBrand(app)
  const vars = doc.modes[doc.defaultMode]?.vars ?? {}
  for (const name of requiredBrandVars) {
    if (!(name in vars)) errors.push(`${app}: default mode missing required var "${name}"`)
  }
  const textOk = requiredTextVars.anyOf.some((set) => set.every((name) => name in vars))
  if (!textOk) {
    errors.push(`${app}: default mode has no complete text tier (${requiredTextVars.anyOf.map((s) => s.join('/')).join(' or ')})`)
  }
}

// 5 — drift guard against authored tokens.css
const tokensCss = readFileSync(join(THEME_SRC, 'tokens.css'), 'utf8')

function cssVars(block) {
  const map = new Map()
  const re = /--([a-zA-Z0-9-]+):\s*([^;]+);/g
  let m
  while ((m = re.exec(block))) map.set(m[1], m[2].replace(/\s+/g, ' ').trim())
  return map
}

const darkStart = tokensCss.indexOf(":root[data-theme='dark']")
const lightVars = cssVars(tokensCss.slice(0, darkStart))
const darkVars = cssVars(tokensCss.slice(darkStart, tokensCss.indexOf('}', darkStart)))

function expectCss(map, varName, tokenNode, label) {
  if (!tokenNode) return
  const actual = map.get(varName)
  const expected = String(tokenNode.$value).replace(/\s+/g, ' ').trim()
  if (actual === undefined) {
    errors.push(`drift: tokens.css missing --${varName} (declared by ${label})`)
  } else if (actual !== expected) {
    errors.push(`drift: --${varName} tokens.css="${actual}" vs ${label}="${expected}"`)
  }
}

for (const [key, node] of Object.entries(primitive.space)) expectCss(lightVars, `space-${key}`, node, `primitive.space.${key}`)
for (const [key, node] of Object.entries(primitive.radius)) expectCss(lightVars, `radius-${key}`, node, `primitive.radius.${key}`)
for (const [key, node] of Object.entries(primitive.text)) expectCss(lightVars, `text-${key}`, node, `primitive.text.${key}`)
for (const [key, node] of Object.entries(primitive.font)) expectCss(lightVars, key, node, `primitive.font.${key}`)
for (const [key, node] of Object.entries(semantic.status.light)) expectCss(lightVars, key, node, `semantic.status.light.${key}`)
for (const [key, node] of Object.entries(semantic.status.dark)) expectCss(darkVars, key, node, `semantic.status.dark.${key}`)

// 6 — generated CSS staleness
function checkGenerated(relPath, expected) {
  const path = join(GENERATED_DIR, relPath)
  if (!existsSync(path)) {
    errors.push(`stale: generated/${relPath} missing — run npm run build:tokens`)
    return
  }
  if (readFileSync(path, 'utf8') !== expected) {
    errors.push(`stale: generated/${relPath} out of date — run npm run build:tokens`)
  }
}
for (const app of BRAND_APPS) {
  checkGenerated(`brands/${app}.css`, brandCss(app, primitive).css)
}
checkGenerated('app-themes.css', aggregateCss())
checkGenerated('component.css', componentCss(component, primitive).css)

if (errors.length > 0) {
  console.error(`validate:tokens FAILED (${errors.length}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('validate:tokens OK — refs, contract, duplicates, tokens.css drift all clean')
