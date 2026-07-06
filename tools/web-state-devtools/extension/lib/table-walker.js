/**
 * In-page table walker — column headers + row objects (generic, no site adapter).
 */
;(function initTableWalker() {
  const core = () => window.__WSD_CORE__

  function isVisible(el) {
    return core()?.isVisible?.(el) ?? false
  }

  function cellText(el) {
    return (el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 500)
  }

  function selectorOf(el) {
    return core()?.bestSelector?.(el) || ''
  }

  function headerTexts(table) {
    const headers = []
    const thead = table.querySelector('thead')
    if (thead) {
      for (const th of thead.querySelectorAll(
        'th, td, [role="columnheader"]',
      )) {
        const t = cellText(th)
        if (t) headers.push(t)
      }
    }
    if (!headers.length) {
      const firstRow = table.querySelector('tr, [role="row"]')
      if (firstRow) {
        for (const cell of firstRow.querySelectorAll(
          'th, td, [role="columnheader"], [role="gridcell"]',
        )) {
          const t = cellText(cell)
          if (t) headers.push(t)
        }
      }
    }
    return headers
  }

  function rowCells(row) {
    return [
      ...row.querySelectorAll('td, th, [role="cell"], [role="gridcell"]'),
    ].map((c) => cellText(c))
  }

  function cellsToObject(headers, cells) {
    /** @type {Record<string, string>} */
    const obj = {}
    for (let i = 0; i < cells.length; i++) {
      const key = headers[i] || `col${i + 1}`
      if (cells[i]) obj[key] = cells[i]
    }
    return obj
  }

  function walkNativeTable(table) {
    const headers = headerTexts(table)
    const rows = []
    const bodyRows = table.querySelectorAll('tbody tr, tr')
    let skippedHeader = !!table.querySelector('thead')

    for (const row of bodyRows) {
      if (skippedHeader && row.closest('thead')) continue
      const cells = rowCells(row)
      if (!cells.length || cells.every((c) => !c)) continue
      if (
        !skippedHeader &&
        headers.length &&
        cells.length === headers.length &&
        cells.every((c, i) => c === headers[i])
      ) {
        skippedHeader = true
        continue
      }
      rows.push(cellsToObject(headers, cells))
      if (rows.length >= 200) break
    }

    const caption =
      table.querySelector('caption')?.textContent?.trim() ||
      table.getAttribute('aria-label') ||
      undefined

    return {
      kind: 'table',
      source: 'table-walker',
      tag: table.tagName.toLowerCase(),
      role: table.getAttribute('role') || 'table',
      caption,
      selector: selectorOf(table),
      headers,
      rows,
      rowCount: rows.length,
    }
  }

  function walkAriaGrid(root) {
    const headers = []
    for (const h of root.querySelectorAll('[role="columnheader"]')) {
      const t = cellText(h)
      if (t) headers.push(t)
    }

    const rows = []
    for (const row of root.querySelectorAll('[role="row"]')) {
      if (row.querySelector('[role="columnheader"]') && !headers.length)
        continue
      const cells = [
        ...row.querySelectorAll('[role="gridcell"], [role="cell"]'),
      ].map((c) => cellText(c))
      if (!cells.length || cells.every((c) => !c)) continue
      rows.push(cellsToObject(headers, cells))
      if (rows.length >= 200) break
    }

    if (!rows.length) return null

    return {
      kind: 'table',
      source: 'table-walker',
      tag: root.tagName.toLowerCase(),
      role: root.getAttribute('role') || 'grid',
      caption: root.getAttribute('aria-label') || undefined,
      selector: selectorOf(root),
      headers,
      rows,
      rowCount: rows.length,
    }
  }

  function walkTables() {
    const out = []
    const seen = new Set()

    for (const table of document.querySelectorAll('table')) {
      if (!isVisible(table) || seen.has(table)) continue
      seen.add(table)
      const parsed = walkNativeTable(table)
      if (parsed.rowCount > 0) out.push(parsed)
    }

    for (const grid of document.querySelectorAll(
      '[role="table"], [role="grid"]',
    )) {
      if (grid.tagName.toLowerCase() === 'table' || seen.has(grid)) continue
      if (!isVisible(grid)) continue
      seen.add(grid)
      const parsed = walkAriaGrid(grid)
      if (parsed?.rowCount > 0) out.push(parsed)
    }

    return out.slice(0, 15)
  }

  window.__WSD_TABLE_WALKER__ = { walkTables }
})()
