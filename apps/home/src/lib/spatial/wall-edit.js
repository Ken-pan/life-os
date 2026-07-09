/** @typedef {import('./types.js').Layout508Config} Layout508Config */
/** @typedef {import('./dimensions.js').FtIn} FtIn */
import {
  fromInches,
  pxToFtIn,
  toInches,
  formatFtIn,
  formatDeltaPx,
  snapDeltaPx,
} from './dimensions.js'
import { validate508Config } from './layout-508.js'

/** @typedef {'h' | 'v'} WallOrientation */

/**
 * @typedef {object} WallEditBinding
 * @property {string} label
 * @property {WallOrientation} orientation
 * @property {'columnSplit' | 'room'} [type]
 * @property {string} [roomKey]
 * @property {'w' | 'h'} [axis]
 * @property {number} [minIn]
 */

/** 可拖拽内墙 → layoutConfig 参数映射 */
export const WALL_EDIT_BINDINGS =
  /** @type {Record<string, WallEditBinding>} */ ({
    'w-div': {
      label: '左右列分隔墙',
      orientation: 'v',
      type: 'columnSplit',
      minIn: 108,
    },
    'w-balcony': {
      label: '阳台下墙',
      orientation: 'h',
      type: 'room',
      roomKey: 'balcony',
      axis: 'h',
      minIn: 24,
    },
    'w-closet-row-l': {
      label: '卧室下墙',
      orientation: 'h',
      type: 'room',
      roomKey: 'bedroom',
      axis: 'h',
      minIn: 60,
    },
    'w-closet-v': {
      label: '壁橱右墙',
      orientation: 'v',
      type: 'room',
      roomKey: 'bedCloset',
      axis: 'w',
      minIn: 36,
    },
    'w-coat-east-top': {
      label: '储物柜东墙',
      orientation: 'v',
      type: 'room',
      roomKey: 'coatCloset',
      axis: 'w',
      minIn: 24,
    },
    'w-bath-right': {
      label: '浴室东墙',
      orientation: 'v',
      type: 'room',
      roomKey: 'bathroom',
      axis: 'w',
      minIn: 48,
    },
    'w-laundry-east-top': {
      label: '洗衣间东墙',
      orientation: 'v',
      type: 'room',
      roomKey: 'laundry',
      axis: 'w',
      minIn: 24,
    },
    'w-liv-kit': {
      label: '客厅·厨房分隔',
      orientation: 'h',
      type: 'room',
      roomKey: 'living',
      axis: 'h',
      minIn: 96,
    },
  })

/** 同一水平墙段共用绑定 */
export const WALL_EDIT_ALIASES = {
  'w-closet-row-r': 'w-closet-row-l',
  'w-closet-row-ext': 'w-closet-row-l',
  'w-coat-east-bot': 'w-coat-east-top',
  'w-laundry-east-bot': 'w-laundry-east-top',
  'w-bath-right-low': 'w-bath-right',
}

/**
 * @typedef {object} OpeningEditBinding
 * @property {string} label
 * @property {'offset' | 'offsetFromRight' | 'center' | 'insetLeft' | 'insetRight' | 'doorOffset' | 'doorWidth'} drag
 * @property {'x' | 'y'} axis
 * @property {string} [configPath] openings.* key or bedCloset.door
 */

