import Foundation

/// Origins for iOS Personal Daily Beta.
/// Prefers phone-reachable LAN Mac release over 127.0.0.1 (useless on device).
enum KenosDailyBetaConfig {
    static let originDefaultsKey = "kenos.dailyBeta.origin"
    static let enabledDefaultsKey = "kenos.dailyBeta.enabled"

    /// Bundle default from Info.plist (injected at device build).
    static var bundleOrigin: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "KENOS_DAILY_BETA_ORIGIN") as? String else {
            return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // Unexpanded build setting leftover
        if trimmed.isEmpty || trimmed.contains("$(") { return nil }
        return URL(string: trimmed)
    }

    static var userOrigin: URL? {
        guard let raw = UserDefaults.standard.string(forKey: originDefaultsKey),
              let url = URL(string: raw), !raw.isEmpty
        else { return nil }
        return url
    }

    static var isEnabled: Bool {
        #if os(iOS)
        if UserDefaults.standard.object(forKey: enabledDefaultsKey) != nil {
            return UserDefaults.standard.bool(forKey: enabledDefaultsKey)
        }
        // iPhone Daily Beta default: always use phone-reachable shell surface.
        return true
        #else
        if UserDefaults.standard.object(forKey: enabledDefaultsKey) != nil {
            return UserDefaults.standard.bool(forKey: enabledDefaultsKey)
        }
        return bundleOrigin != nil || userOrigin != nil
        #endif
    }

    static var kenOsOrigin: URL {
        if let userOrigin { return userOrigin }
        if let bundleOrigin { return bundleOrigin }
        // Last resort documentation default — will show degraded UI if unreachable.
        return URL(string: "http://10.20.202.15:5219")!
    }

    static func setUserOrigin(_ url: URL?) {
        if let url {
            UserDefaults.standard.set(url.absoluteString, forKey: originDefaultsKey)
            UserDefaults.standard.set(true, forKey: enabledDefaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: originDefaultsKey)
        }
    }

    static var plannerOrigin: URL {
        rewritePort(kenOsOrigin, to: 5188)
    }

    static var fitnessOrigin: URL {
        rewritePort(kenOsOrigin, to: 5190)
    }

    private static func rewritePort(_ base: URL, to port: Int) -> URL {
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        c.port = port
        c.path = ""
        c.query = nil
        c.fragment = nil
        return c.url ?? base
    }

    static func pathURL(_ path: String) -> URL {
        let trimmed = path.hasPrefix("/") ? path : "/\(path)"
        // Preserve ?query / #fragment for deep resume (appendingPathComponent drops them).
        if trimmed.contains("?") || trimmed.contains("#"),
           let absolute = URL(string: trimmed, relativeTo: kenOsOrigin)?.absoluteURL
        {
            return absolute
        }
        let pathOnly = trimmed.split(separator: "?", maxSplits: 1).first.map(String.init) ?? trimmed
        return kenOsOrigin.appending(path: pathOnly)
    }
}
