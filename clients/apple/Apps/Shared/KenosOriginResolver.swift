import Foundation

/// Single source of truth for Daily Beta origins.
/// Prefer stable mDNS hostname (e.g. `MacBook.local`) over DHCP IPv4 so IP churn
/// does not require rebuilding the iOS app. Public HTTPS origins (Netlify / DNS)
/// are phone-reachable without LAN.
struct KenosOriginSnapshot: Equatable, Sendable {
    var shellOrigin: URL
    var assistantOrigin: URL
    var plannerOrigin: URL
    var fitnessOrigin: URL
    var networkScope: KenosNetworkScope
    var lastResolvedAddress: String?
    var resolutionStatus: KenosOriginResolutionStatus
    var fallbackSource: KenosOriginFallbackSource
    var hostname: String?
}

enum KenosNetworkScope: String, Sendable {
    case lanHostname = "lan_hostname"
    case lanIpv4 = "lan_ipv4"
    case loopback = "loopback"
    /// Public HTTPS shell (Netlify / custom domain / tunnel) — not LAN-dependent.
    case phoneReachable = "phone_reachable"
    case production = "production"
    case unavailable = "unavailable"
}

enum KenosOriginResolutionStatus: String, Sendable {
    case ok = "ok"
    case staleCache = "stale_cache"
    case unresolved = "unresolved"
    case invalid = "invalid"
    case unavailable = "unavailable"
}

enum KenosOriginFallbackSource: String, Sendable {
    case none = "none"
    case userOverride = "user_override"
    case bundle = "bundle"
    case lastKnownGoodHostname = "last_known_good_hostname"
    case productionOverride = "production_override"
}

enum KenosOriginResolver {
    static let lastKnownGoodHostnameKey = "kenos.origin.lastKnownGoodHostname"
    static let migratedDhcpOriginKey = "kenos.dailyBeta.migratedDhcpOrigin"

    static let shellPort = 5219
    static let plannerPort = 5188
    static let fitnessPort = 5190

    static let productionPlanner = URL(string: "https://planner.kenos.space")!
    static let productionFitness = URL(string: "https://fitness.kenos.space")!

    /// Build a LAN origin URL for `host` + port. Host must not include scheme.
    static func origin(host: String, port: Int) -> URL? {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty else { return nil }
        var c = URLComponents()
        c.scheme = "http"
        c.host = trimmed
        c.port = port
        return c.url
    }

    static func isIpv4Host(_ host: String?) -> Bool {
        guard let host else { return false }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        return parts.count == 4
    }

    static func isLoopbackHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    static func isMdnsHostname(_ host: String?) -> Bool {
        guard let host = host?.lowercased(), !host.isEmpty else { return false }
        return host.hasSuffix(".local")
    }

    /// Tailscale MagicDNS (e.g. `macbook.tailXXXX.ts.net`) — stable Mac↔phone pair.
    static func isTailnetHostname(_ host: String?) -> Bool {
        guard let host = host?.lowercased(), !host.isEmpty else { return false }
        return host.hasSuffix(".ts.net")
    }

    /// Tailscale CGNAT 100.64.0.0/10
    static func isTailscaleCGNAT(_ host: String?) -> Bool {
        guard let host else { return false }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        return parts[0] == 100 && (64...127).contains(parts[1])
    }

    /// Public HTTPS/HTTP origin that should not be rewritten onto LAN Continuity ports.
    static func isPhoneReachableAbsoluteOrigin(_ url: URL?) -> Bool {
        guard let url,
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              let host = url.host?.lowercased(),
              !host.isEmpty
        else { return false }
        if isLoopbackHost(host) { return false }
        if isMdnsHostname(host) { return false }
        if isTailnetHostname(host) { return false }
        if isTailscaleCGNAT(host) { return false }
        if isIpv4Host(host) {
            // Private IPv4 stays on LAN port-rewrite path.
            return false
        }
        return true
    }

    static func networkScope(for host: String?, production: Bool) -> KenosNetworkScope {
        if production { return .production }
        if isLoopbackHost(host) { return .loopback }
        // Tailscale MagicDNS / CGNAT: hostname strategy (stable peer identity).
        if isTailnetHostname(host) { return .lanHostname }
        if isMdnsHostname(host) { return .lanHostname }
        if isTailscaleCGNAT(host) { return .lanIpv4 }
        if isIpv4Host(host) { return .lanIpv4 }
        if host == nil || host?.isEmpty == true { return .unavailable }
        // Non-.local named host on private LAN (rare) — treat as hostname strategy.
        return .lanHostname
    }

