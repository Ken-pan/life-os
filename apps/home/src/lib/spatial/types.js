/**
 * HomeOS spatial model types.
 * Graph-based 2D plan — walls/rooms/furniture/storage as first-class entities.
 * Future 3D: extrude walls via {@link toExtrusionHints} without changing this schema.
 */

/** @typedef {'wall' | 'gap' | 'threshold'} WallKind */

/**
 * @typedef {object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {import('./dimensions.js').FtIn} FtIn
 */

/**
 * @typedef {object} RoomDimensions
 * @property {FtIn} w
 * @property {FtIn} h
 */

/**
 * @typedef {object} BedClosetConfig
 * @property {FtIn} w
 * @property {FtIn} h
 * @property {{ w: FtIn, offset: FtIn }} door
 */

/**
 * @typedef {object} OpeningSlotConfig
 * @property {FtIn} offset 沿宿主墙起点偏移
 * @property {FtIn} span 开口宽度/高度
 * @property {FtIn} [offsetFromRight] 入户门等从右缘计
 * @property {boolean} [center] 居中（阳台推拉门）
 * @property {FtIn} [insetLeft]
 * @property {FtIn} [insetRight]
 */

/**
 * @typedef {object} Layout508OpeningsConfig
 * @property {OpeningSlotConfig} bedroomDoor
 * @property {OpeningSlotConfig} bathDoor
 * @property {OpeningSlotConfig} coatDoor
 * @property {OpeningSlotConfig} laundryDoor
 * @property {OpeningSlotConfig} entryDoor
 * @property {OpeningSlotConfig} balconyDoor
 * @property {OpeningSlotConfig} livingWindow
 * @property {OpeningSlotConfig} bedroomWindow
 */

/**
 * @typedef {object} Layout508Config
 * @property {number} pxPerFt
 * @property {{ x: number, y: number }} margin
 * @property {FtIn} leftCol
 * @property {FtIn} rightCol
 * @property {Layout508OpeningsConfig} [openings]
 * @property {object} rooms
 * @property {RoomDimensions} rooms.balcony
 * @property {RoomDimensions} rooms.bedroom
 * @property {BedClosetConfig} rooms.bedCloset
 * @property {RoomDimensions} rooms.coatCloset
 * @property {RoomDimensions} rooms.bathroom
 * @property {RoomDimensions} rooms.laundry
 * @property {RoomDimensions} rooms.living
 * @property {RoomDimensions} rooms.kitchen
 * @property {RoomDimensions} rooms.entry
 */

/**
 * @typedef {object} SpatialRoom
 * @property {string} id
 * @property {string} nameZh
 * @property {string} nameEn
 * @property {Rect} bounds
 * @property {string} [fill]
 * @property {'room' | 'circulation'} [kind]
 * @property {RoomDimensions} [dimensions]
 */

/**
 * @typedef {object} SpatialWall
 * @property {string} id
 * @property {Point} from
 * @property {Point} to
 * @property {WallKind} kind
 */

/**
 * @typedef {object} SpatialOpening
 * @property {string} id
 * @property {'door' | 'window' | 'ac'} type
 * @property {'swing' | 'bifold' | 'sliding'} [doorStyle]
 * @property {string} [opensInto]
 * @property {string} [pathD]
 * @property {import('./types.js').Rect} [rect]
 * @property {import('./types.js').Rect} [hitRect] gap-sized edit target (not path bbox)
 * @property {import('./types.js').Point} [from]
 * @property {import('./types.js').Point} [to]
 * @property {string} [label]
 */

/**
 * @typedef {object} SpatialFurniture
 * @property {string} id
 * @property {string} roomId
 * @property {Rect} bounds
 * @property {string} label
 * @property {'solid' | 'dashed'} [strokeStyle]
 */

/**
 * @typedef {object} SpatialStorageZone
 * @property {string} id
 * @property {string} code
 * @property {string} nameZh
 * @property {string} locationZh
 * @property {string} formZh
 * @property {Rect} bounds
 * @property {Point} marker
 * @property {string[]} items
 * @property {boolean} [inferred]
 */

/**
 * @typedef {object} SpatialFurnitureRow
 * @property {string} zoneZh
 * @property {string} objectZh
 * @property {string} noteZh
 */

/**
 * @typedef {object} SpatialMeta
 * @property {string} id
 * @property {string} nameZh
 * @property {string} [unitId]
 * @property {string} [building]
 * @property {number} [sqft]
 * @property {string} [layoutType]
 * @property {string} [status]
 * @property {string} [floorplanUrl]
 * @property {string} [scaleLabel]
 * @property {string[]} [assumptions]
 * @property {string} [sourceNote]
 */

/**
 * @typedef {object} SpatialProject
 * @property {number} schemaVersion
 * @property {SpatialMeta} meta
 * @property {{ width: number, height: number }} viewport
 * @property {number} [gridStep]
 * @property {SpatialRoom[]} rooms
 * @property {SpatialWall[]} walls
 * @property {Rect} [outerBounds]
 * @property {SpatialOpening[]} openings
 * @property {SpatialFurniture[]} furniture
 * @property {SpatialStorageZone[]} storageZones
 * @property {SpatialFurnitureRow[]} furnitureInventory
 * @property {Layout508Config} [layoutConfig]
 */

export const SPATIAL_SCHEMA_VERSION = 2
