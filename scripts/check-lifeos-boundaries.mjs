#!/usr/bin/env node
/**
 * Life OS shared platform boundary guard (P0 PR2).
 *
 * Usage:
 *   node scripts/check-lifeos-boundaries.mjs
 *   node scripts/check-lifeos-boundaries.mjs --self-test
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '.svelte-kit',
  'build',
  'dist',
  '.netlify',
  'coverage',
  'test-results',
  'output',
  'exports',
])

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.svelte',
  '.d.ts',
])

const CONTRACTS_FORBIDDEN_SPECS = [
  '@life-os/theme',
  '@life-os/platform-web',
  '@life-os/sync',
  '@life-os/domain',
]

const THEME_FORBIDDEN_SPECS = [
  '@life-os/contracts',
  '@life-os/platform-web',
  '@life-os/domain',
]

const PLATFORM_WEB_ALLOWED_SPECS = new Set(['@life-os/contracts', '@life-os/theme'])

/** @type {string[]} */
const violations = []

/**
 * @param {string} rule
 * @param {string} file
 * @param {string} detail
 */
function fail(rule, file, detail) {
  violations.push(`${rule}: ${relative(ROOT, file)} — ${detail}`)
}

/**
 * @param {string} dir
 * @param {(file: string) => void} visit
 */
function walk(dir, visit) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const name of entries) {
    if (EXCLUDE_DIR_NAMES.has(name)) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, visit)
    } else {
      visit(full)
    }
  }
}

/**
 * @param {string} spec
 */
function isUiPackageSpec(spec) {
  return spec.startsWith('@life-os/ui-')
}

/**
 * @param {string} spec
 */
function isAppsSpec(spec) {
  return spec.startsWith('apps/') || spec.includes('/apps/')
}

/**
 * @param {string} spec
 * @param {string} allowedRoot
 */
function matchesPackageOrSubpath(spec, allowedRoot) {
  return spec === allowedRoot || spec.startsWith(`${allowedRoot}/`)
}

/**
 * @param {string} spec
 */
function isPlatformWebAllowedSpec(spec) {
  for (const allowedRoot of PLATFORM_WEB_ALLOWED_SPECS) {
    if (matchesPackageOrSubpath(spec, allowedRoot)) return true
  }
  return false
}

/**
 * @param {string} content
 * @returns {string[]}
 */
function extractModuleSpecifiers(content) {
  /** @type {string[]} */
  const specs = []
  const patterns = [
    /\bfrom\s+(['"])([^'"]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1/g,
    /\brequire\s*\(\s*(['"])([^'"]+)\1/g,
  ]

  for (const re of patterns) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(content)) !== null) {
      specs.push(match[2])
    }
  }

  return specs
}

/**
 * @param {string} spec
 * @param {string[]} forbiddenExact
 * @returns {boolean}
 */
function matchesForbiddenWorkspaceSpec(spec, forbiddenExact) {
  if (forbiddenExact.includes(spec)) return true
  if (isUiPackageSpec(spec)) return true
  if (isAppsSpec(spec)) return true
  return false
}

/**
 * @param {string} file
 * @param {string} spec
 * @param {string} rule
 * @param {string[]} forbiddenExact
 */
function checkForbiddenSpec(file, spec, rule, forbiddenExact) {
  if (!matchesForbiddenWorkspaceSpec(spec, forbiddenExact)) return
  fail(rule, file, `forbidden import of "${spec}"`)
}

/**
 * @param {string} file
 * @param {string} content
 * @param {string} rule
 * @param {string[]} forbiddenExact
 */
function checkSourceForbiddenImports(file, content, rule, forbiddenExact) {
  for (const spec of extractModuleSpecifiers(content)) {
    checkForbiddenSpec(file, spec, rule, forbiddenExact)
  }
}

/**
 * @param {object} pkg
 * @returns {string[]}
 */
function listDependencySpecs(pkg) {
  /** @type {string[]} */
  const specs = []
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = pkg[field]
    if (!block || typeof block !== 'object') continue
    for (const name of Object.keys(block)) specs.push(name)
  }
  return specs
}

/**
 * @param {string} file
 */
function checkPackageJson(file) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return
  }

  const rel = relative(ROOT, file)
  const deps = listDependencySpecs(pkg)

  if (rel === 'packages/contracts/package.json') {
    for (const spec of deps) {
      if (
        CONTRACTS_FORBIDDEN_SPECS.includes(spec) ||
        isUiPackageSpec(spec) ||
        spec.startsWith('apps/')
      ) {
        fail(
          'contracts-deps',
          file,
          `forbidden dependency "${spec}" in @life-os/contracts`,
        )
      }
    }
    return
  }

  if (rel === 'packages/theme/package.json') {
    for (const spec of deps) {
      if (matchesForbiddenWorkspaceSpec(spec, THEME_FORBIDDEN_SPECS)) {
        fail('theme-deps', file, `forbidden dependency "${spec}" in @life-os/theme`)
      }
    }
    return
  }

  if (rel === 'packages/platform-web/package.json') {
    for (const spec of deps) {
      if (isPlatformWebAllowedSpec(spec)) continue
      if (
        spec.startsWith('@life-os/') ||
        isAppsSpec(spec) ||
        spec.startsWith('apps/')
      ) {
        fail(
          'platform-web-deps',
          file,
          `forbidden dependency "${spec}" in @life-os/platform-web (allowed: @life-os/contracts, @life-os/theme)`,
        )
      }
    }
    return
  }

  if (rel === 'packages/finance-core/package.json') {
    const allowedRoots = [
      '@life-os/finance-enrichment-contract',
      '@life-os/contracts',
    ]
    for (const spec of deps) {
      if (!spec.startsWith('@life-os/') && !isAppsSpec(spec) && !spec.startsWith('apps/')) {
        continue
      }
      if (allowedRoots.some((root) => matchesPackageOrSubpath(spec, root))) continue
      fail(
        'finance-core-deps',
        file,
        `forbidden dependency "${spec}" in @life-os/finance-core (allowed: @life-os/finance-enrichment-contract, @life-os/contracts)`,
      )
    }
  }
}

