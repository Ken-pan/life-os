import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { AppBrand } from '../components/AppBrand'
import { ensureDeviceAuthorized } from '../lib/devices'
import {
  loadFinanceData,
  persistFinanceSetup,
  saveLocale,
  seedFinanceData,
} from '../lib/repo'
import { createDefaultData } from '../store/defaults'
import type { FinanceData } from '../types'
import { ensureFinanceSetup } from '../engine/financeSetup'
import { hydratePortfolioAllocationTarget } from '../lib/portfolioAllocationPrefs'
import {
  migrateLegacyIfCloudEmpty,
  syncLivePriceHistoryToCloud,
} from '../lib/localDataMigration'
import { savePortfolioAllocationTarget } from '../lib/repo'
import { FinanceProvider } from '../store/store'
import { TransactionsProvider } from '../store/transactions'
import { TimelineProvider } from '../store/timeline'
import { AppShell } from '../components/AppShell'
import {
  CACHE_SCOPES,
  clearAllCache,
  peekSessionUserId,
  readCache,
  writeCache,
} from '../lib/localCache'
import { createLifeOsAuth } from '@life-os/sync'
import { createFinanceCloudSync } from '../lib/cloudSync'
import { bindPwaForegroundResume } from '@life-os/theme'
import { useLocale } from '../i18n/context'
import { DEFAULT_LOCALE, readStoredLocale, type AppLocale } from '../i18n/types'

type Phase =
  | 'loading'
  | 'config-missing'
  | 'signed-out'
  | 'device-limit'
  | 'ready'

const bootUserId = isSupabaseConfigured ? peekSessionUserId() : null
const bootData = bootUserId
  ? readCache<FinanceData>(CACHE_SCOPES.finance, bootUserId)
  : null

function LocaleSync({ locale }: { locale?: AppLocale }) {
  const { setLocale } = useLocale()
  useEffect(() => {
    if (!locale) return
    const stored = readStoredLocale()
    // Respect explicit local preference; avoid reverting after in-app language switch.
    if (stored !== DEFAULT_LOCALE && stored !== locale) return
    setLocale(locale)
  }, [locale, setLocale])
  return null
}