export const OPENING_EDIT_BINDINGS =
  /** @type {Record<string, OpeningEditBinding>} */ ({
    'door-bedroom': {
      label: '卧室门',
      drag: 'offset',
      axis: 'y',
      configPath: 'bedroomDoor',
    },
    'door-bath': {
      label: '浴室门',
      drag: 'offset',
      axis: 'y',
      configPath: 'bathDoor',
    },
    'door-coat': {
      label: '储物柜门',
      drag: 'offset',
      axis: 'y',
      configPath: 'coatDoor',
    },
    'door-laundry': {
      label: '洗衣间门',
      drag: 'offset',
      axis: 'y',
      configPath: 'laundryDoor',
    },
    'door-entry': {
      label: '入户门',
      drag: 'offsetFromRight',
      axis: 'x',
      configPath: 'entryDoor',
    },
    'door-balcony': {
      label: '阳台门',
      drag: 'center',
      axis: 'x',
      configPath: 'balconyDoor',
    },
    'door-bed-closet': {
      label: '壁橱双折门',
      drag: 'doorOffset',
      axis: 'x',
      configPath: 'bedCloset.door',
    },
    'g-bed-closet': {
      label: '壁橱双折门',
      drag: 'doorOffset',
      axis: 'x',
      configPath: 'bedCloset.door',
    },
    'win-living': {
      label: '客厅窗',
      drag: 'insetLeft',
      axis: 'x',
      configPath: 'livingWindow',
    },
    'win-bedroom': {
      label: '卧室窗',
      drag: 'insetLeft',
      axis: 'x',
      configPath: 'bedroomWindow',
    },
  })

/** @param {string} wallId */
export function resolveWallBinding(wallId) {
  const key =
    WALL_EDIT_ALIASES[/** @type {keyof typeof WALL_EDIT_ALIASES} */ (wallId)] ??
    wallId
  return WALL_EDIT_BINDINGS[key]
    ? { id: key, ...WALL_EDIT_BINDINGS[key] }
    : null
}

/** @param {Layout508Config} config */
function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config))
}

/**
 * @param {Layout508Config} config
 * @param {string} wallId
 * @param {number} deltaPx screen-space delta (y for h walls, x for v walls)
 */
export function applyWallDrag(config, wallId, deltaPx) {
  const binding = resolveWallBinding(wallId)
  if (!binding) return null

  if (binding.type === 'columnSplit') {
    const deltaIn = Math.round((deltaPx / config.pxPerFt) * 12)
    const leftIn = toInches(config.leftCol) + deltaIn
    const rightIn = toInches(config.rightCol) - deltaIn
    const min = binding.minIn ?? 108
    if (leftIn < min || rightIn < min) return null
    const next = cloneConfig(config)
    next.leftCol = fromInches(leftIn)
    next.rightCol = fromInches(rightIn)
    next.rooms.balcony.w = next.leftCol
    next.rooms.bedroom.w = next.leftCol
    next.rooms.living.w = next.rightCol
    next.rooms.kitchen.w = next.rightCol
    return next
  }

  if (!binding.roomKey || !binding.axis) return null
  const deltaIn = Math.round((deltaPx / config.pxPerFt) * 12)
  const room = /** @type {Record<string, { w: FtIn, h: FtIn }>} */ (
    config.rooms
  )[binding.roomKey]
  if (!room) return null
  const nextIn = toInches(room[binding.axis]) + deltaIn
  if (nextIn < (binding.minIn ?? 12)) return null
  return setRoomDimensionLocal(
    config,
    binding.roomKey,
    binding.axis,
    fromInches(nextIn),
  )
}

/**
 * @param {Layout508Config} config
 * @param {string} roomKey
 * @param {'w' | 'h'} axis
 * @param {FtIn} value
 */
function setRoomDimensionLocal(config, roomKey, axis, value) {
  const next = cloneConfig(config)
  const room = /** @type {Record<string, { w: FtIn, h: FtIn }>} */ (next.rooms)[
    roomKey
  ]
  if (!room) return null
  room[axis] = value
  if (roomKey === 'balcony' || roomKey === 'bedroom') {
    next.rooms.balcony.w = next.leftCol
    next.rooms.bedroom.w = next.leftCol
  }
  if (roomKey === 'living' || roomKey === 'kitchen') {
    next.rooms.living.w = next.rightCol
    next.rooms.kitchen.w = next.rightCol
  }
  return next
}

/** @typedef {'move' | 'width'} OpeningDragMode */

/**
 * @param {Layout508Config} config
 * @param {string} openingId
 * @param {number} deltaPx
 * @param {OpeningDragMode} [dragMode]
 */
