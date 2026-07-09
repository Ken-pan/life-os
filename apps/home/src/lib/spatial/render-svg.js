/** @typedef {import('./types.js').SpatialProject} SpatialProject */
import { formatFtIn } from './dimensions.js'
import { graphOpeningBounds, graphOpeningHitRect } from './graph-openings.js'
import { polygonPointsAttr, zoneCentroid } from './zones.js'
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
 *   graphTool?: 'wallAdd' | 'remove' | 'select' | 'opening',
 *   selectedEdge?: string,
 *   wallChainFrom?: { x: number, y: number } | null,
 *   wallChainHover?: { x: number, y: number } | null,
 *   zoneEditMode?: boolean,
 *   zoneTool?: 'zoneAdd' | 'zoneSelect' | 'zoneRemove',
 *   selectedSpatialZone?: string,
 *   zoneChainFrom?: { x: number, y: number } | null,
 *   zoneChainHover?: { x: number, y: number } | null,
 *   zoneChainPoints?: { x: number, y: number }[],
 *   previewZones?: import('./types.js').SpatialZone[] | null,
 *   placementEditMode?: boolean,
 *   placementTool?: 'place' | 'storage',
 *   selectedPlacement?: string,
 *   showFurniture?: boolean,
 *   showRoomEnglish?: boolean,
 * }} [opts]
 */
