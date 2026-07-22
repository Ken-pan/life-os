import Foundation

/// Process-scoped unlock grants for Continuity Money / Work gates and shell-wide unlock.
///
/// Survives WKWebView remounts (LAN `-1004`, Continuity reload) without
/// re-prompting Face ID. Cleared on app process death, `force` re-auth,
/// or explicit `clearUnlockGrant`. Not persisted to disk — shell / Money / Work
/// must Face ID again after a cold launch.
enum KenosUnlockGrantStore {
    /// Default Continuity / shell session window after a successful Face ID.
    static let defaultTTL: TimeInterval = 15 * 60

    /// Shell-wide unlock key — gates SSO cookie seed and root content.
    static let shellKey = "kenos.unlock.shell"

    private static let lock = NSLock()
    nonisolated(unsafe) private static var grants: [String: Date] = [:]

    static func isValid(_ storageKey: String, now: Date = Date()) -> Bool {
        let key = normalize(storageKey)
        guard !key.isEmpty else { return false }
        lock.lock()
        defer { lock.unlock() }
        guard let exp = grants[key] else { return false }
        if exp <= now {
            grants.removeValue(forKey: key)
            return false
        }
        return true
    }

    static func isShellUnlocked(now: Date = Date()) -> Bool {
        isValid(shellKey, now: now)
    }

    static func remember(
        _ storageKey: String,
        ttl: TimeInterval = defaultTTL,
        now: Date = Date()
    ) {
        let key = normalize(storageKey)
        guard !key.isEmpty else { return }
        let seconds = max(1, min(ttl, 60 * 60))
        lock.lock()
        grants[key] = now.addingTimeInterval(seconds)
        lock.unlock()
    }

    static func rememberShell(ttl: TimeInterval = defaultTTL, now: Date = Date()) {
        remember(shellKey, ttl: ttl, now: now)
    }

    /// Clear one key, or all grants when `storageKey` is empty/nil.
    static func clear(_ storageKey: String?) {
        lock.lock()
        defer { lock.unlock() }
        let key = normalize(storageKey ?? "")
        if key.isEmpty {
            grants.removeAll()
        } else {
            grants.removeValue(forKey: key)
        }
    }

    static func resetForTests() {
        lock.lock()
        grants.removeAll()
        lock.unlock()
    }

    private static func normalize(_ raw: String) -> String {
        String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(128))
    }
}