    /// Prefer hostname sources; never invent a DHCP IPv4 literal.
    static func resolveConfiguredLanHost(
        userOrigin: URL?,
        bundleOrigin: URL?,
        lastKnownGoodHostname: String?,
        migrateDhcpUserOverride: Bool
    ) -> (host: String?, source: KenosOriginFallbackSource, status: KenosOriginResolutionStatus) {
        if migrateDhcpUserOverride,
           let userHost = userOrigin?.host,
           isIpv4Host(userHost),
           let bundleHost = bundleOrigin?.host,
           isMdnsHostname(bundleHost)
        {
            // Drop sticky DHCP override so rebuilt hostname bundle wins.
            return (bundleHost, .bundle, .ok)
        }

        if let userHost = userOrigin?.host, !userHost.isEmpty {
            if isLoopbackHost(userHost) {
                return (userHost, .userOverride, .invalid)
            }
            if isIpv4Host(userHost) {
                // Explicit IP override still works but is marked lan_ipv4 (P1 residual if used).
                return (userHost, .userOverride, .ok)
            }
            return (userHost, .userOverride, .ok)
        }

        if let bundleHost = bundleOrigin?.host, !bundleHost.isEmpty {
            if isLoopbackHost(bundleHost) {
                return (bundleHost, .bundle, .invalid)
            }
            return (bundleHost, .bundle, .ok)
        }

        if let cached = lastKnownGoodHostname?.trimmingCharacters(in: .whitespacesAndNewlines),
           !cached.isEmpty,
           isMdnsHostname(cached) || isTailnetHostname(cached)
        {
            return (cached, .lastKnownGoodHostname, .staleCache)
        }

        return (nil, .none, .unavailable)
    }

    static func snapshot(
        userOrigin: URL?,
        bundleOrigin: URL?,
        lastKnownGoodHostname: String?,
        useProductionOverride: Bool,
        productionShell: URL,
        migrateDhcpUserOverride: Bool = false
    ) -> KenosOriginSnapshot {
        if useProductionOverride {
            return KenosOriginSnapshot(
                shellOrigin: productionShell,
                assistantOrigin: productionShell,
                plannerOrigin: productionPlanner,
                fitnessOrigin: productionFitness,
                networkScope: .production,
                lastResolvedAddress: nil,
                resolutionStatus: .ok,
                fallbackSource: .productionOverride,
                hostname: productionShell.host
            )
        }

        // Settings / Owner paste of a phone-reachable HTTPS canary (Netlify, future DNS).
        // Preserve scheme/host/path; Continuity domains map to production HTTPS.
        if let userOrigin, isPhoneReachableAbsoluteOrigin(userOrigin) {
            var shell = userOrigin
            if shell.path.isEmpty == false, shell.path != "/" {
                // Strip path so Continuity deep links append cleanly.
                var c = URLComponents(url: shell, resolvingAgainstBaseURL: false) ?? URLComponents()
                c.path = ""
                c.query = nil
                c.fragment = nil
                shell = c.url ?? shell
            }
            return KenosOriginSnapshot(
                shellOrigin: shell,
                assistantOrigin: shell,
                plannerOrigin: productionPlanner,
                fitnessOrigin: productionFitness,
                networkScope: .phoneReachable,
                lastResolvedAddress: nil,
                resolutionStatus: .ok,
                fallbackSource: .userOverride,
                hostname: shell.host
            )
        }

        let resolved = resolveConfiguredLanHost(
            userOrigin: userOrigin,
            bundleOrigin: bundleOrigin,
            lastKnownGoodHostname: lastKnownGoodHostname,
            migrateDhcpUserOverride: migrateDhcpUserOverride
        )

        guard let host = resolved.host,
              let shell = origin(host: host, port: shellPort),
              let planner = origin(host: host, port: plannerPort),
              let fitness = origin(host: host, port: fitnessPort)
        else {
            return KenosOriginSnapshot(
                shellOrigin: URL(string: "http://invalid.invalid")!,
                assistantOrigin: URL(string: "http://invalid.invalid")!,
                plannerOrigin: URL(string: "http://invalid.invalid")!,
                fitnessOrigin: URL(string: "http://invalid.invalid")!,
                networkScope: .unavailable,
                lastResolvedAddress: nil,
                resolutionStatus: .unavailable,
                fallbackSource: .none,
                hostname: nil
            )
        }

        return KenosOriginSnapshot(
            shellOrigin: shell,
            assistantOrigin: shell,
            plannerOrigin: planner,
            fitnessOrigin: fitness,
            networkScope: networkScope(for: host, production: false),
            lastResolvedAddress: nil,
            resolutionStatus: resolved.status,
            fallbackSource: resolved.source,
            hostname: host
        )
    }

    /// Doctor-facing redacted line — never includes tokens or full path.
    static func doctorSummary(_ snap: KenosOriginSnapshot) -> String {
        let host = snap.hostname ?? "(none)"
        return "scope=\(snap.networkScope.rawValue) host=\(host) status=\(snap.resolutionStatus.rawValue) source=\(snap.fallbackSource.rawValue)"
    }
}
