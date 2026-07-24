import assert from 'node:assert/strict'
import {
  liveActivityDeepLink,
  isNativeBridgeAvailable,
  getNativeCapabilities,
  nativeHaptic,
  nativeShare,
  nativeAuthenticate,
  nativeCancelAuthenticate,
  nativeClearUnlockGrant,
  ensureNativeUnlock,
  clearNativeUnlock,
  createNativeUnlockController,
  nativeNowPlayingUpdate,
  nativeNowPlayingClear,
  nativeLiveActivityUpsert,
  nativeLiveActivityEnd,
  nativeOpenContinuity,
  hasNativeLocalNotifications,
  nativeNotificationsRequestPermission,
  nativeNotificationsGetStatus,
  nativeNotificationsSyncReminders,
  nativeNotificationsCancel,
  nativeNotificationsListPending,
  nativeShellSettingsGet,
  nativeShellSettingsSet,
  publishNavManifest,
  installNavManifestPublisher,
} from '../src/kenosNativeBridge.js'

// Node / non-shell: bridge helpers must be safe no-ops.
assert.equal(isNativeBridgeAvailable(), false)

const caps = await getNativeCapabilities()
assert.equal(caps.ok, false)
assert.equal(caps.skipped, true)

const haptic = await nativeHaptic('success')
assert.equal(haptic.skipped, true)

const share = await nativeShare({ text: 'hello' })
assert.equal(share.skipped, true)

const auth = await nativeAuthenticate({ reason: 'test' })
assert.equal(auth.skipped, true)
const authCancel = await nativeCancelAuthenticate()
assert.equal(authCancel.skipped, true)
const clearGrant = await nativeClearUnlockGrant('kenos.unlock.test')
assert.equal(clearGrant.skipped, true)

const unlock = await ensureNativeUnlock({
  storageKey: 'kenos.unlock.test',
  reason: 'test',
})
assert.equal(unlock.ok, true)
assert.equal(unlock.skipped, true)
clearNativeUnlock('kenos.unlock.test')

const cancel = await nativeCancelAuthenticate()
assert.equal(cancel.skipped, true)

const ctl = createNativeUnlockController({
  storageKey: 'kenos.unlock.ctl',
  reason: 'test',
})
assert.equal(await ctl.unlock(), 'open')
assert.equal(await ctl.unlock({ prompt: false }), 'open')
await ctl.cancel()
ctl.dispose()
// dispose must not throw and must not require cancelAuthenticate
ctl.dispose()

const np = await nativeNowPlayingUpdate({ title: 'Test', playing: true })
assert.equal(np.skipped, true)
const npClear = await nativeNowPlayingClear()
assert.equal(npClear.skipped, true)

const la = await nativeLiveActivityUpsert({
  kind: 'training',
  title: 'Chest',
  subtitle: 'Set 2/4',
  progress: 0.5,
})
assert.equal(la.skipped, true)
const laEnd = await nativeLiveActivityEnd('training')
assert.equal(laEnd.skipped, true)

const openCont = await nativeOpenContinuity({
  url: 'http://10.0.0.1:5188/',
  domainId: 'plan',
})
assert.equal(openCont.skipped, true)

assert.equal(hasNativeLocalNotifications({ capabilities: { localNotifications: true } }), true)
assert.equal(hasNativeLocalNotifications({ capabilities: { push: false } }), false)
const notifPerm = await nativeNotificationsRequestPermission()
assert.equal(notifPerm.skipped, true)
const notifStatus = await nativeNotificationsGetStatus()
assert.equal(notifStatus.skipped, true)
const notifSync = await nativeNotificationsSyncReminders({
  jobs: [{ id: 't1', title: 'Task', fireAt: Date.now() + 60_000 }],
})
assert.equal(notifSync.skipped, true)
const notifCancel = await nativeNotificationsCancel({ deduplicationKey: 'plan-reminder-t1' })
assert.equal(notifCancel.skipped, true)
const notifPending = await nativeNotificationsListPending()
assert.equal(notifPending.skipped, true)

const shellGet = await nativeShellSettingsGet()
assert.equal(shellGet.skipped, true)
const shellSet = await nativeShellSettingsSet({ theme: 'dark', locale: 'zh' })
assert.equal(shellSet.skipped, true)

const published = await publishNavManifest({
  domainId: 'plan',
  path: '/upcoming',
  title: 'Plan',
  unsavedDraft: true,
  summary: 'Unsaved task',
})
assert.equal(published.skipped, true)
assert.equal(published.manifest?.domainId, 'plan')
assert.equal(published.manifest?.unsavedDraft, true)

const dispose = installNavManifestPublisher(() => ({
  domainId: 'training',
  path: '/session',
  liveState: 'active',
}))
assert.equal(typeof dispose, 'function')
dispose()


// —— liveActivityDeepLink 共享 builder(持久表面点击目标契约)——
assert.equal(
  liveActivityDeepLink({ domain: 'training', path: '/day/abs/focus' }),
  'kenos://training?path=' + encodeURIComponent('/day/abs/focus'),
)
// path 不以 / 开头也归一化
assert.equal(
  liveActivityDeepLink({ domain: 'home', path: 'tidy/go' }),
  'kenos://home?path=' + encodeURIComponent('/tidy/go'),
)
// 无 path → 域落地
assert.equal(liveActivityDeepLink({ domain: 'work' }), 'kenos://work')
// 空 domain → 空串(调用方据此省略 deepLink)
assert.equal(liveActivityDeepLink({}), '')
assert.equal(liveActivityDeepLink({ domain: '  ' }), '')
// 解码后即原始 path(原生 URLComponents 会 percent-decode)
{
  const link = liveActivityDeepLink({ domain: 'training', path: '/day/abs/focus' })
  const u = new URL(link.replace('kenos://', 'https://x/'))
  assert.equal(u.searchParams.get('path'), '/day/abs/focus')
}

console.log('kenosNativeBridge.test.mjs: ok')
