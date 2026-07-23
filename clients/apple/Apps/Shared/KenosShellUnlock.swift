import Foundation
import LocalAuthentication

/// Cold-start / foreground Face ID for the Kenos shell (device lock).
///
/// Distinct from Continuity Money/Work grants — unlocking the shell is required
/// before `KenosSharedWebAuth` seeds SSO cookies into WKWebView.
///
/// Concurrent callers share one in-flight evaluation so App / RootView / Unlock
/// button cannot stack multiple `LAContext.evaluatePolicy` prompts.
enum KenosShellUnlock {
    struct Result: Equatable, Sendable {
        var ok: Bool
        var cached: Bool
        var skipped: Bool
        var message: String?

        static let unlockedCached = Result(ok: true, cached: true, skipped: false, message: nil)
    }

    @MainActor
    private static var inFlight: Task<Result, Never>?

    /// Ensure shell unlock grant. When `prompt` is false, only restores an existing grant.
    @MainActor
    static func ensure(
        prompt: Bool = true,
        reason: String = "Unlock Kenos",
        grantTTL: TimeInterval = KenosUnlockGrantStore.defaultTTL
    ) async -> Result {
        if KenosUnlockGrantStore.isShellUnlocked() {
            return .unlockedCached
        }
        guard prompt else {
            return Result(ok: false, cached: false, skipped: false, message: "Unlock required")
        }

        if let inFlight {
            return await inFlight.value
        }

        let task = Task { @MainActor in
            await evaluate(reason: reason, grantTTL: grantTTL)
        }
        inFlight = task
        defer { inFlight = nil }
        return await task.value
    }

    /// Test / debug only — clears coalescing latch between cases.
    @MainActor
    static func resetInFlightForTests() {
        inFlight?.cancel()
        inFlight = nil
    }

    @MainActor
    private static func evaluate(reason: String, grantTTL: TimeInterval) async -> Result {
        if KenosUnlockGrantStore.isShellUnlocked() {
            return .unlockedCached
        }

        // 开发模式后门:仅开发构建 + 显式传参时跳过 Face ID(生产恒关,见 KenosDevMode)。
        if KenosDevMode.skipShellUnlock {
            KenosUnlockGrantStore.rememberShell(ttl: grantTTL)
            KenosLog.notice("shell unlock skipped — dev mode", category: .session)
            return Result(ok: true, cached: false, skipped: true, message: nil)
        }

        #if targetEnvironment(simulator)
        // Simulator / XCTest must never block on LA — always grant shell unlock.
        KenosUnlockGrantStore.rememberShell(ttl: grantTTL)
        KenosLog.notice("shell unlock skipped — simulator", category: .session)
        return Result(ok: true, cached: false, skipped: true, message: nil)
        #else

        let context = LAContext()
        context.localizedCancelTitle =
            KenosShellSettingsStore.current.resolvedLocale() == "zh" ? "取消" : "Cancel"
        var laError: NSError?
        let canEvaluate = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &laError)

        guard canEvaluate else {
            // Stable key for the no-passcode dead end so the gate can show a recovery path.
            let message: String = laError?.code == LAError.passcodeNotSet.rawValue
                ? "Passcode not set"
                : (laError?.localizedDescription ?? "Biometrics unavailable")
            KenosLog.notice(
                "shell unlock unavailable",
                category: .session,
                metadata: [
                    "message": message,
                    "code": String(laError?.code ?? -1),
                ]
            )
            return Result(ok: false, cached: false, skipped: false, message: message)
        }

        let (ok, authError): (Bool, Error?) = await withCheckedContinuation { cont in
            context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, error in
                cont.resume(returning: (success, error))
            }
        }

        if ok {
            KenosUnlockGrantStore.rememberShell(ttl: grantTTL)
            KenosLog.notice("shell unlock granted", category: .session)
            return Result(ok: true, cached: false, skipped: false, message: nil)
        }

        let ns = authError as NSError?
        let message: String = {
            if let ns, ns.domain == LAErrorDomain {
                switch ns.code {
                case LAError.userCancel.rawValue:
                    return "Authentication cancelled"
                case LAError.userFallback.rawValue:
                    return "Passcode fallback cancelled"
                case LAError.systemCancel.rawValue:
                    return "Authentication interrupted"
                case LAError.appCancel.rawValue:
                    return "Authentication interrupted"
                case LAError.authenticationFailed.rawValue:
                    return "Authentication failed"
                default:
                    return ns.localizedDescription
                }
            }
            return authError?.localizedDescription ?? "Authentication failed"
        }()
        KenosLog.notice(
            "shell unlock denied",
            category: .session,
            metadata: [
                "message": message,
                "code": String(ns?.code ?? -1),
            ]
        )
        return Result(ok: false, cached: false, skipped: false, message: message)
        #endif
    }
    // 生物识别跳过统一收敛到 KenosDevMode(旧 -kenosSkipShellUnlock / KENOS_SHELL_UNLOCK_SKIP
    // 仍兼容,由 KenosDevMode.launchArguments / environmentKeys 承接)。
}
