import { redirect } from '@sveltejs/kit'

/** Legacy / alias → Calendar (Domain dock + Continuity). */
/** @type {import('./$types').PageLoad} */
export function load() {
  redirect(308, '/calendar')
}
