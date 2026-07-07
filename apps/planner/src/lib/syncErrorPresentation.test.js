import { describe, expect, it } from 'vitest'

import { createPlannerSyncErrorPresentation } from './syncErrorPresentation.js'

describe('createPlannerSyncErrorPresentation', () => {
  it('maps an existing sync error reason to the shared presentation contract', () => {
    expect(
      createPlannerSyncErrorPresentation('Network unavailable', {
        message: 'Cloud sync failed: Network unavailable',
        dismissLabel: 'Close',
      }),
    ).toEqual({
      message: 'Cloud sync failed: Network unavailable',
      recoverable: true,
      dismissAction: {
        id: 'dismiss-sync-error',
        label: 'Close',
        intent: 'dismiss',
      },
    })
  })

  it('returns null when no sync error is active', () => {
    expect(
      createPlannerSyncErrorPresentation(null, {
        message: 'Cloud sync failed',
        dismissLabel: 'Close',
      }),
    ).toBeNull()
  })
})
