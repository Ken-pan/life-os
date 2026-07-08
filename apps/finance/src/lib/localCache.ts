import { createLocalCache } from '@life-os/platform-web/local-cache'
import { LIFE_OS_AUTH_STORAGE_KEY } from '@life-os/sync'

const cache = createLocalCache({
  prefix: 'fos_cache',
  authStorageKey: LIFE_OS_AUTH_STORAGE_KEY,
})

export const { readCache, writeCache, clearAllCache, peekSessionUserId } = cache

export const CACHE_SCOPES = {
  finance: 'finance',
  txns: 'txns',
  occurrences: 'occ',
  assertions: 'assert',
} as const
