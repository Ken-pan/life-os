// Build: tokens/brands/*.json → packages/theme/src/generated/brands/*.css + app-themes.css
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND_APPS, GENERATED_DIR, loadPrimitive } from './lib/tokens.mjs'
import { aggregateCss, brandCss } from './lib/generate.mjs'

const primitive = loadPrimitive()
const errors = []

mkdirSync(join(GENERATED_DIR, 'brands'), { recursive: true })

for (const app of BRAND_APPS) {
  const result = brandCss(app, primitive)
  errors.push(...result.errors)
  writeFileSync(join(GENERATED_DIR, 'brands', `${app}.css`), result.css)
}

writeFileSync(join(GENERATED_DIR, 'app-themes.css'), aggregateCss())

writeFileSync(
  join(GENERATED_DIR, 'README.md'),
  [
    '# Generated theme CSS',
    '',
    'Everything in this directory is generated from `packages/design-tokens/tokens/`.',
    'Do not edit by hand — change the token JSON and run `npm run build:tokens`.',
    '',
  ].join('\n')
)

if (errors.length > 0) {
  console.error('build:tokens failed:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`build:tokens OK → packages/theme/src/generated/ (${BRAND_APPS.length} brands + app-themes.css)`)
