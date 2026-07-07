import assert from 'node:assert/strict'

import { createFitnessSyncErrorPresentation } from '../src/lib/syncErrorPresentation.js'

assert.deepEqual(
  createFitnessSyncErrorPresentation('Network unavailable', {
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
  createFitnessSyncErrorPresentation(null, {
    message: 'Cloud sync failed',
    dismissLabel: 'Close',
  }),
  null,
)

console.log('sync-error-presentation-check — OK')
