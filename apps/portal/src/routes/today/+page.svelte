<script>
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import { auth } from '$lib/auth.svelte.js'
  import {
    buildPortalTodayRedirectUrl,
    isPortalTodayRedirectCohortMember,
    isPortalTodayRedirectEnabled,
    KENOS_TODAY_ORIGIN,
  } from '$lib/kenosStrangler.js'

  const redirectEnabled = $derived(isPortalTodayRedirectEnabled())
  const email = $derived(auth.session?.user?.email ?? null)
  const inCohort = $derived(isPortalTodayRedirectCohortMember(email))
  const targetUrl = $derived(
    buildPortalTodayRedirectUrl({
      search: page.url.search,
      hash: page.url.hash,
    }),
  )
  const status = $derived.by(() => {
    if (!browser) return 'checking'
    if (!auth.ready) return 'waiting_auth'
    if (redirectEnabled && inCohort && auth.session?.user) return 'redirecting'
    if (!redirectEnabled) return 'disabled'
    if (!auth.session?.user) return 'signin'
    return 'denied'
  })

  $effect(() => {
    if (!browser || status !== 'redirecting') return
    window.location.replace(targetUrl)
  })
</script>

<section class="portal-today-redirect" aria-live="polite">
  {#if status === 'redirecting' || status === 'waiting_auth' || status === 'checking'}
    <p>正在前往 Korben Today…</p>
  {:else if status === 'signin'}
    <h1>Korben Today</h1>
    <p>登录后可进入 Owner 限定 soft-redirect。</p>
    <p><a href="/">返回 Portal</a></p>
  {:else if status === 'denied'}
    <h1>Korben Today</h1>
    <p>当前账号不在 Portal Today soft-redirect cohort。</p>
    <p><a href="/">返回 Portal</a> · <a href={targetUrl || KENOS_TODAY_ORIGIN + '/'}>手动打开 Korben Today</a></p>
  {:else}
    <h1>Korben Today</h1>
    <p>Portal → Korben Today soft-redirect 默认关闭（可回滚）。</p>
    <p><a href="/">返回 Portal</a> · <a href={targetUrl || KENOS_TODAY_ORIGIN + '/'}>打开 Korben Today</a></p>
  {/if}
</section>

<style>
  .portal-today-redirect {
    max-width: 40rem;
    margin: 3rem auto;
    padding: 1.5rem;
    line-height: 1.5;
  }
</style>
