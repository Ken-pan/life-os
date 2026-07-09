import assert from 'node:assert/strict'
import {
  DOOR_STYLE_ORDER,
  cycleDoorStyleOpening,
  defaultDoorSpanIn,
  doorStyleLabel,
  nextDoorStyle,
} from '../src/lib/spatial/door-styles.js'
import { deriveWallsAndOpenings, convert508Openings } from '../src/lib/spatial/graph-openings.js'
import { SAMPLE_508 } from '../src/lib/spatial/sample-508.js'
import { hydrateProject } from '../src/lib/spatial/model.js'
import { export508ToWallGraph } from '../src/lib/spatial/wall-graph.js'

assert.equal(DOOR_STYLE_ORDER.length, 6)
assert.equal(doorStyleLabel('double'), '双开')
assert.equal(doorStyleLabel('pocket'), '口袋')
assert.equal(defaultDoorSpanIn('double'), 60)
assert.equal(defaultDoorSpanIn('bypass'), 60)

let style = 'swing'
for (let i = 0; i < DOOR_STYLE_ORDER.length; i++) {
  style = nextDoorStyle(style)
}
assert.equal(style, 'swing')

const cycled = cycleDoorStyleOpening({
  id: 'go-1',
  edgeId: 'e1',
  offsetIn: 12,
  spanIn: 32,
  type: 'door',
  style: 'swing',
  swing: 'out',
})
assert.equal(cycled.style, 'double')
assert.equal(cycled.spanIn, 60)

const hydrated = hydrateProject(SAMPLE_508)
const graph = export508ToWallGraph(hydrated)
const graphOpenings = convert508Openings(hydrated, graph)
const { openings } = deriveWallsAndOpenings(graph, graphOpenings)
for (const op of openings.filter((o) => o.type === 'door')) {
  assert.ok(op.pathD && op.pathD.length > 8, `missing path for ${op.id}`)
  assert.ok(!op.pathD.includes('fill'), `unexpected fill in ${op.id}`)
}

console.log('door-styles-unit: ok')
