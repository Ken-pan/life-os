import assert from 'node:assert/strict'
import { scrollToSettingsHash } from '../src/settingsHash.js'

// Node: no-op dispose
const dispose = scrollToSettingsHash('cloud')
assert.equal(typeof dispose, 'function')
dispose()
console.log('settingsHash: ok')
