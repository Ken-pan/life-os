import { sendDueReminderPushes } from '../../server/sendReminderPushes.mjs'

export default async () => {
  try {
    const result = await sendDueReminderPushes()
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 503,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        reason: err instanceof Error ? err.message : 'unknown_error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

export const config = {
  schedule: '*/5 * * * *',
}
