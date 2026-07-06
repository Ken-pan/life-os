/**
 * Post-process raw snapshot → AI-readable artifacts (summary, selectors, page-model, exploration).
 */
import { buildPageModel } from './page-model.mjs'
import { buildExplorationCandidates } from './exploration.mjs'
import { applyPrivacyPolicy } from './privacy.mjs'
import { extractEntities } from './entity-extractor.mjs'
import { mergeCdpIntoSnapshot } from './cdp-merge.mjs'

/**
 * @param {Record<string, unknown>} snapshot
 * @returns {Record<string, unknown>}
 */
export function enrichSnapshot(snapshot) {
  const merged = mergeCdpIntoSnapshot(snapshot)
  const withPrivacy = applyPrivacyPolicy(merged)
  const pageModel = buildPageModel(withPrivacy)
  const explorationCandidates = buildExplorationCandidates(
    withPrivacy,
    pageModel,
  )
  const entities = extractEntities(withPrivacy)
  const summaryMd = buildSummaryMd(
    withPrivacy,
    pageModel,
    explorationCandidates,
    entities,
  )
  const selectors = buildSelectors(withPrivacy, pageModel)
  const formsIndex = buildFormsIndex(withPrivacy)

  return {
    ...withPrivacy,
    derived: {
      summaryMd,
      selectors,
      formsIndex,
      pageModel,
      explorationCandidates,
      entities,
      stats: {
        headingCount: withPrivacy.headings?.length ?? 0,
        linkCount: withPrivacy.links?.length ?? 0,
        controlCount: withPrivacy.controls?.length ?? 0,
        elementCount: withPrivacy.elements?.length ?? 0,
        formCount: withPrivacy.forms?.length ?? 0,
        selectorCount: selectors.interactive?.length ?? 0,
        regionCount: pageModel.stats?.regionCount ?? 0,
        scopedActionCount: pageModel.stats?.scopedActionCount ?? 0,
        explorationCount: explorationCandidates.length,
        entityCount: entities.stats?.entityCount ?? 0,
        entityItemCount: entities.stats?.itemCount ?? 0,
        summaryChars: summaryMd.length,
        jsonChars: JSON.stringify(withPrivacy).length,
      },
    },
  }
}

/**
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} pageModel
 * @param {Array<Record<string, unknown>>} explorationCandidates
 */
