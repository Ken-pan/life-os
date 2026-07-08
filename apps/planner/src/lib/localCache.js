import { createLocalCache } from '@life-os/platform-web/local-cache'

const cache = createLocalCache({ prefix: 'planos_cache' })

export const { readCache, writeCache, clearAllCache, peekSessionUserId } = cache

export const CACHE_SCOPES = {
  state: 'state',
}
