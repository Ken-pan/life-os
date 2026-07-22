// F5-04.4: the paper-mock-* endpoints return fake "applied" success with zero
// persistence. They are dev/test scaffolding and must NOT be reachable as a
// silent fake-success path in production. Gated behind an explicit env flag;
// disabled (404) by default. Files starting with "_" are not deployed as
// Netlify functions, so this stays an import-only helper.
export function paperMockDisabledResponse() {
  if (process.env.PAPER_MOCK_ENABLED === '1') return null
  return new Response(JSON.stringify({ error: 'not_found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}
