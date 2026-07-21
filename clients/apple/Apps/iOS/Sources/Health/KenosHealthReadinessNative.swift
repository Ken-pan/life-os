import Foundation
import JavaScriptCore

/// Runs the shared platform-web readiness stripper in-process so Kenos shell
/// can receive `__KENOS_HEALTH_READINESS__` without raw HealthKit days.
enum KenosHealthReadinessNative {
    private static let lock = NSLock()
    /// JSContext is not Sendable; guarded by `lock`.
    nonisolated(unsafe) private static var cachedContext: JSContext?

    /// JSON object string for WKWebView injection, or `null` when unavailable.
    static func summaryJSON(
        days: [[String: Any]],
        now: Date = Date(),
        source: String = "healthkit"
    ) -> String {
        guard !days.isEmpty else { return "null" }
        guard let ctx = context() else { return "null" }
        guard
            JSONSerialization.isValidJSONObject(days),
            let daysData = try? JSONSerialization.data(withJSONObject: days),
            let daysJSON = String(data: daysData, encoding: .utf8)
        else { return "null" }

        let ms = Int((now.timeIntervalSince1970 * 1000).rounded())
        let sourceJSON = jsonStringLiteral(source)
        let script = """
        (function () {
          var summary = KenosHealthReadiness.buildHealthReadinessFromMeasurements({
            now: \(ms),
            health: \(daysJSON),
            agent: { online: false },
            source: \(sourceJSON)
          });
          if (!KenosHealthReadiness.isSafeHealthReadiness(summary)) return null;
          return JSON.stringify(summary);
        })()
        """
        guard let value = ctx.evaluateScript(script), !value.isUndefined, !value.isNull,
              let raw = value.toString(), raw != "null", !raw.isEmpty
        else { return "null" }
        return raw
    }

    private static func context() -> JSContext? {
        lock.lock()
        defer { lock.unlock() }
        if let cachedContext { return cachedContext }
        guard
            let url = Bundle.main.url(
                forResource: "kenosHealthReadiness.native",
                withExtension: "js"
            ),
            let src = try? String(contentsOf: url, encoding: .utf8)
        else {
            KenosLog.error(
                "Health readiness JS bundle missing",
                category: .health
            )
            return nil
        }
        let ctx = JSContext()!
        ctx.exceptionHandler = { _, exception in
            KenosLog.error(
                "Health readiness JS exception",
                category: .health,
                metadata: ["error": exception?.toString() ?? "unknown"]
            )
        }
        ctx.evaluateScript(src)
        if ctx.objectForKeyedSubscript("KenosHealthReadiness").isUndefined {
            KenosLog.error(
                "Health readiness JS global missing",
                category: .health
            )
            return nil
        }
        cachedContext = ctx
        return ctx
    }

    private static func jsonStringLiteral(_ value: String) -> String {
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        return "\"\(escaped)\""
    }
}
