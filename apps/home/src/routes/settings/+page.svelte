<script>
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsActionRow from '@life-os/platform-web/svelte/settings/action-row'
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row'
  import SettingsSegment from '@life-os/platform-web/svelte/settings/segment'
  import SettingsStackBlock from '@life-os/platform-web/svelte/settings/stack-block'
  import SettingsButtonGroup from '@life-os/platform-web/svelte/settings/button-group'
  import SettingsFileButton from '@life-os/platform-web/svelte/settings/file-button'
  import {
    S,
    setTheme,
    reset508Layout,
    exportLayoutJson,
    importLayoutJson,
    isWallGraphMode,
    activateWallGraphMode,
    revertToParametric508,
    reconvertGraphOpenings,
    getAngleSnapDeg,
    setAngleSnapDeg,
  } from '$lib/state.svelte.js'
  import { getActiveProject } from '$lib/state.svelte.js'
  import {
    auth,
    signIn,
    signOut,
    authErrorMessage,
  } from '$lib/auth.svelte.js'
  import { isSupabaseConfigured } from '$lib/supabase.js'
  import { toast } from '$lib/ui.svelte.js'
  import CloudScanPicker from '$lib/components/CloudScanPicker.svelte'

  const themeOptions = [
    { value: 'auto', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
  ]

  const angleSnapOptions = [
    { value: '0', label: '关闭' },
    { value: '15', label: '15°' },
    { value: '45', label: '45°' },
    { value: '90', label: '正交' },
  ]

  /** @param {string} v */
  function onAngleSnap(v) {
    setAngleSnapDeg(Number(v))
  }

  const project = $derived(getActiveProject())
  const wallGraphMode = $derived(isWallGraphMode())

  function onConvertToWallGraph() {
    if (
      !confirm(
        '将当前 508 户型转换为墙图模式。转换后可自由建删墙，但墙图改动不会回写 508 参数。',
      )
    ) {
      return
    }
    activateWallGraphMode()
  }

  function onRevertTo508() {
    if (
      !confirm(
        '返回 508 参数模式将丢弃墙图编辑。墙图上的改动不会回写到 508 参数，确定继续？',
      )
    ) {
      return
    }
    revertToParametric508()
  }

  let email = $state('')
  let password = $state('')
  let authBusy = $state(false)
  let authError = $state('')

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
      await signIn(email.trim(), password)
    } catch (err) {
      authError = authErrorMessage(err)
    } finally {
      authBusy = false
    }
  }

  async function onSignOut() {
    await signOut()
  }

  function onReset508Layout() {
    if (!confirm('恢复默认户型尺寸？将覆盖当前布局参数。')) return
    reset508Layout()
    toast('已恢复默认户型尺寸')
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
      if (!result.ok) toast(result.error, 'error')
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
    <SettingsActionRow
      label="操作"
      buttonLabel="退出登录"
      onclick={onSignOut}
    />
    <p class="block-desc">
      布局数据仍保存在本机；登录用于跨站 SSO 与 Portal 最近打开记录。
    </p>
  {:else}
    <form class="auth-form" onsubmit={onAuthSubmit}>
      <SettingsRow label="邮箱">
        <input type="email" bind:value={email} autocomplete="email" required />
      </SettingsRow>
      <SettingsRow label="密码">
        <input
          type="password"
          bind:value={password}
          autocomplete="current-password"
          minlength="6"
          required
        />
      </SettingsRow>
      {#if authError}
        <p class="block-desc settings-error">{authError}</p>
      {/if}
      <SettingsButtonGroup>
        <button type="submit" class="btn-primary" disabled={authBusy}>
          {authBusy ? '…' : '登录'}
        </button>
      </SettingsButtonGroup>
    </form>
  {/if}
</SettingsSection>

<SettingsSection title="外观">
  <SettingsRow label="主题">
    <SettingsSegment
      options={themeOptions}
      value={S.settings.theme || 'auto'}
      onchange={onTheme}
      ariaLabel="主题"
    />
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

<SettingsSection title="户型编辑模式">
  <SettingsRow label="当前模式">
    <span class="settings-value">{wallGraphMode ? '墙图' : '508 参数'}</span>
  </SettingsRow>
  {#if !wallGraphMode}
    <SettingsStackBlock label="转换">
      <button type="button" class="btn-primary" onclick={onConvertToWallGraph}>
        从当前户型生成墙图（一次性）
      </button>
    </SettingsStackBlock>
    <p class="block-desc">
      转换后可自由建删墙；508 参数仍保留作「返回 508」的安全气囊。
    </p>
  {:else}
    <SettingsRow label="墙图统计">
      <span class="settings-value"
        >{project.wallGraph?.vertices.length ?? 0} 顶点 ·
        {project.wallGraph?.edges.length ?? 0} 墙段 ·
        {project.graphOpenings?.length ?? 0} 门窗 ·
        {project.zones?.length ?? 0} 分区 ·
        {project.placements?.length ?? 0} 家具</span
      >
    </SettingsRow>
    <SettingsActionRow
      label="恢复"
      desc="墙图改动不会回写 508 参数"
      buttonLabel="返回 508 参数模式"
      onclick={onRevertTo508}
    />
    <SettingsActionRow
      label="门窗"
      buttonLabel="重新识别门窗"
      onclick={reconvertGraphOpenings}
    />
  {/if}
  <SettingsRow label="画墙角度吸附">
    <SettingsSegment
      options={angleSnapOptions}
      value={String(getAngleSnapDeg())}
      onchange={onAngleSnap}
      ariaLabel="画墙角度吸附"
    />
  </SettingsRow>
  <p class="block-desc">
    画墙时按增量吸住角度，斜墙也能画准。Shift 临时强制正交，Alt 临时脱开吸附。
  </p>
</SettingsSection>

<SettingsSection title="当前户型">
  <SettingsRow label="单位">
    <span class="settings-value">{project.meta.unitId ?? '—'}</span>
  </SettingsRow>
  <SettingsRow label="楼盘">
    <span class="settings-value">{project.meta.building ?? '—'}</span>
  </SettingsRow>
  <SettingsRow label="面积">
    <span class="settings-value"
      >{project.meta.sqft ? `${project.meta.sqft} sqft` : '—'}</span
    >
  </SettingsRow>
  <SettingsRow label="房间">
    <span class="settings-value"
      >{project.rooms.filter((r) => r.kind !== 'circulation').length} 区</span
    >
  </SettingsRow>
  <SettingsRow label="储藏区">
    <span class="settings-value">{project.storageZones.length} 处</span>
  </SettingsRow>
  <SettingsRow label="编辑户型">
    <a class="settings-link" href="/plan">前往平面图 →</a>
  </SettingsRow>
  <SettingsRow label="布局备份">
    <button type="button" class="btn-secondary" onclick={downloadLayoutJson}
      >导出 JSON</button
    >
  </SettingsRow>
  <SettingsRow label="布局恢复">
    <SettingsFileButton
      label="导入 JSON"
      accept="application/json,.json"
      onchange={onImportLayout}
    />
  </SettingsRow>
  {#if auth.user}
    <SettingsStackBlock label="云端扫描">
      <CloudScanPicker />
    </SettingsStackBlock>
    <p class="block-desc">
      用 iPhone 上的 HomeScan(RoomPlan)扫描全屋后在这里拉取。默认只并入机位照片 ——
      你这份户型是量过的,比扫描准,不会被动。初次可选「摆家具」，让实测家具各就各位。
    </p>
  {/if}
  <SettingsActionRow
    label="恢复默认"
    desc="覆盖当前户型尺寸参数"
    buttonLabel="默认户型尺寸"
    variant="danger"
    onclick={onReset508Layout}
  />
</SettingsSection>

<style>
  .settings-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .settings-link {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .settings-error {
    color: var(--danger, #c0392b);
  }

  .auth-form {
    display: contents;
  }

  :global(.settings-block.set-group .block-title.sg-title) {
    text-transform: none;
    letter-spacing: 0.04em;
    font-family: var(--font);
  }
</style>
