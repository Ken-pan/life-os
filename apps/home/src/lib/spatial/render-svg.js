/** @typedef {import('./types.js').SpatialProject} SpatialProject */
import { formatFtIn } from './dimensions.js'
import { detectRooms } from './rooms-from-graph.js'
import { graphOpeningBounds, graphOpeningHitRect } from './graph-openings.js'
import { polygonPointsAttr, zoneCentroid } from './zones.js'
import { pointInPolygon } from './geometry.js'
import { viewpointConePath, viewpointHandlePoint } from './viewpoints.js'
import { wallStrokePx } from './wall-standards.js'
import { furnitureSymbol } from './furniture-symbols.js'
import { furnitureVars } from './furniture-tint.js'
import { ART_SYMBOLS } from './shiba-art.js'
import {
  canonicalPlacementKind,
  FENCE_BAND_IN,
  fenceBandRects,
  isFence,
  KIND_REVIEW_MAX,
  PLACEMENT_KINDS,
} from './placements.js'
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
import {
  floorFillForFace,
  floorFillForRoom,
  floorFillForZone,
  floorPatternDefs,
  resolveFurnitureColor,
  wetFixturePoints,
} from './floor-materials.js'
import { sunLightPools, sunLightPlanDir } from './sun.js'

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
 *   snapGuides?: (import('./snap.js').SnapGuide | import('./placement-snap.js').PlacementGuide)[],
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
 *   clashPlacement?: string, 正压在别的家具上的那件 —— 标红,但不阻止落位
 *   viewpointEditMode?: boolean,
 *   viewpointTool?: 'viewAdd' | 'viewSelect',
 *   selectedViewpoint?: string,
 *   previewViewpoints?: import('./types.js').SpatialViewpoint[] | null,
 *   showViewpoints?: boolean,
 *   showFurniture?: boolean,
 *   showRoomEnglish?: boolean,
 *   hideStorageZones?: boolean,
 *   textured?: boolean,
 *     真实贴图模式:房间地面按材质铺程序化纹理(木/砖/毯/户外板),
 *     网格纸退场 —— 看「家」不看「图纸」。见 floor-materials.js
 *   sun?: { azimuthDeg: number, altitudeDeg: number, planNorthDeg: number | null,
 *     aboveHorizon: boolean } | null,
 *     日照模拟:从透光开口投光斑 + 图缘太阳指示。位置/时间 → 角度的换算
 *     在调用方(FloorPlanViewer),几何在 sun.js;浏览态专属
 *   sunHeat?: { cells: { x: number, y: number, hours: number }[], cellPx: number,
 *     maxHours: number } | null,
 *     全天直射热力图(sun.js 的 sunDayHeatmap 算好传入),与 sun 光斑二选一;
 *     颜色透明度按 hours/maxHours 走,谁晒得久谁深
 *   focus?: { x: number, y: number, rect?: { x: number, y: number, w: number, h: number }, spanFt?: number } | null,
 *     整理任务定位:viewBox 收到焦点周围一圈并画脉冲标记 —— 裁的是取景框,
 *     内容仍完整渲染,周围的墙和家具上下文都在
 *   moveOverlay?: Array<{ from: { x: number, y: number, w: number, h: number }, to: { x: number, y: number, w: number, h: number } }>,
 *     布局方案预览:每条 = 一件家具的搬动。旧脚印画虚线幽灵框,箭头从旧中心
 *     指到新中心 —— project 传方案后的摆法,幽灵框自然指回「原来在哪」
 * }} [opts]
 */