export function renderFloorPlanSvg(project, opts = {}) {
  const { width, height } = project.viewport
  const step = project.gridStep ?? 52
  const compact = opts.compact ?? false
  const showRoomEnglish = opts.showRoomEnglish ?? false
  const pxPerFt =
    project.layoutConfig?.pxPerFt ?? project.wallGraph?.pxPerFt ?? 36
  const touchScale = Math.max(1, opts.touchScale ?? 1)
  const wallHitStroke = Math.round(18 * touchScale)
  const wallOnStroke = Math.round(20 * touchScale)
  const dimmed = opts.dragDimmed ? ' room-dimmed' : ''
  const editModeOn = opts.editMode ? ' edit-mode-on' : ''
  const interactiveOn = opts.interactive ? ' plan-interactive' : ''
  const svgRole = opts.interactive ? 'application' : 'img'
  const svgLabel = opts.interactive
    ? '顶视平面图，Tab 聚焦储藏区后按 Enter 查看清单'
    : '顶视平面图'
  const spatialZones = opts.previewZones ?? project.zones ?? []
  const hasSpatialZones = spatialZones.length > 0
  const hideFurniture = opts.hideFurniture && !opts.showFurniture

  const parts = []
  parts.push(
    `<svg class="floor-plan-svg${editModeOn}${interactiveOn}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="${svgRole}" aria-label="${esc(svgLabel)}" xmlns="http://www.w3.org/2000/svg">`,
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
 .door-cad,.door-bifold,.door-pocket{fill:none;stroke:var(--plan-door,#8a929c);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
 .door-pocket{stroke-dasharray:5 3}
 .dim-tag{font:${compact ? 8 : 9}px var(--mono,monospace);fill:var(--plan-dim,#6a727c);pointer-events:none}
 .win{stroke:var(--plan-window,#5b6470);stroke-width:1.6}
 .room-zh{font:650 ${compact ? 11 : 14}px var(--font,system-ui,sans-serif);fill:var(--plan-text,#3a4048);pointer-events:none}
 .room-en{font:${compact ? 9 : 11}px var(--mono,monospace);fill:var(--plan-muted,#8a929c);letter-spacing:.14em;pointer-events:none}
 .room-circ{stroke:var(--plan-circ,#c5cdd6);stroke-width:1;stroke-dasharray:4 3;fill:var(--plan-circ-fill,rgba(238,236,230,.45))}
 .edit-mode-on .room-fill,.edit-mode-on .room-circ{opacity:.72}
 .circ-label{font:600 9px var(--mono,monospace);fill:var(--plan-muted,#8a929c);letter-spacing:.08em;pointer-events:none}
 .furn{font:${compact ? 8 : 10}px var(--sans,system-ui,sans-serif);fill:var(--plan-text-soft,#4a515a);pointer-events:none}
 .furn-item{cursor:help;fill:var(--plan-furn,#c5ced8);stroke:var(--plan-furn-stroke,#8a929c)}
 .storage-zone{pointer-events:none}
 .tiny{font:10px var(--mono,monospace);fill:var(--plan-dim,#6a727c)}
 .mk{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:1.5}
 .mk-t{pointer-events:none;font:700 ${compact ? 9 : 11}px var(--mono,monospace);fill:#f5f8fa}
 .plan-interactive .mk{cursor:pointer}
 .scale{stroke:var(--plan-text,#3a4048);stroke-width:1.6;fill:var(--plan-text,#3a4048)}
 .scale-seg{stroke:var(--plan-text,#3a4048);stroke-width:1}
 .north{fill:var(--plan-text,#3a4048)}
 .zone-hit{cursor:pointer;opacity:0}
 .zone-hit:hover,.zone-hit:focus-visible{opacity:.2;fill:var(--plan-accent,#5c758c)}
 .zone-on{opacity:.24;fill:var(--plan-accent,#5c758c)}
 .plan-interactive .zone-marker:focus-visible{stroke:var(--plan-accent,#5c758c);stroke-width:3;outline:none}
 .zone-label-hit{cursor:help;pointer-events:all}
 .zone-glyph{font:700 9px var(--mono,monospace);fill:var(--plan-accent,#5c758c);opacity:.72;pointer-events:none}
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
 .open-resize-hit{fill:rgba(92,117,140,.12);stroke:var(--plan-accent,#5c758c);stroke-width:1.4;stroke-dasharray:3 2;cursor:ew-resize;opacity:1}
 .open-resize-hit:hover{fill:rgba(92,117,140,.24)}
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
 .graph-edge-on{stroke:color-mix(in srgb,var(--graph-accent,#1d6b42) 75%,transparent);stroke-width:${wallOnStroke};stroke-dasharray:8 5;animation:plan-sel-pulse 1.15s ease-in-out infinite}
 .graph-edge-rm{cursor:crosshair}
 .graph-edge-rm.graph-edge-cascade{stroke:rgba(180,83,9,.55);stroke-width:${wallHitStroke}}
 .graph-edge-rm:hover{stroke:rgba(180,83,9,.75)}
 .graph-vert{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:1.5}
 .graph-chain{stroke:var(--graph-accent,#1d6b42);stroke-width:2;stroke-dasharray:6 4;pointer-events:none}
 .graph-chain-vert{fill:var(--graph-accent,#1d6b42);stroke:#fff;stroke-width:1.5;pointer-events:none}
 .graph-vertex-hit{fill:color-mix(in srgb,var(--graph-accent,#1d6b42) 85%,transparent);stroke:#fff;stroke-width:1.5;cursor:grab;pointer-events:all}
 .graph-vertex-hit:hover{fill:var(--graph-accent,#1d6b42)}
 .graph-open-hit{fill:var(--graph-accent-muted,color-mix(in srgb,#1d6b42 8%,transparent));stroke:color-mix(in srgb,var(--graph-accent,#1d6b42) 35%,transparent);stroke-width:2;cursor:grab;pointer-events:all}
 .graph-open-hit:hover{fill:color-mix(in srgb,var(--graph-accent,#1d6b42) 16%,transparent)}
 .graph-open-on{fill:var(--graph-accent-muted,color-mix(in srgb,#1d6b42 18%,transparent));stroke:var(--graph-accent,#1d6b42);stroke-width:2.5;stroke-dasharray:6 4;animation:plan-sel-pulse 1.15s ease-in-out infinite}
 .graph-open-grip{fill:var(--graph-accent,#1d6b42);stroke:#fff;stroke-width:1.2;pointer-events:none}
 .graph-open-grip-hit{fill:transparent;stroke:none;cursor:ew-resize;pointer-events:all}
 .graph-open-grip-hit[data-wall-axis="v"]{cursor:ns-resize}
 .spatial-zone{stroke:var(--plan-room-stroke,#cdd4da);stroke-width:1;pointer-events:none}
 .spatial-zone-stale{stroke-dasharray:6 4;stroke:#b45309;stroke-width:2}
 .spatial-zone-label{font:650 ${compact ? 11 : 13}px var(--font,system-ui,sans-serif);fill:var(--plan-text,#3a4048);pointer-events:none}
 .spatial-zone-hit{fill:transparent;stroke:none;cursor:pointer;pointer-events:all}
 .spatial-zone-hit:hover{fill:color-mix(in srgb,var(--graph-accent,#1d6b42) 12%,transparent)}
 .spatial-zone-on{fill:color-mix(in srgb,var(--graph-accent,#1d6b42) 14%,transparent);stroke:var(--graph-accent,#1d6b42);stroke-width:2;stroke-dasharray:8 5;animation:plan-sel-pulse 1.15s ease-in-out infinite}
 .spatial-zone-rm{cursor:pointer;fill:color-mix(in srgb,#b45309 10%,transparent)}
 .spatial-zone-rm:hover{fill:color-mix(in srgb,#b45309 22%,transparent)}
 .zone-chain{stroke:var(--graph-accent,#1d6b42);stroke-width:2;stroke-dasharray:6 4;pointer-events:none}
 .zone-chain-vert{fill:var(--graph-accent,#1d6b42);stroke:#fff;stroke-width:1.5;pointer-events:none}
 .zone-vertex-hit{fill:var(--graph-accent,#1d6b42);stroke:#fff;stroke-width:1.5;cursor:grab;pointer-events:all}
 .placement-item{fill:var(--plan-furn,#c5ced8);stroke:var(--plan-furn-stroke,#8a929c);stroke-width:1.2}
 .placement-on{stroke:var(--graph-accent,#1d6b42);stroke-width:2.5;stroke-dasharray:6 4;animation:plan-sel-pulse 1.15s ease-in-out infinite}
 .placement-label{font:${compact ? 8 : 10}px var(--sans,system-ui,sans-serif);fill:var(--plan-text-soft,#4a515a);pointer-events:none}
 .placement-hit{fill:transparent;stroke:none;cursor:pointer;pointer-events:all}
 .storage-unassigned{stroke-dasharray:4 3;opacity:.85}
 @keyframes plan-sel-pulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.45}}
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
    if (hasSpatialZones) continue
    const { x, y, w, h } = room.bounds
    const isCirc = room.kind === 'circulation'
    const fill = room.fill ?? 'var(--plan-room,#e8edf1)'
    if (isCirc) {
      const circTip = `动线 · ${room.nameZh}`
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="room-circ room-fill" data-plan-tip="${esc(circTip)}"/>`,
      )
      if (!compact) {
        parts.push(
          `<text x="${x + 6}" y="${y + 14}" class="circ-label">${esc(room.nameZh)}</text>`,
        )
      }
      continue
    }
    const roomTip = `房间 · ${room.nameZh}（浅色仅区分房间）`
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="room-fill" fill="${fill}" stroke="var(--plan-room-stroke,#cdd4da)" stroke-width="1" data-plan-tip="${esc(roomTip)}"/>`,
    )
    const cx = x + w / 2
    const cy = y + h / 2 - (compact ? 6 : 8)
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" class="room-zh${dimmed}">${esc(room.nameZh)}</text>`,
    )
    if (showRoomEnglish && !compact) {
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

  if (!hideFurniture && !project.placements?.length) {
    for (const item of project.furniture) {
      const { x, y, w, h } = item.bounds
      const dash =
        item.strokeStyle === 'dashed' ? ' stroke-dasharray="4 3"' : ''
      const inferred = item.strokeStyle === 'dashed' ? ' · 推测摆位' : ''
      const furnTip = `家具示意 · ${item.label}${inferred}（不可删除）`
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="furn-item" stroke-width="1.2" rx="3"${dash} data-plan-tip="${esc(furnTip)}">`,
      )
      parts.push(
        `<title>家具示意 · ${esc(item.label)}${inferred}（不可删除）</title></rect>`,
      )
      if (!compact || w > 36) {
        parts.push(
          `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" class="furn">${esc(item.label)}</text>`,
        )
      }
    }
  }

  for (const zone of project.storageZones) {
    if (!zone.bounds) continue
    const { x, y, w, h } = zone.bounds
    const on = opts.highlightZone === zone.code
    const unassigned = !zone.zoneId && !zone.placementId
    const dash = unassigned ? ' storage-unassigned' : ''
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="storage-zone${dash}" fill="url(#hatch)" stroke="var(--plan-accent,#5c758c)" stroke-width="1.8" rx="3" stroke-dasharray="5 3"/>`,
    )
    if (!compact && w > 40 && h > 22) {
      parts.push(
        `<text x="${x + 6}" y="${y + 14}" class="zone-glyph" pointer-events="none">${esc(zone.code)}</text>`,
      )
    }
    if (opts.interactive) {
      const zoneTitle = `${zone.code} · ${zone.nameZh} — 点击查看储藏清单`
      parts.push(
        `<rect class="zone-hit${on ? ' zone-on' : ''}" data-zone="${zone.code}" data-plan-tip="${esc(zoneTitle)}" tabindex="0" role="button" aria-label="${esc(zoneTitle)}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"><title>${esc(zoneTitle)}</title></rect>`,
      )
    } else {
      const zoneTip = `${zone.code} · ${zone.nameZh}`
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="none" pointer-events="all" class="zone-label-hit" data-plan-tip="${esc(zoneTip)}"><title>${esc(zoneTip)}</title></rect>`,
      )
    }
  }

  for (const op of project.openings) {
    if (op.pathD) {
      const cls =
        op.type === 'door'
          ? op.doorStyle === 'bifold'
            ? 'door door-bifold'
            : op.doorStyle === 'pocket'
              ? 'door door-cad door-pocket'
              : 'door door-cad'
          : 'win'
      parts.push(`<path d="${op.pathD}" class="${cls}"/>`)
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

  if (hasSpatialZones) {
    parts.push('<g class="spatial-zones" aria-label="手绘分区">')
    for (const z of spatialZones) {
      const pts = polygonPointsAttr(z.polygon)
      const fill = z.color ?? 'var(--plan-room,#e8edf1)'
      const staleCls = z.stale ? ' spatial-zone-stale' : ''
      const c = zoneCentroid(z.polygon)
      parts.push(
        `<polygon points="${pts}" class="spatial-zone${staleCls}" fill="${fill}" fill-opacity="0.18" data-zone-stale="${z.stale ? '1' : '0'}"/>`,
      )
      parts.push(
        `<text x="${c.x}" y="${c.y}" text-anchor="middle" class="spatial-zone-label${dimmed}">${esc(z.nameZh)}${z.stale ? ' · 需核对' : ''}</text>`,
      )
    }
    parts.push('</g>')
  }

  if (!hideFurniture && project.placements?.length) {
    parts.push('<g class="placements" aria-label="家具布置">')
    for (const p of project.placements) {
      const on = opts.selectedPlacement === p.id
      const rot = p.rotation ?? 0
      const cx = p.x + p.w / 2
      const cy = p.y + p.h / 2
      parts.push(
        `<g transform="rotate(${rot} ${cx} ${cy})">`,
        `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" class="placement-item${on ? ' placement-on' : ''}"/>`,
        `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="placement-label">${esc(p.label)}</text>`,
        `</g>`,
      )
    }
    parts.push('</g>')
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
    if (project.wallGraph) {
      const verts = Object.fromEntries(
        project.wallGraph.vertices.map((v) => [v.id, v]),
      )
      const openingsByEdge = new Map()
      for (const go of project.graphOpenings ?? []) {
        if (go.hidden) continue
        openingsByEdge.set(go.edgeId, (openingsByEdge.get(go.edgeId) ?? 0) + 1)
      }
      const rmMode = opts.graphTool === 'remove'
      for (const edge of project.wallGraph.edges) {
        const a = verts[edge.a]
        const b = verts[edge.b]
        if (!a || !b) continue
        const on = opts.selectedEdge === edge.id
        const cascade = rmMode && (openingsByEdge.get(edge.id) ?? 0) > 0
        const edgeCls = [
          'graph-edge-hit',
          on ? 'graph-edge-on' : '',
          rmMode ? 'graph-edge-rm' : '',
          cascade ? 'graph-edge-cascade' : '',
        ]
          .filter(Boolean)
          .join(' ')
        const tip = cascade
          ? `墙段 — 点击删除 · 含 ${openingsByEdge.get(edge.id)} 个门窗`
          : rmMode
            ? '墙段 — 点击删除'
            : '墙段 — 点击选中'
        parts.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${edgeCls}" data-edge-id="${edge.id}" data-plan-tip="${esc(tip)}" aria-selected="${on ? 'true' : 'false'}"><title>${esc(tip)}</title></line>`,
        )
      }
    } else {
      for (const wall of project.walls) {
        if (wall.kind !== 'wall') continue
        const on = opts.selectedEdge === wall.id
        parts.push(
          `<line x1="${wall.from.x}" y1="${wall.from.y}" x2="${wall.to.x}" y2="${wall.to.y}" class="graph-edge-hit${on ? ' graph-edge-on' : ''}" data-edge-id="${wall.id}" data-plan-tip="墙段 — 点击选中"><title>墙段 — 点击选中</title></line>`,
        )
      }
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
    if (opts.graphTool === 'select' && project.wallGraph) {
      const vr = 6 * touchScale
      for (const v of project.wallGraph.vertices) {
        parts.push(
          `<circle cx="${v.x}" cy="${v.y}" r="${vr}" class="graph-vertex-hit" data-vertex-id="${v.id}"><title>拖曳调整顶点</title></circle>`,
        )
      }
    }
    if (
      project.wallGraph &&
      (opts.graphTool === 'select' || opts.graphTool === 'opening') &&
      project.graphOpenings?.length
    ) {
      parts.push('<g class="graph-openings-hit" aria-label="墙图门窗">')
      for (const go of project.graphOpenings) {
        if (go.hidden) continue
        const hit = graphOpeningHitRect(project.wallGraph, go)
        const bounds = graphOpeningBounds(project.wallGraph, go)
        const wallAxis = bounds?.horizontal === false ? 'v' : 'h'
        const on = opts.selectedOpening === go.id
        const label = go.type === 'window' ? '窗' : '门'
        const title = `${label} · 拖曳沿墙移动 · 端点改宽`
        parts.push(
          `<rect x="${hit.x}" y="${hit.y}" width="${hit.w}" height="${hit.h}" rx="4" class="graph-open-hit${on ? ' graph-open-on' : ''}" data-graph-opening-id="${go.id}" data-plan-tip="${esc(title)}" aria-selected="${on ? 'true' : 'false'}"><title>${esc(title)}</title></rect>`,
        )
        if (on && opts.graphTool === 'select') {
          appendGraphOpeningGrip(
            parts,
            go.id,
            hit.p0,
            'start',
            touchScale,
            wallAxis,
          )
          appendGraphOpeningGrip(
            parts,
            go.id,
            hit.p1,
            'end',
            touchScale,
            wallAxis,
          )
        }
      }
      parts.push('</g>')
    }
    parts.push('</g>')
  } else if (opts.editMode) {
    parts.push(
      '<g class="edit-layer edit-layer-walls" aria-label="可编辑墙线">',
    )
    for (const wall of project.walls) {
      if (wall.kind !== 'wall' || !isEditableWall(wall.id)) continue
      const binding = resolveWallBinding(wall.id)
      const on = opts.selectedWall === wall.id
      const orient = binding?.orientation === 'h' ? ' wall-h' : ''
      const blocked = opts.dragBlockedWall === wall.id
      const deemph =
        opts.selectedOpening || (opts.selectedWall && !on) ? ' wall-deemph' : ''
      const wallTitle = binding
        ? `墙体 · ${binding.label} — 拖曳改房间尺寸`
        : '内墙 — 拖曳改尺寸'
      parts.push(
        `<line x1="${wall.from.x}" y1="${wall.from.y}" x2="${wall.to.x}" y2="${wall.to.y}" class="wall-hit${orient}${on ? ' wall-on' : ''}${blocked ? ' wall-blocked' : ''}${deemph}" data-wall-id="${wall.id}" data-plan-tip="${esc(wallTitle)}"><title>${esc(wallTitle)}</title></line>`,
      )
    }
    parts.push('</g>')
    parts.push(
      '<g class="edit-layer edit-layer-openings" aria-label="可编辑门窗">',
    )
    for (const op of project.openings) {
      if (op.id === 'ac-living') continue
      const hit = openingHitRect(op)
      const on = opts.selectedOpening === op.id
      const blocked = opts.dragBlockedOpening === op.id
      const openingBinding = OPENING_EDIT_BINDINGS[op.id]
      const openTitle = openingBinding
        ? supportsDoorWidthResize(op.id)
          ? `开口 · ${openingBinding.label} — 拖曳移动 · 右侧握把改门宽`
          : `开口 · ${openingBinding.label} — 拖曳改位置`
        : '门窗 — 拖曳改位置'
      parts.push(
        `<rect x="${hit.x}" y="${hit.y}" width="${hit.w}" height="${hit.h}" rx="4" class="open-hit${on ? ' open-on' : ''}${blocked ? ' open-blocked' : ''}" data-opening-id="${op.id}" data-plan-tip="${esc(openTitle)}"><title>${esc(openTitle)}</title></rect>`,
      )
      if (supportsDoorWidthResize(op.id)) {
        appendResizeGrip(parts, op.id, hit, touchScale)
      }
    }
    const closetGap = project.walls.find((w) => w.id === 'g-bed-closet')
    if (closetGap) {
      const hit = openingHitAlongH(
        closetGap.from.x,
        closetGap.to.x,
        closetGap.from.y,
      )
      const on = opts.selectedOpening === 'g-bed-closet'
      const blocked = opts.dragBlockedOpening === 'g-bed-closet'
      const closetTitle = '开口 · 壁橱双折门 — 拖曳移动 · 右侧握把改门宽'
      parts.push(
        `<rect x="${hit.x}" y="${hit.y}" width="${hit.w}" height="${hit.h}" rx="4" class="open-hit${on ? ' open-on' : ''}${blocked ? ' open-blocked' : ''}" data-opening-id="g-bed-closet" data-plan-tip="${esc(closetTitle)}"><title>${esc(closetTitle)}</title></rect>`,
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
    if (!zone.marker) continue
    const { x, y } = zone.marker
    const r = compact ? 8 : 11
    const markerTitle = opts.interactive
      ? `${zone.code} · ${zone.nameZh} — 点击查看储藏清单`
      : `${zone.code} · ${zone.nameZh}`
    const markerA11y = opts.interactive
      ? ` tabindex="0" role="button" aria-label="${esc(markerTitle)}"`
      : ''
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${r}" class="mk zone-marker" data-zone="${zone.code}" data-plan-tip="${esc(markerTitle)}"${markerA11y}><title>${esc(markerTitle)}</title></circle>`,
    )
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
    parts.push(
      '<g class="measure-layer" pointer-events="none" aria-label="测距">',
    )
    parts.push(`<circle cx="${a.x}" cy="${a.y}" r="5" class="measure-dot"/>`)
    if (b) {
      parts.push(`<circle cx="${b.x}" cy="${b.y}" r="5" class="measure-dot"/>`)
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

  if (opts.zoneEditMode) {
    parts.push('<g class="edit-layer zone-edit-layer" aria-label="分区编辑">')
    const rmMode = opts.zoneTool === 'zoneRemove'
    for (const z of spatialZones) {
      const pts = polygonPointsAttr(z.polygon)
      const on = opts.selectedSpatialZone === z.id
      const hitCls = [
        'spatial-zone-hit',
        on ? 'spatial-zone-on' : '',
        rmMode ? 'spatial-zone-rm' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const tip = rmMode ? `${z.nameZh} — 点击删除` : `${z.nameZh} — 点击选中`
      parts.push(
        `<polygon points="${pts}" class="${hitCls}" data-spatial-zone-id="${z.id}" data-plan-tip="${esc(tip)}" data-zone-stale="${z.stale ? '1' : '0'}" aria-selected="${on ? 'true' : 'false'}"><title>${esc(tip)}</title></polygon>`,
      )
      if (on && opts.zoneTool === 'zoneSelect') {
        const vr = 6 * touchScale
        z.polygon.forEach((p, i) => {
          parts.push(
            `<circle cx="${p.x}" cy="${p.y}" r="${vr}" class="zone-vertex-hit" data-spatial-zone-id="${z.id}" data-zone-vertex-index="${i}"><title>拖曳调整顶点</title></circle>`,
          )
        })
      }
    }
    if (opts.zoneChainFrom) {
      parts.push(
        `<circle cx="${opts.zoneChainFrom.x}" cy="${opts.zoneChainFrom.y}" r="5" class="zone-chain-vert"/>`,
      )
      if (opts.zoneChainHover) {
        parts.push(
          `<line x1="${opts.zoneChainFrom.x}" y1="${opts.zoneChainFrom.y}" x2="${opts.zoneChainHover.x}" y2="${opts.zoneChainHover.y}" class="zone-chain"/>`,
        )
        if (opts.zoneChainPoints?.length) {
          const preview = [...opts.zoneChainPoints, opts.zoneChainHover]
          parts.push(
            `<polyline points="${polygonPointsAttr(preview)}" class="zone-chain" fill="none"/>`,
          )
        }
      }
    }
    parts.push('</g>')
  }

  if (opts.placementEditMode && project.placements?.length) {
    parts.push(
      '<g class="edit-layer placement-edit-layer" aria-label="家具编辑">',
    )
    for (const p of project.placements) {
      const on = opts.selectedPlacement === p.id
      parts.push(
        `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3" class="placement-hit${on ? ' placement-on' : ''}" data-placement-id="${p.id}" aria-selected="${on ? 'true' : 'false'}"><title>${esc(p.label)} — 点击选中</title></rect>`,
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

/** @param {string[]} parts @param {string} openingId @param {{ x: number, y: number }} pt @param {'start' | 'end'} grip @param {number} [touchScale] @param {'h' | 'v'} [wallAxis] */
function appendGraphOpeningGrip(
  parts,
  openingId,
  pt,
  grip,
  touchScale = 1,
  wallAxis = 'h',
) {
  const scale = Math.max(1, touchScale)
  const hitR = (RESIZE_GRIP_HIT * scale) / 2
  const visR = 5
  parts.push(
    `<circle cx="${pt.x}" cy="${pt.y}" r="${hitR}" class="graph-open-grip-hit" data-graph-opening-id="${openingId}" data-graph-opening-grip="${grip}" data-wall-axis="${wallAxis}" aria-label="拖曳调整开口宽度"><title>拖曳改宽</title></circle>`,
  )
  parts.push(
    `<circle cx="${pt.x}" cy="${pt.y}" r="${visR}" class="graph-open-grip" aria-hidden="true"/>`,
  )
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
