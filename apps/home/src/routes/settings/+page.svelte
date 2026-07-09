<script>
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row'
  import { S, setTheme, reset508Layout, exportLayoutJson, importLayoutJson } from '$lib/state.svelte.js'
  import { getActiveProject } from '$lib/state.svelte.js'
  import { auth, signIn, signUp, signOut, authErrorMessage } from '$lib/auth.svelte.js'
  import { isSupabaseConfigured } from '$lib/supabase.js'

  const project = $derived(getActiveProject())

  let authMode = $state('signin')
  let email = $state('')
  let password = $state('')
  let authBusy = $state(false)
  let authError = $state('')
  let confirmSent = $state(false)

  /** @param {import('@life-os/contracts/appearance').ColorSchemePreference} value */
  function onTheme(value) {
    setTheme(value)
  }

  /** @param {SubmitEvent} e */
  async function onAuthSubmit(e) {
    e.preventDefault()
    if (authBusy) return
    authError = ''
    authBusy = true
    try {
      if (authMode === 'signup') {
        const { needsConfirm } = await signUp(email.trim(), password)
        if (needsConfirm) confirmSent = true
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      authError = authErrorMessage(err)
    } finally {
      authBusy = false
    }
  }

  async function onSignOut() {
    await signOut()
  }

  function downloadLayoutJson() {
    const blob = new Blob([exportLayoutJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `homeos-layout-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** @param {Event} e */
  function onImportLayout(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget)
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const result = importLayoutJson(text)
      if (!result.ok) alert(result.error)
      input.value = ''
    }
    reader.readAsText(file)
  }
</script>

<SettingsSection title="Life OS 账号">
  {#if !isSupabaseConfigured}
    <SettingsRow label="状态">
      <span class="settings-value">未配置 Supabase</span>
    </SettingsRow>
  {:else if auth.user}
    <SettingsRow label="已登录">
      <span class="settings-value">{auth.user.email}</span>
    </SettingsRow>
    <SettingsRow label="操作">
      <button type="button" class="settings-btn" onclick={onSignOut}>退出登录</button>
    </SettingsRow>
    <p class="settings-hint">布局数据仍保存在本机；登录用于跨站 SSO 与 Portal 最近打开记录。</p>
  {:else if confirmSent}
    <p class="settings-hint">验证邮件已发送至 {email}，请查收后登录。</p>
  {:else}
    <form class="auth-form" onsubmit={onAuthSubmit}>
      <SettingsRow label="邮箱">
        <input class="settings-input" type="email" bind:value={email} autocomplete="email" required />
      </SettingsRow>
      <SettingsRow label="密码">
        <input class="settings-input" type="password" bind:value={password} autocomplete={authMode === 'signup' ? 'new-password' : 'current-password'} minlength="6" required />
      </SettingsRow>
      {#if authError}
        <p class="settings-error">{authError}</p>
      {/if}
      <div class="auth-actions">
        <button type="submit" class="settings-btn settings-btn-primary" disabled={authBusy}>
          {authBusy ? '…' : authMode === 'signin' ? '登录' : '注册'}
        </button>
        <button type="button" class="settings-btn" onclick={() => { authMode = authMode === 'signin' ? 'signup' : 'signin'; authError = '' }}>
          {authMode === 'signin' ? '创建账号' : '已有账号？登录'}
        </button>
      </div>
    </form>
  {/if}
</SettingsSection>

<SettingsSection title="外观">
  <SettingsRow label="主题">
    <select
      class="settings-select"
      value={S.settings.theme}
      onchange={(e) => onTheme(/** @type {HTMLSelectElement} */ (e.currentTarget).value)}
    >
      <option value="auto">跟随系统</option>
      <option value="light">浅色</option>
      <option value="dark">深色</option>
    </select>
  </SettingsRow>
  <SettingsToggleRow
    label="竖屏锁定（手机）"
    desc="平面图更适合横屏查看；开启后竖持手机会提示旋转"
    checked={S.settings.lockPortraitOnPhone}
    onchange={(v) => {
      S.settings.lockPortraitOnPhone = v
      import('$lib/state.svelte.js').then((m) => m.persist())
    }}
  />
</SettingsSection>

<SettingsSection title="当前户型">
  <SettingsRow label="单位">
    <span class="settings-value">{project.meta.unitId ?? '—'}</span>
  </SettingsRow>
  <SettingsRow label="楼盘">
    <span class="settings-value">{project.meta.building ?? '—'}</span>
  </SettingsRow>
  <SettingsRow label="面积">
    <span class="settings-value">{project.meta.sqft ? `${project.meta.sqft} sqft` : '—'}</span>
  </SettingsRow>
  <SettingsRow label="房间">
    <span class="settings-value">{project.rooms.filter((r) => r.kind !== 'circulation').length} 区</span>
  </SettingsRow>
  <SettingsRow label="储藏区">
    <span class="settings-value">{project.storageZones.length} 处</span>
  </SettingsRow>
  <SettingsRow label="编辑户型">
    <a class="settings-link" href="/plan">前往平面图 →</a>
  </SettingsRow>
  <SettingsRow label="布局备份">
    <button type="button" class="settings-btn" onclick={downloadLayoutJson}>导出 JSON</button>
  </SettingsRow>
  <SettingsRow label="布局恢复">
    <label class="settings-file">
      <span class="settings-btn">导入 JSON</span>
      <input type="file" accept="application/json,.json" class="sr-only" onchange={onImportLayout} />
    </label>
  </SettingsRow>
  <SettingsRow label="恢复默认">
    <button type="button" class="settings-btn" onclick={reset508Layout}>默认户型尺寸</button>
  </SettingsRow>
</SettingsSection>

<style>
  .settings-select {
    font-size: 14px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
  }

  .settings-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }

  .settings-link {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .settings-btn {
    font-size: 13px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
    cursor: pointer;
  }

  .settings-btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent, #fff);
  }

  .settings-input {
    font-size: 14px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
    min-width: 200px;
  }

  .settings-hint {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.45;
  }

  .settings-error {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--danger, #c0392b);
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .auth-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .settings-file {
    cursor: pointer;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
