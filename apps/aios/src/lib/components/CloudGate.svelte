<script>
  /**
   * 云端版访问门禁:只有登录且是本人(Life OS 个人所有者)才放行。
   * 未登录 → 登录表单;非本人 → 拒绝;登录态恢复中 → 占位。
   * 仅在 CLOUD_BUILD(Netlify 版)由 +layout 挂载;本地形态不经过它。
   */
  import { t } from '$lib/i18n/index.js'
  import { CLOUD, signInCloud, signOutCloud, isCloudAuthorized } from '$lib/cloud.svelte.js'
  import { AUTH_WALL_DOCUMENT_TITLE } from '$lib/kenos/clientSessionCleanup.core.js'

  let email = $state('')
  let password = $state('')

  async function submit() {
    if (!email.trim() || !password || CLOUD.busy) return
    if (await signInCloud(email.trim(), password)) password = ''
  }
</script>

<svelte:head>
  <title>{AUTH_WALL_DOCUMENT_TITLE}</title>
</svelte:head>

<div class="gate">
  <div class="card">
    <h1>AI.OS</h1>

    {#if !CLOUD.ready}
      <p class="sub shimmer">{t('gate.checking')}</p>
    {:else if isCloudAuthorized()}
      <!-- 已授权:内容由 +layout 渲染,这里不显示(理论上不会走到) -->
      <p class="sub">{t('gate.welcome')}</p>
    {:else if CLOUD.user}
      <!-- 登录了但不是本人 -->
      <p class="sub deny">{t('gate.denied')}</p>
      <p class="who">{CLOUD.user.email}</p>
      <button type="button" class="btn ghost" disabled={CLOUD.busy} onclick={signOutCloud}>
        {t('settings.cloudSignOut')}
      </button>
    {:else}
      <!-- 未登录:登录表单 -->
      <p class="sub">{t('gate.prompt')}</p>
      <input
        type="email"
        autocomplete="email"
        placeholder={t('settings.cloudEmail')}
        bind:value={email}
        aria-label={t('settings.cloudEmail')}
      />
      <input
        type="password"
        autocomplete="current-password"
        placeholder={t('settings.cloudPassword')}
        bind:value={password}
        onkeydown={(e) => e.key === 'Enter' && !e.isComposing && submit()}
        aria-label={t('settings.cloudPassword')}
      />
      <button
        type="button"
        class="btn"
        disabled={!email.trim() || !password || CLOUD.busy}
        onclick={submit}
      >
        {t('settings.cloudSignIn')}
      </button>
      {#if CLOUD.error}
        <p class="err">{CLOUD.error}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .gate {
    display: grid;
    place-items: center;
    min-height: 100dvh;
    padding: var(--space-5, 20px);
    background: var(--bg);
  }
  .card {
    width: 100%;
    max-width: 340px;
    display: grid;
    gap: 12px;
    padding: var(--space-6, 28px) var(--space-5, 22px);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--t1);
  }
  .sub {
    margin: 0 0 4px;
    font-size: var(--text-sm, 13px);
    color: var(--t2);
    line-height: 1.5;
  }
  .sub.deny {
    color: var(--critical, #f85149);
  }
  .who {
    margin: -4px 0 4px;
    font-size: var(--text-xs, 12px);
    color: var(--t3);
  }
  input {
    width: 100%;
    border: 1px solid var(--border-l);
    border-radius: 10px;
    background: var(--bg);
    color: var(--t1);
    font: inherit;
    font-size: var(--text-sm, 14px);
    padding: 10px 12px;
    outline: none;
  }
  input:focus {
    border-color: var(--t3);
  }
  .btn {
    border: none;
    background: var(--accent);
    color: var(--on-accent, #fff);
    border-radius: 10px;
    padding: 10px 14px;
    font: inherit;
    font-size: var(--text-sm, 14px);
    font-weight: 500;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.ghost {
    background: var(--bg);
    color: var(--t1);
    border: 1px solid var(--border-l);
  }
  .err {
    margin: 0;
    font-size: var(--text-xs, 12px);
    color: var(--critical, #f85149);
  }
  .shimmer {
    opacity: 0.7;
  }
</style>
