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
/// - **Local scheduling** is available for Daily Beta (permission only).
/// - **Remote APNs** stays Owner-gated (`remotePushEnabled = false`) until
///   Push capability + certificates land.
enum KenosPushFoundation {
    /// Flip only after App ID has Push Notifications + APNs certs.
    static let remotePushEnabled = false

    /// Local UNUserNotificationCenter scheduling (no APNs required).
    static let localSchedulingEnabled = true

    /// Backward-compatible alias used by capability bridge.
    static var isEnabled: Bool { remotePushEnabled }

    static var statusSummary: String {
        if remotePushEnabled { return "push_enabled" }
        if localSchedulingEnabled { return "local_notifications_ready" }
        return "push_owner_gated"
    }

    /// Request notification authorization + optional remote registration.
    @MainActor
    static func registerIfEnabled() {
        guard localSchedulingEnabled || remotePushEnabled else {
            KenosLog.debug("push register skipped — disabled", category: .shell)
            return
        }
        #if canImport(UserNotifications)
        Task {
            let center = UNUserNotificationCenter.current()
            do {
                let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
                KenosLog.info("notification auth", category: .shell, metadata: [
                    "granted": granted ? "1" : "0",
                    "remote": remotePushEnabled ? "1" : "0",
                ])
                #if canImport(UIKit)
                if granted, remotePushEnabled {
                    UIApplication.shared.registerForRemoteNotifications()
                }
                #endif
            } catch {
                KenosLog.warning("notification auth failed", category: .shell, metadata: [
                    "error": error.localizedDescription,
                ])
            }
        }
        #endif
    }

    /// Schedule a local notification that opens `record.deepLink` on tap.
    @MainActor
    @discardableResult
    static func scheduleLocal(_ record: KenosNotificationRecord, delaySeconds: TimeInterval = 1) async -> Bool {
        guard localSchedulingEnabled else { return false }
        #if canImport(UserNotifications)
        do {
            try KenosNotificationSafety.validate(record)
        } catch {
            KenosLog.warning("local notification rejected", category: .shell, metadata: [
                "error": String(describing: error),
            ])
            return false
        }
        let content = UNMutableNotificationContent()
        content.title = record.safeTitle
        content.body = KenosNotificationSafety.lockScreenBody(for: record)
        content.sound = .default
        content.userInfo = [
            "kenosDeepLink": record.deepLink,
            "kenosType": record.type.rawValue,
            "kenosId": record.id.uuidString,
        ]
        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(1, delaySeconds),
            repeats: false
        )
        let request = UNNotificationRequest(
            identifier: "kenos.local.\(record.id.uuidString)",
            content: content,
            trigger: trigger
        )
        do {
            try await UNUserNotificationCenter.current().add(request)
            KenosLog.info("local notification scheduled", category: .shell, metadata: [
                "type": record.type.rawValue,
                "delay": String(Int(delaySeconds)),
            ])
            return true
        } catch {
            KenosLog.warning("local notification schedule failed", category: .shell, metadata: [
                "error": error.localizedDescription,
            ])
            return false
        }
        #else
        return false
        #endif
    }
}
