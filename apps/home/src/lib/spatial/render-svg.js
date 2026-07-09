/** @typedef {import('./types.js').SpatialProject} SpatialProject */
import { formatFtIn } from './dimensions.js'
import {
  isEditableWall,
  OPENING_EDIT_BINDINGS,
  openingHitAlongH,
  openingHitRect,
  resolveWallBinding,
  RESIZE_GRIP_HIT,
  RESIZE_GRIP_VIS_W,
  supportsDoorWidthResize,
} from './wall-edit.js'
import { distanceFt, formatMeasureFt } from '../plan-measure.js'

/**
 * @param {SpatialProject} project
 * @param {{
 *   interactive?: boolean,
 *   highlightZone?: string,
 *   compact?: boolean,
 *   editMode?: boolean,
 *   selectedWall?: string,
 *   selectedOpening?: string,
 *   hideFurniture?: boolean,
 *   dragOverlay?: {
 *     x: number,
 *     y: number,
 *     anchorX?: number,
 *     anchorY?: number,
 *     text: string,
 *     subtext?: string,
 *     valid: boolean,
 *   } | null,
 *   dragBlockedWall?: string,
 *   dragBlockedOpening?: string,
 *   dragDimmed?: boolean,
 *   touchScale?: number,
 *   measure?: { a: { x: number, y: number } | null, b: { x: number, y: number } | null },
 *   graphEditMode?: boolean,
 *   selectedEdge?: string,
 *   wallChainFrom?: { x: number, y: number } | null,
 *   wallChainHover?: { x: number, y: number } | null,
 * }} [opts]
 */
