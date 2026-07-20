/** @type {import('./$types').PageLoad} */
export function load({ params }) {
  const id = params.id
  if (!['a', 'b', 'c'].includes(id)) {
    return { id: 'a', invalid: true }
  }
  return { id, invalid: false }
}