/**
 * @param {string} clause
 */
function isTypeOnlyImportClause(clause) {
  const trimmed = clause.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('type ')) return true
  if (trimmed.startsWith('{')) {
    const close = trimmed.lastIndexOf('}')
    if (close === -1) return false
    const inner = trimmed.slice(1, close).trim()
    if (!inner) return false
    const specifiers = inner.split(',').map((part) => part.trim()).filter(Boolean)
    return specifiers.every((part) => part.startsWith('type '))
  }
  return false
}

/**
 * @param {string} clause
 */
function isTypeOnlyExportClause(clause) {
  const trimmed = clause.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('type ')) return true
  if (trimmed.startsWith('{')) {
    const close = trimmed.lastIndexOf('}')
    if (close === -1) return false
    const inner = trimmed.slice(1, close).trim()
    if (!inner) return false
    const specifiers = inner.split(',').map((part) => part.trim()).filter(Boolean)
    return specifiers.every((part) => part.startsWith('type '))
  }
  return false
}

/**
 * @param {string} content
 */
function stripAllowedContractsTypeReferences(content) {
  let out = content

  // JSDoc typedef mirrors
  out = out.replace(
    /\/\*\*[\s\S]*?@typedef\s+\{import\s*\(\s*['"]@life-os\/contracts[^]*?\*\//g,
    '',
  )

  // import type / export type statements
  out = out.replace(
    /^\s*import\s+type\s+[\s\S]*?\sfrom\s+['"]@life-os\/contracts[^'"]*['"][\s;]*/gm,
    '',
  )
  out = out.replace(
    /^\s*export\s+type\s+[\s\S]*?\sfrom\s+['"]@life-os\/contracts[^'"]*['"][\s;]*/gm,
    '',
  )

  // Inline type-only import() type references
  out = out.replace(/import\s*\(\s*['"]@life-os\/contracts[^'"]*['"]\s*\)\.[A-Za-z_$][\w$]*/g, '')

  return out
}

/**
 * @param {string} file
 * @param {string} content
 */
function checkContractsValueImports(file, content) {
  const rel = relative(ROOT, file).split('\\').join('/')
  if (rel.startsWith('packages/contracts/')) return
  if (rel === 'scripts/check-lifeos-boundaries.mjs') return

  const stripped = stripAllowedContractsTypeReferences(content)

  if (/\brequire\s*\(\s*['"]@life-os\/contracts/.test(stripped)) {
    fail('contracts-type-only', file, 'runtime require() of @life-os/contracts is forbidden')
  }

  if (/\bimport\s*\(\s*['"]@life-os\/contracts/.test(stripped)) {
    fail('contracts-type-only', file, 'runtime dynamic import() of @life-os/contracts is forbidden')
  }

  const importRe =
    /\bimport\s+(?!type\s)([\s\S]*?)\sfrom\s+(['"])@life-os\/contracts([^'"]*)\2/g
  let match
  while ((match = importRe.exec(stripped)) !== null) {
    const subpath = match[3] ?? ''
    if (subpath === '/events' || subpath === '/kenos-actions') continue // runtime contract modules (event schemas / action registry)
    if (!isTypeOnlyImportClause(match[1])) {
      fail(
        'contracts-type-only',
        file,
        'value import from @life-os/contracts is forbidden (use import type or JSDoc @typedef)',
      )
    }
  }

  const exportRe =
    /\bexport\s+(?!type\s)([\s\S]*?)\sfrom\s+(['"])@life-os\/contracts([^'"]*)\2/g
  while ((match = exportRe.exec(stripped)) !== null) {
    const subpath = match[3] ?? ''
    if (subpath === '/events' || subpath === '/kenos-actions') continue // runtime contract modules (event schemas / action registry)
    if (!isTypeOnlyExportClause(match[1])) {
      fail(
        'contracts-type-only',
        file,
        'value re-export from @life-os/contracts is forbidden (use export type)',
      )
    }
  }
}

/**
 * @param {string} file
 */
function checkSourceFile(file) {
  const rel = relative(ROOT, file).split('\\').join('/')
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return
  }

  if (rel.endsWith('package.json')) {
    checkPackageJson(file)
    return
  }

  if (rel.startsWith('packages/contracts/')) {
    checkSourceForbiddenImports(
      file,
      content,
      'contracts-imports',
      CONTRACTS_FORBIDDEN_SPECS,
    )
  }

  if (rel.startsWith('packages/theme/')) {
    checkSourceForbiddenImports(file, content, 'theme-imports', THEME_FORBIDDEN_SPECS)
  }

  if (rel.startsWith('packages/platform-web/')) {
    for (const spec of extractModuleSpecifiers(content)) {
      if (!spec.startsWith('@life-os/') && !isAppsSpec(spec)) continue
      if (isPlatformWebAllowedSpec(spec)) continue
      fail(
        'platform-web-imports',
        file,
        `forbidden import of "${spec}" (allowed workspace deps: @life-os/contracts, @life-os/theme)`,
      )
    }
  }

  if (rel.startsWith('packages/finance-core/')) {
    const forbidden = [
      '@life-os/theme',
      '@life-os/platform-web',
      '@life-os/sync',
      '@life-os/domain',
    ]
    for (const spec of extractModuleSpecifiers(content)) {
      if (isAppsSpec(spec) || isUiPackageSpec(spec)) {
        fail('finance-core-imports', file, `forbidden import of "${spec}"`)
        continue
      }
      for (const root of forbidden) {
        if (matchesPackageOrSubpath(spec, root)) {
          fail('finance-core-imports', file, `forbidden import of "${spec}"`)
        }
      }
    }
  }

  if (
    rel.startsWith('packages/') ||
    rel.startsWith('apps/') ||
    rel.startsWith('scripts/')
  ) {
    checkContractsValueImports(file, content)
  }
}

/**
 * @returns {string[]}
 */
function collectFiles() {
  /** @type {string[]} */
  const files = []

  const rootPkg = join(ROOT, 'package.json')
  if (statSync(rootPkg).isFile()) files.push(rootPkg)

  walk(join(ROOT, 'scripts'), (file) => {
    if (file.endsWith('.mjs')) files.push(file)
  })

  walk(join(ROOT, 'packages'), (file) => {
    const ext = file.slice(file.lastIndexOf('.'))
    if (SOURCE_EXTENSIONS.has(ext) || file.endsWith('package.json')) files.push(file)
  })

  walk(join(ROOT, 'apps'), (file) => {
    const ext = file.slice(file.lastIndexOf('.'))
    if (SOURCE_EXTENSIONS.has(ext) || file.endsWith('package.json')) files.push(file)
  })

  return files
}

function runSelfTest() {
  /** @type {{ name: string, content: string, shouldViolate: boolean }[]} */
  const cases = [
    {
      name: 'import type allowed',
      content: "import type { Foo } from '@life-os/contracts/appearance'\n",
      shouldViolate: false,
    },
    {
      name: 'JSDoc typedef allowed',
      content:
        "/** @typedef {import('@life-os/contracts/appearance').ColorSchemePreference} ColorSchemePreference */\n",
      shouldViolate: false,
    },
    {
      name: 'value import forbidden',
      content: "import { Foo } from '@life-os/contracts/appearance'\n",
      shouldViolate: true,
    },
    {
      name: 'namespace import forbidden',
      content: "import * as Contracts from '@life-os/contracts'\n",
      shouldViolate: true,
    },
    {
      name: 'require forbidden',
      content: "const x = require('@life-os/contracts')\n",
      shouldViolate: true,
    },
    {
      name: 'dynamic import forbidden',
      content: "const x = await import('@life-os/contracts/appearance')\n",
      shouldViolate: true,
    },
    {
      name: 'export type allowed',
      content: "export type { Foo } from '@life-os/contracts/appearance'\n",
      shouldViolate: false,
    },
    {
      name: 'value re-export forbidden',
      content: "export { Foo } from '@life-os/contracts/appearance'\n",
      shouldViolate: true,
    },
  ]

  let failed = 0
  for (const testCase of cases) {
    /** @type {string[]} */
    const localViolations = []
    const prev = violations.length
    checkContractsValueImports(join(ROOT, 'scripts/__selftest__.mjs'), testCase.content)
    const delta = violations.splice(prev)
    const violated = delta.length > 0
    const ok = violated === testCase.shouldViolate
    if (!ok) {
      failed += 1
      console.error(
        `self-test FAIL: ${testCase.name} (expected ${testCase.shouldViolate ? 'violation' : 'pass'}, got ${violated ? 'violation' : 'pass'})`,
      )
    }
  }

  if (failed > 0) {
    console.error(`\nself-test: ${failed} case(s) failed`)
    process.exit(1)
  }

  console.log(`self-test: ${cases.length} case(s) passed`)
  process.exit(0)
}

function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
    return
  }

  for (const file of collectFiles()) {
    checkSourceFile(file)
  }

  if (violations.length === 0) {
    console.log('check:lifeos-boundaries — OK')
    process.exit(0)
  }

  console.error(`check:lifeos-boundaries — ${violations.length} violation(s):\n`)
  for (const line of violations) {
    console.error(`  • ${line}`)
  }
  process.exit(1)
}

main()
