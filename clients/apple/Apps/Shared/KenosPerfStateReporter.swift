#if os(iOS)
import Foundation
#if canImport(StateReporting)
import StateReporting
#endif

/// Stable performance / crash-context states (shell · space · surface).
///
/// Industry guidance (WWDC26 MetricKit / StateReporting): report a few durable
/// phases — not every tap — so hangs/crashes can be sliced by where the app was.
///
/// When the SDK ships `StateReporting`, transitions also go to MetricKit.
/// Until then we still persist the same states into `KenosCrashContextStore`
/// so unclean-exit / MetricKit logs stay triageable.
@MainActor
enum KenosPerfStateReporter {
    static let shellDomain = "space.kenos.app.shell"
    static let spaceDomain = "space.kenos.app.space"
    static let surfaceDomain = "space.kenos.app.surface"

    private static var lastShell = ""
    private static var lastSpace = ""
    private static var lastSurface = ""

    /// `kenos` | `domain`
    static func setShell(_ mode: String) {
        let next = sanitize(mode, fallback: "kenos")
        guard next != lastShell else { return }
        lastShell = next
        KenosCrashContextStore.noteShellMode(next)
        reportOS(domain: shellDomain, state: next)
        KenosLog.debug("perf state shell", category: .diagnostics, metadata: [
            "state": next,
            "domain": "shell",
        ])
    }

    /// Domain / space id (`music`, `plan`, …) or `none`.
    static func setSpace(_ spaceId: String) {
        let next = sanitize(spaceId, fallback: "none")
        guard next != lastSpace else { return }
        lastSpace = next
        if next != "none" {
            KenosCrashContextStore.noteSpace(next)
        }
        reportOS(domain: spaceDomain, state: next)
        KenosLog.debug("perf state space", category: .diagnostics, metadata: [
            "state": next,
            "domain": "space",
        ])
    }

    /// `native` | `webview` | `none`
    static func setSurface(_ surface: String) {
        let next = sanitize(surface, fallback: "none")
        guard next != lastSurface else { return }
        lastSurface = next
        reportOS(domain: surfaceDomain, state: next)
        KenosLog.debug("perf state surface", category: .diagnostics, metadata: [
            "state": next,
            "domain": "surface",
        ])
    }

    /// Enter Continuity Domain — updates shell + space + crash context in one shot.
    static func enterDomain(url: URL) {
        let domainId = KenosDomainRegistry.domainId(fromContinuity: url)
        KenosCrashContextStore.noteDomain(url: url, shellMode: "domain")
        setShell("domain")
        setSpace(domainId.isEmpty ? "unknown" : domainId)
        setSurface("webview")
    }

    static func returnToKenos() {
        setShell("kenos")
        setSurface("native")
    }

    static func openSpace(_ spaceId: String) {
        setSpace(spaceId)
    }

    // MARK: - OS bridge

    private static func reportOS(domain: String, state: String) {
        #if canImport(StateReporting)
        // StateReporting ships in the iOS 27 SDK, but the module is present at
        // compile time whenever the SDK is (canImport). Deployment target is
        // iOS 17, so the symbol still needs a runtime availability guard —
        // below iOS 27 we skip the MetricKit hop; KenosCrashContextStore already
        // persists the same states for triage.
        if #available(iOS 27.0, *) {
            let reporter = StateReporter.reporter(for: domain)
            reporter.reportTransition(to: state)
        } else {
            _ = domain
            _ = state
        }
        #else
        _ = domain
        _ = state
        #endif
    }

    private static func sanitize(_ raw: String, fallback: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return fallback }
        // Keep MetricKit state labels short and stable.
        let allowed = trimmed.lowercased().map { ch -> Character in
            if ch.isLetter || ch.isNumber || ch == "-" || ch == "_" { return ch }
            return "-"
        }
        let compact = String(allowed).trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        return compact.isEmpty ? fallback : String(compact.prefix(48))
    }
}
#endif
