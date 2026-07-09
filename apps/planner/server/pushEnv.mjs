/** @returns {string | undefined} */
export function readEnv(name) {
  const env = globalThis.process?.env
  if (!env) return undefined
  return env[name]
}

export function readSupabaseUrl() {
  return readEnv('PUBLIC_SUPABASE_URL') || readEnv('VITE_SUPABASE_URL')
}

export function readSupabaseServiceRoleKey() {
  return readEnv('SUPABASE_SERVICE_ROLE_KEY')
}

export function readVapidKeys() {
  const publicKey = readEnv('PUBLIC_VAPID_PUBLIC_KEY') || readEnv('VITE_VAPID_PUBLIC_KEY')
  const privateKey = readEnv('VAPID_PRIVATE_KEY')
  const subject =
    readEnv('VAPID_SUBJECT') || readEnv('PUBLIC_VAPID_SUBJECT') || 'mailto:hello@kenos.space'
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}
