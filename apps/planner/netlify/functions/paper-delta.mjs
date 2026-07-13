import { verifyPaperToken, loadPaperDelta } from '../../server/paperService.mjs';
import { readEnv } from '../../server/pushEnv.mjs';

export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers
    });
  }

  if (!verifyPaperToken(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers
    });
  }

  const userId = readEnv('PAPER_DEVICE_USER_ID');
  if (!userId) {
    return new Response(JSON.stringify({ error: 'misconfigured_server', message: 'PAPER_DEVICE_USER_ID is missing.' }), {
      status: 500,
      headers
    });
  }

  const url = new URL(req.url);
  const cursorParam = url.searchParams.get('cursor');
  const cursor = cursorParam ? parseInt(cursorParam, 10) : 0;

  if (isNaN(cursor)) {
    return new Response(JSON.stringify({ error: 'bad_request', message: 'cursor must be an integer' }), {
      status: 400,
      headers
    });
  }

  try {
    const deltaData = await loadPaperDelta(userId, cursor);
    return new Response(JSON.stringify(deltaData), {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'server_error', message: err.message }), {
      status: 500,
      headers
    });
  }
};

export const config = { path: '/api/paper/delta' };
