<script module>
  const LOCALE_CHANGE_EVENT = 'fos-locale-change'

  /** 设置页切换语言时调用，通知 AuthGate 持久化到云端。 */
  export function notifyLocalePersist(locale) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: locale }))
  }
</script>

<script>
  import { onMount } from 'svelte'
  import { isSupabaseConfigured } from '$lib/supabase.js'
  import { ensureDeviceAuthorized } from '$lib/devices'
  import {
    loadFinanceData,
    persistFinanceSetup,
    saveLocale,
    savePortfolioAllocationTarget,
    seedFinanceData,
  } from '$lib/repo'
  import { hydratePortfolioAllocationTarget } from '$lib/portfolioAllocationPrefs'
  import { migrateLegacyIfCloudEmpty, syncLivePriceHistoryToCloud } from '$lib/localDataMigration'
  import {
    CACHE_SCOPES,
    clearAllCache,
    peekSessionUserId,
    readCache,
    writeCache,
  } from '$lib/localCache'
  import { createFinanceCloudSync } from '$lib/cloudSync'
  import {
    auth,
    initAuth,
    signIn,
    signOut,
    authErrorMessage,
    registerAuthHandlers,
  } from '$lib/auth.svelte.js'
  import { bindPwaForegroundResume } from '@life-os/theme'
  import { createDefaultData } from '@life-os/finance-core/defaults'
  import { ensureFinanceSetup } from '$lib/engine/financeSetup'
  import { DEFAULT_LOCALE, readStoredLocale } from '@life-os/finance-core/i18n/types'
  import { t, locale, setLocale } from '$lib/i18n.svelte.js'
  import AppBrand from '@life-os/platform-web/svelte/brand'
  import FinanceProviders from './FinanceProviders.svelte'

  /** @type {{ children?: import('svelte').Snippet }} */
  let { children } = $props()

  const bootUserId = isSupabaseConfigured ? peekSessionUserId() : null
  const bootData = bootUserId ? readCache(CACHE_SCOPES.finance, bootUserId) : null

  /** @type {'loading' | 'config-missing' | 'signed-out' | 'device-limit' | 'ready'} */
  let phase = $state(!isSupabaseConfigured ? 'config-missing' : bootData ? 'ready' : 'loading')
  let initialData = $state(bootData)
  let dataEpoch = $state(0)
  let error = $state(null)

  let runId = 0
  let dataSig = bootData ? JSON.stringify(bootData) : ''

  function applyData(data) {
    const sig = JSON.stringify(data)
    if (sig === dataSig) return
    dataSig = sig
    initialData = data
    dataEpoch += 1
    if (data.locale && data.locale !== locale()) setLocale(data.locale)
  }

  /** @returns {Promise<string | null>} */
  async function performLoad() {
    const myRun = ++runId
    const check = await ensureDeviceAuthorized()
    if (myRun !== runId) return null
    if (check.status === 'limit-reached') {
      phase = 'device-limit'
      return null
    }
    let data = await loadFinanceData()
    if (myRun !== runId) return null
    if (!data) {
      const legacyMigrate = await migrateLegacyIfCloudEmpty()
      if (legacyMigrate.migrated) {
        console.info('[finance] 已从本机遗留数据 finance_os_v1 初始化云端：', legacyMigrate.summary)
        data = await loadFinanceData()
        if (myRun !== runId) return null
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
    if (myRun !== runId) return null
    const userId = peekSessionUserId()
    if (userId) writeCache(CACHE_SCOPES.finance, userId, data)
    applyData(data)
    error = null
    phase = 'ready'
    return userId
  }

  const { syncBidirectional, scheduleBidirectionalSync, resetCooldown } =
    createFinanceCloudSync(performLoad)

  /** @param {boolean} silent */
  async function sync(silent) {
    try {
      if (silent && phase === 'ready') {
        await scheduleBidirectionalSync()
        return
      }
      await syncBidirectional({ force: true, silent: false })
    } catch (e) {
      if (silent && phase === 'ready') {
        console.error('[auth] 后台刷新失败，继续使用本地缓存：', e)
        return
      }
      error = e instanceof Error ? e.message : t('auth.initFailed')
      phase = 'signed-out'
    }
  }

  // 注册数据加载 / 同步的生命周期钩子；registerAuthHandlers 只更新闭包变量，
  // 只要在 initAuth() 真正触发第一个 auth 事件之前调用即可（onMount 内先注册再 init）。
  registerAuthHandlers({
    onSignedOut: () => {
      resetCooldown()
      clearAllCache()
      dataSig = ''
      initialData = null
      phase = 'signed-out'
    },
    // silent 依据本地缓存相位（乐观启动），不采用事件推导的 silent/force
    onSyncSession: () => sync(phase === 'ready'),
  })

  onMount(() => {
    const handleLocaleEvent = (e) => {
      const nextLocale = e.detail
      if (!nextLocale || phase !== 'ready') return
      if (initialData?.locale === nextLocale) return
      void saveLocale(nextLocale).catch((e) => {
        console.warn('[finance] 保存语言偏好失败：', e)
      })
      if (initialData) initialData = { ...initialData, locale: nextLocale }
    }
    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleEvent)

    if (!isSupabaseConfigured) {
      return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleEvent)
    }

    const cleanupForeground = bindPwaForegroundResume({
      onForeground: () => {
        if (phase === 'ready') void scheduleBidirectionalSync()
      },
    })
    const cleanupAuth = initAuth()

    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleEvent)
      cleanupForeground()
      cleanupAuth()
    }
  })

  // 云端 locale 到达时同步激活；若用户已在本地显式切换过语言，则不覆盖。
  $effect(() => {
    const cloudLocale = initialData?.locale
    if (!cloudLocale || cloudLocale === locale()) return
    const stored = readStoredLocale()
    if (stored !== DEFAULT_LOCALE && stored !== cloudLocale) return
    setLocale(cloudLocale)
  })

  let email = $state('')
  let password = $state('')
  let busy = $state(false)
  let localErr = $state(null)
  const verifying = $derived(Boolean(auth.session))

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    busy = true
    localErr = null
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      localErr = authErrorMessage(err)
    }
    busy = false
  }
