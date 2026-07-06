import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export function load({ url }) {
  const date = url.searchParams.get('date');
  const params = new URLSearchParams({ view: 'timeline' });
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    params.set('date', date);
  }
  redirect(307, `/?${params.toString()}`);
}
