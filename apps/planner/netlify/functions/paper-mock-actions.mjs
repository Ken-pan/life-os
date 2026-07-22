import { paperMockDisabledResponse } from './_paperMockGuard.mjs'

export default async (req) => {
  const _disabled = paperMockDisabledResponse()
  if (_disabled) return _disabled
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

  // Validate request schema
  if (!body.deviceId || !body.clientBatchId || !Array.isArray(body.actions)) {
    return new Response(JSON.stringify({
      error: 'validation_failed',
      message: 'deviceId, clientBatchId, and actions (array) are required fields.'
    }), {
      status: 400,
      headers
    });
  }

  const actions = body.actions;
  const applied = actions.map(act => act.clientActionId).filter(Boolean);

  const responseBody = {
    batchStatus: "applied",
    applied,
    conflicts: [],
    newCursor: String(Date.now())
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers
  });
};

export const config = { path: '/api/paper/mock/actions' };