export function renderFloorPlanSvg(project, opts = {}) {
  const { width, height } = project.viewport
  const step = project.gridStep ?? 52
  const compact = opts.compact ?? false
  const showRoomEnglish = opts.showRoomEnglish ?? false
  const pxPerFt =
    project.layoutConfig?.pxPerFt ?? project.wallGraph?.pxPerFt ?? 36
  const extStroke = wallStrokePx('exterior', pxPerFt)
  const intStroke = wallStrokePx('interior', pxPerFt)
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
  const hideStorageZones = opts.hideStorageZones ?? false
  // 浏览态是「看家」,编辑态才是「画图」:网格只在编辑时全密度出现,
  // 浏览时退成大格淡线 —— 先看到家,再看到工程纸。
  const editingAny = Boolean(
    opts.editMode ||
      opts.graphEditMode ||
      opts.zoneEditMode ||
      opts.placementEditMode ||
      opts.viewpointEditMode,
  )
  // 真实贴图只属于浏览态:编辑是「画图」,线稿 + 网格才是对的工作面。
  const textured = Boolean(opts.textured) && !editingAny
  // 板材方向整图定一次(沿户型长轴通铺),门洞两侧不换向。
  const floorHorizontal = width >= height
  // 储藏编号(S1…)是内部主键,默认不上图:标储藏工具需要对码时才全量显示,
  // 其余场合只有选中的那个区亮出编号。
  const showStorageCodes =
    opts.placementEditMode && opts.placementTool === 'storage'
  // 小件家具的名字在整屋视图里只是噪声 —— 标成 label-minor,由外层按缩放层级
  // 显隐(FloorPlanViewer 在 zoom 过阈值时给容器挂 data-zoom-tier)。
  const minorAreaPx = 6.25 * pxPerFt * pxPerFt // 约 2.5ft × 2.5ft
  // 视角只在编辑「视角」步骤或显式开启时画 —— 平时浏览不该被一堆扇形糊住。
  const showViewpoints = opts.showViewpoints ?? opts.viewpointEditMode ?? false

  // 任务定位:取景框收到焦点周围一圈。给了 rect(整个储藏柜)就框住它再留边,
  // 只有点(门/瓶颈)就按 spanFt 开窗;都夹紧在户型内,焦点贴边时不会裁出空白。
  let box = { x: 0, y: 0, w: width, h: height }
  if (opts.focus) {
    const fr = opts.focus.rect
    const cx = fr ? fr.x + fr.w / 2 : opts.focus.x
    const cy = fr ? fr.y + fr.h / 2 : opts.focus.y
    const spanPx = (opts.focus.spanFt ?? 14) * pxPerFt
    const w2 = Math.min(width, Math.max(spanPx, (fr?.w ?? 0) + pxPerFt * 5))
    const h2 = Math.min(height, Math.max(spanPx * 0.72, (fr?.h ?? 0) + pxPerFt * 5))
    box = {
      x: Math.max(0, Math.min(width - w2, cx - w2 / 2)),
      y: Math.max(0, Math.min(height - h2, cy - h2 / 2)),
      w: w2,
      h: h2,
    }
  }

  const parts = []
  parts.push(
    `<svg class="floor-plan-svg${editModeOn}${interactiveOn}${textured ? ' plan-textured' : ''}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" preserveAspectRatio="xMidYMid meet" role="${svgRole}" aria-label="${esc(svgLabel)}" xmlns="http://www.w3.org/2000/svg">`,
  )
  parts.push(`<defs>
  <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <rect width="7" height="7" fill="var(--plan-hatch-bg,#edf1f5)"/>
    <line x1="0" y1="0" x2="0" y2="7" stroke="var(--plan-hatch-line,#9aadc0)" stroke-width="2.4"/>
  </pattern>
${textured ? floorPatternDefs(pxPerFt) : ''}
</defs>`)
  parts.push(`<style>
 .grid line{stroke:var(--plan-grid,#dbe1e6);stroke-width:1}
 .grid-soft line{opacity:.5}
 .label-minor{transition:opacity .18s ease}
 .wall{stroke:var(--plan-wall,#20242b);stroke-linecap:square}
 .wall-exterior{stroke-width:${extStroke}}
 .wall-interior{stroke-width:${intStroke}}
 .gap{stroke:var(--plan-paper,#eef1f4);stroke-width:${intStroke + 2}}
 .thresh{stroke:var(--plan-threshold,#b9c1c9);stroke-width:1.4;stroke-dasharray:2 3}
 .door{fill:rgba(138,146,156,.12);stroke:var(--plan-door,#8a929c);stroke-width:1.2}
 .door-cad,.door-bifold,.door-pocket{fill:none;stroke:var(--plan-door,#8a929c);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
 .door-pocket{stroke-dasharray:5 3}
 .dim-tag{font:${compact ? 8 : 9}px var(--mono,monospace);fill:var(--plan-dim,#6a727c);pointer-events:none}
 .win{fill:none;stroke:var(--plan-window,#5b6470);stroke-width:1.6}
 .win-cad{fill:none;stroke:var(--plan-window,#5b6470);stroke-width:1.3;stroke-linecap:square;stroke-linejoin:miter}
 .room-zh{font:650 ${compact ? 11 : 14}px var(--font,system-ui,sans-serif);fill:var(--plan-text,#3a4048);pointer-events:none}
 .room-en{font:${compact ? 9 : 11}px var(--mono,monospace);fill:var(--plan-muted,#8a929c);letter-spacing:.14em;pointer-events:none}
 .room-circ{stroke:var(--plan-circ,#c5cdd6);stroke-width:1;stroke-dasharray:4 3;fill:var(--plan-circ-fill,rgba(238,236,230,.45))}
 .room-structural{stroke:#b45309;stroke-width:1.6;stroke-dasharray:5 3;fill:url(#hatch);pointer-events:none}
 .structural-label{font:600 8px var(--mono,monospace);fill:#b45309;pointer-events:none}
 .edit-mode-on .room-fill,.edit-mode-on .room-circ{opacity:.72}
 .circ-label{font:600 9px var(--mono,monospace);fill:var(--plan-muted,#8a929c);letter-spacing:.08em;pointer-events:none}
 .furn{font:${compact ? 8 : 10}px var(--sans,system-ui,sans-serif);fill:var(--plan-text-soft,#4a515a);pointer-events:none}
 .furn-item{cursor:help;fill:var(--plan-furn,#c5ced8);stroke:var(--plan-furn-stroke,#8a929c)}
 .storage-zone{pointer-events:none}
 .task-focus .focus-ring{fill:none;stroke:var(--plan-danger,#d3572b);stroke-width:3}
 .task-focus .focus-dot{fill:var(--plan-danger,#d3572b);stroke:var(--plan-paper,#fff);stroke-width:2}
 .task-focus .focus-rect{fill:none;stroke:var(--plan-danger,#d3572b);stroke-width:2.5;stroke-dasharray:7 4}
 .tiny{font:10px var(--mono,monospace);fill:var(--plan-dim,#6a727c)}
 .mk{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:1.5}
 .mk-t{pointer-events:none;font:700 ${compact ? 9 : 11}px var(--mono,monospace);fill:#f5f8fa}
 .mk-halo{fill:none;stroke:var(--plan-accent,#5c758c);stroke-width:2;stroke-opacity:.4;pointer-events:none}
 .mk-hit{fill:transparent;stroke:none;pointer-events:all}
 .plan-interactive .mk-hit{cursor:pointer}
 .plan-interactive .mk-hit:hover ~ .mk,.plan-interactive .mk-hit:focus-visible ~ .mk{stroke:var(--plan-accent,#5c758c);stroke-width:3}
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
 .snap-guide{stroke:var(--snap-guide,#b45309);stroke-width:1;stroke-dasharray:3 3;opacity:.85;pointer-events:none}
 .snap-guide-midpoint{stroke-dasharray:1 4}
 .chain-badge{pointer-events:none}
 .chain-badge-bg{fill:var(--graph-accent,#1d6b42);opacity:.92}
 .chain-badge-text{fill:#fff;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
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
 /* NOTE: never write a raw angle bracket anywhere in this stylesheet, comments
    included. This style element lives inside the SVG, which the HTML parser
    treats as foreign content — style is NOT a raw-text element there, so the
    first thing that looks like a tag is parsed as an element and every rule
    after it silently vanishes. A stray tag name in a comment here cost the
    selected and clash states once already. */
 /* --furn-fill / --furn-stroke are set per placement from its scanned colour
    (furniture-tint.js). Custom properties rather than an inline fill on purpose:
    an inline fill would outrank .placement-clash / .placement-on below and eat
    the warning and selected states. This way those classes still win normally. */
 .fixture-item{fill:var(--furn-fill,var(--plan-furn,#c5ced8));stroke:var(--furn-stroke,var(--plan-furn-stroke,#8a929c));stroke-width:1.1;cursor:help}
 .placement-item{fill:var(--furn-fill,var(--plan-furn,#c5ced8));stroke:var(--furn-stroke,var(--plan-furn-stroke,#8a929c));stroke-width:1.2}
 /* Silhouettes carry no fill/stroke of their own — they inherit from the
    .placement-item / .fixture-item group, which is what lets one group colour
    every shape of a multi-part symbol at once. */
 .furn-body{stroke-linejoin:round}
 /* Above the cut plane, or walk-over: never read as a floor obstruction. */
 .furn-body-overhead{fill-opacity:.3}
 /* Seen-but-not-cut, and you can see the floor through it: a pet pen's
    enclosure, a rug, a closet rod. The plan cut plane is ~5ft, so a 32in pen is
    below it — drawn as a light SOLID outline, never poché-filled (that is
    reserved for what the plane actually cuts) and never dashed (that would say
    it is overhead, i.e. step right over it). The floor inside is still floor. */
 .furn-body-hollow{fill:none}
 /* Detail takes the piece's own stroke, not the group's: it must stay legible
    on a tinted body (a mid-grey line on a dark sofa is an invisible line), and
    it must not turn green-dashed with the outline when the piece is selected. */
 .furn-line{fill:none;stroke:var(--furn-stroke,var(--plan-furn-stroke,#8a929c));stroke-width:1;stroke-linejoin:round;opacity:.85;pointer-events:none}
 .placement-on{stroke:var(--graph-accent,#1d6b42);stroke-width:2.5;stroke-dasharray:6 4;animation:plan-sel-pulse 1.15s ease-in-out infinite}
 .placement-clash{fill:var(--plan-danger-fill,#e9c4bc);stroke:var(--plan-danger,#a3341f);stroke-width:2}
 .placement-label{font:${compact ? 8 : 10}px var(--sans,system-ui,sans-serif);fill:var(--plan-text-soft,#4a515a);pointer-events:none}
 .placement-lock-badge{font:${compact ? 8 : 10}px var(--sans,system-ui,sans-serif);pointer-events:none;opacity:.85}
 .placement-review-badge{font:700 ${compact ? 9 : 11}px var(--sans,system-ui,sans-serif);fill:var(--plan-warn,#c8811f);pointer-events:none}
 .move-ghost{fill:rgba(232,89,12,.08);stroke:#e8590c;stroke-width:2;stroke-dasharray:6 4;pointer-events:none}
 .move-to{fill:none;stroke:#e8590c;stroke-width:2.5;pointer-events:none}
 .move-arrow{stroke:#e8590c;stroke-width:3;stroke-linecap:round;pointer-events:none}
 .move-arrow-halo{stroke:rgba(255,255,255,.85);stroke-width:5.5;stroke-linecap:round;pointer-events:none}
 .move-arrow-head{fill:#e8590c;stroke:rgba(255,255,255,.85);stroke-width:1;pointer-events:none}
 .placement-hit{fill:transparent;stroke:none;cursor:grab;pointer-events:all}
 .placement-hit:active{cursor:grabbing}
 .vp-cone{fill:var(--plan-accent,#5c758c);fill-opacity:.14;stroke:var(--plan-accent,#5c758c);stroke-opacity:.5;stroke-width:1.2;pointer-events:none}
 .vp-cone-on{fill:var(--graph-accent,#1d6b42);fill-opacity:.2;stroke:var(--graph-accent,#1d6b42);stroke-opacity:.85}
 .vp-dot{fill:var(--plan-accent,#5c758c);stroke:#fff;stroke-width:1.6}
 .vp-dot-on{fill:var(--graph-accent,#1d6b42)}
 .vp-dot-empty{fill:var(--plan-paper,#eef1f4);stroke:var(--plan-accent,#5c758c);stroke-width:2;stroke-dasharray:3 2}
 .vp-label{font:600 ${compact ? 8 : 9}px var(--mono,monospace);fill:var(--plan-text-soft,#4a515a);pointer-events:none}
 .vp-state-dot{stroke:#fff;stroke-width:1.2;pointer-events:none}
 .vp-state-t{font:700 ${compact ? 7 : 8}px var(--sans,system-ui,sans-serif);fill:#fff;pointer-events:none}
 .vp-hit{fill:transparent;stroke:none;cursor:grab;pointer-events:all}
 .vp-handle{fill:var(--graph-accent,#1d6b42);stroke:#fff;stroke-width:1.6;cursor:crosshair;pointer-events:all}
 .vp-handle-stem{stroke:var(--graph-accent,#1d6b42);stroke-width:1.2;stroke-dasharray:3 2;pointer-events:none}
 .plan-interactive .vp-dot{cursor:pointer}
 .storage-unassigned{stroke-dasharray:4 3;opacity:.85}
 /* 贴图模式:文字压在纹理上,给一圈纸色描边当光环,否则木纹里的小字会糊。
    paint-order 先描边后填色,描边只朝外扩。 */
 .plan-textured .room-zh,.plan-textured .spatial-zone-label{stroke:var(--plan-label-halo,rgba(255,255,255,.72));stroke-width:3.5px;paint-order:stroke fill}
 .plan-textured .room-en,.plan-textured .circ-label,.plan-textured .dim-tag,.plan-textured .furn,.plan-textured .placement-label,.plan-textured .tiny{stroke:var(--plan-label-halo,rgba(255,255,255,.72));stroke-width:2.5px;paint-order:stroke fill}
 /* 走廊在贴图模式下就是一段木地板,虚线框会把它读成「区域标注」。 */
 .plan-textured .room-circ{stroke:none}
 /* 日照:光斑是半透明暖色罩,盖在地板与家具上、被墙截断(画在墙之前)。
    低角度斜照(高度角小于 15°)换更暖的夕照色。 */
 .sun-pool{fill:var(--plan-sun,#ffd27a);fill-opacity:.28;pointer-events:none}
 .sun-pool-low{fill:var(--plan-sun-low,#ffab52)}
 .sun-glyph{fill:var(--plan-sun-glyph,#f2a93b);pointer-events:none}
 .sun-glyph-ray{stroke:var(--plan-sun-glyph,#f2a93b);stroke-width:1.6;stroke-linecap:round;pointer-events:none}
 .sun-glyph-arrow{stroke:var(--plan-sun-glyph,#f2a93b);stroke-width:1.4;fill:none;stroke-dasharray:5 4;opacity:.75;pointer-events:none}
 .sun-heat-cell{fill:var(--plan-sun-heat,#ff8a2e);pointer-events:none}
 @keyframes plan-sel-pulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.45}}
</style>`)

  // 浏览态:隔行采样 + 低透明度,网格退成背景纸纹;编辑态:全密度可吸附网格。
  // 贴图模式下网格整个退场 —— 地板纹理本身就是「地」,工程纸格会穿帮。
  if (!textured) {
    const gridStep = editingAny ? step : step * 2
    parts.push(`<g class="grid${editingAny ? '' : ' grid-soft'}">`)
    for (let x = gridStep; x < width; x += gridStep) {
      parts.push(
        `<line x1="${x}" y1="${step}" x2="${x}" y2="${height - step}"/>`,
      )
    }
    for (let y = gridStep; y < height; y += gridStep) {
      parts.push(
        `<line x1="${step}" y1="${y}" x2="${width - step}" y2="${y}"/>`,
      )
    }
    parts.push('</g>')
  }

  // 贴图模式的墙图户型:围合面即地板。手绘分区往往只盖住一部分地面,
  // 先把墙图追出的每个封闭多边形铺上默认木地板打底,命名分区随后画在
  // 上面覆写各自的材质 —— 这样整个家的地面都是「地」,不会露出纸白。
  // bridgeGapIn 放宽到 60″:分区检测不敢跨门洞(会把两间房焊成一间),
  // 铺地板恰恰要跨 —— 门洞两侧的地面本来就是连续的,宽到滑门/通道也要过。
  if (textured && project.wallGraph) {
    const faces = detectRooms(project.wallGraph, {
      minSqFt: 4,
      bridgeGapIn: 60,
    })
    if (faces.length) {
      const wetPts = wetFixturePoints(project.fixtures)
      // 带显式 floor 的分区赢过湿区推断:面基层先看自己落在哪个分区里,
      // 那个分区设了 floor 就照它铺(卫生间设成 wood 就不会被洁具推断硬铺砖)。
      const floorZones = spatialZones.filter((z) => z.floor && z.polygon)
      parts.push('<g class="floor-base" aria-hidden="true">')
      for (const f of faces) {
        let explicitMat
        if (floorZones.length) {
          const c = zoneCentroid(f.polygon)
          explicitMat = floorZones.find((z) => pointInPolygon(c, z.polygon))?.floor
        }
        parts.push(
          `<polygon points="${polygonPointsAttr(f.polygon)}" fill="${floorFillForFace(f, wetPts, floorHorizontal, explicitMat)}"/>`,
        )
      }
      parts.push('</g>')
    }
  }

  for (const room of project.rooms) {
    if (hasSpatialZones) continue
    const { x, y, w, h } = room.bounds
    const isCirc = room.kind === 'circulation'
    const isStructural = room.kind === 'structural'
    const fill = room.fill ?? 'var(--plan-room,#e8edf1)'
    if (isStructural) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="room-structural" data-plan-tip="${esc('结构柱 · 实心不可进')}"/>`,
      )
      parts.push(
        `<text x="${x + w / 2}" y="${y + h / 2 + 3}" text-anchor="middle" class="structural-label${dimmed}">实心不可进</text>`,
      )
      continue
    }
    if (isCirc) {
      const circTip = `动线 · ${room.nameZh}`
      // 贴图模式:走廊铺和干区一样的木地板(class 里保留 room-circ 语义,
      // 虚线框由 .plan-textured 样式关掉)。内联 style 而非 fill 属性:
      // .room-circ 的 CSS fill 规则会压过 presentation attribute。
      const circFill = textured
        ? ` style="fill:${floorFillForRoom(room, floorHorizontal)}"`
        : ''
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="room-circ room-fill" data-plan-tip="${esc(circTip)}"${circFill}/>`,
      )
      if (!compact) {
        parts.push(
          `<text x="${x + 6}" y="${y + 14}" class="circ-label">${esc(room.nameZh)}</text>`,
        )
      }
      continue
    }
    const roomTip = textured
      ? `房间 · ${room.nameZh}`
      : `房间 · ${room.nameZh}（浅色仅区分房间）`
    const roomFill = textured ? floorFillForRoom(room, floorHorizontal) : fill
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="room-fill" fill="${roomFill}" stroke="var(--plan-room-stroke,#cdd4da)" stroke-width="1" data-plan-tip="${esc(roomTip)}"/>`,
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
          `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" class="furn${w * h < minorAreaPx ? ' label-minor' : ''}">${esc(item.label)}</text>`,
        )
      }
    }
  }

  if (!hideStorageZones) {
    for (const zone of project.storageZones) {
      if (!zone.bounds) continue
      const { x, y, w, h } = zone.bounds
      const on = opts.highlightZone === zone.code
      const unassigned = !zone.zoneId && !zone.placementId
      const dash = unassigned ? ' storage-unassigned' : ''
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="storage-zone${dash}" fill="url(#hatch)" stroke="var(--plan-accent,#5c758c)" stroke-width="1.8" rx="3" stroke-dasharray="5 3"/>`,
      )
      // 编号默认不上图(内部主键):标储藏对码、或该区被选中时才有意义
      if (!compact && w > 40 && h > 22 && (showStorageCodes || on)) {
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
          : 'win-cad'
      parts.push(`<path d="${op.pathD}" class="${cls}"/>`)
    }
    if (op.rect) {
      const { x, y, w, h } = op.rect
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--plan-ac,#c9d0d8)" stroke="var(--plan-door,#8a929c)" stroke-width="1"/>`,
      )
      if (op.label && !compact)
        parts.push(
          `<text x="${x + w / 2}" y="${y + h + 22}" text-anchor="middle" class="tiny label-minor">${esc(op.label)}</text>`,
        )
    }
    if (op.type === 'window' && op.from && op.to && !op.pathD) {
      // Legacy windows carry endpoints only. Offset the sill line across the
      // wall, which means along y for a horizontal wall and along x for a
      // vertical one.
      const horizontal =
        Math.abs(op.to.x - op.from.x) >= Math.abs(op.to.y - op.from.y)
      const ox = horizontal ? 0 : 4
      const oy = horizontal ? 4 : 0
      parts.push(
        `<line x1="${op.from.x}" y1="${op.from.y}" x2="${op.to.x}" y2="${op.to.y}" class="win"/>`,
      )
      parts.push(
        `<line x1="${op.from.x + ox}" y1="${op.from.y + oy}" x2="${op.to.x + ox}" y2="${op.to.y + oy}" class="win"/>`,
      )
    }
  }

  // outerBounds is NOT stroked. Both builders already emit the perimeter as
  // real wall segments, split around their openings — re-stroking the bounds as
  // a closed rect drew the perimeter a second time, unbroken, painting over
  // every window and door cut into an exterior wall. It stays on the model
  // because wall-edit uses it for bounds math.

  if (hasSpatialZones) {
    parts.push('<g class="spatial-zones" aria-label="手绘分区">')
    for (const z of spatialZones) {
      const pts = polygonPointsAttr(z.polygon)
      const fill = z.color ?? 'var(--plan-room,#e8edf1)'
      const staleCls = z.stale ? ' spatial-zone-stale' : ''
      const c = zoneCentroid(z.polygon)
      if (textured) {
        // 地板贴图打底,分区自己的颜色降成一层极淡的罩色 —— 语义色还在,
        // 但地面材质才是主视觉。
        parts.push(
          `<polygon points="${pts}" class="spatial-zone${staleCls}" fill="${floorFillForZone(z, floorHorizontal)}" data-zone-stale="${z.stale ? '1' : '0'}"/>`,
        )
        if (z.color) {
          parts.push(
            `<polygon points="${pts}" fill="${z.color}" fill-opacity="0.08" pointer-events="none"/>`,
          )
        }
      } else {
        parts.push(
          `<polygon points="${pts}" class="spatial-zone${staleCls}" fill="${fill}" fill-opacity="0.18" data-zone-stale="${z.stale ? '1' : '0'}"/>`,
        )
      }
      parts.push(
        `<text x="${c.x}" y="${c.y}" text-anchor="middle" class="spatial-zone-label${dimmed}">${esc(z.nameZh)}${z.stale ? ' · 需核对' : ''}</text>`,
      )
    }
    parts.push('</g>')
  }

  // Built-in fixtures — appliances, plumbing, fixed shelving. Always drawn:
  // they are part of the unit, not the user's furniture, so they neither hide
  // with the furniture toggle nor yield to placements.
  if (project.fixtures?.length) {
    parts.push('<g class="fixtures" aria-label="固定设施">')
    for (const f of project.fixtures) {
      const rot = f.rotation ?? 0
      const cx = f.bounds.x + f.bounds.w / 2
      const cy = f.bounds.y + f.bounds.h / 2
      // Same convention as placements: bounds is the *rotated* AABB, so the
      // symbol is built unrotated and turned back onto it.
      const turned = rot === 90 || rot === 270
      const box = {
        x: cx - (turned ? f.bounds.h : f.bounds.w) / 2,
        y: cy - (turned ? f.bounds.w : f.bounds.h) / 2,
        w: turned ? f.bounds.h : f.bounds.w,
        h: turned ? f.bounds.w : f.bounds.h,
      }
      const { body, detail } = furnitureSymbol(f.kind, box)
      // 贴图模式:按扫描可信度分级(见 resolveFurnitureColor)。淡中性扫描信它,
      // 高饱和/发黑回落类型材质色,无类型色再回落扫描。fixtures 用 kind 当 symbol
      // 名(它们没有 symbol 层),多数无 colorHex → 走类型色,与改动前一致。
      const fixtureHex = textured
        ? resolveFurnitureColor(
            f.kind,
            f.kind,
            f.attrs?.colorHex,
            f.attrs?.colorConfidence,
          )
        : undefined
      const vars = fixtureHex
        ? furnitureVars(fixtureHex, true)
        : furnitureVars(f.attrs?.colorHex)
      parts.push(
        `<g transform="rotate(${rot} ${cx} ${cy})">`,
        `<g class="fixture-item"${vars ? ` style="${vars}"` : ''}>`,
        // No silhouette of its own — a plain rect is the honest fallback.
        body ||
          `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="2" class="furn-body"/>`,
        detail,
        `<title>${esc(f.label)}</title>`,
        `</g>`,
        `</g>`,
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
      // x/y/w/h is the *rotated* footprint (rotatePlacement swaps w/h), so the
      // symbol has to be built in the unrotated frame and turned back onto it —
      // otherwise rotate() would undo the swap and land back at 0°.
      const turned = rot === 90 || rot === 270
      const box = {
        x: cx - (turned ? p.h : p.w) / 2,
        y: cy - (turned ? p.w : p.h) / 2,
        w: turned ? p.h : p.w,
        h: turned ? p.w : p.h,
      }
      // 过别名再查:云端优化会自造 kind(pet_fence),直接查表会把
      // 狗狗围栏画成「未知家具」的实心方块
      const kind = canonicalPlacementKind(p.kind)
      const symbol = PLACEMENT_KINDS[kind]?.symbol
      const { body, detail } = furnitureSymbol(symbol, box)
      // 贴图模式:按扫描可信度分级(见 resolveFurnitureColor)。淡中性扫描(白层架
      // #FFFFFF、近白小架 #CFC4B7、浅木边桌)信它;高饱和/发黑(红鸟笼、espresso
      // 折叠桌)回落类型材质色;鸟笼/折叠桌/工作桌/电视等「扫描必错」kind 硬锁类型色。
      // 无类型色的手绘件回落扫描色或图纸灰。
      const furnHex = textured
        ? resolveFurnitureColor(
            kind,
            symbol,
            p.attrs?.colorHex,
            p.attrs?.colorConfidence,
          )
        : undefined
      const vars = furnHex
        ? furnitureVars(furnHex, true)
        : furnitureVars(p.attrs?.colorHex)
      // Hand-drawn pieces take their label *under* the footprint. Everything else
      // is a flat glyph a name can sit on top of; stamping "Onyx" across a drawn
      // face is just defacing it.
      const art = ART_SYMBOLS.has(symbol)
      const labelY = art ? p.y + p.h + 11 : cy + 4
      parts.push(
        `<g transform="rotate(${rot} ${cx} ${cy})">`,
        `<g class="placement-item${opts.clashPlacement === p.id ? ' placement-clash' : ''}${on ? ' placement-on' : ''}"${vars ? ` style="${vars}"` : ''}>`,
        body ||
          `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="3" class="furn-body"/>`,
        detail,
        `</g>`,
        `</g>`,
        // Label sits outside the rotation so it stays upright at 90°/270°.
        `<text x="${cx}" y="${labelY}" text-anchor="middle" class="placement-label${p.w * p.h < minorAreaPx ? ' label-minor' : ''}">${esc(p.label)}</text>`,
      )
      // 用户锁定件(布局方案不许挪):右上角一枚锁,画在旋转组外保持直立
      if (p.locked) {
        parts.push(
          `<text x="${p.x + p.w - 3}" y="${p.y + 10}" text-anchor="end" class="placement-lock-badge">🔒</text>`,
        )
      }
      // 低置信度类型(扫描按几何猜的,如 table 分不清餐桌/书桌)且用户还没确认过 →
      // 左上角一枚「?」待复核。用户改过 kind(userEdited∋'kind')就消失。
      const kindConf = p.attrs?.kindConfidence
      if (
        typeof kindConf === 'number' &&
        kindConf < KIND_REVIEW_MAX &&
        !p.attrs?.userEdited?.includes('kind')
      ) {
        parts.push(
          `<text x="${p.x + 3}" y="${p.y + 11}" class="placement-review-badge" data-plan-tip="${esc('扫描对类型没把握,点开确认或改类型')}">?</text>`,
        )
      }
    }
    parts.push('</g>')
  }

  const viewpoints = opts.previewViewpoints ?? project.viewpoints ?? []
  if (showViewpoints && viewpoints.length) {
    parts.push('<g class="viewpoints" aria-label="照片视角">')
    for (const vp of viewpoints) {
      const on = opts.selectedViewpoint === vp.id
      const dotR = Math.max(3.5, 4.5 * touchScale)
      parts.push(
        `<path d="${viewpointConePath(vp, pxPerFt)}" class="vp-cone${on ? ' vp-cone-on' : ''}"/>`,
        `<circle cx="${vp.x}" cy="${vp.y}" r="${dotR}" class="vp-dot${on ? ' vp-dot-on' : ''}${vp.photoRef ? '' : ' vp-dot-empty'}"/>`,
      )
      // 状态点贴在机位右上：一眼扫过全图就知道哪块该收拾了，不用逐个点开。
      if (vp.state) {
        const sx = vp.x + dotR + 3
        const sy = vp.y - dotR - 3
        parts.push(
          `<circle cx="${sx}" cy="${sy}" r="${dotR * 1.25}" class="vp-state-dot" fill="${stateColor(vp.state)}"/>`,
          `<text x="${sx}" y="${sy + 3}" text-anchor="middle" class="vp-state-t">${esc(vp.state.slice(0, 1))}</text>`,
        )
      }
      if (!compact && vp.label) {
        parts.push(
          `<text x="${vp.x}" y="${vp.y - dotR - 4}" text-anchor="middle" class="vp-label">${esc(vp.label)}</text>`,
        )
      }
    }
    parts.push('</g>')
  }

  // 全天热力图:格子透明度 = 直射时长占当日最大值的比例。同光斑一样画在
  // 墙之前,墙线盖住贴墙格子的毛边。
  if (opts.sunHeat?.cells.length && !editingAny) {
    const { cells, cellPx, maxHours } = opts.sunHeat
    parts.push('<g class="sun-heat" aria-label="全天直射热力">')
    for (const cell of cells) {
      const a = 0.08 + 0.5 * (cell.hours / Math.max(maxHours, 0.1))
      parts.push(
        `<rect x="${Math.round(cell.x * 10) / 10}" y="${Math.round(cell.y * 10) / 10}" width="${Math.round(cellPx * 10) / 10}" height="${Math.round(cellPx * 10) / 10}" class="sun-heat-cell" fill-opacity="${Math.round(a * 100) / 100}"/>`,
      )
    }
    parts.push('</g>')
  }

  // 日照:光斑压在地板/家具上,但画在墙之前 —— 墙是被切开的结构,按制图
  // 惯例保持纯黑,不被光染色;顺带让墙线盖掉光斑贴墙的毛边。
  if (opts.sun && !editingAny && opts.sun.aboveHorizon) {
    const pools = sunLightPools(project, opts.sun)
    if (pools.length) {
      parts.push('<g class="sun-light" aria-label="日照光斑">')
      for (const pool of pools) {
        parts.push(
          `<polygon points="${pool.points.map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(' ')}" class="sun-pool${pool.low ? ' sun-pool-low' : ''}"/>`,
        )
      }
      parts.push('</g>')
    }
    // 图缘太阳指示:太阳在图外哪个方向,一眼即知;虚线箭头 = 光的走向
    const L = sunLightPlanDir(opts.sun.azimuthDeg, opts.sun.planNorthDeg)
    const cx0 = box.x + box.w / 2
    const cy0 = box.y + box.h / 2
    const rx = box.w / 2 - 34
    const ry = box.h / 2 - 34
    const t = Math.min(
      Math.abs(L.x) > 1e-6 ? rx / Math.abs(L.x) : Infinity,
      Math.abs(L.y) > 1e-6 ? ry / Math.abs(L.y) : Infinity,
    )
    const sx = cx0 - L.x * t
    const sy = cy0 - L.y * t
    parts.push('<g class="sun-badge" aria-label="太阳方位">')
    parts.push(`<circle cx="${sx}" cy="${sy}" r="7" class="sun-glyph"/>`)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      parts.push(
        `<line x1="${sx + Math.cos(a) * 10}" y1="${sy + Math.sin(a) * 10}" x2="${sx + Math.cos(a) * 14}" y2="${sy + Math.sin(a) * 14}" class="sun-glyph-ray"/>`,
      )
    }
    parts.push(
      `<line x1="${sx + L.x * 20}" y1="${sy + L.y * 20}" x2="${sx + L.x * 52}" y2="${sy + L.y * 52}" class="sun-glyph-arrow"/>`,
    )
    parts.push('</g>')
  }

  for (const wall of project.walls) {
    const cls =
      wall.kind === 'gap'
        ? 'gap'
        : wall.kind === 'threshold'
          ? 'thresh'
          : `wall ${wall.role === 'exterior' ? 'wall-exterior' : 'wall-interior'}`
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
        // 提示必须跟当前工具说同一句话:建墙时点击是落点、门窗时点击是放置,
        // 都不是「选中」—— 说错话的提示比没有提示更误导。
        const tip = cascade
          ? `墙段 — 点击删除 · 含 ${openingsByEdge.get(edge.id)} 个门窗`
          : rmMode
            ? '墙段 — 点击删除'
            : opts.graphTool === 'wallAdd'
              ? ''
              : opts.graphTool === 'opening'
                ? '墙段 — 点击放置门窗'
                : '墙段 — 点击选中'
        const tipAttrs = tip
          ? ` data-plan-tip="${esc(tip)}"`
          : ''
        parts.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${edgeCls}" data-edge-id="${edge.id}"${tipAttrs} aria-selected="${on ? 'true' : 'false'}">${tip ? `<title>${esc(tip)}</title>` : ''}</line>`,
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
        const a = opts.wallChainFrom
        const b = opts.wallChainHover
        parts.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="graph-chain"/>`,
        )
        // 长度 / 角度徽标——贴在链线中点侧上方
        const pxPerFt = project.wallGraph?.pxPerFt ?? 36
        const lenPx = Math.hypot(b.x - a.x, b.y - a.y)
        if (lenPx > 2) {
          const totalIn = Math.round((lenPx / pxPerFt) * 12)
          const ft = Math.floor(totalIn / 12)
          const inch = totalIn % 12
          const lenTxt = ft === 0 ? `${inch}"` : inch === 0 ? `${ft}'` : `${ft}'${inch}"`
          let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
          // atan2 已落在 (-180,180]，只有正西向可能回 -180，翻正读作 180° 更自然
          if (deg <= -180) deg += 360
          const degTxt = `${Math.round(deg)}°`
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          // 沿链线法向偏移，避免徽标压在线上
          const nx = lenPx > 0 ? -(b.y - a.y) / lenPx : 0
          const ny = lenPx > 0 ? (b.x - a.x) / lenPx : -1
          const bx = mx + nx * 14
          const by = my + ny * 14
          const label = `${lenTxt} · ${degTxt}`
          const w = label.length * 6.5 + 10
          parts.push(
            `<g class="chain-badge" transform="translate(${bx} ${by})">`,
            `<rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="4" class="chain-badge-bg"/>`,
            `<text x="0" y="4" text-anchor="middle" class="chain-badge-text">${esc(label)}</text>`,
            `</g>`,
          )
        }
      }
    } else if (opts.graphTool === 'wallAdd' && opts.wallChainHover) {
      // 链未起头：给链首那一点也画个吸附落点预览
      parts.push(
        `<circle cx="${opts.wallChainHover.x}" cy="${opts.wallChainHover.y}" r="4" class="graph-chain-vert" opacity=".7"/>`,
      )
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
      const closetTitle = '开口 · 壁橱推拉门 — 拖曳移动 · 右侧握把改门宽'
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

  if (!hideStorageZones) {
    for (const zone of project.storageZones) {
      if (!zone.marker) continue
      const { x, y } = zone.marker
      const on = opts.highlightZone === zone.code
      // 编号是内部主键:默认标记只是一个小圆点(位置本身才是信息),
      // 选中的那个区、或标储藏工具需要对码时,才放大并亮出编号。
      const badge = on || showStorageCodes
      const r = badge ? (compact ? 8 : 11) : compact ? 3.5 : 4.5
      const markerTitle = opts.interactive
        ? `${zone.nameZh}（${zone.code}）— 点击查看储藏清单`
        : `${zone.nameZh}（${zone.code}）`
      const markerA11y = opts.interactive
        ? ` tabindex="0" role="button" aria-label="${esc(markerTitle)}"`
        : ''
      // 点击热区始终按可点的尺寸给,视觉尺寸再小也不该考验指尖。
      // 每个标记一个 g:hover 用的兄弟选择器只能看见自己组里的点。
      parts.push('<g class="mk-g">')
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${compact ? 11 : 14}" class="mk-hit zone-marker" data-zone="${zone.code}" data-plan-tip="${esc(markerTitle)}"${markerA11y}><title>${esc(markerTitle)}</title></circle>`,
      )
      if (on) {
        parts.push(
          `<circle cx="${x}" cy="${y}" r="${r + 4.5}" class="mk-halo"/>`,
        )
      }
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${r}" class="mk" pointer-events="none"/>`,
      )
      if (badge) {
        parts.push(
          `<text x="${x}" y="${y + (compact ? 2.8 : 3.6)}" text-anchor="middle" class="mk-t">${esc(zone.code)}</text>`,
        )
      }
      parts.push('</g>')
    }
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
      const tip = rmMode
        ? `${z.nameZh} — 点击删除`
        : opts.zoneTool === 'zoneAdd'
          ? `${z.nameZh} — 画区中 · 点击落顶点`
          : `${z.nameZh} — 点击选中`
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
    const placementHint =
      opts.placementTool === 'place'
        ? '放置中 · 点击画布落新家具'
        : opts.placementTool === 'storage'
          ? '点击指派储藏区'
          : '点击选中'
    for (const p of project.placements) {
      const on = opts.selectedPlacement === p.id
      // 围栏的命中区只有边框:整块矩形会把住在里面的狗盖住 —— 围栏后放的
      // 狗永远点不中。选围栏就点栏板,和现实里伸手扶的是同一处。
      const hitRects = isFence(p.kind)
        ? fenceBandRects(p, (FENCE_BAND_IN / 12) * pxPerFt)
        : [p]
      for (const hr of hitRects) {
        parts.push(
          `<rect x="${hr.x}" y="${hr.y}" width="${hr.w}" height="${hr.h}" rx="3" class="placement-hit${on ? ' placement-on' : ''}" data-placement-id="${p.id}" aria-selected="${on ? 'true' : 'false'}"><title>${esc(p.label)} — ${placementHint}</title></rect>`,
        )
      }
    }
    parts.push('</g>')
  }

  if (opts.viewpointEditMode && viewpoints.length) {
    parts.push('<g class="edit-layer viewpoint-edit-layer" aria-label="视角编辑">')
    const hitR = Math.max(11, 13 * touchScale)
    for (const vp of viewpoints) {
      const on = opts.selectedViewpoint === vp.id
      parts.push(
        `<circle cx="${vp.x}" cy="${vp.y}" r="${hitR}" class="vp-hit" data-viewpoint-id="${vp.id}" aria-selected="${on ? 'true' : 'false'}"><title>${esc(vp.label ?? '视角')} — 拖动改位置</title></circle>`,
      )
      // 转角手柄只给选中的那个 —— 全画出来会互相挡住命中区。
      if (on) {
        const h = viewpointHandlePoint(vp, pxPerFt)
        parts.push(
          `<line x1="${vp.x}" y1="${vp.y}" x2="${h.x}" y2="${h.y}" class="vp-handle-stem"/>`,
          `<circle cx="${h.x}" cy="${h.y}" r="${Math.max(6, 7 * touchScale)}" class="vp-handle" data-viewpoint-rotate="${vp.id}"><title>拖动改朝向</title></circle>`,
        )
      }
    }
    parts.push('</g>')
  }

  // Alignment guides sit above every edit layer so they stay readable over the
  // thing being aligned. Both wall drawing and furniture placement feed these.
  if (opts.snapGuides?.length) {
    parts.push('<g class="snap-guides" aria-hidden="true">')
    for (const g of opts.snapGuides) {
      parts.push(
        `<line x1="${g.from.x}" y1="${g.from.y}" x2="${g.to.x}" y2="${g.to.y}" class="snap-guide snap-guide-${g.source}"/>`,
      )
    }
    parts.push('</g>')
  }

  // 布局方案的搬动示意:虚线幽灵框 = 原位置,箭头指到新中心。画在最上层;
  // 箭头三角按角度现算顶点,不用 marker defs(defs 在 {@html} 多实例页面里会撞 id)
  if (opts.moveOverlay?.length) {
    parts.push('<g class="move-overlay" aria-hidden="true">')
    for (const mv of opts.moveOverlay) {
      const { from, to } = mv
      parts.push(
        `<rect x="${from.x}" y="${from.y}" width="${from.w}" height="${from.h}" rx="3" class="move-ghost"/>`,
        `<rect x="${to.x}" y="${to.y}" width="${to.w}" height="${to.h}" rx="3" class="move-to"/>`,
      )
      const x1 = from.x + from.w / 2
      const y1 = from.y + from.h / 2
      const x2 = to.x + to.w / 2
      const y2 = to.y + to.h / 2
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len < 4) continue
      const ux = (x2 - x1) / len
      const uy = (y2 - y1) / len
      const ah = Math.min(14, len * 0.4)
      const aw = ah * 0.55
      const bx = x2 - ux * ah
      const by = y2 - uy * ah
      // 白色光晕垫底再画橙色箭身:深浅家具底色上都读得出
      parts.push(
        `<line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" class="move-arrow-halo"/>`,
        `<line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" class="move-arrow"/>`,
        `<polygon points="${x2},${y2} ${bx - uy * aw},${by + ux * aw} ${bx + uy * aw},${by - ux * aw}" class="move-arrow-head"/>`,
      )
    }
    parts.push('</g>')
  }

  // 任务定位标记画在最上层:脉冲圆环指着「去这」。rect 模式(储藏柜)再加一圈
  // 虚线框住整件家具 —— 光一个点说不清"梳理的是哪个柜"。
  if (opts.focus) {
    const fr = opts.focus.rect
    const fx = fr ? fr.x + fr.w / 2 : opts.focus.x
    const fy = fr ? fr.y + fr.h / 2 : opts.focus.y
    parts.push('<g class="task-focus" aria-hidden="true">')
    if (fr) {
      parts.push(
        `<rect x="${fr.x - 4}" y="${fr.y - 4}" width="${fr.w + 8}" height="${fr.h + 8}" rx="6" class="focus-rect"/>`,
      )
    }
    parts.push(
      `<circle cx="${fx}" cy="${fy}" r="8" class="focus-dot"/>`,
      `<circle cx="${fx}" cy="${fy}" r="16" class="focus-ring"><animate attributeName="r" values="13;28;13" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0.12;1" dur="2.2s" repeatCount="indefinite"/></circle>`,
    )
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
/**
 * 状态色阶：整洁→堆满 由冷到暖。与 PlanViewpointSelectionBar 的徽章同色。
 * @param {string} state
 */
function stateColor(state) {
  switch (state) {
    case '整洁':
      return '#1d6b42'
    case '杂乱':
      return '#b45309'
    case '堆满':
      return '#a3341f'
    case '空置':
      return '#5c758c'
    default:
      return '#8a929c'
  }
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
