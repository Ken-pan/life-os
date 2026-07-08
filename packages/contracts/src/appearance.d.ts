/**
 * Cross-surface appearance preferences.
 *
 * This module intentionally uses "appearance" instead of "theme" because
 * @life-os/theme is the web-only CSS/runtime implementation package.
 */

/** cross-surface -> Swift: enum ColorSchemePreference: String, Codable */
export type ColorSchemePreference = 'light' | 'dark' | 'system'

/** cross-surface -> Swift: enum BrandThemeID: String, Codable */
export type BrandThemeID = 'planner' | 'fitness' | 'finance' | 'music' | 'portal'

/** cross-surface -> Swift: enum AmbientThemeSource: String, Codable */
export type AmbientThemeSource =
  | 'none'
  | 'albumArt'
  | 'coverMedia'
  | 'focusMode'

/** cross-surface -> Swift: struct ThemePreferenceModel: Codable */
export type ThemePreferenceModel = {
  colorScheme: ColorSchemePreference
  brand: BrandThemeID
  ambient: AmbientThemeSource
}
