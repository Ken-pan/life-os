import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useFinance } from '../store/store'
import { defaultAssumptions } from '../store/defaults'
import { NumberField, PercentField } from './fields'
import { DeviceManager } from '../auth/DeviceManager'
import { HorizontalTabs, TabPanel } from './HorizontalTabs'
import {
  clearLegacyLocalFinanceKeys,
  migrateLegacyLocalFinanceToCloud,
  readLegacyLocalFinance,
  summarizeLegacyLocalFinance,
} from '../lib/localDataMigration'
import {
  deleteAllFinancialData,
  exportFinancialBackup,
  loadFinanceData,
  restoreFinancialBackup,
  summarizeBackupPayload,
  validateFinancialBackupPayload,
  type FinancialBackupPayload,
} from '../lib/repo'
import {
  getBackupFormatNote,
  backupRestoreDoneMessage,
  accessibleLabel,
  productName,
  stsBreakdown,
} from '../copy/terminology'
import { useTransactions } from '../store/transactions'
import { useLocale } from '../i18n/context'
import { formatDateTimeForIntl } from '../format'
import { SettingsAppearanceSection } from './settings/SettingsAppearanceSection'
import { SettingsSection as SettingsSectionCard } from './settings/SettingsSection'
import { SettingsPrefRow } from './settings/SettingsPrefRow'
import { SettingsButtonGroup } from './settings/SettingsButtonGroup'
import type { ThemePreference } from '../lib/themePreference'
import type { SettingsSection } from '../lib/appRoute'
import type { GoTab } from './AppShell'
import { HelpCenterView } from './HelpCenterView'
import { AnalyticsPanel } from './settings/AnalyticsPanel'

