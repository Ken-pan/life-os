<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import SettingsSyncBlock from '@life-os/platform-web/svelte/settings/sync-block'
  import SettingsAppearanceBlock from '@life-os/platform-web/svelte/settings/appearance-block'
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'
  import {
    publishShellTheme,
    publishShellLocale,
  } from '$lib/kenos/iosNativeShell.js'
  import {
    MODELS,
    TTS_VOICES,
    GATEWAY,
    DEFAULT_GATEWAY,
    setGateway,
  } from '$lib/localai.js'
  import { CLOUD_BUILD } from '$lib/env.js'
  import { C, refreshGateway, clearAllConversations } from '$lib/chat.svelte.js'
  import {
    M,
    deleteMemory,
    clearMemories,
    addMemory,
  } from '$lib/memory.svelte.js'
  import {
    CLOUD,
    isCloudAuthorized,
    signInCloud,
    signOutCloud,
    syncNow,
    getCloudAccessToken,
  } from '$lib/cloud.svelte.js'
  import {
    CONTROL,
    refreshControlCenter,
  } from '$lib/kenos/controlCenter.svelte.js'
  import {
    productSessionLabels,
    resolveProductSessionState,
  } from '$lib/kenos/productSessionState.core.js'
  import { isNative } from '$lib/native.js'
  import { dailyBriefDeliveryAvailable } from '$lib/proactive.svelte.js'
  import {
    loadServers,
    saveServers,
    slugifyId,
    refreshMcpTools,
    testServer,
    mcpToolCount,
    ensureLifeOsMcpFleet,
  } from '$lib/mcp.js'
  import {
    PERMS,
    PERM_META,
    refreshPermissions,
    requestScreen,
    requestAccessibility,
    requestAutomation,
    openPrivacyPane,
    relaunchApp,
  } from '$lib/permissions.svelte.js'
  import { onMount } from 'svelte'
  import { scrollToSettingsHash } from '@life-os/platform-web/settings-hash'

  const smartToggles = $derived([
    { key: 'tools', label: t('settings.tools'), desc: t('settings.toolsDesc') },
    {
      key: 'webAccess',
      label: t('settings.webAccess'),
      desc: t('settings.webAccessDesc'),
    },
    {
      key: 'memory',
      label: t('settings.memory'),
      desc: t('settings.memoryDesc'),
    },
  ])

  function setTheme(value) {
    void publishShellTheme(value, (theme) => {
      S.settings.theme = theme
      save()
      applyTheme()
    })
  }

  function setShellLocale(value) {
    void publishShellLocale(value, setLocale)
  }

  function setModel(value) {
    S.settings.model = value
    save()
  }

  function toggle(key) {
    S.settings[key] = !S.settings[key]
    save()
  }

  function toggleDailyBrief() {
    if (!S.settings.dailyBrief)
      S.settings.dailyBrief = { enabled: false, time: '08:00' }
    S.settings.dailyBrief.enabled = !S.settings.dailyBrief.enabled
    save()
  }

  function setBriefTime(e) {
    if (!S.settings.dailyBrief)
      S.settings.dailyBrief = { enabled: false, time: '08:00' }
    S.settings.dailyBrief.time = e.target.value || '08:00'
    save()
  }

  /* —— MCP servers（设备本地） —— */
  let mcpServers = $state(loadServers())
  let mcpToolN = $state(mcpToolCount())
  let mcpDraft = $state({ name: '', url: '', token: '' })
  let mcpStatus = $state('')
  let mcpBusy = $state(false)
  let mcpUiSynced = false

  // 登录后 cloud 会自动 ensure 舰队；进设置时对齐一次 UI（只跑一次）
  $effect(() => {
    if (mcpUiSynced || !CLOUD.ready) return
    mcpUiSynced = true
    mcpServers = loadServers()
    mcpToolN = mcpToolCount()
  })

  function persistMcp() {
    saveServers($state.snapshot(mcpServers))
  }

  async function addMcpServer() {
    const name = mcpDraft.name.trim()
    const url = mcpDraft.url.trim()
    if (!name || !url) {
      mcpStatus = t('settings.mcpNeedNameUrl')
      return
    }
    let id = slugifyId(name)
    const taken = new Set(mcpServers.map((s) => s.id))
    let base = id
    let i = 2
    while (taken.has(id)) id = `${base}_${i++}`
    mcpServers = [
      ...mcpServers,
      {
        id,
        name,
        url,
        token: mcpDraft.token.trim() || undefined,
        enabled: true,
      },
    ]
    persistMcp()
    mcpDraft = { name: '', url: '', token: '' }
    await refreshMcp()
  }

  function removeMcpServer(id) {
    mcpServers = mcpServers.filter((s) => s.id !== id)
    persistMcp()
    refreshMcp()
  }

  function toggleMcpServer(id) {
    mcpServers = mcpServers.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s,
    )
    persistMcp()
    refreshMcp()
  }

  async function refreshMcp() {
    mcpBusy = true
    mcpStatus = t('settings.mcpRefreshing')
    const { ok, failed } = await refreshMcpTools()
    mcpToolN = mcpToolCount()
    mcpBusy = false
    mcpStatus = failed.length
      ? t('settings.mcpSomeFailed', {
          n: mcpToolN,
          errs: failed.map((f) => `${f.name}: ${f.error}`).join('；'),
        })
      : t('settings.mcpRefreshed', { ok, n: mcpToolN })
  }

  async function testMcpServer(server) {
    mcpBusy = true
    mcpStatus = t('settings.mcpTesting', { name: server.name })
    const r = await testServer($state.snapshot(server))
    mcpBusy = false
    mcpStatus = r.ok
      ? t('settings.mcpTestOk', {
          name: server.name,
          n: r.tools.length,
          tools: r.tools.slice(0, 12).join(', '),
        })
      : t('settings.mcpTestFail', { name: server.name, error: r.error })
  }

  /** 一键接入 Home/Planner/Finance/Fitness 四个 MCP（用当前登录 JWT） */
  async function addLifeOsMcpFleet() {
    if (!CLOUD.user) {
      mcpStatus = t('settings.mcpNeedLogin')
      return
    }
    mcpBusy = true
    mcpStatus = t('settings.mcpFleetAdding')
    const token = await getCloudAccessToken()
    if (!token) {
      mcpBusy = false
      mcpStatus = t('settings.mcpNeedLogin')
      return
    }
    const { servers, added } = ensureLifeOsMcpFleet(mcpServers, token)
    mcpServers = servers
    persistMcp()
    await refreshMcp()
    mcpBusy = false
    mcpStatus = added.length
      ? t('settings.mcpFleetAdded', { names: added.join('、'), n: mcpToolN })
      : t('settings.mcpFleetUpToDate', { n: mcpToolN })
  }

  let briefPreview = $state('')
  async function previewBrief() {
    briefPreview = t('settings.briefPreviewing')
    const { maybeSendDailyBrief } = await import('$lib/proactive.svelte.js')
    const r = await maybeSendDailyBrief({ force: true })
    briefPreview =
      r === 'sent'
        ? t('settings.briefPreviewSent')
        : r === 'no-data'
          ? t('settings.briefPreviewNoData')
          : t('settings.briefPreviewUnavailable')
  }

  let checking = $state(false)
  async function checkGateway() {
    checking = true
    await refreshGateway()
    checking = false
  }

  /* —— 网关地址(设备本地,不同步)——
     改地址后重载:部分端点(bridge/vault/image)在模块加载时读取网关,
     重载让它们一并生效;initGateway 会从 localStorage 读回新地址。 */
  let gatewayInput = $state(GATEWAY)
  function applyGateway() {
    const next = gatewayInput.trim()
    if (!next || next === GATEWAY) return
    setGateway(next)
    location.reload()
  }

  function clearChats() {
    if (confirm(t('settings.clearChatsConfirm'))) clearAllConversations()
  }

  function clearAllMemories() {
    if (confirm(t('settings.clearMemoriesConfirm'))) clearMemories()
  }

  /* —— 云端同步(Life OS 统一账户) —— */
  let cloudEmail = $state('')
  let cloudPassword = $state('')

  async function cloudSignIn() {
    const email = cloudEmail.trim()
    if (!email || !cloudPassword) return
    if (await signInCloud(email, cloudPassword)) cloudPassword = ''
  }

  function lastSyncLabel(at) {
    if (!at) return t('settings.cloudNever')
    return new Date(at).toLocaleTimeString()
  }

  const session = $derived(
    resolveProductSessionState({
      cloudReady: CLOUD.ready,
      cloudUser: CLOUD.user,
      cloudAuthorized: isCloudAuthorized(),
      cloudSyncing: CLOUD.syncing,
      cloudLastSyncAt: CLOUD.lastSyncAt,
      controlLoading: CONTROL.loading,
      sources: CONTROL.sources,
    }),
  )
  const sessionLabels = $derived(productSessionLabels(session))
  const accountSignedInDesc = $derived.by(() => {
    const status = sessionLabels.accountStatus
    if (session.accountSyncState === 'syncing') return status
    if (session.accountSyncState === 'synced') {
      return `${status} · ${t('settings.cloudLastSync')}: ${lastSyncLabel(CLOUD.lastSyncAt)}`
    }
    if (session.accountSyncState === 'partial') return status
    if (session.accountSyncState === 'error') return status
    return `${status} · ${t('settings.cloudLastSync')}: ${CLOUD.syncing ? t('settings.cloudSyncing') : lastSyncLabel(CLOUD.lastSyncAt)}`
  })

  /* —— 权限中心(仅原生壳)——
     挂载即静默探测;窗口重新聚焦时复查,用户从系统设置回来对勾会自动变绿。 */
  let permBusy = $state('') // 正在请求的权限 key,禁用按钮防重复点
  onMount(() => {
    void refreshControlCenter()
    const disposeScroll = scrollToSettingsHash('cloud')
    if (!isNative) return disposeScroll
    refreshPermissions()
    const onFocus = () => refreshPermissions()
    window.addEventListener('focus', onFocus)
    return () => {
      disposeScroll()
      window.removeEventListener('focus', onFocus)
    }
  })

  const PERM_REQ = {
    screen: requestScreen,
    accessibility: requestAccessibility,
    automation: requestAutomation,
  }
  async function grantPerm(key) {
    permBusy = key
    try {
      await PERM_REQ[key]()
    } finally {
      permBusy = ''
    }
  }

  let newMemory = $state('')
  let addingMemory = $state(false)
  async function submitMemory() {
    const text = newMemory.trim()
    if (!text || addingMemory) return
    addingMemory = true
    newMemory = ''
    await addMemory(text)
    addingMemory = false
  }
