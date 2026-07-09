<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { buildAppPath, parseAppPath } from '@life-os/finance-core/routing/app-route'
  import { DEFAULT_PWA_SETTINGS, normalizePwaSettings } from '@life-os/theme'
  import SettingsView from '$lib/components/SettingsView.svelte'
  import { themePreference, setThemePreference } from '$lib/themePreference.svelte.js'
  import { createGoTab } from '$lib/goTab.js'

  const PWA_SETTINGS_STORAGE_KEY = 'fos-pwa-settings'

  function readPwaSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(PWA_SETTINGS_STORAGE_KEY) ?? 'null')
      return normalizePwaSettings(raw)
    } catch {
      return { ...DEFAULT_PWA_SETTINGS }
    }
  }

  function writePwaSettings(next) {
    localStorage.setItem(PWA_SETTINGS_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new StorageEvent('storage', { key: PWA_SETTINGS_STORAGE_KEY }))
  }

  let pwaSettings = $state(readPwaSettings())
  const onGoTab = createGoTab()

  const section = $derived(
    /** @type {import('@life-os/finance-core/routing/app-route').SettingsSection} */ (
      parseAppPath(page.url.pathname)?.section ?? 'assumptions'
    ),
  )

  /** @param {import('@life-os/finance-core/routing/app-route').SettingsSection} next */
  function onSectionChange(next) {
    void goto(buildAppPath({ tab: 'settings', section: next }))
  }

  /** @param {boolean} enabled */
  function onLockPortraitOnPhoneChange(enabled) {
    pwaSettings = { ...pwaSettings, lockPortraitOnPhone: enabled }
    writePwaSettings(pwaSettings)
  }
</script>

<SettingsView
  themePreference={themePreference()}
  onThemePreferenceChange={setThemePreference}
  lockPortraitOnPhone={pwaSettings.lockPortraitOnPhone}
  {onLockPortraitOnPhoneChange}
  {section}
  {onSectionChange}
  {onGoTab}
/>
