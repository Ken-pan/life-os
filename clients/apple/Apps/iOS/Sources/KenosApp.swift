import SwiftUI
import UIKit
import UserNotifications

@main
struct KenosApp: App {
    @UIApplicationDelegateAdaptor(KenosAppDelegate.self) private var appDelegate
    @StateObject private var model = KenosAppModel()

    /// Kenos ink — must match LaunchBackground / WKWebView so cold start never flashes white.
    private let ink = Color(red: 0.031, green: 0.035, blue: 0.039)

    var body: some Scene {
        WindowGroup {
            ZStack {
                ink.ignoresSafeArea()
                KenosRootView(model: model)
            }
            .preferredColorScheme(.dark)
            .background(ink.ignoresSafeArea())
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
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        let link = info["kenosDeepLink"] as? String
        if let link, !link.isEmpty {
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
}