export function buildSummaryMd(
  snapshot,
  pageModel,
  explorationCandidates,
  entities,
) {
  const page = snapshot.page || {}
  const lines = [
    `# Page Summary`,
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| URL | ${page.url || '—'} |`,
    `| Title | ${page.title || '—'} |`,
    `| Captured | ${snapshot.capturedAt || '—'} |`,
    `| Page type | ${pageModel.pageType || 'generic'} |`,
    `| Primary entity | ${pageModel.primaryEntity || '—'} |`,
    `| Viewport | ${page.viewport?.width ?? '?'}×${page.viewport?.height ?? '?'} |`,
    '',
  ]

  const scroll = snapshot.sensor?.scroll
  if (scroll?.scrollable) {
    lines.push(
      '## Scroll',
      '',
      `- Scrollable: yes (${scroll.percentScrolled ?? 0}% scrolled, ${scroll.scrollHeight}px tall)`,
      `- More below: ${scroll.hasMoreBelow ? 'yes' : 'no'}`,
      '',
    )
  }

  const collapsed =
    snapshot.sensor?.disclosures?.filter((d) => d.collapsed)?.length ?? 0
  if (collapsed) {
    lines.push(`## Hidden / collapsed (${collapsed})`, '')
    for (const d of (snapshot.sensor?.disclosures || [])
      .filter((x) => x.collapsed)
      .slice(0, 8)) {
      lines.push(`- **${d.label || d.kind}** → \`${d.bestSelector}\``)
    }
    lines.push('')
  }

  if (pageModel.regions?.length) {
    lines.push(`## Regions (${pageModel.regions.length})`, '')
    for (const r of pageModel.regions.slice(0, 5)) {
      lines.push(`### ${r.label || r.id} (${r.itemsCountVisible} items)`, '')
      for (const item of (r.items || []).slice(0, 3)) {
        lines.push(
          `- Item #${item.index}: ${item.preview?.title || '(no title)'}`,
        )
        for (const a of (item.actions || []).slice(0, 4)) {
          lines.push(
            `  - \`${a.label}\` (${a.intent}) → \`${a.scopedSelector}\``,
          )
        }
      }
      if ((r.items?.length || 0) > 3)
        lines.push(`- … +${r.items.length - 3} more items`)
      lines.push('')
    }
  }

  if (explorationCandidates.length) {
    lines.push('## Suggested next steps', '')
    for (const c of explorationCandidates.slice(0, 6)) {
      lines.push(`- **[${c.priority}]** ${c.type}: ${c.reason}`)
    }
    lines.push('')
  }

  if (snapshot.snapV2?.axTree) {
    const v2 = snapshot.snapV2
    lines.push(
      '## Accessibility Snap (v2)',
      '',
      `- Refs: **${v2.stats?.refCount ?? Object.keys(v2.refs || {}).length}**`,
      '',
      '```',
      String(v2.axTree).split('\n').slice(0, 35).join('\n'),
      v2.axTree.split('\n').length > 35 ? '…' : '',
      '```',
      '',
    )
  }

  if (entities?.entities?.length) {
    lines.push(`## Entities (${entities.stats?.itemCount ?? 0} items)`, '')
    for (const e of entities.entities.slice(0, 4)) {
      const label =
        e.kind === 'table'
          ? `${e.caption || e.selector || 'table'} (${e.count ?? 0} rows)`
          : `${e.kind} (${e.source}) — ${e.count ?? e.items?.length ?? 0} items`
      lines.push(`- **${label}**`)
    }
    lines.push('')
  }

  const net = snapshot.sensor?.network
  if (net?.stats?.total) {
    lines.push('## Network (CDP)', '')
    lines.push(
      `- Captured **${net.stats.total}** responses (${net.stats.jsonCount} JSON)`,
    )
    for (const api of (net.apiUrls || []).slice(0, 5)) {
      lines.push(`  - \`${api.url}\` → keys: ${(api.keys || []).join(', ')}`)
    }
    lines.push('')
  }

  if (snapshot.adapter?.site) {
    lines.push(`## Site Adapter: ${snapshot.adapter.site}`, '')
    if (snapshot.adapter.app) lines.push(`- App: \`${snapshot.adapter.app}\``)
    if (snapshot.adapter.entity)
      lines.push(`- Entity: \`${snapshot.adapter.entity}\``)
    if (snapshot.adapter.framework?.name) {
      lines.push(`- Framework: \`${snapshot.adapter.framework.name}\``)
    }
    if (snapshot.adapter.components?.length) {
      lines.push(
        `- Component hints: **${snapshot.adapter.components.length}**`,
        '',
      )
      for (const c of snapshot.adapter.components.slice(0, 12)) {
        lines.push(
          `  - \`${c.component}\` (${c.tag})${c.text ? `: ${c.text.slice(0, 50)}` : ''}`,
        )
      }
    }
    if (snapshot.adapter.items?.length) {
      lines.push(`- Items extracted: **${snapshot.adapter.items.length}**`, '')
    }
  }

  const cap = snapshot.captureMeta
  if (cap?.framework?.name || cap?.shadowRootCount) {
    lines.push('## Capture Meta', '')
    if (cap.framework?.name)
      lines.push(`- Framework: \`${cap.framework.name}\``)
    if (cap.shadowRootCount != null)
      lines.push(`- Shadow roots: ${cap.shadowRootCount}`)
    lines.push('')
  }

  const headings = snapshot.headings || []
  if (headings.length) {
    lines.push('## Headings', '')
    for (const h of headings.slice(0, 20)) {
      const indent = '  '.repeat(Math.max(0, (h.level || 1) - 1))
      lines.push(
        `${indent}- ${'#'.repeat(h.level || 1)} ${h.text || '(empty)'}`,
      )
    }
    if (headings.length > 20)
      lines.push(`- … +${headings.length - 20} more`, '')
  }

  const landmarks = (snapshot.elements || []).filter((e) =>
    ['main', 'nav', 'header', 'footer', 'banner', 'complementary'].includes(
      e.role || e.tag,
    ),
  )
  if (landmarks.length) {
    lines.push('## Landmarks', '')
    for (const lm of landmarks.slice(0, 12)) {
      lines.push(
        `- \`${lm.role || lm.tag}\` ${lm.name || lm.text || ''}`.trim(),
      )
    }
    lines.push('')
  }

  const controls = snapshot.controls || []
  if (controls.length) {
    lines.push('## Global Interactive Controls', '')
    lines.push('| Kind | Label | Best selector |')
    lines.push('|------|-------|---------------|')
    for (const c of controls.slice(0, 25)) {
      const kind = c.role || c.tag || '?'
      const label = (c.name || c.type || '—').replace(/\|/g, '\\|').slice(0, 60)
      const sel = (c.bestSelector || c.selector || '—')
        .replace(/\|/g, '\\|')
        .slice(0, 80)
      lines.push(`| ${kind} | ${label} | \`${sel}\` |`)
    }
    if (controls.length > 25)
      lines.push(`| … | +${controls.length - 25} more | |`)
    lines.push('')
  }

  const forms = snapshot.forms || []
  if (forms.length) {
    lines.push('## Forms', '')
    for (const f of forms.slice(0, 8)) {
      lines.push(
        `### ${f.name || f.id || 'Form'} (${f.fields?.length ?? 0} fields)`,
      )
      for (const field of (f.fields || []).slice(0, 15)) {
        lines.push(
          `- **${field.label || field.name || field.type}** (\`${field.type}\`)${field.required ? ' *required*' : ''}`,
        )
      }
      lines.push('')
    }
  }

  const links = snapshot.links || []
  if (links.length) {
    lines.push('## Notable Links', '')
    for (const l of links.slice(0, 15)) {
      lines.push(`- [${l.text || l.href}](${l.href})`)
    }
    if (links.length > 15) lines.push(`- … +${links.length - 15} more links`)
    lines.push('')
  }

  if (snapshot.storageKeys) {
    const ls = snapshot.storageKeys.localStorage?.length ?? 0
    const ss = snapshot.storageKeys.sessionStorage?.length ?? 0
    if (ls || ss) {
      lines.push('## Storage Keys (names only)', '')
      lines.push(`- localStorage: ${ls} keys`)
      lines.push(`- sessionStorage: ${ss} keys`, '')
    }
  }

  lines.push('---', '*Generated by web-state-devtools enrich v0.8*')
  return lines.join('\n')
}

