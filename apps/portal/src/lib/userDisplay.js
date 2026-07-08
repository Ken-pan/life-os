/**
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function getUserInitial(email) {
  const value = email?.trim() || ''
  if (!value) return '?'
  return value.charAt(0).toUpperCase()
}

/**
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function abbreviateEmail(email) {
  const value = email?.trim() || ''
  if (!value) return ''
  const at = value.indexOf('@')
  if (at <= 0) return value
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (local.length <= 2) return value
  return `${local.slice(0, 2)}…@${domain}`
}
