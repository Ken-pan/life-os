/** @typedef {import('./types.js').SpatialProject} SpatialProject */
import { build508Project, default508Config } from './layout-508.js'

export const DEFAULT_508_CONFIG = default508Config()

/** @type {SpatialProject} */
export const SAMPLE_508 = build508Project(DEFAULT_508_CONFIG)
