/**
 * Cross-domain aggregation for Today / Shelf / Quick Switch / Assistant / Inbox.
 * Reads DOMAIN_REGISTRY — no per-domain hardcoded switches in consumers.
 */
import {
  DOMAIN_REGISTRY,
  INTEGRATION_DOMAIN_ORDER,
  canonicalizeDomainId,
  getDomainDefinition,
  listShelfDomainDefinitions,
  projectShelfCard,
  searchQuickSwitchStub,
} from './domainIntegration.core.js'

/**
 * Today L1/L2/L3 aggregation rules:
 * L1 = actionable now (providers.today + integrated/reference)
 * L2 = glanceable summary stubs
 * L3 = domain chip only
 *
 * @param {{ now?: Date }} [opts]
 */
export function aggregateTodaySummaries(opts = {}) {
  void opts
  const rows = []
  for (const id of ['plan', 'training', ...INTEGRATION_DOMAIN_ORDER]) {
    const def = getDomainDefinition(id)
    if (!def || def.id === 'kenos') continue
    if (def.integrationStatus === 'missing') continue
    const level = def.providers.today
      ? def.integrationStatus === 'reference' || def.integrationStatus === 'integrated'
        ? 'L1'
        : 'L2'
      : 'L3'
    rows.push({
      domainId: def.id,
      label: def.label,
      level,
      privacy: def.privacy,
      lines: [],
      accent: def.accent,
    })
  }
  return rows
}

/**
 * Shelf structure: Kenos Home / ACTIVE / RECENT / ALL
 * @param {{
 *   activeDomainId?: string | null,
 *   recentIds?: string[],
 *   resumeSubtitles?: Record<string, string>,
 * }} [opts]
 */
export function projectSpaceShelf(opts = {}) {
  const activeId = canonicalizeDomainId(opts.activeDomainId) || null
  const recent = (opts.recentIds || [])
    .map((id) => canonicalizeDomainId(id))
    .filter(Boolean)
  const kenos = projectShelfCard('kenos', {
    isCurrent: !activeId,
    subtitle: 'Today · Assistant · Inbox',
  })
  const all = listShelfDomainDefinitions().map((d) =>
    projectShelfCard(d.id, {
      isCurrent: d.id === activeId,
      subtitle: opts.resumeSubtitles?.[d.id] || d.subtitle,
      relativeTime: d.id === activeId ? 'Now' : null,
    }),
  )
  const active = activeId ? all.filter((c) => c.id === activeId) : []
  const recentCards = recent
    .filter((id) => id !== activeId)
    .map((id) => all.find((c) => c.id === id))
    .filter(Boolean)
  return {
    kenosHome: kenos,
    active,
    recent: recentCards,
    all,
    privacy: {
      money: 'hide_amounts',
      health: 'non_decision',
      paper: 'no_second_knowledge_truth',
    },
  }
}

/**
 * Unified Quick Switch search across registry.
 * @param {string} query
 */
export function searchAllDomains(query) {
  return searchQuickSwitchStub(query, {
    domainIds: Object.keys(DOMAIN_REGISTRY).filter((id) => id !== 'kenos'),
  })
}

/**
 * Single Inbox sources — domains may contribute; no second Inbox product.
 */
export function listInboxSources() {
  return listShelfDomainDefinitions()
    .filter((d) => d.providers.inbox)
    .map((d) => ({
      domainId: d.id,
      sourceId: `${d.id}.inbox`,
      label: d.label,
    }))
}

/**
 * Assistant handoff targets from registry.
 */
export function listAssistantHandoffs() {
  return listShelfDomainDefinitions()
    .filter((d) => d.providers.assistant)
    .map((d) => ({
      domainId: d.id,
      scope: d.id,
      contextTitle: d.label,
    }))
}
