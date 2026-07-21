import SwiftUI
import UIKit
import UserNotifications
import KenosContracts
import KenosNotifications

@main
struct KenosApp: App {
    @UIApplicationDelegateAdaptor(KenosAppDelegate.self) private var appDelegate
    @StateObject private var model = KenosAppModel()

    var body: some Scene {
        WindowGroup {
            ZStack {
                model.chromeAppearance.canvasColor.ignoresSafeArea()
                KenosRootView(model: model)
            }
            // Status bar foreground follows content: light canvas → dark icons, dark → light.
            // Never hardcode `.dark` — Plan Tasks/Calendar are light and white icons fail contrast.
            .preferredColorScheme(model.chromeAppearance.colorScheme)
            .background(model.chromeAppearance.canvasColor.ignoresSafeArea())
            .privacySensitive()
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
                model.releaseInactiveContinuityIfNeeded()
            }
            .task {
                let health = KenosHealthSyncer.shared
                guard health.available else {
                    KenosLog.debug("HealthKit unavailable — skip sync", category: .health)
                    return
                }
                // Defer HealthKit auth until after first content frame — avoids
                // system permission sheet colliding with launch veil.
                try? await Task.sleep(nanoseconds: 900_000_000)
                await health.authorize(andSync: true)
            }
        }
    }
}

final class KenosAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Same ink as LaunchBackground.colorset / KenosWebRuntime.
    private static let ink = UIColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1)

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Bridge UILaunchScreen → first SwiftUI frame (empty launch dict was pure white).
        UIWindow.appearance().backgroundColor = Self.ink
        KenosLog.bootstrap(source: "didFinishLaunching")
        if let launchOptions, !launchOptions.isEmpty {
            let keys = launchOptions.keys.map(\.rawValue).sorted().joined(separator: ",")
            KenosLog.info("launch options", category: .lifecycle, metadata: ["keys": keys])
        }
        UNUserNotificationCenter.current().delegate = self
        KenosHealthSyncer.registerBackgroundSync()
        KenosLog.debug("background health sync registered", category: .health)
        KenosLogCloudSync.shared.startAutoSync()
        // Music Continuity — HTML5 audio needs playback session + remote commands early.
        KenosNowPlayingBridge.prepareAudioSession()
        // Warm WebContent before first Continuity surface mounts (hidden seed WKWebView).
        Task { @MainActor in
            KenosWebRuntime.warmWebContentProcessIfNeeded()
        }
        // Mirror Keychain SSO vault → shared WK cookies before first Continuity paint.
        Task { @MainActor in
            await KenosSharedWebAuth.seedSharedSessionCookies()
        }
        Task { @MainActor in
            KenosMetricKitSubscriber.shared.start()
        }
        return true
    }

    func applicationWillTerminate(_ application: UIApplication) {
        KenosLog.info("app will terminate", category: .lifecycle, metadata: ["breadcrumb": "1"])
        KenosSessionWatchdog.markCleanExit()
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let info = notification.request.content.userInfo
        let typeRaw = info["kenosType"] as? String
        // UNUserNotificationCenter completion handlers are not Sendable; call once then forget.
        nonisolated(unsafe) let finish = completionHandler
        Task {
            let prefs = await KenosLocalNotificationCenter.shared.currentPreferences()
            let type = typeRaw.flatMap(KenosNotificationType.init(rawValue:))
            let allowed: Bool = {
                guard let type else { return true }
                let record = KenosNotificationRecord(
                    type: type,
                    safeTitle: "x",
                    safeBody: "y",
                    deepLink: "kenos://today",
                    risk: .r0,
                    classification: .personal,
                    createdAt: KenosNotificationISO.nowString(),
                    deduplicationKey: "foreground-gate"
                )
                return prefs.allowsSystemDelivery(
                    for: record,
                    domain: KenosNotificationDomainMap.domain(for: type)
                )
            }()
            finish(allowed ? [.banner, .sound] : [])
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        let action = response.actionIdentifier
        let dedupe = info["kenosDedupeKey"] as? String
        let link = info["kenosDeepLink"] as? String

        if action == KenosNotificationActionID.snooze15m, let dedupe, !dedupe.isEmpty {
            KenosLog.info("notification snooze", category: .deepLink, metadata: [
                "dedupe": String(dedupe.prefix(48)),
            ])
            nonisolated(unsafe) let finish = completionHandler
            Task {
                let pending = await KenosLocalNotificationCenter.shared.pending()
                if let existing = pending.first(where: { $0.deduplicationKey == dedupe }) {
                    let fireAt = Date().addingTimeInterval(15 * 60)
                    var next = existing
                    next.fireAt = KenosNotificationISO.string(from: fireAt)
                    try? await KenosLocalNotificationCenter.shared.replace(
                        deduplicationKey: dedupe,
                        with: next,
                        at: fireAt
                    )
                }
                finish()
            }
            return
        }

        let shouldOpen =
            action == UNNotificationDefaultActionIdentifier
            || action == KenosNotificationActionID.open
        if shouldOpen, let link, !link.isEmpty {
            KenosLog.info("notification open", category: .deepLink, metadata: [
                "link": String(link.prefix(80)),
            ])
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .kenosHandleDeepLink, object: link)
            }
        }
        completionHandler()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        KenosLog.breadcrumb("app became active", category: .lifecycle)
        KenosLogCloudSync.shared.kick(reason: "active")
        Task { @MainActor in
            KenosCrashReporter.shared.flushPendingNow(reason: "active")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        KenosLog.info("app will resign active", category: .lifecycle)
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        KenosLog.breadcrumb("app entered background", category: .lifecycle)
        KenosLogCloudSync.shared.kick(reason: "background")
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        KenosLog.info("app will enter foreground", category: .lifecycle)
        KenosLogCloudSync.shared.kick(reason: "foreground")
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        KenosPushTokenStore.remember(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        KenosPushTokenStore.rememberFailure(error)
    }
}
