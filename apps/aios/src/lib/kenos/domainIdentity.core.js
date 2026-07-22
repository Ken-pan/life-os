/**
 * Kenos domain identity — low-noise color + glyph tokens for Spaces / Continue / Today.
 *
 * Identity color ≠ status color (`--critical` stays reserved for overdue / danger).
 * Apply only via: 2–3px rail · small glyph · status dot · faint active tint · progress.
 *
 * Accents are semantic pairs — never one hex for light + dark + glass:
 *   accentLight / accentDark
 *   accentOnGlassLight / accentOnGlassDark
 * `accent` remains the dark brand channel for legacy callers / CSS defaults.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   accent: string,
 *   accentLight: string,
 *   accentDark: string,
 *   accentOnGlassLight: string,
 *   accentOnGlassDark: string,
 *   selectionPlateOpacityLight?: number,
 *   selectionPlateOpacityDark?: number,
 *   icon: string,
 *   cssVar: string,
 * }} DomainIdentity
 */

/**
 * @param {Omit<DomainIdentity, 'accent'> & { accentDark: string }} partial
 * @returns {DomainIdentity}
 */
function defineIdentity(partial) {
  return Object.freeze({
    ...partial,
    accent: partial.accentDark,
    selectionPlateOpacityLight: partial.selectionPlateOpacityLight ?? 0.1,
    selectionPlateOpacityDark: partial.selectionPlateOpacityDark ?? 0.14,
  })
}

/** @type {Readonly<Record<string, DomainIdentity>>} */
export const DOMAIN_IDENTITY = Object.freeze({
  training: defineIdentity({
    id: 'training',
    label: 'Training',
    // Warm coral — distinct from --critical (#b9364f)
    accentLight: '#A8483A',
    accentDark: '#C45C4A',
    accentOnGlassLight: '#943C30',
    accentOnGlassDark: '#E0705C',
    icon: 'activity',
    cssVar: '--kenos-domain-training',
  }),
  plan: defineIdentity({
    id: 'plan',
    label: 'Plan',
    // Light ochre aligns planner --accent #c47a08; never #C9A227 on light glass.
    // onGlassLight ~12% deeper than #9A6410 so check / icon hold on cream Shelf tint.
    accentLight: '#C47A08',
    accentDark: '#D4AE2E',
    accentOnGlassLight: '#87580E',
    accentOnGlassDark: '#E0B83A',
    selectionPlateOpacityLight: 0.1,
    selectionPlateOpacityDark: 0.14,
    icon: 'list-todo',
    cssVar: '--kenos-domain-plan',
  }),
  money: defineIdentity({
    id: 'money',
    label: 'Money',
    accentLight: '#2F7A52',
    accentDark: '#3D9B6E',
    accentOnGlassLight: '#276645',
    accentOnGlassDark: '#4DB882',
    icon: 'wallet',
    cssVar: '--kenos-domain-money',
  }),
  music: defineIdentity({
    id: 'music',
    label: 'Music',
    accentLight: '#6E629E',
    accentDark: '#8B7EC8',
    accentOnGlassLight: '#5A4F88',
    accentOnGlassDark: '#A698DB',
    icon: 'music',
    cssVar: '--kenos-domain-music',
  }),
  home: defineIdentity({
    id: 'home',
    label: '家',
    accentLight: '#5A7088',
    accentDark: '#8AADC8',
    accentOnGlassLight: '#4A5F74',
    accentOnGlassDark: '#9BBDD4',
    icon: 'home',
    cssVar: '--kenos-domain-home',
  }),
  knowledge: defineIdentity({
    id: 'knowledge',
    label: 'Knowledge',
    accentLight: '#4A58A0',
    accentDark: '#5B6BBF',
    accentOnGlassLight: '#3D4A8A',
    accentOnGlassDark: '#7A88D4',
    icon: 'notebook',
    cssVar: '--kenos-domain-knowledge',
  }),
  work: defineIdentity({
    id: 'work',
    label: 'Work',
    accentLight: '#4A7AB0',
    accentDark: '#6A9BE0',
    accentOnGlassLight: '#3A6494',
    accentOnGlassDark: '#86B4EB',
    icon: 'briefcase',
    cssVar: '--kenos-domain-work',
  }),
  'work-focus': defineIdentity({
    id: 'work-focus',
    label: 'Work · Deep Work',
    accentLight: '#4A7AB0',
    accentDark: '#6A9BE0',
    accentOnGlassLight: '#3A6494',
    accentOnGlassDark: '#86B4EB',
    icon: 'focus',
    cssVar: '--kenos-domain-work',
  }),
  paper: defineIdentity({
    id: 'paper',
    label: 'Paper',
    accentLight: '#6E5A42',
    accentDark: '#8B7355',
    accentOnGlassLight: '#5A4834',
    accentOnGlassDark: '#C4A882',
    icon: 'pencil',
    cssVar: '--kenos-domain-paper',
  }),
  health: defineIdentity({
    id: 'health',
    label: 'Health',
    accentLight: '#4556D4',
    accentDark: '#5B6CFF',
    accentOnGlassLight: '#3846B8',
    accentOnGlassDark: '#7A88FF',
    icon: 'brain',
    cssVar: '--kenos-domain-health',
  }),
  code: defineIdentity({
    id: 'code',
    label: 'Code',
    // Teal — distinct from work 蓝 / knowledge 靛 / money 绿。
    accentLight: '#1F8A82',
    accentDark: '#35B5AC',
    accentOnGlassLight: '#17726B',
    accentOnGlassDark: '#4ECFC5',
    icon: 'code',
    cssVar: '--kenos-domain-code',
  }),
  projects: defineIdentity({
    id: 'projects',
    label: 'Projects',
    // 与 plan 同族但更深:脊柱是 Planner 真源上的编排层。
    accentLight: '#8A4FB0',
    accentDark: '#A96BD4',
    accentOnGlassLight: '#734094',
    accentOnGlassDark: '#C08BE4',
    icon: 'target',
    cssVar: '--kenos-domain-projects',
  }),
})

