import { redirect } from '@sveltejs/kit'

/** @type {import('./$types').PageLoad} */
export function load({ url }) {
  const date = url.searchParams.get('date')
  const params = new URLSearchParams()
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    params.set('date', date)
  }
  const qs = params.toString()
  redirect(307, qs ? `/calendar?${qs}` : '/calendar')
}
