#if os(iOS)
import Foundation
import UIKit

/// Automatic diagnostics breadcrumbs for lifecycle / memory pressure.
/// Complements navigation breadcrumbs already emitted by AppModel / WebView.
@MainActor
enum KenosDiagnosticsLifecycle {
    private static var started = false
    private static var observers: [NSObjectProtocol] = []

    static func start() {
        guard !started else { return }
        started = true
        let nc = NotificationCenter.default
        observers = [
            nc.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { _ in
                KenosLog.breadcrumb("app became active", category: .lifecycle)
                KenosPerfStateReporter.setSurface(
                    KenosCrashContextStore.load()?.shellMode == "domain" ? "webview" : "native"
                )
            },
            nc.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { _ in
                KenosLog.breadcrumb("app entered background", category: .lifecycle)
            },
            nc.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { _ in
                KenosLog.breadcrumb("app will resign active", category: .lifecycle)
            },
            nc.addObserver(
                forName: UIApplication.didReceiveMemoryWarningNotification,
                object: nil,
                queue: .main
            ) { _ in
                KenosLog.breadcrumb("memory warning", category: .diagnostics, metadata: [
                    "kind": "memory_warning",
                ])
            },
        ]
        KenosLog.debug("diagnostics lifecycle observers registered", category: .diagnostics)
    }
}
#endif
