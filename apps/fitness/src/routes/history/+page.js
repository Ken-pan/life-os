import { redirect } from '@sveltejs/kit'

/** Domain dock + legacy deep link → Discover Records. */
/** @type {import('./$types').PageLoad} */
export function load() {
  redirect(308, '/discover/records')
}
