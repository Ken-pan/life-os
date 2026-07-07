/**
 * Raw vs export storage — merge keys live in raw; export applies full redaction.
 */
import fs from 'node:fs'
import path from 'node:path'
import { redactForExport } from './privacy.mjs'

/**
 * @param {string} dataDir
 */
export function createDataStore(dataDir) {
  const rawDir = path.join(dataDir, 'raw')
  const exportDir = path.join(dataDir, 'export')
  const sessionsDir = path.join(dataDir, 'sessions')
  const recipesDir = path.join(dataDir, '..', 'recipes')

  fs.mkdirSync(rawDir, { recursive: true })
  fs.mkdirSync(exportDir, { recursive: true })
  fs.mkdirSync(sessionsDir, { recursive: true })

  const paths = {
    dataDir,
    rawDir,
    exportDir,
    sessionsDir,
    recipesDir,
    rawSnap: path.join(rawDir, 'latest-snap.json'),
    rawEntities: path.join(rawDir, 'latest-entities.json'),
    exportSummary: path.join(exportDir, 'latest-summary.md'),
    exportEntities: path.join(exportDir, 'latest-entities.json'),
    exportSnap: path.join(exportDir, 'latest-snapshot.json'),
    // backward-compat enriched snapshot (privacy without orderId mask)
    latestSnap: path.join(dataDir, 'latest-snapshot.json'),
    latestSummary: path.join(dataDir, 'latest-summary.md'),
    latestSelectors: path.join(dataDir, 'latest-selectors.json'),
    latestPageModel: path.join(dataDir, 'latest-page-model.json'),
    latestExploration: path.join(dataDir, 'latest-exploration.json'),
    latestExploreTrace: path.join(dataDir, 'latest-explore-trace.json'),
    latestSnapV2: path.join(dataDir, 'latest-snap-v2.json'),
    latestNetwork: path.join(dataDir, 'latest-network.json'),
  }

  return {
    paths,
    writeRaw(raw) {
      fs.writeFileSync(paths.rawSnap, JSON.stringify(raw, null, 2))
    },
    readRaw() {
      if (!fs.existsSync(paths.rawSnap)) return null
      return JSON.parse(fs.readFileSync(paths.rawSnap, 'utf8'))
    },
    writeEnriched(enriched) {
      fs.writeFileSync(paths.latestSnap, JSON.stringify(enriched, null, 2))
      fs.writeFileSync(paths.latestSummary, enriched.derived.summaryMd)
      fs.writeFileSync(
        paths.latestSelectors,
        JSON.stringify(enriched.derived.selectors, null, 2),
      )
      fs.writeFileSync(
        paths.latestPageModel,
        JSON.stringify(enriched.derived.pageModel, null, 2),
      )
      fs.writeFileSync(
        paths.latestExploration,
        JSON.stringify(enriched.derived.explorationCandidates, null, 2),
      )

      const exportSnap = redactForExport(enriched)
      fs.writeFileSync(paths.exportSnap, JSON.stringify(exportSnap, null, 2))
      fs.writeFileSync(paths.exportSummary, enriched.derived.summaryMd)

      if (enriched.derived.entities) {
        fs.writeFileSync(
          paths.rawEntities,
          JSON.stringify(enriched.derived.entities, null, 2),
        )
        fs.writeFileSync(
          paths.exportEntities,
          JSON.stringify(redactForExport(enriched.derived.entities), null, 2),
        )
      }

      if (enriched.snapV2) {
        fs.writeFileSync(
          paths.latestSnapV2,
          JSON.stringify(enriched.snapV2, null, 2),
        )
      }

      if (enriched.sensor?.network) {
        fs.writeFileSync(
          paths.latestNetwork,
          JSON.stringify(enriched.sensor.network, null, 2),
        )
      }
    },
    writeSession(sessionId, data) {
      const dir = path.join(sessionsDir, sessionId)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(data, null, 2),
      )
      return dir
    },
    stampedSnapshot(enriched) {
      const stamped = path.join(dataDir, `snapshot-${Date.now()}.json`)
      fs.writeFileSync(stamped, JSON.stringify(enriched, null, 2))
      return stamped
    },
  }
}

/**
 * Extract stable merge key from entity item (never masked).
 * @param {Record<string, unknown>} item
 * @param {string[]} [rules]
 */
export function extractMergeKey(
  item,
  rules = ['detailUrl:orderID=([^&]+)', 'orderId', 'id'],
) {
  for (const rule of rules) {
    if (rule.includes(':')) {
      // Split on the FIRST colon only, so regex patterns may contain ':'
      // (e.g. non-capturing groups like /orders/(?:stores/)?([^/?#]+)).
      const idx = rule.indexOf(':')
      const field = rule.slice(0, idx)
      const pattern = rule.slice(idx + 1)
      const val = item[field]
      if (typeof val === 'string') {
        const m = val.match(new RegExp(pattern, 'i'))
        if (m?.[1]) return decodeURIComponent(m[1])
      }
    } else {
      const val = item[rule]
      if (val && typeof val === 'string' && !/\*\*\*\*/.test(val)) return val
    }
  }
  return null
}
