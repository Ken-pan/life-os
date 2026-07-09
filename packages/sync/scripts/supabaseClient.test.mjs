import assert from 'node:assert/strict'
import {
  createLifeOsSupabaseClient,
  resetLifeOsSupabaseClientCache,
} from '../src/supabaseClient.js'

function fakeCreateClient(url, key, options) {
  return {
    url,
    key,
    options,
    auth: { getSession: async () => ({ data: { session: null } }) },
  }
}

resetLifeOsSupabaseClientCache()

const env = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-test',
}

const first = createLifeOsSupabaseClient(fakeCreateClient, { env, productionFallback: false })
const second = createLifeOsSupabaseClient(fakeCreateClient, { env, productionFallback: false })

assert.equal(first.supabase, second.supabase, 'browser singleton should reuse client')
assert.equal(first, second, 'result object should be cached')

const music = createLifeOsSupabaseClient(fakeCreateClient, {
  env,
  schema: 'music',
  productionFallback: false,
})
assert.notEqual(music.supabase, first.supabase, 'different schema should get separate client')

resetLifeOsSupabaseClientCache()
console.log('supabaseClient singleton: ok')