export function renderFloorPlanSvg(project, opts = {}) {
  const { width, height } = project.viewport
  const step = project.gridStep ?? 52
  const compact = opts.compact ?? false
  const pxPerFt = project.layoutConfig?.pxPerFt ?? 36
  const touchScale = Math.max(1, opts.touchScale ?? 1)
  const wallHitStroke = Math.round(18 * touchScale)
  const wallOnStroke = Math.round(20 * touchScale)
  const dimmed = opts.dragDimmed ? ' room-dimmed' : ''

  const parts = []
  parts.push(
    `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="floor plan" xmlns="http://www.w3.org/2000/svg">`,
  )
  parts.push(`<defs>
  <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <rect width="7" height="7" fill="var(--plan-hatch-bg,#edf1f5)"/>
    <line x1="0" y1="0" x2="0" y2="7" stroke="var(--plan-hatch-line,#9aadc0)" stroke-width="2.4"/>
  </pattern>
</defs>`)
  parts.push(`<style>
 .grid line{stroke:var(--plan-grid,#dbe1e6);stroke-width:1}
 .wall{stroke:var(--plan-wall,#20242b);stroke-width:5;stroke-linecap:square}
 .gap{stroke:var(--plan-paper,#eef1f4);stroke-width:7}
 .thresh{stroke:var(--plan-threshold,#b9c1c9);stroke-width:1.4;stroke-dasharray:2 3}
 .door{fill:rgba(138,146,156,.12);stroke:var(--plan-door,#8a929c);stroke-width:1.2}
 .door-bifold{fill:none;stroke:var(--plan-door,#8a929c);stroke-width:1.6;stroke-linejoin:round}
 .dim-tag{font:${compact ? 8 : 9}px var(--mono,monospace);fill:var(--plan-dim,#6a727c)}
 .win{stroke:var(--plan-window,#5b6470);stroke-width:1.6}
 .room-zh{font:650 ${compact ? 11 : 14}px var(--font,system-ui,sans-serif);fill:var(--plan-text,#3a4048)}
 .room-en{font:${compact ? 9 : 11}px var(--mono,monospace);fill:var(--plan-muted,#8a929c);letter-spacing:.14em}
 .room-circ{stroke:var(--plan-circ,#c5cdd6);stroke-width:1;stroke-dasharray:4 3;fill:var(--plan-circ-fill,rgba(238,236,230,.45))}
 .circ-label{font:600 9px var(--mono,monospace);fill:var(--plan-muted,#8a929c);letter-spacing:.08em}
 .furn{font:${compact ? 8 : 10}px var(--sans,system-ui,sans-serif);fill:var(--plan-text-soft,#4a515a)}
 .tiny{font:10px var(--mono,monospace);fill:var(--plan-dim,#6a727c)}
 .mk{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:1.5}
 .mk-t{font:700 ${compact ? 9 : 11}px var(--mono,monospace);fill:#f5f8fa}
 .scale{stroke:var(--plan-text,#3a4048);stroke-width:1.6;fill:var(--plan-text,#3a4048)}
 .scale-seg{stroke:var(--plan-text,#3a4048);stroke-width:1}
 .north{fill:var(--plan-text,#3a4048)}
 .zone-hit{cursor:pointer;opacity:0}
 .zone-hit:hover{opacity:.2;fill:var(--plan-accent,#5c758c)}
 .zone-on{opacity:.24;fill:var(--plan-accent,#5c758c)}
 .wall-hit{stroke:rgba(92,117,140,.14);stroke-width:${wallHitStroke};cursor:ew-resize;pointer-events:stroke}
 .wall-hit.wall-h{cursor:ns-resize}
 .wall-hit:hover{stroke:rgba(92,117,140,.42)}
 .wall-hit.wall-deemph{stroke:rgba(92,117,140,.08);pointer-events:stroke}
 .wall-hit.wall-deemph:hover{stroke:rgba(92,117,140,.22)}
 .wall-on{stroke:rgba(92,117,140,.65);stroke-width:${wallOnStroke}}
 .open-hit{fill:transparent;stroke:transparent;cursor:grab;pointer-events:all}
 .open-hit:hover{fill:rgba(92,117,140,.14);stroke:var(--plan-accent,#5c758c);stroke-width:1.5;stroke-dasharray:4 3}
 .open-on{fill:rgba(92,117,140,.22);stroke:var(--plan-accent,#5c758c);stroke-width:2}
 .open-blocked{fill:rgba(180,83,9,.26)!important;stroke:#b45309!important;stroke-width:2.5;stroke-dasharray:4 3}
 .open-resize-hit{fill:rgba(92,117,140,.08);stroke:var(--plan-accent,#5c758c);stroke-width:1.2;stroke-dasharray:3 2;cursor:ew-resize;opacity:.95}
 .open-resize-hit:hover{fill:rgba(92,117,140,.18)}
 .open-resize{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:1;pointer-events:none;opacity:.95}
 .drag-leader{stroke:var(--plan-accent,#5c758c);stroke-width:1;stroke-dasharray:4 3;opacity:.65}
 .drag-leader.invalid{stroke:#b45309;opacity:.8}
 .edit-badge{font:600 10px var(--mono,monospace);fill:var(--plan-accent,#5c758c);opacity:.9}
 .edit-badge-sub{font:500 9px var(--mono,monospace);fill:var(--plan-dim,#6a727c)}
 .room-dimmed{opacity:.34}
 .drag-live{font:700 11px var(--mono,monospace);fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:3px;paint-order:stroke fill}
 .drag-live.invalid{fill:#b45309}
 .drag-live-sub{font:600 9px var(--mono,monospace);fill:var(--plan-dim,#6a727c);stroke:#fff;stroke-width:2.5px;paint-order:stroke fill}
 .drag-live-sub.invalid{fill:#b45309}
 .wall-blocked{stroke:rgba(180,83,9,.72)!important;stroke-width:${wallOnStroke + 2}}
 .measure-line{stroke:var(--plan-accent,#5c758c);stroke-width:2.2;stroke-dasharray:6 4}
 .measure-dot{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:2}
 .measure-label{font:700 12px var(--mono,monospace);fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:3px;paint-order:stroke fill}
 .graph-edge-hit{stroke:rgba(92,117,140,.12);stroke-width:${wallHitStroke};cursor:pointer;pointer-events:stroke}
 .graph-edge-hit:hover{stroke:rgba(92,117,140,.45)}
 .graph-edge-on{stroke:rgba(29,107,66,.75);stroke-width:${wallOnStroke}}
 .graph-edge-rm{cursor:crosshair}
 .graph-vert{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:1.5}
 .graph-chain{stroke:#1d6b42;stroke-width:2;stroke-dasharray:6 4;pointer-events:none}
 .graph-chain-vert{fill:#1d6b42;stroke:#fff;stroke-width:1.5;pointer-events:none}
</style>`)

  parts.push('<g class="grid">')
  for (let x = step; x < width; x += step) {
    parts.push(`<line x1="${x}" y1="${step}" x2="${x}" y2="${height - step}"/>`)
  }
  for (let y = step; y < height; y += step) {
    parts.push(`<line x1="${step}" y1="${y}" x2="${width - step}" y2="${y}"/>`)
  }
  parts.push('</g>')

  for (const room of project.rooms) {
    const { x, y, w, h } = room.bounds
    const isCirc = room.kind === 'circulation'
    const fill = room.fill ?? 'var(--plan-room,#e8edf1)'
    if (isCirc) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="room-circ"/>`,
      )
      if (!compact) {
        parts.push(
          `<text x="${x + 6}" y="${y + 14}" class="circ-label">${esc(room.nameZh)}</text>`,
        )
      }
      continue
    }
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="var(--plan-room-stroke,#cdd4da)" stroke-width="1"/>`,
    )
    const cx = x + w / 2
    const cy = y + h / 2 - (compact ? 6 : 8)
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" class="room-zh${dimmed}">${esc(room.nameZh)}</text>`,
    )
    if (!compact) {
      parts.push(
        `<text x="${cx}" y="${cy + 18}" text-anchor="middle" class="room-en${dimmed}">${esc(room.nameEn)}</text>`,
      )
    }
    if (room.dimensions && !compact) {
      const tag = `${formatFtIn(room.dimensions.w)} × ${formatFtIn(room.dimensions.h)}`
      parts.push(
        `<text x="${x + 6}" y="${y + h - 6}" class="dim-tag${dimmed}">${esc(tag)}</text>`,
      )
    }
  }

  if (!opts.hideFurniture) {
    for (const item of project.furniture) {
      const { x, y, w, h } = item.bounds
      const dash =
        item.strokeStyle === 'dashed' ? ' stroke-dasharray="4 3"' : ''
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--plan-furn,#dfe3e8)" stroke="var(--plan-door,#8a929c)" stroke-width="1.2" rx="3"${dash}/>`,
      )
      if (!compact || w > 36) {
        parts.push(
          `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" class="furn">${esc(item.label)}</text>`,
        )
      }
    }
  }

  for (const zone of project.storageZones) {
    const { x, y, w, h } = zone.bounds
    const on = opts.highlightZone === zone.code
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hatch)" stroke="var(--plan-accent,#5c758c)" stroke-width="1.6" rx="3" stroke-dasharray="5 3"/>`,
    )
    if (opts.interactive) {
      parts.push(
        `<rect class="zone-hit${on ? ' zone-on' : ''}" data-zone="${zone.code}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`,
      )
    }
  }

  for (const op of project.openings) {
    if (op.pathD) {
      const cls =
        op.type === 'door'
          ? op.doorStyle === 'bifold'
            ? 'door door-bifold'
            : 'door'
          : 'win'
      const fill = op.doorStyle === 'bifold' ? 'fill="none"' : ''
      parts.push(`<path d="${op.pathD}" class="${cls}" ${fill}/>`)
    }
    if (op.rect) {
      const { x, y, w, h } = op.rect
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--plan-ac,#c9d0d8)" stroke="var(--plan-door,#8a929c)" stroke-width="1"/>`,
      )
      if (op.label && !compact)
        parts.push(
          `<text x="${x + w / 2}" y="${y + h + 22}" text-anchor="middle" class="tiny">${esc(op.label)}</text>`,
        )
    }
    if (op.type === 'window' && op.from && op.to) {
      parts.push(
        `<line x1="${op.from.x}" y1="${op.from.y}" x2="${op.to.x}" y2="${op.to.y}" class="win"/>`,
      )
      parts.push(
        `<line x1="${op.from.x}" y1="${op.from.y + 4}" x2="${op.to.x}" y2="${op.to.y + 4}" class="win"/>`,
      )
    }
  }

  if (project.outerBounds) {
    const { x, y, w, h } = project.outerBounds
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="var(--plan-wall,#20242b)" stroke-width="6"/>`,
    )
  }
  for (const wall of project.walls) {
    const cls =
      wall.kind === 'gap'
        ? 'gap'
        : wall.kind === 'threshold'
          ? 'thresh'
          : 'wall'
    parts.push(
      `<line x1="${wall.from.x}" y1="${wall.from.y}" x2="${wall.to.x}" y2="${wall.to.y}" class="${cls}"/>`,
    )
  }

  if (opts.graphEditMode) {
    parts.push('<g class="edit-layer graph-layer" aria-label="墙图编辑">')
    for (const wall of project.walls) {
      if (wall.kind !== 'wall') continue
      const on = opts.selectedEdge === wall.id
      parts.push(
        `<line x1="${wall.from.x}" y1="${wall.from.y}" x2="${wall.to.x}" y2="${wall.to.y}" class="graph-edge-hit${on ? ' graph-edge-on' : ''}" data-edge-id="${wall.id}"/>`,
      )
    }
    if (opts.wallChainFrom) {
      parts.push(
        `<circle cx="${opts.wallChainFrom.x}" cy="${opts.wallChainFrom.y}" r="5" class="graph-chain-vert"/>`,
      )
      if (opts.wallChainHover) {
        parts.push(
          `<line x1="${opts.wallChainFrom.x}" y1="${opts.wallChainFrom.y}" x2="${opts.wallChainHover.x}" y2="${opts.wallChainHover.y}" class="graph-chain"/>`,
        )
      }
    }
    parts.push('</g>')
  } else if (opts.editMode) {
    parts.push('<g class="edit-layer edit-layer-walls" aria-label="可编辑墙线">')
    for (const wall of project.walls) {
      if (wall.kind !== 'wall' || !isEditableWall(wall.id)) continue
      const binding = resolveWallBinding(wall.id)
      const on = opts.selectedWall === wall.id
      const orient = binding?.orientation === 'h' ? ' wall-h' : ''
      const blocked = opts.dragBlockedWall === wall.id
      const deemph = opts.selectedOpening ? ' wall-deemph' : ''
      parts.push(
        `<line x1="${wall.from.x}" y1="${wall.from.y}" x2="${wall.to.x}" y2="${wall.to.y}" class="wall-hit${orient}${on ? ' wall-on' : ''}${blocked ? ' wall-blocked' : ''}${deemph}" data-wall-id="${wall.id}"/>`,
      )
    }
    parts.push('</g>')
    parts.push('<g class="edit-layer edit-layer-openings" aria-label="可编辑门窗">')
    for (const op of project.openings) {
      if (op.id === 'ac-living') continue
      const hit = openingHitRect(op)
      const on = opts.selectedOpening === op.id
      const blocked = opts.dragBlockedOpening === op.id
      parts.push(
        `<rect x="${hit.x}" y="${hit.y}" width="${hit.w}" height="${hit.h}" rx="4" class="open-hit${on ? ' open-on' : ''}${blocked ? ' open-blocked' : ''}" data-opening-id="${op.id}"/>`,
      )
      if (supportsDoorWidthResize(op.id)) {
        appendResizeGrip(parts, op.id, hit, touchScale)
      }
    }
    const closetGap = project.walls.find((w) => w.id === 'g-bed-closet')
    if (closetGap) {
      const hit = openingHitAlongH(closetGap.from.x, closetGap.to.x, closetGap.from.y)
      const on = opts.selectedOpening === 'g-bed-closet'
      const blocked = opts.dragBlockedOpening === 'g-bed-closet'
      parts.push(
        `<rect x="${hit.x}" y="${hit.y}" width="${hit.w}" height="${hit.h}" rx="4" class="open-hit${on ? ' open-on' : ''}${blocked ? ' open-blocked' : ''}" data-opening-id="g-bed-closet"/>`,
      )
      appendResizeGrip(parts, 'g-bed-closet', hit, touchScale)
    }
    parts.push('</g>')
    if (!compact) {
      const margin = project.layoutConfig?.margin ?? { x: 46, y: 40 }
      const badgeY = margin.y + 14
      let badgeMain = '编辑模式'
      let badgeSub = ''
      if (opts.selectedWall) {
        const b = resolveWallBinding(opts.selectedWall)
        if (b) {
          badgeMain = `墙体 · ${b.label}`
          badgeSub = '拖曳调整尺寸'
        }
      } else if (opts.selectedOpening) {
        const b = OPENING_EDIT_BINDINGS[opts.selectedOpening]
        if (b) {
          badgeMain = `开口 · ${b.label}`
          badgeSub = supportsDoorWidthResize(opts.selectedOpening)
            ? '拖曳移动 · 右侧握把改门宽'
            : '拖曳调整位置'
        }
      }
      parts.push(
        `<text x="${margin.x}" y="${badgeY}" class="edit-badge">${esc(badgeMain)}</text>`,
      )
      if (badgeSub) {
        parts.push(
          `<text x="${margin.x}" y="${badgeY + 12}" class="edit-badge-sub">${esc(badgeSub)}</text>`,
        )
      }
    }
  }

  for (const zone of project.storageZones) {
    const { x, y } = zone.marker
    const r = compact ? 8 : 11
    parts.push(`<circle cx="${x}" cy="${y}" r="${r}" class="mk"/>`)
    parts.push(
      `<text x="${x}" y="${y + (compact ? 2.8 : 3.6)}" text-anchor="middle" class="mk-t">${esc(zone.code)}</text>`,
    )
  }

  renderGraphicScale(parts, height, pxPerFt, compact)

  parts.push(
    `<path d="M ${width - 106} ${height - 54} L ${width - 112} ${height - 34} L ${width - 106} ${height - 39} L ${width - 100} ${height - 34} Z" class="north"/>`,
  )
  parts.push(
    `<text x="${width - 106}" y="${height - 58}" text-anchor="middle" class="tiny">N</text>`,
  )

  if (opts.dragOverlay) {
    const { x, y, anchorX, anchorY, text, subtext, valid } = opts.dragOverlay
    const cls = valid ? 'drag-live' : 'drag-live invalid'
    const subCls = valid ? 'drag-live-sub' : 'drag-live-sub invalid'
    const leaderCls = valid ? 'drag-leader' : 'drag-leader invalid'
    const label = esc(text)
    const sub = subtext ? esc(subtext) : ''
    const boxW = Math.min(
      240,
      Math.max(96, Math.max(label.length, sub.length) * 6.2 + 18),
    )
    const boxH = sub ? 34 : 24
    const boxY = y - boxH - 4
    const leaderY = boxY + boxH / 2
    parts.push('<g class="drag-overlay" pointer-events="none">')
    if (anchorX != null && anchorY != null) {
      parts.push(
        `<line x1="${anchorX}" y1="${anchorY}" x2="${x}" y2="${leaderY}" class="${leaderCls}"/>`,
      )
    }
    parts.push(
      `<rect x="${x - boxW / 2}" y="${boxY}" width="${boxW}" height="${boxH}" rx="6" fill="rgba(255,255,255,.97)" stroke="${valid ? 'var(--plan-accent,#5c758c)' : '#b45309'}" stroke-width="1.4"/>`,
    )
    parts.push(
      `<text x="${x}" y="${y - (sub ? 18 : 12)}" text-anchor="middle" class="${cls}">${label}</text>`,
    )
    if (sub) {
      parts.push(
        `<text x="${x}" y="${y - 6}" text-anchor="middle" class="${subCls}">${sub}</text>`,
      )
    }
    parts.push('</g>')
  }

  if (opts.measure?.a) {
    const { a, b } = opts.measure
    parts.push('<g class="measure-layer" pointer-events="none" aria-label="测距">')
    parts.push(
      `<circle cx="${a.x}" cy="${a.y}" r="5" class="measure-dot"/>`,
    )
    if (b) {
      parts.push(
        `<circle cx="${b.x}" cy="${b.y}" r="5" class="measure-dot"/>`,
      )
      parts.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="measure-line"/>`,
      )
      const label = formatMeasureFt(distanceFt(a, b, pxPerFt))
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 12 }
      parts.push(
        `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" class="measure-label">${esc(label)}</text>`,
      )
    }
    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/** @param {string[]} parts @param {number} height @param {number} pxPerFt @param {boolean} compact */