</script>

{#if phase === 'loading'}
  <div class="auth-screen">{t('common.loading')}</div>
{:else if phase === 'config-missing'}
  <div class="auth-screen">
    <div class="auth-card">
      <h1 class="auth-card__title">{t('auth.configMissingTitle')}</h1>
      <p class="auth-card__hint">{t('auth.configMissingHint')}</p>
    </div>
  </div>
{:else if phase === 'device-limit'}
  <div class="auth-screen">
    <div class="auth-card">
      <h1 class="auth-card__title">{t('auth.deviceLimitTitle')}</h1>
      <p class="auth-card__hint">{t('auth.deviceLimitHint')}</p>
      <button type="button" class="btn" onclick={() => signOut()}>
        {t('auth.signOut')}
      </button>
    </div>
  </div>
{:else if phase === 'ready' && initialData}
  {#key dataEpoch}
    <FinanceProviders data={initialData}>
      {@render children?.()}
    </FinanceProviders>
  {/key}
{:else}
  <div class="auth-screen">
    <form class="auth-card" onsubmit={submit}>
      <AppBrand appId="finance" variant="auth" class="auth-card__brand" />
      <p class="auth-card__hint">{t('auth.loginHint')}</p>
      <input
        class="input"
        type="email"
        inputmode="email"
        autocomplete="username"
        placeholder={t('auth.email')}
        bind:value={email}
        required
      />
      <input
        class="input"
        type="password"
        autocomplete="current-password"
        placeholder={t('auth.password')}
        bind:value={password}
        required
      />
      <button class="btn" type="submit" disabled={busy || verifying}>
        {busy ? t('auth.loggingIn') : verifying ? t('auth.verifyingDevice') : t('auth.login')}
      </button>
      {#if localErr || error}
        <p class="text-critical">{localErr ?? error}</p>
      {/if}
    </form>
  </div>
{/if}
