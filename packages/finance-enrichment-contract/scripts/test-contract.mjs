#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  classifyCleanReasons,
  resolveDisplayState,
  buildDuplicateMaps,
} from '../src/index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(
  readFileSync(path.join(__dirname, '../fixtures/display-state.json'), 'utf8'),
)

let failed = 0
for (const c of fixtures.cases) {
  const dupMaps = buildDuplicateMaps([c.order])
  const reasons = classifyCleanReasons(c.order, dupMaps)
  const state = resolveDisplayState(c.order, reasons)

  if (state !== c.expectedState) {
    console.error(`FAIL ${c.id}: state ${state} !== ${c.expectedState}`)
    failed++
    continue
  }
  if (c.expectedReasons) {
    for (const r of c.expectedReasons) {
      if (!reasons.includes(r)) {
        console.error(`FAIL ${c.id}: missing reason ${r} in ${reasons.join(',')}`)
        failed++
      }
    }
  }
  console.log(`PASS ${c.id} -> ${state}`)
}

if (failed) process.exit(1)
console.log(`All ${fixtures.cases.length} fixture cases passed.`)
