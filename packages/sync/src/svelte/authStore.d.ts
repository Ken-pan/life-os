import type {
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js'

export interface AppAuthState {
  user: User | null
  session: Session | null
  ready: boolean
  allowedAppKeys: string[] | null
}

/** 缺省 zh auth 错误文案；`errorLabels` 覆盖其中任意 key */
export declare const DEFAULT_AUTH_ERROR_LABELS: Record<string, string>

export interface CreateAppAuthStoreOptions {
  appId: 'finance' | 'fitness' | 'planner' | 'music' | 'portal' | 'home' | (string & {})
  /** 静态对象，或函数形式以便接 i18n（随 locale 切换实时求值）；缺省用内置 zh 文案 */
  errorLabels?: Record<string, string> | (() => Record<string, string>)
  onSignedOut?: () => void
  onSyncSession?: (payload: { force?: boolean }) => void | Promise<unknown>
  /** store 字段更新后的后置钩子（如 Finance 的空会话清理） */
  onSessionChange?: (session: Session | null) => void
}

export interface AppAuthStore {
  auth: AppAuthState
  /** SSR 安全：非浏览器环境为 no-op */
  initAuth: () => () => void
  authErrorMessage: (err: unknown) => string
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ needsConfirm: boolean; user: unknown }>
  signIn: (email: string, password: string) => Promise<unknown>
  signOut: () => Promise<void>
}

export function createAppAuthStore(
  supabase: SupabaseClient,
  options: CreateAppAuthStoreOptions,
): AppAuthStore
