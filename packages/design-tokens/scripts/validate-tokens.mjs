// Validate token sources:
//  1. every {ref} resolves against primitive.json (no cycles)
//  2. $type:color values look like colors
//  3. no duplicate var keys inside a brand mode (raw-text scan; JSON.parse hides dupes)
//  4. each brand's default mode satisfies the semantic contract in semantic.json
//  5. structural.json flat-key sanity
//  6. staleness guard: packages/theme/src/generated/*.css matches a fresh rebuild
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BRAND_APPS,
  GENERATED_DIR,
  TOKENS_DIR,
  loadBrand,
  loadComponent,
  loadPrimitive,
  loadSemantic,
  loadStructural,
  resolveValue,
  walkTokens,
} from './lib/tokens.mjs'
import {
  aggregateCss,
  brandCss,
  componentCss,
  tokensCss,
} from './lib/generate.mjs'

const primitive = loadPrimitive()
const semantic = loadSemantic()
const structural = loadStructural()
const component = loadComponent()
const errors = []

const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}\b|rgba?\(|color-mix\(|var\(--|transparent\b|currentColor\b|inherit\b)/

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
        if (seen.has(key))
          errors.push(`${app}: duplicate var "${key}" in a vars block`)
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
    if (!(name in vars))
      errors.push(`${app}: default mode missing required var "${name}"`)
  }
  const textOk = requiredTextVars.anyOf.some((set) =>
    set.every((name) => name in vars),
  )
  if (!textOk) {
    errors.push(
      `${app}: default mode has no complete text tier (${requiredTextVars.anyOf.map((s) => s.join('/')).join(' or ')})`,
    )
  }
}

// 5 — structural token tree sanity (flat keys + cssValue/color types)
for (const [key, token] of Object.entries(structural)) {
  if (key.startsWith('$')) continue
  if (!token?.$type || token.$value == null) {
    errors.push(`structural.${key}: missing $type or $value`)
    continue
  }
  if (token.$type === 'color') {
    const value = String(token.$value)
    if (!COLOR_RE.test(value))
      errors.push(`structural.${key}: invalid color "${value}"`)
  }
}

// 6 — generated CSS staleness
function checkGenerated(relPath, expected) {
  const path = join(GENERATED_DIR, relPath)
  if (!existsSync(path)) {
    errors.push(
      `stale: generated/${relPath} missing — run npm run build:tokens`,
    )
    return
  }
  if (readFileSync(path, 'utf8') !== expected) {
    errors.push(
      `stale: generated/${relPath} out of date — run npm run build:tokens`,
    )
  }
}
for (const app of BRAND_APPS) {
  checkGenerated(`brands/${app}.css`, brandCss(app, primitive).css)
}
checkGenerated('app-themes.css', aggregateCss())
checkGenerated('component.css', componentCss(component, primitive).css)
checkGenerated('tokens.css', tokensCss(primitive, semantic, structural).css)

if (errors.length > 0) {
  console.error(`validate:tokens FAILED (${errors.length}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(
  'validate:tokens OK — refs, contract, duplicates, generated CSS staleness all clean',
)