export function SettingsView({
  themePreference,
  onThemePreferenceChange,
  lockPortraitOnPhone,
  onLockPortraitOnPhoneChange,
  section,
  onSectionChange,
  onGoTab,
}: {
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  lockPortraitOnPhone?: boolean
  onLockPortraitOnPhoneChange?: (enabled: boolean) => void
  section?: SettingsSection
  onSectionChange?: (section: SettingsSection) => void
  onGoTab?: GoTab
}) {
  const store = useFinance()
  const a = store.data.assumptions
  const [openAdvanced, setOpenAdvanced] = useState(false)
  const [openExpert, setOpenExpert] = useState(false)
  const [restoreCandidate, setRestoreCandidate] =
    useState<FinancialBackupPayload | null>(null)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [dataActionBusy, setDataActionBusy] = useState(false)
  const [dataActionResult, setDataActionResult] = useState<string | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('finance_os_last_backup_at')
    } catch {
      return null
    }
  })
  const [internalSection, setInternalSection] =
    useState<SettingsSection>('assumptions')
  const [legacyConfirmText, setLegacyConfirmText] = useState('')
  const [legacyBlobPresent, setLegacyBlobPresent] = useState(
    () => readLegacyLocalFinance() != null,
  )
  const legacyPreview = legacyBlobPresent ? readLegacyLocalFinance() : null
  const txns = useTransactions()
  const { t } = useLocale()
  const activeSection = section ?? internalSection
  const sts = stsBreakdown()
  const backupNote = getBackupFormatNote()
  const accessible = accessibleLabel()
  const product = productName()

  const downloadLegacyBlob = () => {
    if (!legacyPreview) return
    const blob = new Blob([JSON.stringify(legacyPreview, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-os-legacy-local-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setDataActionResult(t('settings.resultLegacyExported'))
  }

  const uploadLegacyToCloud = async () => {
    if (!legacyPreview) return
    setDataActionBusy(true)
    setDataActionResult(null)
    try {
      const cloud = await loadFinanceData()
      if (cloud) {
        setDataActionResult(t('settings.resultLegacyCloudBlocked'))
        return
      }
      const result = await migrateLegacyLocalFinanceToCloud(legacyPreview)
      setLegacyBlobPresent(false)
      setLegacyConfirmText('')
      setDataActionResult(
        t('settings.resultLegacyUploaded', {
          accounts: result.summary?.accounts ?? 0,
          cashFlows: result.summary?.cashFlows ?? 0,
          events: result.summary?.events ?? 0,
          goals: result.summary?.goals ?? 0,
        }),
      )
    } catch (error) {
      setDataActionResult(
        t('settings.resultLegacyUploadFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      setDataActionBusy(false)
    }
  }

  const clearLegacyBlob = () => {
    if (legacyConfirmText.trim().toUpperCase() !== 'CLEAR LEGACY') {
      setDataActionResult(t('settings.resultLegacyClearNeedConfirm'))
      return
    }
    clearLegacyLocalFinanceKeys()
    setLegacyBlobPresent(false)
    setLegacyConfirmText('')
    setDataActionResult(t('settings.resultLegacyCleared'))
  }

  const downloadBackup = async () => {
    setDataActionBusy(true)
    setDataActionResult(null)
    try {
      const backup = await exportFinancialBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-os-backup-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
      try {
        const ts = new Date().toISOString()
        localStorage.setItem('finance_os_last_backup_at', ts)
        setLastBackupAt(ts)
      } catch {
        // ignore
      }
      setDataActionResult(t('settings.resultBackupExported'))
    } catch (error) {
      setDataActionResult(
        t('settings.resultBackupExportFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      setDataActionBusy(false)
    }
  }

  const selectRestoreFile = async (file?: File) => {
    if (!file) return
    setRestoreCandidate(null)
    setRestoreConfirmText('')
    setDataActionResult(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const check = validateFinancialBackupPayload(parsed)
      if (!check.ok) {
        setDataActionResult(
          t('settings.resultRestoreValidationFailed', {
            errors: check.errors.join('；'),
          }),
        )
        return
      }
      setRestoreCandidate(parsed as FinancialBackupPayload)
      setDataActionResult(t('settings.resultRestoreValidated'))
    } catch (error) {
      setDataActionResult(
        t('settings.resultRestoreReadFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  const confirmRestore = async () => {
    if (!restoreCandidate) return
    if (restoreConfirmText.trim().toUpperCase() !== 'RESTORE') {
      setDataActionResult(t('settings.resultRestoreNeedConfirm'))
      return
    }
    setDataActionBusy(true)
    try {
      const result = await restoreFinancialBackup(restoreCandidate)
      await txns.reload()
      setDataActionResult(
        backupRestoreDoneMessage(result.schemaVersion, result.restoredAt),
      )
      window.location.reload()
    } catch (error) {
      setDataActionResult(
        t('settings.resultRestoreFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      setDataActionBusy(false)
    }
  }

  const confirmDeleteAll = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE ALL') {
      setDataActionResult(t('settings.resultDeleteNeedConfirm'))
      return
    }
    setDataActionBusy(true)
    try {
      const result = await deleteAllFinancialData()
      setDataActionResult(
        t('settings.resultDeleted', {
          details: Object.entries(result.deleted)
            .map(([table, count]) => `${table}:${count}`)
            .join('，'),
        }),
      )
      window.location.reload()
    } catch (error) {
      setDataActionResult(
        t('settings.resultDeleteFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      setDataActionBusy(false)
    }
  }

  const sections: { id: SettingsSection; label: string }[] = [
    { id: 'assumptions', label: t('settings.sectionAssumptions') },
    { id: 'app', label: t('settings.sectionApp') },
    { id: 'help', label: t('settings.sectionHelp') },
  ]

  return (
    <div className="settings-page">
      <HorizontalTabs
        items={sections}
        activeId={activeSection}
        className="settings-tabs"
        tablistWrapperClassName="settings-intro"
        ariaLabel={t('settings.sectionAria')}
        onChange={(next) => {
          onSectionChange?.(next)
          if (!onSectionChange) setInternalSection(next)
        }}
      >
        <TabPanel tabId="assumptions" active={activeSection === 'assumptions'}>
          <div className="card">
            <div className="section-head">
              <h3>{t('settings.assumptionsTitle')}</h3>
              <button
                className="icon-btn"
                onClick={() => store.setAssumptions({ ...defaultAssumptions })}
                title={t('settings.restoreDefaultsTitle')}
              >
                {t('settings.restoreDefaults')}
              </button>
            </div>
            <p className="muted-note">{t('settings.assumptionsIntro')}</p>

            <h3 className="mb-2">{t('settings.assumptionsBasic')}</h3>
            <div className="row">
              <PercentField
                label={t('settings.salaryGrowth')}
                value={a.salaryGrowth}
                onChange={(v) => store.setAssumptions({ salaryGrowth: v })}
              />
              <NumberField
                label={t('settings.emergencyReserveTarget')}
                value={a.emergencyReserveTarget}
                onChange={(v) =>
                  store.setAssumptions({ emergencyReserveTarget: v })
                }
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
                  })
                }
                step={1}
                min={1}
              />
            </div>
            <div className="row">
              <PercentField
                label={t('settings.investRatio')}
                value={a.investRatio}
                onChange={(v) =>
                  store.setAssumptions({
                    investRatio: Math.min(1, Math.max(0, v)),
                  })
                }
              />
              <div className="field">
                <label>{t('settings.displayModeLabel')}</label>
                <span className="seg">
                  <button
                    className={a.displayMode === 'today' ? 'active' : ''}
                    onClick={() =>
                      store.setAssumptions({ displayMode: 'today' })
                    }
                  >
                    {t('settings.displayToday')}
                  </button>
                  <button
                    className={a.displayMode === 'future' ? 'active' : ''}
                    onClick={() =>
                      store.setAssumptions({ displayMode: 'future' })
                    }
                  >
                    {t('settings.displayFuture')}
                  </button>
                </span>
              </div>
            </div>

            <button
              className="group-toggle mt-3"
              onClick={() => setOpenAdvanced((v) => !v)}
            >
              <span className={`chev${openAdvanced ? ' open' : ''}`}>⌄</span>
              {t('settings.advancedAssumptions')}
            </button>
            {openAdvanced && (
              <div className="grid gap-3">
                <div className="row">
                  <PercentField
                    label={t('settings.baselineReturn')}
                    value={a.baselineReturn}
                    onChange={(v) =>
                      store.setAssumptions({ baselineReturn: v })
                    }
                  />
                  <PercentField
                    label={t('settings.conservativeReturn')}
                    value={a.conservativeReturn}
                    onChange={(v) =>
                      store.setAssumptions({ conservativeReturn: v })
                    }
                  />
                  <PercentField
                    label={t('settings.aggressiveReturn')}
                    value={a.aggressiveReturn}
                    onChange={(v) =>
                      store.setAssumptions({ aggressiveReturn: v })
                    }
                  />
                </div>
                <div className="row">
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
                      })
                    }
                  />
                </div>
              </div>
            )}

            <button
              className="group-toggle mt-2"
              onClick={() => setOpenExpert((v) => !v)}
            >
              <span className={`chev${openExpert ? ' open' : ''}`}>⌄</span>
              {t('settings.expertNotes')}
            </button>
            {openExpert && (
              <div className="list mt-1">
                <div className="kv">
                  <span className="k">{t('settings.expertDisplayMode')}</span>
                  <span className="text-secondary">
                    {t('settings.expertDisplayModeSub')}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">{t('settings.expertBasicFirst')}</span>
                  <span className="text-secondary">
                    {t('settings.expertBasicFirstSub')}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">{t('settings.expertAdvanced')}</span>
                  <span className="text-secondary">
                    {t('settings.expertAdvancedSub')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel
          tabId="app"
          active={activeSection === 'app'}
          className="settings-section"
        >
          <div className="settings-section-head">
            <h3>{t('settings.appHead')}</h3>
            <p className="muted-note">{t('settings.appNote')}</p>
          </div>
          <SettingsAppearanceSection
            title={t('settings.appearance')}
            themePreference={themePreference}
            onThemePreferenceChange={onThemePreferenceChange}
            lockPortraitOnPhone={lockPortraitOnPhone}
            onLockPortraitOnPhoneChange={onLockPortraitOnPhoneChange}
          />
          <SettingsSectionCard title={t('settings.uiPrefs')}>
            <SettingsPrefRow
              label={t('settings.amountDisplay')}
              desc={t('settings.amountDisplayDesc')}
            >
              <button
                className="icon-btn"
                onClick={() => store.setPrivacy(!store.data.privacy)}
                title={
                  store.data.privacy
                    ? t('settings.showAmountsTitle')
                    : t('settings.hideAmountsTitle')
                }
                aria-label={
                  store.data.privacy
                    ? t('settings.showAmountsTitle')
                    : t('settings.hideAmountsTitle')
                }
              >
                {store.data.privacy ? (
                  <Eye size={16} strokeWidth={1.8} />
                ) : (
                  <EyeOff size={16} strokeWidth={1.8} />
                )}
                {store.data.privacy
                  ? t('settings.showAmounts')
                  : t('settings.hideAmounts')}
              </button>
            </SettingsPrefRow>
          </SettingsSectionCard>
          <SettingsSectionCard
            title={t('settings.dataTitle')}
            testId="settings-backup"
          >
            <p className="muted-note">{t('settings.dataIntro', { product })}</p>
            <p className="muted-note">{t('settings.dataBackupWarning')}</p>
            <p className="muted-note">
              {t('settings.dataBackupScope', { backupNote })}
            </p>
            {store.data.privacy && (
              <p className="muted-note">
                {t('settings.dataPrivacyBackupNote')}
              </p>
            )}
            {lastBackupAt && (
              <p className="muted-note">
                {t('settings.lastBackup', {
                  date: formatDateTimeForIntl(lastBackupAt),
                })}
              </p>
            )}

            <SettingsPrefRow
              label={t('settings.exportBackup')}
              desc={t('settings.exportJsonHint')}
            >
              <SettingsButtonGroup>
                <button
                  className="btn ghost"
                  onClick={() => void downloadBackup()}
                  disabled={dataActionBusy}
                >
                  {t('settings.exportJson')}
                </button>
              </SettingsButtonGroup>
            </SettingsPrefRow>

            <div className="list">
              <div className="kv kv-top">
                <span className="k">{t('settings.restoreBackup')}</span>
                <div className="kv-actions">
                  <input
                    className="input"
                    type="file"
                    accept="application/json"
                    onChange={(e) =>
                      void selectRestoreFile(e.target.files?.[0])
                    }
                    disabled={dataActionBusy}
                  />
                  {restoreCandidate && (
                    <>
                      <span
                        className="text-secondary"
                        style={{ textAlign: 'right', maxWidth: 380 }}
                      >
                        {t('settings.restoreSummary', {
                          accounts:
                            summarizeBackupPayload(restoreCandidate).accounts,
                          cashFlows:
                            summarizeBackupPayload(restoreCandidate).cashFlows,
                          events:
                            summarizeBackupPayload(restoreCandidate).events,
                          goals: summarizeBackupPayload(restoreCandidate).goals,
                          transactions:
                            summarizeBackupPayload(restoreCandidate)
                              .transactions,
                          extra:
                            restoreCandidate.schemaVersion >= 2
                              ? t('settings.restoreSummaryExtra', {
                                  scenarios:
                                    summarizeBackupPayload(restoreCandidate)
                                      .scenarios,
                                  holdings:
                                    summarizeBackupPayload(restoreCandidate)
                                      .holdingsSnapshots,
                                })
                              : '',
                        })}
                      </span>
                      <input
                        className="input"
                        value={restoreConfirmText}
                        onChange={(e) => setRestoreConfirmText(e.target.value)}
                        placeholder={t('settings.restoreConfirmPlaceholder')}
                        disabled={dataActionBusy}
                      />
                      <button
                        className="btn danger"
                        onClick={() => void confirmRestore()}
                        disabled={dataActionBusy}
                      >
                        {t('settings.restoreConfirm')}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="kv kv-top">
                <span className="k">{t('settings.deleteAllTitle')}</span>
                <div className="kv-actions">
                  <input
                    className="input"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={t('settings.deleteConfirmPlaceholder')}
                    disabled={dataActionBusy}
                  />
                  <button
                    className="btn danger"
                    onClick={() => void confirmDeleteAll()}
                    disabled={dataActionBusy}
                  >
                    {t('settings.deleteAll')}
                  </button>
                </div>
              </div>
            </div>
            {legacyBlobPresent && legacyPreview && (
              <div className="card mt-3">
                <h3>{t('settings.legacyTitle')}</h3>
                <p className="muted-note">
                  {t('settings.legacyDetected', {
                    version: legacyPreview.version,
                    date: formatDateTimeForIntl(legacyPreview.updatedAt),
                  })}
                </p>
                <p className="muted-note">
                  {t('settings.legacySummary', {
                    accounts:
                      summarizeLegacyLocalFinance(legacyPreview).accounts,
                    cashFlows:
                      summarizeLegacyLocalFinance(legacyPreview).cashFlows,
                    events: summarizeLegacyLocalFinance(legacyPreview).events,
                    goals: summarizeLegacyLocalFinance(legacyPreview).goals,
                    holdings:
                      summarizeLegacyLocalFinance(legacyPreview)
                        .holdingsSnapshots,
                  })}
                </p>
                <div className="list">
                  <div className="kv">
                    <span className="k">{t('settings.legacyExport')}</span>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={downloadLegacyBlob}
                      disabled={dataActionBusy}
                    >
                      {t('settings.legacyDownload')}
                    </button>
                  </div>
                  <div className="kv">
                    <span className="k">{t('settings.legacyUpload')}</span>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => void uploadLegacyToCloud()}
                      disabled={dataActionBusy}
                    >
                      {t('settings.legacyUploadHint')}
                    </button>
                  </div>
                  <div className="kv kv-top">
                    <span className="k">{t('settings.legacyClear')}</span>
                    <div className="kv-actions">
                      <input
                        className="input"
                        value={legacyConfirmText}
                        onChange={(e) => setLegacyConfirmText(e.target.value)}
                        placeholder={t('settings.legacyConfirmPlaceholder')}
                        disabled={dataActionBusy}
                      />
                      <button
                        className="btn danger"
                        type="button"
                        onClick={clearLegacyBlob}
                        disabled={dataActionBusy}
                      >
                        {t('settings.legacyClearConfirm')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {dataActionResult && (
              <p className="muted-note mb-0">{dataActionResult}</p>
            )}
          </SettingsSectionCard>
          <AnalyticsPanel />
          <DeviceManager />
        </TabPanel>

        <TabPanel tabId="help" active={activeSection === 'help'}>
          {onGoTab ? (
            <HelpCenterView onGoTab={onGoTab} />
          ) : (
            <div className="card">
              <p className="muted-note">{t('help.centerIntro')}</p>
            </div>
          )}
        </TabPanel>
      </HorizontalTabs>
    </div>
  )
}