export function AuthGate() {
  const { t, setLocale } = useLocale()
  const [phase, setPhase] = useState<Phase>(() =>
    !isSupabaseConfigured ? 'config-missing' : bootData ? 'ready' : 'loading',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [initialData, setInitialData] = useState<FinanceData | null>(bootData)
  const [dataEpoch, setDataEpoch] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const runId = useRef(0)
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const dataSigRef = useRef<string>(bootData ? JSON.stringify(bootData) : '')

  const handleLocaleChange = useCallback((locale: AppLocale) => {
    if (phaseRef.current !== 'ready') return
    void saveLocale(locale).catch((e) => {
      console.warn('[finance] 保存语言偏好失败：', e)
    })
    setInitialData((prev) => (prev ? { ...prev, locale } : prev))
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AppLocale>).detail
      if (detail) handleLocaleChange(detail)
    }
    window.addEventListener('fos-locale-change', handler)
    return () => window.removeEventListener('fos-locale-change', handler)
  }, [handleLocaleChange])

  const applyData = useCallback(
    (data: FinanceData) => {
      const sig = JSON.stringify(data)
      if (sig === dataSigRef.current) return
      dataSigRef.current = sig
      setInitialData(data)
      setDataEpoch((e) => e + 1)
      if (data.locale) setLocale(data.locale)
    },
    [setLocale],
  )

  const performLoad = useCallback(async (): Promise<string | null> => {
    const myRun = ++runId.current
    const check = await ensureDeviceAuthorized()
    if (myRun !== runId.current) return null
    if (check.status === 'limit-reached') {
      setPhase('device-limit')
      return null
    }
    let data = await loadFinanceData()
    if (myRun !== runId.current) return null
    if (!data) {
      const legacyMigrate = await migrateLegacyIfCloudEmpty()
      if (legacyMigrate.migrated) {
        console.info(
          '[finance] 已从本机遗留数据 finance_os_v1 初始化云端：',
          legacyMigrate.summary,
        )
        data = await loadFinanceData()
        if (myRun !== runId.current) return null
      }
    }
    if (!data) {
      data = createDefaultData()
      await seedFinanceData(data)
    }
    const setup = ensureFinanceSetup(data)
    if (setup.changed) {
      if (setup.notes.length > 0) {
        console.info('[finance] 启动校准：', setup.notes.join('；'))
      }
      await persistFinanceSetup(setup.data)
      data = setup.data
    }
    const hydrated = hydratePortfolioAllocationTarget(data)
    data = hydrated.data
    if (hydrated.shouldUploadLocal && data.portfolioAllocationTarget) {
      try {
        await savePortfolioAllocationTarget(data.portfolioAllocationTarget)
      } catch (e) {
        console.warn('[finance] 本机资产配置目标上传云端失败：', e)
      }
    }
    void syncLivePriceHistoryToCloud().catch((e) => {
      console.warn('[finance] 本机实时价轨迹同步云端失败：', e)
    })
    if (myRun !== runId.current) return null
    const userId = peekSessionUserId()
    if (userId) writeCache(CACHE_SCOPES.finance, userId, data)
    applyData(data)
    setError(null)
    setPhase('ready')
    return userId
  }, [applyData])

  const cloudSync = useMemo(
    () => createFinanceCloudSync(performLoad),
    [performLoad],
  )
  const { syncBidirectional, scheduleBidirectionalSync, resetCooldown } =
    cloudSync

  const sync = useCallback(
    async (silent: boolean) => {
      try {
        if (silent && phaseRef.current === 'ready') {
          await scheduleBidirectionalSync()
          return
        }
        await syncBidirectional({ force: true, silent: false })
      } catch (e) {
        if (silent && phaseRef.current === 'ready') {
          console.error('[auth] 后台刷新失败，继续使用本地缓存：', e)
          return
        }
        setError(e instanceof Error ? e.message : t('auth.initFailed'))
        setPhase('signed-out')
      }
    },
    [scheduleBidirectionalSync, syncBidirectional, t],
  )

  useEffect(() => {
    if (!isSupabaseConfigured) return
    return bindPwaForegroundResume({
      onForeground: () => {
        if (phaseRef.current === 'ready') void scheduleBidirectionalSync()
      },
    })
  }, [scheduleBidirectionalSync])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const lifeOsAuth = createLifeOsAuth(supabase, {
      appId: 'finance',
      onSession: (sess) => {
        setSession(sess)
        // 任意事件下 session 为空即清理（含冷启动未登录），与 SIGNED_OUT 同路径
        if (!sess) {
          resetCooldown()
          clearAllCache()
          dataSigRef.current = ''
          setInitialData(null)
          setPhase('signed-out')
        }
      },
      // silent 依据本地缓存相位（乐观启动），不采用 handler 按事件推导的 silent/force
      onSyncSession: () => sync(phaseRef.current === 'ready'),
    })
    return lifeOsAuth.init()
  }, [resetCooldown, sync])

  if (phase === 'loading') return <Centered>{t('common.loading')}</Centered>

  if (phase === 'config-missing') {
    return (
      <Centered>
        <div className="auth-card">
          <h1 className="auth-card__title">{t('auth.configMissingTitle')}</h1>
          <p className="auth-card__hint">{t('auth.configMissingHint')}</p>
        </div>
      </Centered>
    )
  }

  if (phase === 'device-limit') {
    return (
      <Centered>
        <div className="auth-card">
          <h1 className="auth-card__title">{t('auth.deviceLimitTitle')}</h1>
          <p className="auth-card__hint">{t('auth.deviceLimitHint')}</p>
          <button
            type="button"
            className="btn"
            onClick={() => supabase.auth.signOut()}
          >
            {t('auth.signOut')}
          </button>
        </div>
      </Centered>
    )
  }

  if (phase === 'ready' && initialData) {
    return (
      <FinanceProvider key={dataEpoch} initialData={initialData}>
        <LocaleSync locale={initialData.locale} />
        <TransactionsProvider>
          <TimelineProvider>
            <AppShell />
          </TimelineProvider>
        </TransactionsProvider>
      </FinanceProvider>
    )
  }

  return <LoginScreen error={error} session={session} />
}

function LoginScreen({
  error,
  session,
}: {
  error: string | null
  session: Session | null
}) {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)
  const verifying = Boolean(session)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setLocalErr(null)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (err) setLocalErr(t('auth.loginFailed'))
  }

  return (
    <Centered>
      <form className="auth-card" onSubmit={submit}>
        <AppBrand variant="auth" className="auth-card__brand" />
        <p className="auth-card__hint">{t('auth.loginHint')}</p>
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder={t('auth.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn" type="submit" disabled={busy || verifying}>
          {busy
            ? t('auth.loggingIn')
            : verifying
              ? t('auth.verifyingDevice')
              : t('auth.login')}
        </button>
        {(localErr || error) && (
          <p className="text-critical">{localErr ?? error}</p>
        )}
      </form>
    </Centered>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="auth-screen">{children}</div>
}

/** 设置页切换语言时通知 AuthGate 持久化到云端。 */
export function notifyLocalePersist(locale: AppLocale): void {
  window.dispatchEvent(new CustomEvent('fos-locale-change', { detail: locale }))
}
