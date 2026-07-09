// Pure generation of brand CSS from token JSON — shared by build-css.mjs and
// validate-tokens.mjs (staleness check).
import {
  BRAND_APPS,
  loadBrand,
  resolveValue,
  tokenVarName,
  walkTokens,
} from './tokens.mjs'

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
  modeNames.sort((a, b) =>
    a === doc.defaultMode ? -1 : b === doc.defaultMode ? 1 : 0,
  )
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

const STRUCTURAL_SECTIONS = [
  [
    'page-gutter-reflow',
    'page-gutter-mobile',
    'page-gutter-tablet',
    'page-gutter-desktop',
    'page-gutter',
    'content-after-header',
    'header-block-end',
    'content-pad-start',
    'page-top',
    'page-block-gap',
    'page-scroll-bottom',
    'wrap-pad-x',
    'inset-inline',
    'inset-inline-start',
    'inset-inline-end',
    'stack-tight',
    'stack-section',
    'stack-block',
    'title-stack',
    'header-block',
    'gap',
    'grid-gap',
    'grid-gap-tight',
    'grid-min-card',
    'grid-min-tile',
    'grid-min-panel',
    'grid-split-aside',
    'grid-split-aside-wide',
    'back-to-content',
  ],
  ['content-max', 'maxw', 'content-inline-pad'],
  ['body', 'disp', 'heading', 'button'],
  [
    'control-h',
    'control-radius',
    'control-pad-x',
    'btn-h-sm',
    'btn-h-md',
    'btn-h-lg',
    'tap-min',
    'tap-spacing',
    'btn-pad-x-sm',
    'btn-pad-x-md',
    'btn-pad-x-lg',
    'btn-radius',
    'btn-focus-ring',
  ],
  [
    'card-padding',
    'card-padding-compact',
    'card-padding-mobile',
    'card-radius',
    'card-gap',
    'card-stack-gap',
  ],
  [
    'fab-h',
    'fab-w',
    'fab-offset-above-tabbar',
    'fab-bg',
    'fab-fg',
    'fab-radius',
    'nav-h',
    'mobile-tabbar-h',
    'mobile-tabbar-total-h',
    'mobile-content-inset',
    'mobile-content-inset-tabbar',
    'mobile-content-inset-minimal',
    'sidebar-w',
    'appbar-h',
    'appbar-h-back',
    'appbar-height',
    'page-header-h',
    'nav-leading',
    'nav-trailing',
  ],
  [
    'ios-edge-min',
    'ios-landscape-top-buffer',
    'safe-top',
    'safe-right',
    'safe-bottom',
    'safe-left',
    'safe-top-effective',
    'safe-bottom-effective',
    'safe-left-effective',
    'safe-right-effective',
  ],
  [
    'ease-standard',
    'ease-emphasized',
    'ease-press',
    'ease',
    'dur-fast',
    'motion-fast',
    'motion-standard',
    'dur-base',
    'motion-slow',
    'dur-slow',
    'motion-distance',
    'hover-lift',
    'press-scale',
    'sel-fg',
  ],
  ['viewport-min-h', 'viewport-stable-h', 'bottom-chrome-h'],
  [
    'safari-chrome-tint-top-bg',
    'safari-chrome-tint-bottom-bg',
    'z-safe-area-tint',
    'z-mobile-chrome',
  ],
  [
    'z-nav',
    'z-more-sheet',
    'z-fab',
    'z-sheet',
    'z-banner',
    'z-toast',
    'banner-fixed-h',
  ],
  [
    'toast-pad-y',
    'toast-pad-x',
    'toast-min-h',
    'toast-gap',
    'toast-action-gap',
    'toast-font-size',
    'toast-line-height',
    'toast-max-width',
    'toast-max-width-desktop',
  ],
]

function emitVar(lines, name, value) {
  lines.push(`  --${name}: ${value};`)
}

const SPACE_ORDER = [
  '0',
  '0-5',
  '1',
  '1-5',
  '2',
  '2-5',
  '3',
  '3-5',
  '4',
  '5',
  '6',
  '7',
  '8',
  '10',
  '12',
  '24',
]

function emitPrimitiveSpace(lines, primitive) {
  for (const key of SPACE_ORDER) {
    const node = primitive.space[key]
    if (node) emitVar(lines, `space-${key}`, node.$value)
  }
}

function emitPrimitiveRadius(lines, primitive) {
  for (const [key, node] of Object.entries(primitive.radius)) {
    emitVar(lines, `radius-${key}`, node.$value)
  }
}

function emitControlSection(lines, structural, primitive) {
  for (const key of STRUCTURAL_SECTIONS[3]) {
    const node = structural[key]
    if (!node?.$value) continue
    emitVar(lines, key, node.$value)
    if (key === 'control-pad-x') emitPrimitiveRadius(lines, primitive)
  }
}

function emitPrimitiveText(lines, primitive) {
  for (const [key, node] of Object.entries(primitive.text)) {
    emitVar(lines, `text-${key}`, node.$value)
  }
}

function emitPrimitiveFont(lines, primitive) {
  for (const [key, node] of Object.entries(primitive.font)) {
    emitVar(lines, key, node.$value)
  }
}

function emitStructuralSection(lines, structural, keys) {
  for (const key of keys) {
    const node = structural[key]
    if (!node?.$value) continue
    emitVar(lines, key, node.$value)
  }
}

/** primitive + semantic + structural → generated tokens.css */
export function tokensCss(primitive, semantic, structural) {
  const lines = [
    header('primitive.json + semantic.json + structural.json'),
    '/*',
    '  Life OS 设计令牌（结构层）',
    '  各 app 在 app.css / index.css 中覆盖色彩与 --content-max；',
    '  文本色兼容 --t1…--t4 与 Finance 的 --text / --text-secondary / --text-muted。',
    '*/',
    '',
    ':root {',
  ]

  emitPrimitiveSpace(lines, primitive)
  lines.push('')
  for (const section of STRUCTURAL_SECTIONS.slice(0, 1))
    emitStructuralSection(lines, structural, section)
  lines.push('')
  for (const section of STRUCTURAL_SECTIONS.slice(1, 3))
    emitStructuralSection(lines, structural, section)
  lines.push('')
  emitPrimitiveFont(lines, primitive)
  lines.push('')
  emitPrimitiveText(lines, primitive)
  lines.push('')
  emitControlSection(lines, structural, primitive)
  lines.push('')
  for (const section of STRUCTURAL_SECTIONS.slice(4))
    emitStructuralSection(lines, structural, section)
  lines.push('')
  for (const [key, node] of Object.entries(semantic.status.light)) {
    emitVar(lines, key, node.$value)
  }
  lines.push('}', '')
  lines.push(":root[data-theme='dark'] {")
  for (const [key, node] of Object.entries(semantic.status.dark)) {
    emitVar(lines, key, node.$value)
  }
  lines.push('}', '')
  lines.push('@supports (padding: max(0px, 1px)) {')
  lines.push('  :root {')
  lines.push(
    '    --safe-top-effective: max(var(--ios-edge-min), env(safe-area-inset-top, 0px));',
  )
  lines.push(
    '    --safe-bottom-effective: max(var(--ios-edge-min), env(safe-area-inset-bottom, 0px));',
  )
  lines.push(
    '    --safe-left-effective: max(var(--ios-edge-min), env(safe-area-inset-left, 0px));',
  )
  lines.push(
    '    --safe-right-effective: max(var(--ios-edge-min), env(safe-area-inset-right, 0px));',
  )
  lines.push('  }')
  lines.push('}')
  lines.push('')

  return { css: lines.join('\n'), errors: [] }
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
