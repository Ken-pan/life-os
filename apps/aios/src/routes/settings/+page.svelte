<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { S, save, applyTheme } from '$lib/state.svelte.js'
  import { t, setLocale } from '$lib/i18n/index.js'
  import { MODELS, TTS_VOICES } from '$lib/localai.js'
  import { C, refreshGateway, clearAllConversations } from '$lib/chat.svelte.js'
  import { M, deleteMemory, clearMemories, addMemory } from '$lib/memory.svelte.js'

  const themeOptions = $derived([
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
    { value: 'auto', label: t('settings.themeAuto') },
  ])

  const smartToggles = $derived([
    { key: 'tools', label: t('settings.tools'), desc: t('settings.toolsDesc') },
    { key: 'webAccess', label: t('settings.webAccess'), desc: t('settings.webAccessDesc') },
    { key: 'memory', label: t('settings.memory'), desc: t('settings.memoryDesc') },
  ])

  function setTheme(value) {
    S.settings.theme = value
    save()
    applyTheme()
  }

  function setModel(value) {
    S.settings.model = value
    save()
  }

  function toggle(key) {
    S.settings[key] = !S.settings[key]
    save()
  }

  let checking = $state(false)
  async function checkGateway() {
    checking = true
    await refreshGateway()
    checking = false
  }

  function clearChats() {
    if (confirm(t('settings.clearChatsConfirm'))) clearAllConversations()
  }

  function clearAllMemories() {
    if (confirm(t('settings.clearMemoriesConfirm'))) clearMemories()
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
        <button type="button" class="mini-btn" disabled={checking} onclick={checkGateway}>
          {t('settings.gatewayCheck')}
        </button>
      </span>
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
    <p class="note">{t('settings.gatewayNote')}</p>
  </section>

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

  <section class="card">
    <h2>
      {t('settings.memories')}
      <span class="count">{M.items.length}</span>
    </h2>
    <p class="note">{t('settings.memoriesDesc')}</p>

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

  <section class="card">
    <h2>{t('settings.theme')}</h2>
    <div class="seg" role="group" aria-label={t('settings.theme')}>
      {#each themeOptions as option (option.value)}
        <button
          type="button"
          class:on={S.settings.theme === option.value}
          aria-pressed={S.settings.theme === option.value}
          onclick={() => setTheme(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="card">
    <h2>{t('settings.language')}</h2>
    <div class="seg" role="group" aria-label={t('settings.language')}>
      <button
        type="button"
        class:on={S.settings.locale === 'zh'}
        aria-pressed={S.settings.locale === 'zh'}
        onclick={() => setLocale('zh')}
      >
        中文
      </button>
      <button
        type="button"
        class:on={S.settings.locale === 'en'}
        aria-pressed={S.settings.locale === 'en'}
        onclick={() => setLocale('en')}
      >
        English
      </button>
    </div>
  </section>

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
    transition: background var(--dur-fast, 120ms) var(--ease, ease);
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
    transition: transform var(--dur-fast, 120ms) var(--ease, ease);
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
</style>
