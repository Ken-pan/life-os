/**
 * AIOS Kenos shell helpers — SSOT detection/CSS lives in @life-os/platform-web.
 * Keep Space Shelf + bridge re-exports here for AIOS call sites.
 */
import { isIosNativeShell } from '@life-os/platform-web/ios-native-shell'

export {
  isIosNativeShell,
  markIosNativeShellDom,
  ensureIosNativeShellChromeCss,
  preferredShellLocale,
  syncLocaleFromSystemForNativeShell,
  IOS_NATIVE_SHELL_TOP_PAD_PX,
  IOS_NATIVE_SHELL_BOTTOM_PAD_PX,
} from '@life-os/platform-web/ios-native-shell'

/**
 * Open native Space Shelf (dock Spaces SSOT). Returns true if handled.
 * Browser / PWA callers should fall through to `/spaces`.
 */
export function requestNativeSpaceShelf() {
  if (!isIosNativeShell()) return false
  try {
    window.location.href = 'kenos://shelf'
    return true
  } catch {
    return false
  }
}

export {
  isNativeBridgeAvailable,
  getNativeCapabilities,
  hasNativeLocalNotifications,
  nativeHaptic,
  nativeShare,
  nativeAuthenticate,
  nativeCancelAuthenticate,
  cancelNativeAuthenticate,
  ensureNativeUnlock,
  clearNativeUnlock,
  createNativeUnlockController,
  nativeNowPlayingUpdate,
  nativeNowPlayingUpdatePosition,
  nativeNowPlayingClear,
  nativeLiveActivityUpsert,
  nativeLiveActivityEnd,
  nativeNotificationsSchedule,
  nativeNotificationsCancel,
  nativeNotificationsRequestPermission,
  nativeShellSettingsGet,
  nativeShellSettingsSet,
  publishNavManifest,
  installNavManifestPublisher,
} from '@life-os/platform-web/kenos-native-bridge'

export {
  bindKenosShellSettings,
  publishShellTheme,
  publishShellLocale,
  publishShellPersona,
  publishNotificationCategoryEnabled,
  readNotificationCategoryEnabled,
  pullKenosShellSettings,
  pushKenosShellSettings,
} from '@life-os/platform-web/kenos-shell-settings'

export {
  sensory,
  normalizeSensoryIntent,
  SENSORY_MAP,
} from '@life-os/platform-web/kenos-sensory'

/** Session unlock keys for sensitive Continuity domains. */
export const NATIVE_UNLOCK_KEYS = {
  shell: 'kenos.unlock.shell',
  money: 'kenos.unlock.money',
  work: 'kenos.unlock.work',
}
