import Foundation

/// Korben Shell V2 feature flag — three-layer resolution, frozen at launch.
///
/// Resolution order (first hit wins) — **rollback beats enable**:
/// 1. Launch argument `-legacyKenosShell`   → force OFF (emergency rollback ALWAYS wins)
/// 2. Launch argument `-korbenShellV2`      → force ON  (UI tests / dogfood)
/// 3. UserDefaults `feature.korbenShellV2.enabled` (local dogfood toggle)
/// 4. Compile default: **OFF**
///
/// If a scheme / script accidentally passes both arguments, the safe fallback
/// (legacy shell) must win — locked by unit test.
///
/// `isEnabled` is a `static let` — evaluated once per process and frozen.
/// A mid-session flip would tear down whichever shell hosts the persistent
/// WKWebView surfaces and remount them (auth/scroll/history loss), so the
/// dogfood toggle intentionally takes effect on next launch only.
/// No remote config in P1 — local sources only.
enum KorbenShellV2Feature {
    static let defaultsKey = "feature.korbenShellV2.enabled"
    static let enableArgument = "-korbenShellV2"
    static let legacyArgument = "-legacyKenosShell"

    /// Frozen at first access (process launch path reads this before the root
    /// view builds). Legacy and Korben shells are therefore mutually exclusive
    /// per process — only one host tree ever mounts the Web surfaces.
    static let isEnabled: Bool = resolve(
        arguments: ProcessInfo.processInfo.arguments,
        defaults: UserDefaults.standard
    )

    /// iOS-only gate for shared view code — Korben Shell V2 has no macOS host
    /// in P1, so the flag reads as OFF there regardless of stored preference.
    static var isEnabledOniOS: Bool {
        #if os(iOS)
        return isEnabled
        #else
        return false
        #endif
    }

    /// Where the frozen value came from — diagnostics / settings footer.
    static let resolvedSource: String = resolveSource(
        arguments: ProcessInfo.processInfo.arguments,
        defaults: UserDefaults.standard
    )

    /// Pure resolver — unit-testable without touching process state.
    /// Rollback argument has TOP priority (safe fallback wins on conflict).
    static func resolve(arguments: [String], defaults: UserDefaults) -> Bool {
        if arguments.contains(legacyArgument) { return false }
        if arguments.contains(enableArgument) { return true }
        return defaults.bool(forKey: defaultsKey)
    }

    static func resolveSource(arguments: [String], defaults: UserDefaults) -> String {
        if arguments.contains(legacyArgument) { return "launchArgument.off" }
        if arguments.contains(enableArgument) { return "launchArgument.on" }
        if defaults.object(forKey: defaultsKey) != nil {
            return defaults.bool(forKey: defaultsKey) ? "defaults.on" : "defaults.off"
        }
        return "compileDefault.off"
    }

    /// Dogfood toggle — persists for the **next** launch (see `isEnabled` doc).
    static func setDogfoodEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: defaultsKey)
    }

    /// Current persisted preference (may differ from the frozen `isEnabled`
    /// until relaunch) — lets Settings show "takes effect after relaunch".
    static var dogfoodPreference: Bool {
        UserDefaults.standard.bool(forKey: defaultsKey)
    }
}
