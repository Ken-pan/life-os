// Pure generation of brand CSS from token JSON — shared by build-css.mjs and
// validate-tokens.mjs (staleness check).
import { BRAND_APPS, loadBrand, resolveValue, tokenVarName, walkTokens } from './tokens.mjs'

export function header(sourceFile) {
  return [
    '/*',
    '  GENERATED FILE — do not edit by hand.',
    `  Source: packages/design-tokens/tokens/${sourceFile}`,
    '  Rebuild: npm run build:tokens',
    '*/',
    '',
  ].join('\n')
}

// Returns { css, errors } for one brand.
export function brandCss(app, primitive) {
  const doc = loadBrand(app)
  const errors = []
  const lines = [header(`brands/${app}.json`)]
  const modeNames = Object.keys(doc.modes)
  // default mode first, matching the authored cascade order
  modeNames.sort((a, b) => (a === doc.defaultMode ? -1 : b === doc.defaultMode ? 1 : 0))
  for (const mode of modeNames) {
    const { colorScheme, vars } = doc.modes[mode]
    // Non-default modes match both the catalog's data-mode and the apps' data-theme.
    const selector =
      mode === doc.defaultMode
        ? `[data-app='${app}']`
        : `[data-app='${app}'][data-mode='${mode}'],\n[data-app='${app}'][data-theme='${mode}']`
    lines.push(`${selector} {`)
    for (const [name, token] of Object.entries(vars)) {
      const { value, error } = resolveValue(token.$value, primitive)
      if (error) {
        errors.push(`${app}.${mode}.${name}: ${error}`)
        continue
      }
      lines.push(`  --${name}: ${value};`)
    }
    if (colorScheme) lines.push(`  color-scheme: ${colorScheme};`)
    lines.push('}', '')
  }
  return { css: lines.join('\n'), errors }
}

export function aggregateCss() {
  return (
    header('brands/*.json') +
    BRAND_APPS.map((app) => `@import './brands/${app}.css';`).join('\n') +
    '\n'
  )
}

/** component.json → :root { --card-bg: … } */
export function componentCss(componentTree, primitive) {
  const errors = []
  const lines = [header('component.json'), ':root {']
  walkTokens(componentTree, (path, token) => {
    const { value, error } = resolveValue(token.$value, primitive)
    if (error) {
      errors.push(`component.${path}: ${error}`)
      return
    }
    lines.push(`  --${tokenVarName(path.split('.'))}: ${value};`)
  })
  lines.push('}', '')
  return { css: lines.join('\n'), errors }
}
