/**
 * 诊断 triage 读源:一次拉齐 崩溃 / 错误日志 / bug / 处置状态,喂给 diagnosticsModel。
 * 全部只读(处置写在 diagnosticsStore 单独走)。owner-only,未登录直接返回空。
 */
import { CLOUD, isCloudAuthorized } from '$lib/cloud.svelte.js'
import { supabase as aiosSupabase } from '$lib/supabase.js'
import { guardReadOnlyClient } from '$lib/kenos/prodWriteGuard.core.js'
import { buildDiagnosticsModel } from './diagnosticsModel.core.js'

const CRASH_LIMIT = 400
const LOG_LIMIT = 500
const BUG_LIMIT = 200
const RES_LIMIT = 1000

function publicClient() {
  return guardReadOnlyClient(aiosSupabase.schema('public'), import.meta.env)
}

/**
 * @param {{ sinceDays?: number, now?: number }} [opts]
 * @returns {Promise<{ ok: boolean, model: object|null, error?: string, reason?: string }>}
 */
export async function readDiagnostics({ sinceDays = 30, now = Date.now() } = {}) {
  if (!isCloudAuthorized()) {
    return { ok: false, model: null, reason: 'unauthorized' }
  }
  const online =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  if (!online) return { ok: false, model: null, reason: 'offline' }

  const sinceIso = new Date(now - sinceDays * 86_400_000).toISOString()
  const sb = publicClient()
  try {
    const [crashRes, logRes, bugRes, resRes] = await Promise.all([
      sb
        .from('kenos_crash_events')
        .select(
          'id,logged_at,created_at,level,message,event,kind,fingerprint,signal_name,exception_name,top_frames,app_build,build_version,session_build,ctx_domain,ctx_space,ctx_path,device_model,system_version,metadata',
        )
        .gte('logged_at', sinceIso)
        .order('logged_at', { ascending: false })
        .limit(CRASH_LIMIT),
      sb
        .from('kenos_app_logs')
        .select('id,logged_at,created_at,level,category,message,metadata')
        .in('level', ['error', 'fault'])
        .neq('category', 'diagnostics')
        .gte('logged_at', sinceIso)
        .order('logged_at', { ascending: false })
        .limit(LOG_LIMIT),
      sb
        .from('bug_logs')
        .select(
          'id,app,route,title,notes,screenshot_path,severity,status,console_summary,error_message,error_stack,created_at,updated_at',
        )
        .order('created_at', { ascending: false })
        .limit(BUG_LIMIT),
      sb
        .from('kenos_issue_resolutions')
        .select('issue_type,issue_key,status,note,updated_at')
        .limit(RES_LIMIT),
    ])

    // 崩溃 view / bug 表任一挂了都还想显示其余段,单段失败降级为空。
    const firstError =
      (crashRes.error && `crash: ${crashRes.error.message}`) ||
      (bugRes.error && `bug: ${bugRes.error.message}`) ||
      ''

    const model = buildDiagnosticsModel({
      crashes: crashRes.data ?? [],
      logs: logRes.data ?? [],
      bugs: bugRes.data ?? [],
      resolutions: resRes.data ?? [],
    })
    return {
      ok: true,
      model,
      error: firstError || undefined,
      partial: Boolean(
        crashRes.error || logRes.error || bugRes.error || resRes.error,
      ),
    }
  } catch (error) {
    return {
      ok: false,
      model: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 处置写:崩溃/日志 upsert kenos_issue_resolutions;bug 更新 bug_logs.status。 */
export async function writeIssueResolution(row) {
  const sb = publicClient()
  const { error } = await sb
    .from('kenos_issue_resolutions')
    .upsert(row, { onConflict: 'user_id,issue_type,issue_key' })
  if (error) throw error
}

export async function writeBugResolution(id, patch) {
  const sb = publicClient()
  const { error } = await sb
    .from('bug_logs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', CLOUD.user?.id ?? '')
  if (error) throw error
}
