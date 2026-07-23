import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { selectDueReminderJobs } from './reminderSchedule.mjs'
import { readSupabaseServiceRoleKey, readSupabaseUrl, readVapidKeys } from './pushEnv.mjs'

/** @param {unknown} row */
function notificationsEnabledFromState(row) {
  const payload = row?.payload
  const settings = payload?.settings
  if (settings && typeof settings.notificationsEnabled === 'boolean') {
    return settings.notificationsEnabled
  }
  return Boolean(payload?.notificationsEnabled)
}

/**
 * Scan subscribed users and send due task reminders via Web Push.
 * @returns {Promise<{ ok: boolean, reason?: string, sent?: number, expired?: number }>}
 */
export async function sendDueReminderPushes() {
  const url = readSupabaseUrl()
  const serviceKey = readSupabaseServiceRoleKey()
  const vapid = readVapidKeys()
  if (!url || !serviceKey) return { ok: false, reason: 'supabase_not_configured' }
  if (!vapid) return { ok: false, reason: 'vapid_not_configured' }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: subscriptions, error: subErr } = await supabase
    .from('planner_push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
  if (subErr) return { ok: false, reason: subErr.message }

  /** @type {Map<string, { endpoint: string, p256dh: string, auth: string }[]>} */
  const subsByUser = new Map()
  for (const row of subscriptions ?? []) {
    const list = subsByUser.get(row.user_id) ?? []
    list.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth })
    subsByUser.set(row.user_id, list)
  }

  let sent = 0
  let expired = 0
  const now = Date.now()

  for (const [userId, subs] of subsByUser) {
    const { data: stateRow } = await supabase
      .from('planner_user_state')
      .select('payload')
      .eq('user_id', userId)
      .maybeSingle()
    if (!notificationsEnabledFromState(stateRow)) continue

    const { data: taskRows, error: taskErr } = await supabase
      .from('planner_tasks')
      .select('id, data')
      .eq('user_id', userId)
    if (taskErr) continue

    const tasks = (taskRows ?? []).map((row) => ({ id: row.id, ...row.data }))
    const jobs = selectDueReminderJobs(tasks, { now })

    for (const job of jobs) {
      const { data: existing } = await supabase
        .from('planner_reminder_push_log')
        .select('task_id')
        .eq('user_id', userId)
        .eq('task_id', job.id)
        .eq('fire_at', job.fireAt)
        .maybeSingle()
      if (existing) continue

      const payload = JSON.stringify({
        title: 'Kenos Plan 提醒',
        body: job.title,
        taskId: job.id,
        url: `/?task=${encodeURIComponent(job.id)}`,
      })

      let delivered = false
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            { TTL: 86400 },
          )
          delivered = true
        } catch (err) {
          const status = /** @type {{ statusCode?: number }} */ (err)?.statusCode
          if (status === 404 || status === 410) {
            expired += 1
            await supabase
              .from('planner_push_subscriptions')
              .delete()
              .eq('user_id', userId)
              .eq('endpoint', sub.endpoint)
          }
        }
      }

      if (delivered) {
        sent += 1
        await supabase.from('planner_reminder_push_log').insert({
          user_id: userId,
          task_id: job.id,
          fire_at: job.fireAt,
        })
      }
    }
  }

  return { ok: true, sent, expired }
}
