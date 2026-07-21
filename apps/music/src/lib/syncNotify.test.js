import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'syncNotify.js'), 'utf8')

test('syncNotify suppresses unauthenticated sync errors', () => {
  assert.match(src, /isAuthGateError/)
  assert.match(src, /sync\.notSignedIn/)
  assert.match(src, /if \(isAuthGateError\(err\)\) return/)
})
