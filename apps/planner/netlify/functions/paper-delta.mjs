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
  const cursorStr = url.searchParams.get('cursor');
  if (!cursorStr) {
    return new Response(JSON.stringify({ error: 'bad_request', message: 'cursor parameter is required.' }), {
      status: 400,
      headers
    });
  }

  const cursorMs = Number(cursorStr);
  if (isNaN(cursorMs)) {
    return new Response(JSON.stringify({ error: 'bad_request', message: 'cursor must be a valid number representation.' }), {
      status: 400,
      headers
    });
  }

  try {
    const data = await loadPaperDelta(userId, cursorMs);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', message: err.message }), {
      status: 500,
      headers
    });
  }
};

export const config = { path: '/api/paper/delta' };
