import assert from 'node:assert/strict'
import {
  MAX_TRUSTED_DEVICES,
  buildTrustedDeviceLabel,
  filterActiveTrustedDevices,
  findTrustedDeviceSlot,
  getOrCreateTrustedDeviceId,
  isLifeOsPersonalOwnerEmail,
  isThisTrustedDeviceSlot,
  resolveDeviceClass,
  LIFE_OS_PERSONAL_OWNER_EMAIL,
} from '../src/index.js'

assert.equal(MAX_TRUSTED_DEVICES, 2)
assert.equal(resolveDeviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS)'), 'mobile')
assert.equal(resolveDeviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X)'), 'desktop')
assert.equal(isLifeOsPersonalOwnerEmail(LIFE_OS_PERSONAL_OWNER_EMAIL), true)
assert.equal(isLifeOsPersonalOwnerEmail('other@example.com'), false)

const storage = {
  map: new Map(),
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null
  },
  setItem(k, v) {
    this.map.set(k, v)
  },
}
const id1 = getOrCreateTrustedDeviceId(storage)
const id2 = getOrCreateTrustedDeviceId(storage)
assert.equal(id1, id2)

const devices = [
  { id: '1', device_class: 'desktop', device_id: 'd1', revoked_at: null },
  { id: '2', device_class: 'mobile', device_id: 'm1', revoked_at: '2026-01-01T00:00:00Z' },
]
assert.equal(filterActiveTrustedDevices(devices).length, 1)
assert.equal(findTrustedDeviceSlot(devices, { deviceId: 'd1', deviceClass: 'desktop' })?.id, '1')
assert.equal(
  findTrustedDeviceSlot(devices, { deviceId: 'new', deviceClass: 'mobile' }),
  null,
  'revoked mobile slot must not match',
)

assert.equal(
  isThisTrustedDeviceSlot({ device_id: 'd1', device_class: 'desktop' }, {
    deviceId: 'd1',
    deviceClass: 'desktop',
  }),
  true,
)
assert.ok(buildTrustedDeviceLabel('Mozilla/5.0 (iPhone) Safari/605').includes('iPhone'))

console.log('trustedDevices.test.mjs — OK')
