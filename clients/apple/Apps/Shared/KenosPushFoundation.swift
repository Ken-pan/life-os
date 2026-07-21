import Foundation
#if canImport(UserNotifications)
import UserNotifications
#endif
#if canImport(UIKit)
import UIKit
#endif
import KenosNotifications

/// Local notifications + APNs foundation.
///
/// - **Local scheduling** via `KenosLocalNotificationCenter` (Daily Beta / Continuity).
/// - **Remote APNs** registers only when Owner enables `KenosPushTokenStore.remoteRegistrationEnabled`
///   (requires App ID Push capability + `aps-environment` entitlement).
enum KenosPushFoundation {
    /// True when Owner opted into remote registration (Settings / defaults).
    /// Local notifications work independently of this flag.
    static var remotePushEnabled: Bool {
        KenosPushTokenStore.remoteRegistrationEnabled
    }

    /// Local UNUserNotificationCenter scheduling (no APNs required).
    static let localSchedulingEnabled = true

    /// Backward-compatible alias used by capability bridge for remote push.
    static var isEnabled: Bool { remotePushEnabled }

    static var statusSummary: String {
        if remotePushEnabled {
            return "push_enabled:\(KenosPushTokenStore.statusSummary)"
        }
        if localSchedulingEnabled { return "local_notifications_ready" }
        return "push_owner_gated"
    }

    static var center: KenosLocalNotificationCenter { .shared }

    /// Authorization status string for capability bridge.
    @MainActor
    static func localAuthorizationStatus() async -> String {
        #if canImport(UserNotifications)
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "authorized"
        case .denied:
            return "denied"
        case .notDetermined:
            return "not_determined"
        @unknown default:
            return "unknown"
        }
        #else
        return "unsupported"
        #endif
    }

    /// Register local categories + optional remote APNs.
    ///
    /// Does **not** auto-prompt for notification permission on launch when only
    /// local scheduling is enabled — that races Face ID / Money·Work unlock
    /// (`LAContext`) and can freeze the system auth UI. Permission is requested
    /// via `requestPermission()` (Settings / bridge) or when Owner enables APNs.
    @MainActor
    static func registerIfEnabled() {
        guard localSchedulingEnabled || remotePushEnabled else {
            KenosLog.debug("push register skipped — disabled", category: .shell)
            return
        }
        #if canImport(UserNotifications)
        KenosLocalNotificationCategories.register()
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            // Auto-prompt ONLY when Owner opted into remote APNs.
            // Local-only Daily Beta: wait for explicit `requestPermission`.
            if remotePushEnabled, settings.authorizationStatus == .notDetermined {
                do {
                    let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
                    KenosLog.info("notification auth", category: .shell, metadata: [
                        "granted": granted ? "1" : "0",
                        "remote": "1",
                    ])
                } catch {
                    KenosLog.warning("notification auth failed", category: .shell, metadata: [
                        "error": error.localizedDescription,
                    ])
                }
            } else {
                KenosLog.debug("notification auth existing", category: .shell, metadata: [
                    "status": String(describing: settings.authorizationStatus.rawValue),
                    "remote": remotePushEnabled ? "1" : "0",
                ])
            }
            #if canImport(UIKit)
            if remotePushEnabled {
                let latest = await center.notificationSettings()
                if latest.authorizationStatus == .authorized
                    || latest.authorizationStatus == .provisional
                {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            #endif
        }
        #endif
    }

    /// Explicit permission request (bridge / Settings).
    @MainActor
    static func requestPermission() async -> String {
        #if canImport(UserNotifications)
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            KenosLocalNotificationCategories.register()
            return granted ? "authorized" : "denied"
        } catch {
            KenosLog.warning("notification permission request failed", category: .shell, metadata: [
                "error": error.localizedDescription,
            ])
            return "denied"
        }
        #else
        return "unsupported"
        #endif
    }

    /// Schedule a local notification (absolute time preferred; delay is fallback).
    @MainActor
    @discardableResult
    static func scheduleLocal(
        _ record: KenosNotificationRecord,
        delaySeconds: TimeInterval? = nil,
        fireAt: Date? = nil
    ) async -> Bool {
        guard localSchedulingEnabled else { return false }
        do {
            let resolved: Date?
            if let fireAt {
                resolved = fireAt
            } else if let delaySeconds {
                resolved = Date().addingTimeInterval(max(1, delaySeconds))
            } else if let iso = KenosNotificationISO.date(from: record.fireAt) {
                resolved = iso
            } else {
                resolved = Date().addingTimeInterval(1)
            }
            try await center.schedule(record, at: resolved)
            KenosLog.info("local notification scheduled", category: .shell, metadata: [
                "type": record.type.rawValue,
                "dedupe": record.deduplicationKey,
            ])
            return true
        } catch {
            KenosLog.warning("local notification schedule failed", category: .shell, metadata: [
                "error": error.localizedDescription,
            ])
            return false
        }
    }

    @MainActor
    static func cancelLocal(deduplicationKey: String) async {
        await center.cancel(deduplicationKey: deduplicationKey)
    }

    @MainActor
    static func refreshInbox() async -> [KenosNotificationRecord] {
        await center.pending()
    }
}
