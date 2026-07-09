import assert from 'node:assert/strict'
import test from 'node:test'

test('bindNetworkResume is a no-op without window', async () => {
  const { bindNetworkResume } = await import('../src/networkResume.js')
  const cleanup = bindNetworkResume({
    onResume: () => assert.fail('should not run'),
  })
  assert.equal(typeof cleanup, 'function')
  cleanup()
})

test('appBadge helpers degrade without navigator APIs', async () => {
  const { isAppBadgeSupported, setAppBadgeCount, clearAppBadge } =
    await import('../src/appBadge.js')
  assert.equal(isAppBadgeSupported(), false)
  assert.equal(await setAppBadgeCount(3), false)
  assert.equal(await clearAppBadge(), false)
})

test('isOnline defaults true without navigator', async () => {
  const { isOnline } = await import('../src/connectivity.js')
  assert.equal(isOnline(), true)
})
