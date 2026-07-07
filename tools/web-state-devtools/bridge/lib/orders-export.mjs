import fs from 'node:fs'
import path from 'node:path'

/**
 * Canonical basename for a date-range order harvest, e.g.
 *   bestbuy-orders-2024-12-01_to_2026-05-17
 * Replaces the old, misleading `<source>-orders-past-year` naming.
 */
export function datedOrdersBasename(source, sinceLabel, untilLabel) {
  return `${source}-orders-${sinceLabel}_to_${untilLabel}`
}

/**
 * Resolve the newest raw orders export for a merchant source, so consumers
 * never hardcode a specific (and now variable) filename.
 *
 * Selection: newest `<source>-orders*-raw.json` by mtime. This transparently
 * prefers a freshly written date-range file while still resolving the legacy
 * `<source>-orders-past-year-raw.json` before any re-harvest happens.
 *
 * @param {string} exportDir absolute path to the `<source>-export` directory
 * @param {string} source e.g. 'bestbuy' | 'target' | 'amazon'
 * @returns {string | null} absolute path to the newest raw export, or null
 */
export function resolveOrdersRawPath(exportDir, source) {
  try {
    if (!fs.existsSync(exportDir)) return null
    const files = fs
      .readdirSync(exportDir)
      .filter(
        (f) => f.startsWith(`${source}-orders`) && f.endsWith('-raw.json'),
      )
    if (!files.length) return null
    const newest = files
      .map((f) => {
        const full = path.join(exportDir, f)
        return { full, mtime: fs.statSync(full).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)[0]
    return newest.full
  } catch {
    return null
  }
}

/**
 * Read the harvest window start from an export summary, tolerating both the new
 * `harvestSince` field and legacy `since` / `pastYearCutoff` fields.
 */
export function summaryHarvestSince(summary) {
  return (
    summary?.harvestSince ?? summary?.since ?? summary?.pastYearCutoff ?? null
  )
}

/**
 * Read the harvest window end from an export summary (new `harvestUntil`,
 * falling back to `until`). Returns null when absent.
 */
export function summaryHarvestUntil(summary) {
  return summary?.harvestUntil ?? summary?.until ?? null
}
