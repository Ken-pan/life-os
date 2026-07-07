import { useLocale } from '../i18n/context'
import { SUPPORTED_LOCALES, type AppLocale } from '../i18n/types'
import { notifyLocalePersist } from '../auth/AuthGate'
import type { ThemePreference } from '../lib/themePreference'
import { SettingsPrefRow } from './settings/SettingsPrefRow'

const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'auto']

export function AppearancePrefs({
  themePreference,
  onThemePreferenceChange,
  lockPortraitOnPhone = true,
  onLockPortraitOnPhoneChange,
}: {
  themePreference: ThemePreference
  onThemePreferenceChange: (preference: ThemePreference) => void
  lockPortraitOnPhone?: boolean
  onLockPortraitOnPhoneChange?: (enabled: boolean) => void
}) {
  const { t, locale, setLocale } = useLocale()

  const pickLocale = (next: AppLocale) => {
    setLocale(next)
    notifyLocalePersist(next)
  }

  return (
    <>
      <SettingsPrefRow
        label={t('settings.language')}
        desc={t('settings.languageDesc')}
      >
        <div className="seg" role="group" aria-label={t('settings.language')}>
          {SUPPORTED_LOCALES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={locale === opt.value ? 'active' : ''}
              onClick={() => pickLocale(opt.value)}
              aria-pressed={locale === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SettingsPrefRow>
      <SettingsPrefRow
        label={t('settings.theme')}
        desc={t('settings.themeDesc')}
      >
        <div className="seg" role="group" aria-label={t('settings.theme')}>
          {THEME_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={themePreference === value ? 'active' : ''}
              onClick={() => onThemePreferenceChange(value)}
              aria-pressed={themePreference === value}
            >
              {t(
                value === 'light'
                  ? 'settings.themeLight'
                  : value === 'dark'
                    ? 'settings.themeDark'
                    : 'settings.themeAuto',
              )}
            </button>
          ))}
        </div>
      </SettingsPrefRow>
      {onLockPortraitOnPhoneChange && (
        <SettingsPrefRow
          label={t('settings.lockPortraitOnPhone')}
          desc={t('settings.lockPortraitOnPhoneDesc')}
        >
          <div
            className={`toggle settings-toggle${lockPortraitOnPhone ? ' on' : ''}`}
            role="switch"
            aria-checked={lockPortraitOnPhone}
            aria-label={t('settings.lockPortraitOnPhone')}
            tabIndex={0}
            onClick={() => onLockPortraitOnPhoneChange(!lockPortraitOnPhone)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onLockPortraitOnPhoneChange(!lockPortraitOnPhone)
              }
            }}
          />
        </SettingsPrefRow>
      )}
    </>
  )
}
