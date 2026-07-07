/**
 * @life-os/platform-web — web-only adapters.
 */
import type {
  ColorSchemePreference,
} from '@life-os/contracts/appearance'
import type { PageMetadata } from '@life-os/contracts/meta'
import type { ApplyThemeOptions, ResolvedTheme } from '@life-os/theme'

export type WebThemePreference = 'light' | 'dark' | 'auto'

export type ThemePreferenceStoreWebSnapshot = {
  preference: ColorSchemePreference
  webPreference: WebThemePreference
  resolved: ResolvedTheme
}

export type ThemePreferenceStoreWebOptions = {
  storageKey: string
  defaultPreference?: ColorSchemePreference
  storage?: Storage | null
  apply?: boolean
  themeOptions?: ApplyThemeOptions
}

export type ThemePreferenceStoreWeb = {
  getPreference(): ColorSchemePreference
  getWebPreference(): WebThemePreference
  getResolvedTheme(): ResolvedTheme
  setPreference(nextPreference: ColorSchemePreference): void
  subscribe(
    listener: (snapshot: ThemePreferenceStoreWebSnapshot) => void,
  ): () => void
  destroy(): void
}

export declare function toWebThemePreference(
  pref: ColorSchemePreference,
): WebThemePreference

export declare function fromWebThemePreference(
  pref: WebThemePreference,
): ColorSchemePreference

export declare function applyDocumentMetaWeb(
  meta: PageMetadata,
  options?: { pathname?: string; imagePath?: string },
): void

export declare function createThemePreferenceStoreWeb(
  options: ThemePreferenceStoreWebOptions,
): ThemePreferenceStoreWeb
