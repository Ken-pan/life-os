/**
 * Kenos domain identity — low-noise color + glyph tokens for Spaces / Continue / Today.
 *
 * Identity color ≠ status color (`--critical` stays reserved for overdue / danger).
 * Apply only via: 2–3px rail · small glyph · status dot · faint active tint · progress.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   accent: string,
 *   icon: string,
 *   cssVar: string,
 * }} DomainIdentity
 */

/** @type {Readonly<Record<string, DomainIdentity>>} */
export const DOMAIN_IDENTITY = Object.freeze({
  training: Object.freeze({
    id: 'training',
    label: 'Training',
    // Warm coral — distinct from --critical (#b9364f)
    accent: '#C45C4A',
    icon: 'activity',
    cssVar: '--kenos-domain-training',
  }),
  plan: Object.freeze({
    id: 'plan',
    label: 'Plan',
    accent: '#C9A227',
    icon: 'list-todo',
    cssVar: '--kenos-domain-plan',
  }),
  money: Object.freeze({
    id: 'money',
    label: 'Money',
    accent: '#3D9B6E',
    icon: 'wallet',
    cssVar: '--kenos-domain-money',
  }),
  music: Object.freeze({
    id: 'music',
    label: 'Music',
    accent: '#8B7EC8',
    icon: 'music',
    cssVar: '--kenos-domain-music',
  }),
  home: Object.freeze({
    id: 'home',
    label: 'Home',
    accent: '#6B7C8F',
    icon: 'home',
    cssVar: '--kenos-domain-home',
  }),
  knowledge: Object.freeze({
    id: 'knowledge',
    label: 'Knowledge',
    accent: '#5B6BBF',
    icon: 'notebook',
    cssVar: '--kenos-domain-knowledge',
  }),
  work: Object.freeze({
    id: 'work',
    label: 'Work',
    accent: '#5B7C99',
    icon: 'briefcase',
    cssVar: '--kenos-domain-work',
  }),
  'work-focus': Object.freeze({
    id: 'work-focus',
    label: 'Work · Deep Work',
    accent: '#5B7C99',
    icon: 'focus',
    cssVar: '--kenos-domain-work',
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
 */
export function domainAccent(spaceId, fallback = 'var(--border)') {
  return resolveDomainIdentity(spaceId)?.accent ?? fallback
}

/**
 * Glyph name for Icon registry.
 * @param {string | null | undefined} spaceId
 * @param {string} [fallback]
 */
export function domainIcon(spaceId, fallback = 'globe') {
  return resolveDomainIdentity(spaceId)?.icon ?? fallback
}

/** CSS custom-property block for :root / [data-app=aios] */
export function domainIdentityCssVariables() {
  /** @type {string[]} */
  const lines = []
  const seen = new Set()
  for (const entry of Object.values(DOMAIN_IDENTITY)) {
    if (seen.has(entry.cssVar)) continue
    seen.add(entry.cssVar)
    lines.push(`  ${entry.cssVar}: ${entry.accent};`)
  }
  return lines.join('\n')
}
