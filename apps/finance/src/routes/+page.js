import { redirect } from '@sveltejs/kit'

export const prerender = false

/** Bare `/` has no matching route file; always land on the home/today hub. */
export function load() {
  throw redirect(307, '/home/today')
}