function renderGraphicScale(parts, height, pxPerFt, compact) {
  const y = height - (compact ? 24 : 32)
  const seg = pxPerFt * 5
  const x0 = 46
  const labels = ['0', "5'", "10'"]
  for (let i = 0; i < 2; i++) {
    const x1 = x0 + i * seg
    const x2 = x0 + (i + 1) * seg
    const fill = i % 2 === 0 ? 'var(--plan-text,#3a4048)' : 'none'
    parts.push(
      `<rect x="${x1}" y="${y - 6}" width="${seg}" height="6" fill="${fill}" stroke="var(--plan-text,#3a4048)" stroke-width="1" class="scale-seg"/>`,
    )
    parts.push(
      `<line x1="${x1}" y1="${y - 10}" x2="${x1}" y2="${y + 2}" class="scale"/>`,
    )
    parts.push(
      `<text x="${x1}" y="${y + 14}" text-anchor="middle" class="tiny">${labels[i]}</text>`,
    )
  }
  const xEnd = x0 + seg * 2
  parts.push(
    `<line x1="${xEnd}" y1="${y - 10}" x2="${xEnd}" y2="${y + 2}" class="scale"/>`,
  )
  parts.push(
    `<text x="${xEnd}" y="${y + 14}" text-anchor="middle" class="tiny">${labels[2]}</text>`,
  )
  if (!compact) {
    parts.push(
      `<text x="${x0 + seg}" y="${y + 28}" text-anchor="middle" class="tiny">比例尺 · ${pxPerFt} px/ft · 北向上</text>`,
    )
  }
}