export function applyOpeningDrag(
  config,
  openingId,
  deltaPx,
  dragMode = 'move',
) {
  const binding = OPENING_EDIT_BINDINGS[openingId]
  if (!binding) return null

  const effectiveDrag =
    dragMode === 'width' && binding.configPath === 'bedCloset.door'
      ? 'doorWidth'
      : binding.drag

  const deltaFtIn = pxToFtIn(Math.abs(deltaPx), config.pxPerFt)
  const sign = deltaPx >= 0 ? 1 : -1
  const deltaIn = sign * toInches(deltaFtIn)
  const next = cloneConfig(config)

  if (binding.configPath === 'bedCloset.door') {
    const door = next.rooms.bedCloset.door
    if (effectiveDrag === 'doorOffset') {
      const off = toInches(door.offset) + deltaIn
      if (off < 0 || off + toInches(door.w) > toInches(next.rooms.bedCloset.w))
        return null
      door.offset = fromInches(off)
    } else if (effectiveDrag === 'doorWidth') {
      const w = toInches(door.w) + deltaIn
      if (
        w < 24 ||
        toInches(door.offset) + w > toInches(next.rooms.bedCloset.w)
      )
        return null
      door.w = fromInches(w)
    }
    return next
  }

  const openings = next.openings ?? defaultOpenings()
  const slot =
    openings[/** @type {keyof typeof openings} */ (binding.configPath)]
  if (!slot) return null

  if (binding.drag === 'offset') {
    const off = toInches(slot.offset) + deltaIn
    if (off < 0) return null
    slot.offset = fromInches(off)
  } else if (binding.drag === 'offsetFromRight') {
    const off = toInches(slot.offsetFromRight ?? { ft: 0, in: 0 }) - deltaIn
    if (off < 0) return null
    slot.offsetFromRight = fromInches(off)
  } else if (binding.drag === 'insetLeft') {
    const off = toInches(slot.insetLeft ?? { ft: 0, in: 0 }) + deltaIn
    if (off < 0) return null
    slot.insetLeft = fromInches(off)
  } else if (binding.drag === 'insetRight') {
    const off = toInches(slot.insetRight ?? { ft: 0, in: 0 }) - deltaIn
    if (off < 0) return null
    slot.insetRight = fromInches(off)
  } else if (binding.drag === 'center') {
    return null
  }

  next.openings = openings
  return next
}

/** @returns {import('./types.js').Layout508OpeningsConfig} */
export function defaultOpenings() {
  return {
    bedroomDoor: { offset: { ft: 6, in: 0 }, span: { ft: 2, in: 0 } },
    bathDoor: { offset: { ft: 5, in: 0 }, span: { ft: 1, in: 6 } },
    coatDoor: { offset: { ft: 1, in: 0 }, span: { ft: 1, in: 6 } },
    laundryDoor: { offset: { ft: 1, in: 0 }, span: { ft: 2, in: 0 } },
    entryDoor: { offsetFromRight: { ft: 2, in: 0 }, span: { ft: 3, in: 0 } },
    balconyDoor: {
      offset: { ft: 0, in: 0 },
      span: { ft: 6, in: 0 },
      center: true,
    },
    livingWindow: {
      offset: { ft: 0, in: 0 },
      span: { ft: 0, in: 0 },
      insetLeft: { ft: 2, in: 0 },
      insetRight: { ft: 2, in: 0 },
    },
    bedroomWindow: {
      offset: { ft: 0, in: 0 },
      span: { ft: 0, in: 0 },
      insetLeft: { ft: 2, in: 0 },
      insetRight: { ft: 2, in: 0 },
    },
  }
}

/** @param {string} wallId */
export function isEditableWall(wallId) {
  return Boolean(resolveWallBinding(wallId))
}

/** @param {string} openingId */
export function isEditableOpening(openingId) {
  return Boolean(OPENING_EDIT_BINDINGS[openingId])
}

