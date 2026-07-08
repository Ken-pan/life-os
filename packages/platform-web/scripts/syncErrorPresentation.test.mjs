import assert from 'node:assert/strict'

import { createSyncErrorPresentation } from '../src/syncErrorPresentation.js'

assert.deepEqual(
  createSyncErrorPresentation('Network unavailable', {
    message: 'Cloud sync failed: Network unavailable',
    dismissLabel: 'Close',
  }),
  {
    message: 'Cloud sync failed: Network unavailable',
    recoverable: true,
    dismissAction: {
      id: 'dismiss-sync-error',
      label: 'Close',
      intent: 'dismiss',
    },
  },
)

assert.equal(
  createSyncErrorPresentation(null, {
    message: 'Cloud sync failed',
    dismissLabel: 'Close',
  }),
  null,
)

console.log('syncErrorPresentation.test.mjs: ok')