/** @param {string[]} parts @param {string} openingId @param {{ x: number, y: number, w: number, h: number }} hit @param {number} [touchScale] */
function appendResizeGrip(parts, openingId, hit, touchScale = 1) {
  const scale = Math.max(1, touchScale)
  const visW = RESIZE_GRIP_VIS_W
  const visH = Math.min(hit.h, 28)
  const visX = hit.x + hit.w - visW - 4
  const visY = hit.y + (hit.h - visH) / 2
  const hitW = RESIZE_GRIP_HIT * scale
  const hitH = Math.max(visH + 8, RESIZE_GRIP_HIT * scale)
  const hitX = visX + visW / 2 - hitW / 2
  const hitY = visY + visH / 2 - hitH / 2
  parts.push(
    `<rect x="${hitX}" y="${hitY}" width="${hitW}" height="${hitH}" rx="5" class="open-resize-hit" data-opening-id="${openingId}" data-drag-mode="width" aria-label="拖曳调整门宽"/>`,
  )
  parts.push(
    `<rect x="${visX}" y="${visY}" width="${visW}" height="${visH}" rx="3" class="open-resize" aria-hidden="true"/>`,
  )
  parts.push(
    `<text x="${visX + visW / 2}" y="${visY + visH / 2 + 3.5}" text-anchor="middle" class="tiny" fill="#fff" pointer-events="none">↔</text>`,
  )
}

/** @param {string} s */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
