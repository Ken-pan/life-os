import { browser } from '$app/environment'
import {
  createLifeOsSupabaseClient,
  ensureLifeOsSsoReady,
  mapAuthErrorMessage,
  LIFE_OS_PERSONAL_OWNER_EMAIL,
} from '@life-os/sync'
import { createClient } from '@supabase/supabase-js'
import { t } from '$lib/i18n/index.js'

/**
 * Life OS 云端桥（照 AIOS 模式）：共享统一 Supabase 登录态，只读直读
 * Planner 的项目/任务表做「项目现状」联动。RLS 按 user_id 只放行本人数据；
 * 刻意不接 app_memberships 门禁 —— KnowledgeOS 是本地优先的个人 app，
 * 未登录一切照常，登录只是多了 Planner 联动。全部只读，绝不写 Planner 表。
 */

export const { supabase: sb, isSupabaseConfigured } = createLifeOsSupabaseClient(
  createClient,
  { env: import.meta.env },
)

export const CLOUD = $state({
  configured: isSupabaseConfigured,
  /** 登录态是否已从 Supabase 恢复完毕 */
  ready: false,
  /** @type {{ id: string, email: string } | null} */
  user: null,
  busy: false,
  error: '',
})

/** 云端联动门禁：个人数据只对 Life OS 本人开放。 */
export function isCloudAuthorized() {
  return (
    !!CLOUD.user &&
    CLOUD.user.email.toLowerCase() === LIFE_OS_PERSONAL_OWNER_EMAIL.toLowerCase()
  )
}

/** app 启动时调用：恢复共享登录态。 */
export async function initCloud() {
  if (!browser || !CLOUD.configured) {
    CLOUD.ready = true
    return
  }
  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user
    CLOUD.user = u ? { id: u.id, email: u.email ?? '' } : null
  })
  await ensureLifeOsSsoReady(sb)
  const { data } = await sb.auth.getSession()
  const u = data?.session?.user
  CLOUD.user = u ? { id: u.id, email: u.email ?? '' } : null
  CLOUD.ready = true
}

export async function signInCloud(email, password) {
  CLOUD.busy = true
  CLOUD.error = ''
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    return true
  } catch (err) {
    CLOUD.error = mapAuthErrorMessage(err, {
      invalidCredentials: t('cloud.errInvalidCredentials'),
      network: t('cloud.errNetwork'),
      generic: t('cloud.errGeneric'),
    })
    return false
  } finally {
    CLOUD.busy = false
  }
}

export async function signOutCloud() {
  CLOUD.busy = true
  try {
    await sb.auth.signOut()
  } finally {
    CLOUD.busy = false
    CLOUD.user = null
  }
}

/**
 * 拉取 Planner 快照（项目 + 任务，jsonb data 列直出）。
 * 未登录/未授权返回 null；网络错误抛出。
 * @returns {Promise<{ projects: object[], tasks: object[] } | null>}
 */
export async function fetchPlannerSnapshot() {
  if (!isCloudAuthorized()) return null
  const [projRes, taskRes] = await Promise.all([
    sb.from('planner_projects').select('data').limit(500),
    sb.from('planner_tasks').select('data').limit(5000),
  ])
  if (projRes.error) throw new Error(projRes.error.message)
  if (taskRes.error) throw new Error(taskRes.error.message)
  return {
    projects: (projRes.data ?? []).map((r) => r.data).filter(Boolean),
    tasks: (taskRes.data ?? []).map((r) => r.data).filter(Boolean),
  }
}
