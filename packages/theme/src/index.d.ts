export declare const LIFE_OS_LAYOUT: {
  readonly bpNarrow: 380
  readonly bpCompact: 640
  readonly bpPhone: 640
  readonly bpTabletMin: 641
  readonly bpTabletMax: 860
  readonly bpMobile: 860
  readonly bpMobileMin: 861
  readonly contentMaxText: 820
  readonly contentMaxData: 1320
}

export type LifeOsAppId = 'planner' | 'fitness' | 'finance' | 'music'

export type LifeOsSiteMetaEntry = {
  id: LifeOsAppId
  name: string
  shortName: string
  description: { zh: string; en: string }
  themeColor: { light: string; dark: string }
  defaultTheme: 'light' | 'dark' | 'auto'
  locale: string
  storageKey: string
  storageKind: 'nested' | 'direct'
  settingsThemePath: string[]
  favicon: { id?: string; light: string; dark?: string }
  manifest: string
  appleTouchIcon: string
  categories: string[]
}

export declare const LIFE_OS_SITE_META: Record<LifeOsAppId, LifeOsSiteMetaEntry>
export declare const LIFE_OS_ROBOTS: string
export declare const LIFE_OS_REFERRER: string

export declare function formatDocumentTitle(
  pageTitle: string | null | undefined,
  appName: string,
): string
export declare function getSiteDescription(
  appId: LifeOsAppId,
  locale?: 'zh' | 'en' | string,
): string
export declare function absoluteUrl(
  origin: string | null | undefined,
  path: string,
): string
export declare function getOgLocale(locale?: 'zh' | 'en' | string): string

export type ApplyDocumentMetaOptions = {
  pageTitle: string
  locale?: 'zh' | 'en' | string
  pathname?: string
  imagePath?: string
}

export declare function applyDocumentMeta(
  appId: LifeOsAppId,
  options: ApplyDocumentMetaOptions,
): void

export type ThemePreference = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

export declare const THEME_PREFERENCES: ThemePreference[]

export declare function isThemePreference(
  value: string | null | undefined,
): value is ThemePreference
export declare function resolveTheme(
  preference: ThemePreference | string | null | undefined,
  fallback?: ThemePreference,
): ResolvedTheme

export type ApplyThemeOptions = {
  themeColorMetaId?: string
  faviconId?: string
  faviconLight?: string
  faviconDark?: string
  themeColorFallback?: { light: string; dark: string }
}

export declare function applyResolvedTheme(
  resolved: ResolvedTheme,
  options?: ApplyThemeOptions,
): void
export declare function applyThemeFromPreference(
  readPreference: () => ThemePreference | string | null | undefined,
  options: ApplyThemeOptions,
  fallback?: ThemePreference,
): void
export declare function bindSystemThemeChange(
  readPreference: () => ThemePreference | string | null | undefined,
  onResolved: (resolved: ResolvedTheme) => void,
  fallback?: ThemePreference,
): () => void
export declare function bootResolveTheme(
  preference: ThemePreference | string | null | undefined,
  fallback?: ThemePreference,
): ResolvedTheme

export declare function lockScroll(): void
export declare function unlockScroll(): void
export declare function resetScrollLock(): void

export declare function isStandalonePwa(): boolean
export declare function needsViewportHeightSync(): boolean
export declare function getVisualViewportHeight(): number
export declare function getViewportRect(): {
  height: number
  width: number
  offsetTop: number
  offsetLeft: number
}
export declare function getBottomChromeHeight(): number
export declare function clampPopoverPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  opts?: { padding?: number; bottomInset?: number },
): { left: number; top: number }
export declare function bindViewportHeight(): () => void

export type PwaSettings = {
  lockPortraitOnPhone?: boolean
}

export declare const DEFAULT_PWA_SETTINGS: Required<PwaSettings>
export declare function normalizePwaSettings(
  raw: unknown,
): Required<PwaSettings>
export declare function mergePwaSettings(
  local: Partial<PwaSettings> | null | undefined,
  incoming: Partial<PwaSettings> | null | undefined,
): Required<PwaSettings>

export declare const PWA_FOREGROUND_DEFER_MS: number
export declare function flushViewportHeight(): void
export declare function bindPwaForegroundResume(options?: {
  onForeground?: () => void
  shouldDefer?: () => boolean
  deferMs?: number
}): () => void

export declare function syncPortraitLockEnabled(enabled: boolean): void

export type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record'

export declare function configureAudioLeaseDebugTag(tag: string): void
export declare function getAudioSession(): AudioSession | null
export declare function safeSetAudioSessionType(type: AudioSessionType): boolean
export declare function getAudioLeaseContext(): AudioContext | null
export declare function primeAudioLease(): Promise<boolean>
export declare function withAudioCuePlayback(
  playFn: () => number | void,
): Promise<boolean>
export declare function cancelAudioLeaseCues(): void
export declare function closeAudioLease(): Promise<void>
export declare function bindAudioLeaseCleanup(): () => void
export declare function logAudioLeaseDebug(
  event: string,
  extra?: Record<string, unknown>,
): void

export type ActivateFocusTrapOptions = {
  initialFocusSelector?: string
}

export declare function activateFocusTrap(
  container: HTMLElement,
  options?: ActivateFocusTrapOptions,
): () => void

export type ImeCommitHandler = (value: string) => void

export declare function createImeGuard(): {
  compositionstart: () => void
  compositioncancel: () => void
  compositionend: (event: CompositionEvent, onCommit?: ImeCommitHandler) => void
  isComposing: (event?: KeyboardEvent | InputEvent) => boolean
}

export declare function resolveToastDuration(
  msg: string,
  opts?: {
    tone?: string
    actionLabel?: string
    min?: number
    max?: number
    perCharMs?: number
  },
): number

export declare function createToastDeduper(): (
  key: string | undefined,
  dedupeMs?: number,
) => boolean