</script>

<div class="wrap">
  <SettingsSyncBlock
    title={t('settings.cloud')}
    signedOutDesc={t('settings.cloudDesc')}
    ssoHint={t('settings.cloudSsoHint')}
    signedInDesc={accountSignedInDesc}
    email={CLOUD.user ? `${CLOUD.user.email} · ${sessionLabels.accountStatus}` : ''}
    configured={CLOUD.configured}
    signedIn={!!CLOUD.user}
    unavailableDesc={t('settings.cloudDesc')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn-secondary"
        disabled={CLOUD.syncing}
        onclick={() => syncNow()}
      >
        {t('settings.cloudSyncNow')}
      </button>
      <button
        type="button"
        class="btn-secondary"
        disabled={CLOUD.busy}
        onclick={signOutCloud}
      >
        {t('settings.cloudSignOut')}
      </button>
    {/snippet}
    {#snippet footer()}
      <p class="block-desc">{t('settings.cloudPrivacyNote')}</p>
      {#if CLOUD.error}
        <p class="block-desc cloud-error">{CLOUD.error}</p>
      {/if}
    {/snippet}
    {#snippet signedOut()}
      <div class="cloud-login">
        <input
          type="email"
          class="cloud-input"
          autocomplete="email"
          placeholder={t('settings.cloudEmail')}
          bind:value={cloudEmail}
          aria-label={t('settings.cloudEmail')}
        />
        <input
          type="password"
          class="cloud-input"
          autocomplete="current-password"
          placeholder={t('settings.cloudPassword')}
          bind:value={cloudPassword}
          onkeydown={(e) =>
            e.key === 'Enter' && !e.isComposing && cloudSignIn()}
          aria-label={t('settings.cloudPassword')}
        />
        <button
          type="button"
          class="mini-btn cloud-connect"
          disabled={!cloudEmail.trim() || !cloudPassword || CLOUD.busy}
          onclick={cloudSignIn}
        >
          {t('settings.cloudSignIn')}
        </button>
      </div>
      {#if CLOUD.error}
        <p class="block-desc cloud-error">{CLOUD.error}</p>
      {/if}
    {/snippet}
  </SettingsSyncBlock>

  <section class="card">
    <h2>{t('settings.ai')}</h2>

    <div class="row">
      <span class="row-label">{t('settings.gateway')}</span>
      <span class="row-value">
        <span
          class="status-dot"
          class:ok={C.gatewayOk === true}
          class:down={C.gatewayOk === false}
        ></span>
        {#if C.gatewayOk === true}{t('settings.gatewayOk')}
        {:else if C.gatewayOk === false}{t('settings.gatewayDown')}
        {:else}…{/if}
        <button
          type="button"
          class="mini-btn"
          disabled={checking}
          onclick={checkGateway}
        >
          {t('settings.gatewayCheck')}
        </button>
      </span>
    </div>

    <div class="field">
      <span class="field-label">{t('settings.gatewayUrl')}</span>
      <div class="memory-add">
        <input
          type="text"
          inputmode="url"
          placeholder={DEFAULT_GATEWAY}
          bind:value={gatewayInput}
          onkeydown={(e) =>
            e.key === 'Enter' && !e.isComposing && applyGateway()}
          aria-label={t('settings.gatewayUrl')}
        />
        <button
          type="button"
          class="mini-btn"
          disabled={gatewayInput.trim() === GATEWAY}
          onclick={applyGateway}
        >
          {t('settings.gatewayApply')}
        </button>
      </div>
      <p class="note">
        {CLOUD_BUILD
          ? t('settings.gatewayUrlCloudNote')
          : t('settings.gatewayUrlNote')}
      </p>
    </div>

    <div class="row">
      <span class="row-label">{t('settings.defaultModel')}</span>
      <div class="seg" role="group" aria-label={t('settings.defaultModel')}>
        {#each MODELS as model (model.id)}
          <button
            type="button"
            class:on={S.settings.model === model.id}
            aria-pressed={S.settings.model === model.id}
            onclick={() => setModel(model.id)}
          >
            {t(model.nameKey)}
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <span class="row-label">{t('settings.ttsVoice')}</span>
      <select
        class="voice-select"
        bind:value={S.settings.ttsVoice}
        onchange={save}
        aria-label={t('settings.ttsVoice')}
      >
        {#each TTS_VOICES as voice (voice.id)}
          <option value={voice.id}>{t(voice.nameKey)}</option>
        {/each}
      </select>
    </div>

    <div class="row">
      <span class="row-label">{t('settings.ttsRate')}</span>
      <select
        class="voice-select"
        bind:value={S.settings.ttsRate}
        onchange={save}
        aria-label={t('settings.ttsRate')}
      >
        {#each [0.75, 1, 1.25, 1.5, 2] as r (r)}
          <option value={r}>{r}×</option>
        {/each}
      </select>
    </div>
    <p class="note">{t('settings.gatewayNote')}</p>
  </section>

  {#if isNative}
    <section class="card">
      <h2>{t('settings.permissions')}</h2>
      <p class="note">{t('settings.permissionsDesc')}</p>

      {#each PERM_META as p (p.key)}
        {@const st = PERMS[p.key]}
        <div class="perm-row">
          <span class="perm-icon"><Icon name={p.icon} size={18} /></span>
          <span class="perm-text">
            <span class="perm-label">
              <span
                class="status-dot"
                class:ok={st === true}
                class:down={st === false}
              ></span>
              {p.label}
              <span class="perm-state">
                {#if st === true}已授权
                {:else if st === false}未授权
                {:else}检测中…{/if}
              </span>
            </span>
            <span class="perm-why">{p.why}</span>
            {#if st !== true && p.needsRestart}
              <span class="perm-why perm-hint"
                >授权后需重启 AIOS 才对截屏生效。</span
              >
            {/if}
          </span>
          <span class="perm-actions">
            {#if st === true}
              {#if p.needsRestart}
                <button type="button" class="mini-btn" onclick={relaunchApp}
                  >重启</button
                >
              {/if}
            {:else}
              <button
                type="button"
                class="mini-btn primary"
                disabled={permBusy === p.key}
                onclick={() => grantPerm(p.key)}
              >
                {permBusy === p.key ? '请求中…' : '授权'}
              </button>
              <button
                type="button"
                class="mini-btn"
                onclick={() => openPrivacyPane(p.pane)}
              >
                打开设置
              </button>
            {/if}
          </span>
        </div>
      {/each}
    </section>
  {/if}

  <section class="card">
    <h2>{t('settings.intelligence')}</h2>

    {#each smartToggles as item (item.key)}
      <button type="button" class="toggle-row" onclick={() => toggle(item.key)}>
        <span class="toggle-text">
          <span class="toggle-label">{item.label}</span>
          <span class="toggle-desc">{item.desc}</span>
        </span>
        <span
          class="switch"
          class:on={S.settings[item.key]}
          role="switch"
          aria-checked={S.settings[item.key]}
          aria-label={item.label}
        ></span>
      </button>
    {/each}

    <div class="field">
      <span class="field-label">
        {t('settings.temperature')}
        <span class="field-value">{S.settings.temperature.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min="0"
        max="1.5"
        step="0.1"
        bind:value={S.settings.temperature}
        onchange={save}
        aria-label={t('settings.temperature')}
      />
      <p class="note">{t('settings.temperatureDesc')}</p>
    </div>

    <div class="field">
      <span class="field-label">{t('settings.customPrompt')}</span>
      <textarea
        rows="3"
        placeholder={t('settings.customPromptHint')}
        bind:value={S.settings.customPrompt}
        onblur={save}
        aria-label={t('settings.customPrompt')}
      ></textarea>
    </div>
  </section>

  {#if dailyBriefDeliveryAvailable()}
    <section class="card">
      <h2>{t('settings.proactive')}</h2>
      <p class="note">{t('settings.proactiveDesc')}</p>

      <button type="button" class="toggle-row" onclick={toggleDailyBrief}>
        <span class="toggle-text">
          <span class="toggle-label">{t('settings.dailyBrief')}</span>
          <span class="toggle-desc">{t('settings.dailyBriefDesc')}</span>
        </span>
        <span
          class="switch"
          class:on={S.settings.dailyBrief?.enabled}
          role="switch"
          aria-checked={S.settings.dailyBrief?.enabled ?? false}
          aria-label={t('settings.dailyBrief')}
        ></span>
      </button>

      {#if S.settings.dailyBrief?.enabled}
        <div class="field">
          <span class="field-label">{t('settings.briefTime')}</span>
          <input
            type="time"
            class="cloud-input"
            value={S.settings.dailyBrief?.time ?? '08:00'}
            onchange={setBriefTime}
            aria-label={t('settings.briefTime')}
          />
          <p class="note">{t('settings.briefTimeDesc')}</p>
        </div>
      {/if}

      <div class="field">
        <button type="button" class="mini-btn" onclick={previewBrief}>
          {t('settings.briefPreview')}
        </button>
        {#if briefPreview}<p class="note">{briefPreview}</p>{/if}
      </div>
    </section>
  {/if}

  <section class="card">
    <h2>
      {t('settings.mcp')}
      {#if mcpToolN}<span class="count"
          >{t('settings.mcpToolCount', { n: mcpToolN })}</span
        >{/if}
    </h2>
    <p class="note">{t('settings.mcpDesc')}</p>
    <p class="note">{t('settings.mcpLifeOsHint')}</p>
    <div class="mcp-actions" style="margin-bottom: 12px">
      <button
        type="button"
        class="mini-btn primary"
        disabled={mcpBusy || !CLOUD.user}
        onclick={addLifeOsMcpFleet}
      >
        {t('settings.mcpFleetAdd')}
      </button>
    </div>

    {#each mcpServers as server (server.id)}
      <div class="mcp-row">
        <button
          type="button"
          class="switch"
          class:on={server.enabled}
          role="switch"
          aria-checked={server.enabled}
          aria-label={server.name}
          onclick={() => toggleMcpServer(server.id)}
        ></button>
        <span class="mcp-meta">
          <span class="mcp-name">{server.name}</span>
          <span class="mcp-url">{server.url}</span>
        </span>
        <button
          type="button"
          class="mini-btn"
          disabled={mcpBusy}
          onclick={() => testMcpServer(server)}
        >
          {t('settings.mcpTest')}
        </button>
        <button
          type="button"
          class="mini-btn"
          onclick={() => removeMcpServer(server.id)}
        >
          {t('settings.mcpRemove')}
        </button>
      </div>
    {/each}

    <div class="field mcp-add">
      <input
        type="text"
        class="cloud-input"
        placeholder={t('settings.mcpNamePlaceholder')}
        bind:value={mcpDraft.name}
        aria-label={t('settings.mcpName')}
      />
      <input
        type="url"
        class="cloud-input"
        placeholder="https://…/mcp"
        bind:value={mcpDraft.url}
        aria-label="URL"
      />
      <input
        type="password"
        class="cloud-input"
        placeholder={t('settings.mcpTokenPlaceholder')}
        bind:value={mcpDraft.token}
        aria-label="Token"
      />
      <div class="mcp-actions">
        <button
          type="button"
          class="mini-btn primary"
          disabled={mcpBusy}
          onclick={addMcpServer}
        >
          {t('settings.mcpAdd')}
        </button>
        {#if mcpServers.length}
          <button
            type="button"
            class="mini-btn"
            disabled={mcpBusy}
            onclick={refreshMcp}
          >
            {t('settings.mcpRefresh')}
          </button>
        {/if}
      </div>
      {#if mcpStatus}<p class="note">{mcpStatus}</p>{/if}
    </div>
  </section>

  <section class="card">
    <h2>
      {t('settings.memories')}
      <span class="count">{M.items.length}</span>
    </h2>
    <p class="note">{t('settings.memoriesDesc')}</p>

    <div class="field">
      <span class="field-label">{t('settings.location')}</span>
      <input
        type="text"
        class="cloud-input"
        placeholder={t('settings.locationHint')}
        bind:value={S.settings.location}
        onblur={save}
        aria-label={t('settings.location')}
      />
      <p class="note">{t('settings.locationDesc')}</p>
    </div>

    <div class="field">
      <span class="field-label">{t('settings.profile')}</span>
      <textarea
        rows="6"
        placeholder={t('settings.profileHint')}
        bind:value={S.settings.userProfile}
        onblur={save}
        aria-label={t('settings.profile')}
      ></textarea>
      <p class="note">{t('settings.profileDesc')}</p>
    </div>

    <div class="memory-add">
      <input
        type="text"
        placeholder={t('settings.memoryAddHint')}
        bind:value={newMemory}
        onkeydown={(e) => e.key === 'Enter' && !e.isComposing && submitMemory()}
        aria-label={t('settings.memoryAddHint')}
      />
      <button
        type="button"
        class="mini-btn"
        disabled={!newMemory.trim() || addingMemory}
        onclick={submitMemory}
      >
        {t('settings.memoryAdd')}
      </button>
    </div>

    {#if M.items.length}
      <ul class="memory-list">
        {#each M.items as item (item.id)}
          <li>
            <span class="memory-text">{item.text}</span>
            <button
              type="button"
              class="memory-del"
              title={t('history.delete')}
              aria-label={t('history.delete')}
              onclick={() => deleteMemory(item.id)}
            >
              <Icon name="x" size={14} strokeWidth={2} />
            </button>
          </li>
        {/each}
      </ul>
      <button type="button" class="danger-btn" onclick={clearAllMemories}>
        {t('settings.clearMemories')}
      </button>
    {:else}
      <p class="note">{t('settings.memoriesEmpty')}</p>
    {/if}
  </section>

  <SettingsAppearanceBlock
    title={t('settings.appearance')}
    theme={S.settings.theme || 'auto'}
    onThemeChange={setTheme}
    themeOptions={[
      { value: 'light', label: t('settings.themeLight') },
      { value: 'dark', label: t('settings.themeDark') },
      { value: 'auto', label: t('settings.themeAuto') },
    ]}
    themeLabel={t('settings.theme')}
    themeDesc={t('settings.themeDesc')}
    locale={S.settings.locale}
    onLocaleChange={setShellLocale}
    localeOptions={[
      { value: 'zh', label: t('settings.langZh') },
      { value: 'en', label: t('settings.langEn') },
    ]}
    languageLabel={t('settings.language')}
    languageDesc={t('settings.languageDesc')}
  />

  <section class="card">
    <h2>{t('settings.data')}</h2>
    <button type="button" class="danger-btn" onclick={clearChats}>
      {t('settings.clearChats')}
    </button>
  </section>
</div>

<style>
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-5, 20px);
    margin-block: var(--space-4, 16px);
    display: grid;
    gap: var(--space-3, 12px);
  }

  h2 {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .count {
    font-size: var(--text-sm, 13px);
    font-weight: 500;
    color: var(--t3);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    flex-wrap: wrap;
  }
  .row-label {
    color: var(--t2);
    font-size: var(--text-sm, 13px);
  }
  .row-value {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm, 13px);
    color: var(--t1);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--t4);
  }
  .status-dot.ok {
    background: var(--positive, #3fb950);
  }
  .status-dot.down {
    background: var(--critical, #f85149);
  }

  .mini-btn {
    border: 1px solid var(--border-l);
    background: var(--bg);
    color: var(--t1);
    border-radius: 8px;
    padding: 4px 10px;
    font-size: var(--text-xs, 12px);
    cursor: pointer;
  }
  .mini-btn:hover {
    background: var(--card-h);
  }
  .mini-btn:disabled {
    opacity: 0.5;
  }
  .mini-btn.primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent);
    font-weight: 500;
  }
  .mini-btn.primary:hover {
    background: var(--accent-2);
  }

  /* —— 权限中心 —— */
  .perm-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 12px);
  }
  .perm-icon {
    flex: none;
    margin-top: 2px;
    color: var(--t2);
  }
  .perm-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .perm-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 500;
  }
  .perm-state {
    font-size: var(--text-xs, 12px);
    font-weight: 400;
    color: var(--t3);
  }
  .perm-why {
    font-size: var(--text-xs, 12px);
    color: var(--t3);
    line-height: 1.4;
  }
  .perm-hint {
    color: var(--warning, #d29922);
  }
  .perm-actions {
    flex: none;
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .note {
    margin: 0;
    font-size: var(--text-xs, 12px);
    color: var(--t3);
  }

  /* —— 智能开关行 —— */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    width: 100%;
    border: none;
    background: transparent;
    padding: 6px 0;
    cursor: pointer;
    text-align: start;
  }
  .toggle-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .toggle-label {
    font-size: var(--text-base, 15px);
    color: var(--t1);
  }
  .toggle-desc {
    font-size: var(--text-xs, 12px);
    color: var(--t3);
  }
  /* 命名避开主题包全局 .toggle 组件(settings-ext.css),防止样式互相泄漏 */
  .switch {
    flex: 0 0 auto;
    width: 40px;
    height: 24px;
    border-radius: 999px;
    background: var(--card-h);
    position: relative;
    transition: background var(--dur-fast) var(--ease, ease);
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--bg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform var(--dur-fast) var(--ease, ease);
  }
  .switch.on {
    background: var(--accent);
  }
  .switch.on::after {
    transform: translateX(16px);
  }

  /* —— 字段 —— */
  .field {
    display: grid;
    gap: 8px;
  }
  .field-label {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm, 13px);
    color: var(--t2);
  }
  .field-value {
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  textarea,
  .memory-add input {
    width: 100%;
    border: 1px solid var(--border-l);
    border-radius: 10px;
    background: var(--bg);
    color: var(--t1);
    font: inherit;
    font-size: var(--text-sm, 14px);
    padding: 10px 12px;
    resize: vertical;
    outline: none;
  }
  textarea:focus,
  .memory-add input:focus {
    border-color: var(--t3);
  }

  .voice-select {
    border: 1px solid var(--border-l);
    border-radius: 8px;
    background: var(--bg);
    color: var(--t1);
    font: inherit;
    font-size: var(--text-sm, 13px);
    padding: 6px 10px;
    outline: none;
    cursor: pointer;
  }
  .voice-select:focus {
    border-color: var(--t3);
  }

  /* —— 记忆管理 —— */
  .memory-add {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .memory-add input {
    flex: 1;
  }
  .memory-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    max-height: 260px;
    overflow-y: auto;
  }
  .memory-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
  }
  .memory-text {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm, 13px);
    color: var(--t1);
    overflow-wrap: anywhere;
  }
  .memory-del {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--t4);
    cursor: pointer;
  }
  .memory-del:hover {
    color: var(--t1);
    background: var(--card);
  }

  /* —— 云端同步 —— */
  .cloud-login {
    display: grid;
    gap: 8px;
  }
  .cloud-input {
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
  .cloud-input:focus {
    border-color: var(--t3);
  }
  .cloud-connect {
    justify-self: start;
  }
  .cloud-error {
    color: var(--critical, #f85149);
  }

  .danger-btn {
    justify-self: start;
    border: 1px solid var(--border-l);
    background: var(--bg);
    color: var(--critical, #f85149);
    border-radius: 10px;
    padding: 8px 14px;
    font-size: var(--text-sm, 13px);
    cursor: pointer;
  }
  .danger-btn:hover {
    background: var(--card-h);
  }

  /* —— MCP servers —— */
  .mcp-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border-l);
  }
  .mcp-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .mcp-name {
    font-size: var(--text-sm, 14px);
    color: var(--t1);
  }
  .mcp-url {
    font-size: var(--text-xs, 12px);
    color: var(--t3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mcp-add {
    gap: 8px;
  }
  .mcp-actions {
    display: flex;
    gap: 8px;
  }
</style>
