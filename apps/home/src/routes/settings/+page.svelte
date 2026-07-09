<script>
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsToggleRow from '@life-os/platform-web/svelte/settings/toggle-row'
  import { S, setTheme, reset508Layout, exportLayoutJson, importLayoutJson } from '$lib/state.svelte.js'
  import { getActiveProject } from '$lib/state.svelte.js'
  import {
    isSpatialStudioEnabled,
    setSpatialStudioEnabled,
  } from '$lib/spatial-studio.js'

  const project = $derived(getActiveProject())
  const studio = $derived(isSpatialStudioEnabled())

  /** @param {import('@life-os/contracts/appearance').ColorSchemePreference} value */
  function onTheme(value) {
    setTheme(value)
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
  {#if studio}
    <SettingsRow label="尺寸编辑">
      <a class="settings-link" href="/plan">前往平面页 →</a>
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
      <button type="button" class="settings-btn" onclick={reset508Layout}>开发商户型尺寸</button>
    </SettingsRow>
  {/if}
</SettingsSection>

{#if studio}
  <SettingsSection title="空间工坊（内部）">
    <SettingsToggleRow
      label="户型编辑与家具层"
      desc="对外站点默认关闭；可用 ?studio=1 启用并持久化"
      checked={studio}
      onchange={(v) => setSpatialStudioEnabled(v)}
    />
    <SettingsRow label="入口">
      <a class="settings-link" href="/plan">平面 · 编辑户型 →</a>
    </SettingsRow>
  </SettingsSection>
{/if}

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
