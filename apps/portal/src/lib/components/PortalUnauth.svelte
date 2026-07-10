<script>
  import { getLifeOsBrand } from '@life-os/theme/brand'
  import BrandMark from '@life-os/platform-web/svelte/brand/mark'
  import { auth, signIn, authErrorMessage } from '$lib/auth.svelte.js'
  import { isSupabaseConfigured } from '$lib/supabase.js'

  const portalBrand = getLifeOsBrand('portal')

  let email = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state('')

  /** @param {SubmitEvent} event */
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    error = ''
    busy = true
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      error = authErrorMessage(err)
    } finally {
      busy = false
    }
  }
</script>

<div class="portal-unauth-wrap">
  <div class="portal-unauth-hero" aria-hidden="true">
    <BrandMark
      size={72}
      lightSrc={portalBrand.light}
      darkSrc={portalBrand.dark}
      lightSrcSet={portalBrand.lightSrcSet}
      darkSrcSet={portalBrand.darkSrcSet}
    />
  </div>

  {#if auth.user}
    <div class="settings-block">
      <h1 class="portal-unauth-title">已登录</h1>
      <p class="portal-unauth-desc">正在以 {auth.user.email} 进入 Life OS…</p>
    </div>
  {:else if !isSupabaseConfigured}
    <div class="settings-block">
      <h1 class="portal-unauth-title">欢迎使用 Life OS</h1>
      <p class="portal-unauth-desc">云端身份未配置。请设置 Supabase 环境变量后刷新页面。</p>
    </div>
  {:else}
    <form class="settings-block portal-auth-form" onsubmit={submit}>
      <h1 class="portal-unauth-title">登录 Life OS</h1>
      <p class="portal-unauth-desc">使用同一账号切换 Planner、Finance、Fitness 与 Music。</p>

      <div class="field">
        <label for="portal-email">邮箱</label>
        <input
          id="portal-email"
          type="email"
          bind:value={email}
          required
          autocomplete="email"
          inputmode="email"
          placeholder="name@example.com"
        />
      </div>
      <div class="field">
        <label for="portal-password">密码</label>
        <input
          id="portal-password"
          type="password"
          bind:value={password}
          required
          minlength="6"
          autocomplete="current-password"
          placeholder="至少 6 位"
        />
      </div>

      {#if error}
        <p class="portal-auth-error" role="alert">{error}</p>
      {/if}

      <button type="submit" class="btn-primary portal-auth-submit" disabled={busy}>
        {busy ? '处理中…' : '登录'}
      </button>
    </form>
  {/if}
</div>
