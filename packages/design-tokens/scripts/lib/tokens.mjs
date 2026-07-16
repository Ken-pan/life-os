// Shared helpers: load token JSON, resolve {dot.path} refs against primitive.json.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PKG_ROOT = join(__dirname, '..', '..')
export const REPO_ROOT = join(PKG_ROOT, '..', '..')
export const TOKENS_DIR = join(PKG_ROOT, 'tokens')
export const THEME_SRC = join(REPO_ROOT, 'packages', 'theme', 'src')
export const GENERATED_DIR = join(THEME_SRC, 'generated')

// [app-generator:brand-apps] promote-life-os-app.mjs 会向此数组追加新 app
export const BRAND_APPS = ['planner', 'fitness', 'finance', 'music', 'home', 'aios', 'portal', 'knowledge', 'health']

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function loadPrimitive() {
  return loadJson(join(TOKENS_DIR, 'primitive.json'))
}

export function loadSemantic() {
  return loadJson(join(TOKENS_DIR, 'semantic.json'))
}

export function loadComponent() {
  return loadJson(join(TOKENS_DIR, 'component.json'))
}

export function loadStructural() {
  return loadJson(join(TOKENS_DIR, 'structural.json'))
}

/** card.bgHover → card-bg-hover */
export function tokenVarName(path) {
  return path
    .map((seg) => seg.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-')
}

export function loadBrand(app) {
  return loadJson(join(TOKENS_DIR, 'brands', `${app}.json`))
}

export function lookupPath(tree, dotPath) {
  let node = tree
  for (const part of dotPath.split('.')) {
    if (node == null || typeof node !== 'object' || !(part in node))
      return undefined
    node = node[part]
  }
  return node
}

const REF_RE = /^\{([a-zA-Z0-9_.-]+)\}$/

// Resolve a token $value; refs point into primitive.json and may chain.
export function resolveValue(rawValue, primitive, seen = new Set()) {
  const m = typeof rawValue === 'string' && rawValue.match(REF_RE)
  if (!m) return { value: rawValue, error: null }
  const path = m[1]
  if (seen.has(path)) return { value: null, error: `circular ref {${path}}` }
  seen.add(path)
  const node = lookupPath(primitive, path)
  if (node == null || typeof node !== 'object' || !('$value' in node)) {
    return { value: null, error: `unresolved ref {${path}}` }
  }
  return resolveValue(node.$value, primitive, seen)
}

// Walk every {$type,$value} leaf in a token tree.
export function walkTokens(tree, visit, path = []) {
  if (tree == null || typeof tree !== 'object') return
  if ('$value' in tree) {
    visit(path.join('.'), tree)
    return
  }
  for (const [key, child] of Object.entries(tree)) {
    if (key.startsWith('$')) continue
    walkTokens(child, visit, [...path, key])
  }
}
