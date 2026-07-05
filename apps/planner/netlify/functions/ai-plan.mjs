import { handleAiPlan } from '../../server/aiPlan.mjs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const result = await handleAiPlan(process.env.KIMI_API_KEY, payload, {
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer')
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/ai/plan' };