/** @param {import('./types.js').SpatialProject} project */
export function listEditableWalls(project) {
  return project.walls
    .filter((w) => w.kind === 'wall' && isEditableWall(w.id))
    .map((w) => {
      const b = resolveWallBinding(w.id)
      return { id: w.id, label: b?.label ?? w.id, wall: w }
    })
}

/** @param {import('./types.js').SpatialProject} project */
export function listEditableOpenings(project) {
  return project.openings
    .filter((o) => isEditableOpening(o.id))
    .map((o) => {
      const b = OPENING_EDIT_BINDINGS[o.id]
      return { id: o.id, label: b?.label ?? o.id, type: o.type, opening: o }
    })
}

/** @param {number} x1 @param {number} x2 @param {number} y @param {number} [thick] */
export function openingHitAlongH(x1, x2, y, thick = 44) {
  const pad = 18
  const x = Math.min(x1, x2)
  const w = Math.abs(x2 - x1)
  return { x: x - pad, y: y - thick / 2, w: Math.max(w, 28) + pad * 2, h: thick }
}

/** @param {number} x @param {number} y1 @param {number} y2 @param {number} [thick] */
export function openingHitAlongV(x, y1, y2, thick = 44) {
  const pad = 18
  const y = Math.min(y1, y2)
  const h = Math.abs(y2 - y1)
  return { x: x - thick / 2, y: y - pad, w: thick, h: Math.max(h, 28) + pad * 2 }
}

/**
 * @param {import('./types.js').SpatialOpening} op
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function openingHitRect(op) {
  if (op.hitRect) return { ...op.hitRect }
  if (op.rect) {
    const pad = 14
    return {
      x: op.rect.x - pad,
      y: op.rect.y - pad,
      w: op.rect.w + pad * 2,
      h: op.rect.h + pad * 2 + 8,
    }
  }
  if (op.from && op.to) {
    const x1 = Math.min(op.from.x, op.to.x)
    const x2 = Math.max(op.from.x, op.to.x)
    const y1 = Math.min(op.from.y, op.to.y)
    const y2 = Math.max(op.from.y, op.to.y)
    const pad = 18
    return {
      x: x1 - pad,
      y: y1 - pad,
      w: Math.max(x2 - x1, 28) + pad * 2,
      h: Math.max(y2 - y1, 28) + pad * 2,
    }
  }
  if (op.pathD && /^M\s+[\d.-]+\s+[\d.-]+\s+L\s+[\d.-]+\s+[\d.-]+\s*$/.test(op.pathD.trim())) {
    const nums = op.pathD.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    if (nums.length >= 4) {
      return openingHitAlongH(nums[0], nums[2], nums[1])
    }
  }
  return { x: 0, y: 0, w: 32, h: 32 }
}

/**
 * Live drag hint for HUD overlay.
 * @param {Layout508Config} base
 * @param {'wall' | 'opening'} kind
 * @param {string} id
 * @param {number} deltaPx raw svg-space delta
 * @param {OpeningDragMode} [dragMode]
 * @returns {{ valid: boolean, title: string, detail: string, delta: string, gridSnapped: boolean }}
 */
export function describeDragEdit(base, kind, id, deltaPx, dragMode = 'move') {
  const snapped = snapDeltaPx(deltaPx, base.pxPerFt)
  const gridSnapped = Math.abs(snapped - deltaPx) > 0.01
  const delta = formatDeltaPx(snapped, base.pxPerFt)
  const binding =
    kind === 'wall' ? resolveWallBinding(id) : OPENING_EDIT_BINDINGS[id]
  const title = binding?.label ?? id

  const next =
    kind === 'wall'
      ? applyWallDrag(base, id, snapped)
      : applyOpeningDrag(base, id, snapped, dragMode)

  if (!next) {
    return { valid: false, title, detail: '已达尺寸边界', delta, gridSnapped }
  }
  const issues = validate508Config(next)
  if (issues.length) {
    return { valid: false, title, detail: issues[0], delta, gridSnapped }
  }

  return {
    valid: true,
    title,
    detail: formatDragResult(base, next, kind, id, dragMode),
    delta,
    gridSnapped,
  }
}

