export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), {
      status: 400,
      headers
    });
  }

  // Validate heartbeat body parameters
  if (
    typeof body.battery !== 'number' ||
    typeof body.onlineState !== 'string' ||
    typeof body.queueDepth !== 'number' ||
    typeof body.appVersion !== 'string' ||
    typeof body.osVersion !== 'string'
  ) {
    return new Response(JSON.stringify({
      error: 'validation_failed',
      message: 'battery (number), onlineState (string), queueDepth (number), appVersion (string), and osVersion (string) are required fields.'
    }), {
      status: 400,
      headers
    });
  }

  const responseBody = {
    status: "ok",
    serverTime: new Date().toISOString()
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers
  });
};

export const config = { path: '/api/paper/mock/heartbeat' };
