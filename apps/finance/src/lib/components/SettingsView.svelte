<script>
  import { Eye, EyeOff } from '@lucide/svelte'
  import { goto } from '$app/navigation'
  import { buildAppPath } from '@life-os/finance-core/routing/app-route'
  import { defaultAssumptions } from '@life-os/finance-core/defaults'
  import NumberField from '$lib/components/fields/NumberField.svelte'
  import PercentField from '$lib/components/fields/PercentField.svelte'
  import {
    LifeOsTabs as HorizontalTabs,
    LifeOsTabPanel as TabPanel,
  } from '@life-os/platform-web/svelte/tabs'
  import {
    clearLegacyLocalFinanceKeys,
    migrateLegacyLocalFinanceToCloud,
    readLegacyLocalFinance,
    summarizeLegacyLocalFinance,
  } from '$lib/localDataMigration'
  import {
    deleteAllFinancialData,
    exportFinancialBackup,
    loadFinanceData,
    restoreFinancialBackup,
    summarizeBackupPayload,
    validateFinancialBackupPayload,
  } from '$lib/repo'
  import {
    getBackupFormatNote,
    backupRestoreDoneMessage,
    accessibleLabel,
    productName,
    stsBreakdown,
  } from '@life-os/finance-core/copy/terminology'
  import { t } from '$lib/i18n.svelte.js'
  import { formatDateTimeForIntl } from '$lib/format.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import SettingsSection from '@life-os/platform-web/svelte/settings/section'
  import SettingsRow from '@life-os/platform-web/svelte/settings/row'
  import SettingsButtonGroup from '@life-os/platform-web/svelte/settings/button-group'
  import SettingsAppearanceSection from './settings/SettingsAppearanceSection.svelte'
  import HelpCenterView from './HelpCenterView.svelte'
  import AnalyticsPanel from './settings/AnalyticsPanel.svelte'
  import DeviceManager from './DeviceManager.svelte'

  /** @typedef {import('../../lib/themePreference').ThemePreference} ThemePreference */
  /** @typedef {import('@life-os/finance-core/routing/app-route').SettingsSection} SettingsSectionId */
  /** @typedef {import('$lib/goTab.js').GoTab} GoTab */
  /** @typedef {import('$lib/repo').FinancialBackupPayload} FinancialBackupPayload */

  /** @type {{
   *   themePreference: ThemePreference,
   *   onThemePreferenceChange: (preference: ThemePreference) => void,
   *   lockPortraitOnPhone?: boolean,
   *   onLockPortraitOnPhoneChange?: (enabled: boolean) => void,
   *   section?: SettingsSectionId,
   *   onSectionChange?: (section: SettingsSectionId) => void,
   *   onGoTab?: GoTab,
   * }} */
  let {
    themePreference,
    onThemePreferenceChange,
    lockPortraitOnPhone,
    onLockPortraitOnPhoneChange,
    section,
    onSectionChange,
    onGoTab,
  } = $props()

  const store = getFinanceStore()
  const txns = getTransactionsStore()

  let openAdvanced = $state(false)
  let openExpert = $state(false)
  /** @type {FinancialBackupPayload | null} */
  let restoreCandidate = $state(null)
  let restoreConfirmText = $state('')
  let deleteConfirmText = $state('')
  let dataActionBusy = $state(false)
  let dataActionResult = $state(null)
  let lastBackupAt = $state(/** @type {string | null} */ (null))

  if (typeof localStorage !== 'undefined') {
    try {
      lastBackupAt = localStorage.getItem('finance_os_last_backup_at')
    } catch {
      // ignore
    }
  }
  /** @type {SettingsSectionId} */
  let internalSection = $state('assumptions')
  let legacyConfirmText = $state('')
  let legacyBlobPresent = $state(readLegacyLocalFinance() != null)

  const a = $derived(store.data.assumptions)
  const activeSection = $derived(section ?? internalSection)
  const sts = $derived(stsBreakdown())
  const backupNote = $derived(getBackupFormatNote())
  const accessible = $derived(accessibleLabel())
  const product = $derived(productName())
  const legacyPreview = $derived(legacyBlobPresent ? readLegacyLocalFinance() : null)

  const sections = $derived([
    { id: 'assumptions', label: t('settings.sectionAssumptions') },
    { id: 'app', label: t('settings.sectionApp') },
    { id: 'help', label: t('settings.sectionHelp') },
  ])

  /** @param {SettingsSectionId} next */
  function handleSectionChange(next) {
    onSectionChange?.(next)
    if (!onSectionChange) internalSection = next
    void goto(buildAppPath({ tab: 'settings', section: next }))
  }

  function downloadLegacyBlob() {
    if (!legacyPreview) return
    const blob = new Blob([JSON.stringify(legacyPreview, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `finance-os-legacy-local-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    dataActionResult = t('settings.resultLegacyExported')
  }

  async function uploadLegacyToCloud() {
    if (!legacyPreview) return
    dataActionBusy = true
    dataActionResult = null
    try {
      const cloud = await loadFinanceData()
      if (cloud) {
        dataActionResult = t('settings.resultLegacyCloudBlocked')
        return
      }
      const result = await migrateLegacyLocalFinanceToCloud(legacyPreview)
      legacyBlobPresent = false
      legacyConfirmText = ''
      dataActionResult = t('settings.resultLegacyUploaded', {
        accounts: result.summary?.accounts ?? 0,
        cashFlows: result.summary?.cashFlows ?? 0,
        events: result.summary?.events ?? 0,
        goals: result.summary?.goals ?? 0,
      })
    } catch (error) {
      dataActionResult = t('settings.resultLegacyUploadFailed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      dataActionBusy = false
    }
  }

  function clearLegacyBlob() {
    if (legacyConfirmText.trim().toUpperCase() !== 'CLEAR LEGACY') {
      dataActionResult = t('settings.resultLegacyClearNeedConfirm')
      return
    }
    clearLegacyLocalFinanceKeys()
    legacyBlobPresent = false
    legacyConfirmText = ''
    dataActionResult = t('settings.resultLegacyCleared')
  }

  async function downloadBackup() {
    dataActionBusy = true
    dataActionResult = null
    try {
      const backup = await exportFinancialBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `finance-os-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      try {
        const ts = new Date().toISOString()
        localStorage.setItem('finance_os_last_backup_at', ts)
        lastBackupAt = ts
      } catch {
        // ignore
      }
      dataActionResult = t('settings.resultBackupExported')
    } catch (error) {
      dataActionResult = t('settings.resultBackupExportFailed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      dataActionBusy = false
    }
  }

  /** @param {File | undefined} file */
  async function selectRestoreFile(file) {
    if (!file) return
    restoreCandidate = null
    restoreConfirmText = ''
    dataActionResult = null
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const check = validateFinancialBackupPayload(parsed)
      if (!check.ok) {
        dataActionResult = t('settings.resultRestoreValidationFailed', {
          errors: check.errors.join('；'),
        })
        return
      }
      restoreCandidate = parsed
      dataActionResult = t('settings.resultRestoreValidated')
    } catch (error) {
      dataActionResult = t('settings.resultRestoreReadFailed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function confirmRestore() {
    if (!restoreCandidate) return
    if (restoreConfirmText.trim().toUpperCase() !== 'RESTORE') {
      dataActionResult = t('settings.resultRestoreNeedConfirm')
      return
    }
    dataActionBusy = true
    try {
      const result = await restoreFinancialBackup(restoreCandidate)
      await txns.reload()
      dataActionResult = `${backupRestoreDoneMessage(result.schemaVersion, result.restoredAt)}${t('settings.reloadingHint')}`
      // 先让结果文案可见，再刷新（否则立即 reload 会盖掉反馈）
      setTimeout(() => window.location.reload(), 1600)
    } catch (error) {
      dataActionResult = t('settings.resultRestoreFailed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      dataActionBusy = false
    }
  }

  async function confirmDeleteAll() {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE ALL') {
      dataActionResult = t('settings.resultDeleteNeedConfirm')
      return
    }
    dataActionBusy = true
    try {
      const result = await deleteAllFinancialData()
      dataActionResult = `${t('settings.resultDeleted', {
        details: Object.entries(result.deleted)
          .map(([table, count]) => `${table}:${count}`)
          .join('，'),
      })}${t('settings.reloadingHint')}`
      // 先让结果文案可见，再刷新（否则立即 reload 会盖掉反馈）
      setTimeout(() => window.location.reload(), 1600)
    } catch (error) {
      dataActionResult = t('settings.resultDeleteFailed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      dataActionBusy = false
    }
  }
</script>

<div class="settings-page">
  <HorizontalTabs
    items={sections}
    activeId={activeSection}
    class="settings-tabs"
    tablistWrapperClass="settings-intro"
    ariaLabel={t('settings.sectionAria')}
    onChange={(next) => handleSectionChange(/** @type {SettingsSectionId} */ (next))}
  >
    <TabPanel tabId="assumptions" active={activeSection === 'assumptions'}>
      <div class="card">
        <div class="section-head">
          <h3>{t('settings.assumptionsTitle')}</h3>
          <button
            class="icon-btn"
            onclick={() => store.setAssumptions({ ...defaultAssumptions })}
            title={t('settings.restoreDefaultsTitle')}
          >
            {t('settings.restoreDefaults')}
          </button>
        </div>
        <p class="muted-note">{t('settings.assumptionsIntro')}</p>

        <h3 class="mb-2" style="margin-top: var(--space-4)">{t('settings.assumptionsBasic')}</h3>
        <div class="row">
          <PercentField
            label={t('settings.salaryGrowth')}
            value={a.salaryGrowth}
            onChange={(v) => store.setAssumptions({ salaryGrowth: v })}
          />
          <NumberField
            label={t('settings.emergencyReserveTarget')}
            value={a.emergencyReserveTarget}
            onChange={(v) => store.setAssumptions({ emergencyReserveTarget: v })}
            step={1000}
          />
          <NumberField
            label={t('settings.checkingBufferMin', { buffer: sts.buffer })}
            value={a.checkingBuffer}
            onChange={(v) => store.setAssumptions({ checkingBuffer: v })}
            step={500}
          />
          <NumberField
            label={t('settings.horizonYears')}
            value={a.horizonYears}
            onChange={(v) =>
              store.setAssumptions({
                horizonYears: Math.max(1, Math.min(40, Math.round(v))),
              })}
            step={1}
            min={1}
          />
        </div>
        <div class="row">
          <PercentField
            label={t('settings.investRatio')}
            value={a.investRatio}
            onChange={(v) =>
              store.setAssumptions({
                investRatio: Math.min(1, Math.max(0, v)),
              })}
          />
          <div class="field">
            <label>{t('settings.displayModeLabel')}</label>
            <span class="seg">
              <button
                class={a.displayMode === 'today' ? 'active' : ''}
                onclick={() => store.setAssumptions({ displayMode: 'today' })}
              >
                {t('settings.displayToday')}
              </button>
              <button
                class={a.displayMode === 'future' ? 'active' : ''}
                onclick={() => store.setAssumptions({ displayMode: 'future' })}
              >
                {t('settings.displayFuture')}
              </button>
            </span>
          </div>
        </div>

        <button class="group-toggle mt-3" onclick={() => (openAdvanced = !openAdvanced)}>
          <span class="chev{openAdvanced ? ' open' : ''}">⌄</span>
          {t('settings.advancedAssumptions')}
        </button>
        {#if openAdvanced}
          <div class="grid gap-3">
            <div class="row">
              <PercentField
                label={t('settings.baselineReturn')}
                value={a.baselineReturn}
                onChange={(v) => store.setAssumptions({ baselineReturn: v })}
              />
              <PercentField
                label={t('settings.conservativeReturn')}
                value={a.conservativeReturn}
                onChange={(v) => store.setAssumptions({ conservativeReturn: v })}
              />
              <PercentField
                label={t('settings.aggressiveReturn')}
                value={a.aggressiveReturn}
                onChange={(v) => store.setAssumptions({ aggressiveReturn: v })}
              />
            </div>
            <div class="row">
              <PercentField
                label={t('settings.inflationRate')}
                value={a.inflation}
                onChange={(v) => store.setAssumptions({ inflation: v })}
              />
              <PercentField
                label={t('settings.cashYield')}
                value={a.cashYield}
                onChange={(v) => store.setAssumptions({ cashYield: v })}
              />
              <PercentField
                label={t('settings.capitalGainsTax', { accessible })}
                value={a.capitalGainsTaxRate ?? 0.15}
                onChange={(v) =>
                  store.setAssumptions({
                    capitalGainsTaxRate: Math.min(1, Math.max(0, v)),
                  })}
              />
            </div>
          </div>
        {/if}

        <button class="group-toggle mt-2" onclick={() => (openExpert = !openExpert)}>
          <span class="chev{openExpert ? ' open' : ''}">⌄</span>
          {t('settings.expertNotes')}
        </button>
        {#if openExpert}
          <div class="list mt-1">
            <div class="kv">
              <span class="k">{t('settings.expertDisplayMode')}</span>
              <span class="text-secondary">{t('settings.expertDisplayModeSub')}</span>
            </div>
            <div class="kv">
              <span class="k">{t('settings.expertBasicFirst')}</span>
              <span class="text-secondary">{t('settings.expertBasicFirstSub')}</span>
            </div>
            <div class="kv">
              <span class="k">{t('settings.expertAdvanced')}</span>
              <span class="text-secondary">{t('settings.expertAdvancedSub')}</span>
            </div>
          </div>
        {/if}
      </div>
    </TabPanel>

    <TabPanel tabId="app" active={activeSection === 'app'} class="settings-section">
      <div class="settings-section-head">
        <h3>{t('settings.appHead')}</h3>
        <p class="muted-note">{t('settings.appNote')}</p>
      </div>
      <SettingsAppearanceSection
        title={t('settings.appearance')}
        {themePreference}
        {onThemePreferenceChange}
        {lockPortraitOnPhone}
        {onLockPortraitOnPhoneChange}
      />
      <SettingsSection title={t('settings.uiPrefs')}>
        <SettingsRow label={t('settings.amountDisplay')} desc={t('settings.amountDisplayDesc')}>
          <button
            class="icon-btn"
            onclick={() => store.setPrivacy(!store.data.privacy)}
            title={store.data.privacy ? t('settings.showAmountsTitle') : t('settings.hideAmountsTitle')}
            aria-label={store.data.privacy ? t('settings.showAmountsTitle') : t('settings.hideAmountsTitle')}
          >
            {#if store.data.privacy}
              <Eye size={16} strokeWidth={1.8} />
            {:else}
              <EyeOff size={16} strokeWidth={1.8} />
            {/if}
            {store.data.privacy ? t('settings.showAmounts') : t('settings.hideAmounts')}
          </button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title={t('settings.dataTitle')} testId="settings-backup">
        <p class="block-desc">{t('settings.dataIntro', { product })}</p>
        <p class="block-desc">{t('settings.dataBackupWarning')}</p>
        <p class="block-desc">{t('settings.dataBackupScope', { backupNote })}</p>
        {#if store.data.privacy}
          <p class="block-desc">{t('settings.dataPrivacyBackupNote')}</p>
        {/if}
        {#if lastBackupAt}
          <p class="block-desc">
            {t('settings.lastBackup', { date: formatDateTimeForIntl(lastBackupAt) })}
          </p>
        {/if}

        <SettingsRow label={t('settings.exportBackup')} desc={t('settings.exportJsonHint')}>
          <SettingsButtonGroup>
            <button class="btn ghost" onclick={() => void downloadBackup()} disabled={dataActionBusy}>
              {t('settings.exportJson')}
            </button>
          </SettingsButtonGroup>
        </SettingsRow>

        <SettingsRow label={t('settings.restoreBackup')}>
          <div class="kv-actions">
            <input
              class="input"
              type="file"
              accept="application/json"
              onchange={(e) => void selectRestoreFile(e.currentTarget.files?.[0])}
              disabled={dataActionBusy}
            />
            {#if restoreCandidate}
              <span class="text-secondary" style="text-align: right; max-width: 380px">
                {t('settings.restoreSummary', {
                  accounts: summarizeBackupPayload(restoreCandidate).accounts,
                  cashFlows: summarizeBackupPayload(restoreCandidate).cashFlows,
                  events: summarizeBackupPayload(restoreCandidate).events,
                  goals: summarizeBackupPayload(restoreCandidate).goals,
                  transactions: summarizeBackupPayload(restoreCandidate).transactions,
                  extra:
                    restoreCandidate.schemaVersion >= 2
                      ? t('settings.restoreSummaryExtra', {
                          scenarios: summarizeBackupPayload(restoreCandidate).scenarios,
                          holdings: summarizeBackupPayload(restoreCandidate).holdingsSnapshots,
                        })
                      : '',
                })}
              </span>
              <input
                class="input"
                value={restoreConfirmText}
                oninput={(e) => (restoreConfirmText = e.currentTarget.value)}
                placeholder={t('settings.restoreConfirmPlaceholder')}
                disabled={dataActionBusy}
              />
              <button class="btn danger" onclick={() => void confirmRestore()} disabled={dataActionBusy}>
                {t('settings.restoreConfirm')}
              </button>
            {/if}
          </div>
        </SettingsRow>
        <SettingsRow label={t('settings.deleteAllTitle')}>
          <div class="kv-actions">
            <input
              class="input"
              value={deleteConfirmText}
              oninput={(e) => (deleteConfirmText = e.currentTarget.value)}
              placeholder={t('settings.deleteConfirmPlaceholder')}
              disabled={dataActionBusy}
            />
            <button class="btn danger" onclick={() => void confirmDeleteAll()} disabled={dataActionBusy}>
              {t('settings.deleteAll')}
            </button>
          </div>
        </SettingsRow>
        {#if dataActionResult}
          <p class="block-desc">{dataActionResult}</p>
        {/if}
      </SettingsSection>
      {#if legacyBlobPresent && legacyPreview}
        <SettingsSection title={t('settings.legacyTitle')}>
          <p class="block-desc">
            {t('settings.legacyDetected', {
              version: legacyPreview.version,
              date: formatDateTimeForIntl(legacyPreview.updatedAt),
            })}
          </p>
          <p class="block-desc">
            {t('settings.legacySummary', {
              accounts: summarizeLegacyLocalFinance(legacyPreview).accounts,
              cashFlows: summarizeLegacyLocalFinance(legacyPreview).cashFlows,
              events: summarizeLegacyLocalFinance(legacyPreview).events,
              goals: summarizeLegacyLocalFinance(legacyPreview).goals,
              holdings: summarizeLegacyLocalFinance(legacyPreview).holdingsSnapshots,
            })}
          </p>
          <SettingsRow label={t('settings.legacyExport')}>
            <button class="btn ghost" type="button" onclick={downloadLegacyBlob} disabled={dataActionBusy}>
              {t('settings.legacyDownload')}
            </button>
          </SettingsRow>
          <SettingsRow label={t('settings.legacyUpload')}>
            <button
              class="btn ghost"
              type="button"
              onclick={() => void uploadLegacyToCloud()}
              disabled={dataActionBusy}
            >
              {t('settings.legacyUploadHint')}
            </button>
          </SettingsRow>
          <SettingsRow label={t('settings.legacyClear')}>
            <div class="kv-actions">
              <input
                class="input"
                value={legacyConfirmText}
                oninput={(e) => (legacyConfirmText = e.currentTarget.value)}
                placeholder={t('settings.legacyConfirmPlaceholder')}
                disabled={dataActionBusy}
              />
              <button class="btn danger" type="button" onclick={clearLegacyBlob} disabled={dataActionBusy}>
                {t('settings.legacyClearConfirm')}
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>
      {/if}
      <AnalyticsPanel />
      <DeviceManager />
    </TabPanel>

    <TabPanel tabId="help" active={activeSection === 'help'}>
      {#if onGoTab}
        <HelpCenterView {onGoTab} />
      {:else}
        <div class="card">
          <p class="muted-note">{t('help.centerIntro')}</p>
        </div>
      {/if}
    </TabPanel>
  </HorizontalTabs>
</div>