/**
 * @param {Layout508Config} base
 * @param {Layout508Config} next
 * @param {'wall' | 'opening'} kind
 * @param {string} id
 * @param {OpeningDragMode} [dragMode]
 */
function formatDragResult(base, next, kind, id, dragMode = 'move') {
  if (kind === 'wall') {
    const b = resolveWallBinding(id)
    if (b?.type === 'columnSplit') {
      return `左列 ${formatFtIn(next.leftCol)} · 右列 ${formatFtIn(next.rightCol)}`
    }
    if (b?.roomKey && b?.axis) {
      const room = /** @type {Record<string, { w: FtIn, h: FtIn }>} */ (
        next.rooms
      )[b.roomKey]
      const axisLabel = b.axis === 'w' ? '宽' : '深'
      return `${axisLabel} ${formatFtIn(room[b.axis])}`
    }
  }

  const ob = OPENING_EDIT_BINDINGS[id]
  if (!ob) return '已更新'

  if (ob.configPath === 'bedCloset.door') {
    const door = next.rooms.bedCloset.door
    if (dragMode === 'width') return `门宽 ${formatFtIn(door.w)}`
    return `偏移 ${formatFtIn(door.offset)} · 门宽 ${formatFtIn(door.w)}`
  }

  const openings = { ...defaultOpenings(), ...next.openings }
  const slot = openings[/** @type {keyof typeof openings} */ (ob.configPath)]
  if (!slot) return '已更新'

  if (ob.drag === 'offset' && slot.offset) {
    return `沿墙 ${formatFtIn(slot.offset)}`
  }
  if (ob.drag === 'offsetFromRight' && slot.offsetFromRight) {
    return `距右缘 ${formatFtIn(slot.offsetFromRight)}`
  }
  if (ob.drag === 'insetLeft' && slot.insetLeft) {
    return `左内缩 ${formatFtIn(slot.insetLeft)}`
  }
  if (ob.drag === 'insetRight' && slot.insetRight) {
    return `右内缩 ${formatFtIn(slot.insetRight)}`
  }
  if (slot.span) {
    return `跨度 ${formatFtIn(slot.span)}`
  }
  return '已更新'
}

/** @param {import('./types.js').SpatialProject} project @param {string} wallId */
export function wallMidpoint(project, wallId) {
  const wall = project.walls.find((w) => w.id === wallId)
  if (!wall) return null
  return {
    x: (wall.from.x + wall.to.x) / 2,
    y: (wall.from.y + wall.to.y) / 2,
  }
}

const CLOSET_OPENING_IDS = new Set(['door-bed-closet', 'g-bed-closet'])

/** @param {import('./types.js').SpatialProject} project @param {string} openingId */
export function openingAnchor(project, openingId) {
  const op = project.openings.find((o) => o.id === openingId)
  if (op) {
    const hit = openingHitRect(op)
    return { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 }
  }
  if (openingId === 'g-bed-closet') {
    const wall = project.walls.find((w) => w.id === 'g-bed-closet')
    if (wall) {
      return {
        x: (wall.from.x + wall.to.x) / 2,
        y: (wall.from.y + wall.to.y) / 2,
      }
    }
  }
  return null
}

/** @param {string} openingId */
export function supportsDoorWidthResize(openingId) {
  return CLOSET_OPENING_IDS.has(openingId)
}

/** SVG viewBox units — enlarged for touch; visual grip stays narrow */
export const RESIZE_GRIP_HIT = 56
export const RESIZE_GRIP_VIS_W = 12

/**
 * Nudge label away from room title / dim-tag zones (CAD exterior placement).
 * @param {import('./types.js').SpatialProject} project
 * @param {{ x: number, y: number, anchorX: number, anchorY: number }} pos
 */
