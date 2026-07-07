import { AppearancePrefs } from '../AppearancePrefs'
import type { ThemePreference } from '../../lib/themePreference'

export function SettingsAppearanceSection({
  themePreference,
  onThemePreferenceChange,
  lockPortraitOnPhone,
  onLockPortraitOnPhoneChange,
  title,
}: {
  title: string
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  lockPortraitOnPhone?: boolean
  onLockPortraitOnPhoneChange?: (enabled: boolean) => void
}) {
  return (
    <div className="card settings-section" data-testid="settings-appearance">
      <h3>{title}</h3>
      <AppearancePrefs
        themePreference={themePreference}
        onThemePreferenceChange={onThemePreferenceChange}
        lockPortraitOnPhone={lockPortraitOnPhone}
        onLockPortraitOnPhoneChange={onLockPortraitOnPhoneChange}
      />
    </div>
  )
}
