import { redirect } from '@sveltejs/kit'

/** Home OS routes that should not 404 on the Portal origin. */
const HOME_OS_PREFIXES = ['/storage', '/plan', '/settings']

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const { pathname, search } = event.url

  if (
    HOME_OS_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    redirect(302, `https://home.kenos.space${pathname}${search}`)
  }

  return resolve(event)
}