/**
 * @param {string | null | undefined} spaceId
 * @returns {DomainIdentity | null}
 */
export function resolveDomainIdentity(spaceId) {
  if (!spaceId) return null
  const key = String(spaceId)
  if (DOMAIN_IDENTITY[key]) return DOMAIN_IDENTITY[key]
  // listKey form hosted:training
  const colon = key.indexOf(':')
  if (colon >= 0) {
    const id = key.slice(colon + 1).split('#')[0]
    return DOMAIN_IDENTITY[id] ?? null
  }
  return null
}

/**
 * Accent for a space id / listKey; falls back to border token for unknown.
 * @param {string | null | undefined} spaceId
 * @param {string} [fallback]
 * @param {{
 *   scheme?: 'light' | 'dark',
 *   surface?: 'default' | 'glass',
 * }} [opts]
 */
export function domainAccent(spaceId, fallback = 'var(--border)', opts = {}) {
  const identity = resolveDomainIdentity(spaceId)
  if (!identity) return fallback
  const scheme = opts.scheme === 'light' ? 'light' : 'dark'
  const glass = opts.surface === 'glass'
  if (glass) {
    return scheme === 'light'
      ? identity.accentOnGlassLight
      : identity.accentOnGlassDark
  }
  return scheme === 'light' ? identity.accentLight : identity.accentDark
}

/**
 * Glyph name for Icon registry.
 * @param {string | null | undefined} spaceId
 * @param {string} [fallback]
 */
export function domainIcon(spaceId, fallback = 'globe') {
  return resolveDomainIdentity(spaceId)?.icon ?? fallback
}

/** CSS custom-property block for :root / [data-app=aios] — light + dark pairs. */
export function domainIdentityCssVariables() {
  /** @type {string[]} */
  const lines = []
  const seen = new Set()
  for (const entry of Object.values(DOMAIN_IDENTITY)) {
    if (seen.has(entry.cssVar)) continue
    seen.add(entry.cssVar)
    lines.push(`  ${entry.cssVar}: ${entry.accentDark};`)
    lines.push(`  ${entry.cssVar}-light: ${entry.accentLight};`)
    lines.push(`  ${entry.cssVar}-dark: ${entry.accentDark};`)
    lines.push(`  ${entry.cssVar}-on-glass-light: ${entry.accentOnGlassLight};`)
    lines.push(`  ${entry.cssVar}-on-glass-dark: ${entry.accentOnGlassDark};`)
  }
  return lines.join('\n')
}
