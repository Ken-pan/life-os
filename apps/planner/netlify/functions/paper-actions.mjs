import { verifyPaperToken, dryRunActions, applyActions } from '../../server/paperService.mjs';
import { readEnv } from '../../server/pushEnv.mjs';

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

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), {
      status: 400,
      headers
    });
  }

  // Validate payload structures
  if (!body.deviceId || !body.clientBatchId || !Array.isArray(body.actions)) {
    return new Response(JSON.stringify({
      error: 'validation_failed',
      message: 'deviceId, clientBatchId, and actions (array) are required fields.'
    }), {
      status: 400,
      headers
    });
  }

  try {
    // Check if real writes are enabled
    const writeEnabled = readEnv('PAPER_ACTIONS_WRITE_ENABLED') === 'true';

    let responseBody;
    if (writeEnabled) {
      // Real writes enabled: apply actions with idempotency tracking
      responseBody = await applyActions(userId, body);
    } else {
      // Real writes disabled: dry-run mode for safety
      responseBody = await dryRunActions(userId, body);
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'bad_request', message: err.message }), {
      status: 400,
      headers
    });
  }
};

export const config = { path: '/api/paper/actions' };