function avoidRoomLabelOverlap(project, pos) {
  const pad = 52
  let { x, y } = pos
  for (const room of project.rooms) {
    if (room.kind === 'circulation') continue
    const { x: rx, y: ry, w, h } = room.bounds
    const titleY = ry + h / 2 - 8
    const titleBox = { x: rx + w / 2 - 72, y: titleY - 22, w: 144, h: 44 }
    const dimBox = { x: rx + 2, y: ry + h - 22, w: Math.min(w - 4, 120), h: 18 }
    for (const box of [titleBox, dimBox]) {
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        const toLeft = x - box.x
        const toRight = box.x + box.w - x
        const toTop = y - box.y
        const toBottom = box.y + box.h - y
        const min = Math.min(toLeft, toRight, toTop, toBottom)
        if (min === toLeft) x = box.x - pad
        else if (min === toRight) x = box.x + box.w + pad
        else if (min === toTop) y = box.y - pad
        else y = box.y + box.h + pad
      }
    }
  }
  return { ...pos, x, y }
}

/**
 * Prefer dimension labels outside the floor-plan outer bounds when possible.
 * @param {import('./types.js').SpatialProject} project
 * @param {{ x: number, y: number, anchorX: number, anchorY: number }} pos
 */
function preferExteriorBounds(project, pos) {
  const ob = project.outerBounds
  if (!ob) return pos
  const margin = 56
  const { x: ox, y: oy, w, h } = ob
  let { x, y } = pos
  const inside = x > ox + 8 && x < ox + w - 8 && y > oy + 8 && y < oy + h - 8
  if (!inside) return pos
  const distLeft = x - ox
  const distRight = ox + w - x
  const distTop = y - oy
  const distBottom = oy + h - y
  const min = Math.min(distLeft, distRight, distTop, distBottom)
  if (min === distLeft) x = ox - margin
  else if (min === distRight) x = ox + w + margin
  else if (min === distTop) y = oy - margin
  else y = oy + h + margin
  return { ...pos, x, y }
}

/**
 * Offset drag label away from wall/opening & room text (exterior-side heuristic).
 * @param {import('./types.js').SpatialProject} project
 * @param {'wall' | 'opening'} kind
 * @param {string} id
 * @returns {{ x: number, y: number, anchorX: number, anchorY: number } | null}
 */
export function dragLabelAnchor(project, kind, id) {
  const pad = 48
  const cx = project.viewport.width / 2
  const cy = project.viewport.height / 2
  const margin = project.layoutConfig?.margin ?? { x: 46, y: 40 }

  if (kind === 'wall') {
    const mid = wallMidpoint(project, id)
    if (!mid) return null
    const binding = resolveWallBinding(id)
    let pos
    if (binding?.orientation === 'v') {
      const side = mid.x < cx ? 1 : -1
      pos = { anchorX: mid.x, anchorY: mid.y, x: mid.x + side * pad, y: mid.y }
    } else {
      const side = mid.y < cy ? 1 : -1
      pos = { anchorX: mid.x, anchorY: mid.y, x: mid.x, y: mid.y + side * pad }
    }
    if (binding?.orientation === 'v' && mid.x < cx + 40) {
      pos.x = Math.max(pos.x, margin.x + 8)
    }
    return avoidRoomLabelOverlap(project, preferExteriorBounds(project, pos))
  }

  const mid = openingAnchor(project, id)
  if (!mid) return null
  const binding = OPENING_EDIT_BINDINGS[id]
  let pos
  if (binding?.axis === 'y') {
    const side = mid.x < cx ? 1 : -1
    pos = { anchorX: mid.x, anchorY: mid.y, x: mid.x + side * pad, y: mid.y }
  } else {
    pos = { anchorX: mid.x, anchorY: mid.y, x: mid.x, y: mid.y - 36 }
  }
  return avoidRoomLabelOverlap(project, preferExteriorBounds(project, pos))
}