/**
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} pageModel
 */
export function buildSelectors(snapshot, pageModel) {
  const interactive = []
  const seen = new Set()

  for (const r of pageModel.regions || []) {
    for (const item of r.items || []) {
      for (const a of item.actions || []) {
        const key = a.scopedSelector
        if (!key || seen.has(key)) continue
        seen.add(key)
        interactive.push({
          label: a.label,
          role: a.intent,
          scope: `${r.id}#${item.index}`,
          candidates: [
            { strategy: 'scoped', value: a.scopedSelector, score: 95 },
          ],
          best: a.scopedSelector,
          global: a.globalSelector,
        })
      }
    }
  }

  for (const c of snapshot.controls || []) {
    const key = c.bestSelector || c.selector
    if (!key || seen.has(key)) continue
    seen.add(key)
    interactive.push({
      label: c.name || c.type || c.tag,
      role: c.role,
      tag: c.tag,
      scope: 'global',
      candidates: c.selectorCandidates || [
        { strategy: 'css-path', value: c.selector, score: 10 },
      ],
      best: c.bestSelector || c.selector,
    })
  }

  const byTestId = (snapshot.elements || [])
    .filter((e) => e.testId)
    .slice(0, 50)
    .map((e) => ({
      label: e.name || e.text || e.testId,
      best: `[data-testid="${e.testId}"]`,
      candidates: [
        {
          strategy: 'data-testid',
          value: `[data-testid="${e.testId}"]`,
          score: 100,
        },
      ],
    }))

  return {
    priority: [
      'scoped',
      'data-testid',
      'aria-label',
      'aria-name',
      'role+name',
      'id',
      'css-path',
    ],
    interactive: interactive.slice(0, 150),
    testIds: byTestId,
  }
}

/**
 * @param {Record<string, unknown>} snapshot
 */
export function buildFormsIndex(snapshot) {
  return (snapshot.forms || []).map((f) => ({
    id: f.id,
    name: f.name,
    action: f.action,
    method: f.method,
    fieldCount: f.fields?.length ?? 0,
    fields: (f.fields || []).map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      bestSelector: field.bestSelector,
    })),
  }))
}
