import Foundation

extension Notification.Name {
    /// Posted when Owner saves a new Daily Beta origin — shell + domain WK must reload.
    static let kenosDailyBetaOriginDidChange = Notification.Name("kenosDailyBetaOriginDidChange")
}

/// Origins for iOS Personal Daily Beta.
/// Prefers phone-reachable stable mDNS hostname over DHCP IPv4 / 127.0.0.1.
/// When LAN is offline, can fall back to production `*.kenos.space` (cellular-reachable).
enum KenosDailyBetaConfig {
    static let originDefaultsKey = "kenos.dailyBeta.origin"
    static let enabledDefaultsKey = "kenos.dailyBeta.enabled"
    static let preferProductionFallbackKey = "kenos.dailyBeta.preferProductionFallback"
    static let useProductionOverrideKey = "kenos.dailyBeta.useProductionOverride"

    /// Public AIOS shell — reachable off LAN (cellular / Mac sleep).
    static let productionKenOsOrigin = URL(string: "https://aios.kenos.space")!

    /// Bundle default from Info.plist (injected at device build as `http://<LocalHostName>.local:5219`).
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

    /// When LAN Daily Beta is unreachable, auto-switch shell/domains to production.
    /// Default **off** until `aios.kenos.space` is a real Owner canary (DNS currently unresolved).
    static var preferProductionFallback: Bool {
        get {
            if UserDefaults.standard.object(forKey: preferProductionFallbackKey) == nil { return false }
            return UserDefaults.standard.bool(forKey: preferProductionFallbackKey)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: preferProductionFallbackKey)
        }
    }

    /// Active session override — true while serving production after LAN failure / Owner choice.
    static var useProductionOverride: Bool {
        get { UserDefaults.standard.bool(forKey: useProductionOverrideKey) }
        set {
            let prev = UserDefaults.standard.bool(forKey: useProductionOverrideKey)
            guard prev != newValue else { return }
            UserDefaults.standard.set(newValue, forKey: useProductionOverrideKey)
            NotificationCenter.default.post(name: .kenosDailyBetaOriginDidChange, object: kenOsOrigin)
        }
    }

    private static var lastKnownGoodHostname: String? {
        get { UserDefaults.standard.string(forKey: KenosOriginResolver.lastKnownGoodHostnameKey) }
        set {
            if let newValue, !newValue.isEmpty {
                UserDefaults.standard.set(newValue, forKey: KenosOriginResolver.lastKnownGoodHostnameKey)
            } else {
                UserDefaults.standard.removeObject(forKey: KenosOriginResolver.lastKnownGoodHostnameKey)
            }
        }
    }

    /// One-time: clear sticky DHCP IPv4 UserDefaults override when bundle provides `.local`.
    static func migrateLegacyDhcpOriginIfNeeded() {
        guard UserDefaults.standard.object(forKey: KenosOriginResolver.migratedDhcpOriginKey) == nil else {
            return
        }
        defer {
            UserDefaults.standard.set(true, forKey: KenosOriginResolver.migratedDhcpOriginKey)
        }
        guard let userHost = userOrigin?.host,
              KenosOriginResolver.isIpv4Host(userHost),
              let bundleHost = bundleOrigin?.host,
              KenosOriginResolver.isMdnsHostname(bundleHost)
        else { return }
        UserDefaults.standard.removeObject(forKey: originDefaultsKey)
        KenosLog.info("daily beta migrated DHCP origin to hostname", category: .network, metadata: [
            "from": userHost,
            "to": bundleHost,
        ])
    }

    /// Current origin snapshot (shell / planner / fitness share the same host strategy).
    static var originSnapshot: KenosOriginSnapshot {
        migrateLegacyDhcpOriginIfNeeded()
        return KenosOriginResolver.snapshot(
            userOrigin: userOrigin,
            bundleOrigin: bundleOrigin,
            lastKnownGoodHostname: lastKnownGoodHostname,
            useProductionOverride: useProductionOverride,
            productionShell: productionKenOsOrigin,
            migrateDhcpUserOverride: false
        )
    }

    /// Configured LAN / custom origin (ignores production override) — for Settings + Retry LAN.
    static var configuredLanOrigin: URL {
        let snap = KenosOriginResolver.snapshot(
            userOrigin: userOrigin,
            bundleOrigin: bundleOrigin,
            lastKnownGoodHostname: lastKnownGoodHostname,
            useProductionOverride: false,
            productionShell: productionKenOsOrigin,
            migrateDhcpUserOverride: UserDefaults.standard.object(
                forKey: KenosOriginResolver.migratedDhcpOriginKey
            ) == nil
        )
        if snap.networkScope == .unavailable {
            // Honest unavailable — still return a non-nil URL for call sites; UI must check status.
            return URL(string: "http://kenos-daily-beta-unavailable.local:5219")!
        }
        return snap.shellOrigin
    }

    static var kenOsOrigin: URL {
        originSnapshot.shellOrigin
    }

    /// True when configured strategy is stable mDNS hostname (DHCP IP P1 closed).
    static var usesStableHostnameStrategy: Bool {
        let snap = originSnapshot
        return snap.networkScope == .lanHostname && snap.resolutionStatus != .unavailable
    }

    static func rememberSuccessfulHostname(_ host: String?) {
        guard let host, KenosOriginResolver.isMdnsHostname(host) else { return }
        lastKnownGoodHostname = host
    }

    static func setUserOrigin(_ url: URL?) {
        if let url {
            UserDefaults.standard.set(url.absoluteString, forKey: originDefaultsKey)
            UserDefaults.standard.set(true, forKey: enabledDefaultsKey)
            if let host = url.host, KenosOriginResolver.isMdnsHostname(host) {
                lastKnownGoodHostname = host
            }
        } else {
            UserDefaults.standard.removeObject(forKey: originDefaultsKey)
        }
        // New LAN origin → leave production override so Retry path is honest.
        UserDefaults.standard.set(false, forKey: useProductionOverrideKey)
        NotificationCenter.default.post(name: .kenosDailyBetaOriginDidChange, object: kenOsOrigin)
    }

    /// Flip to production origins (shell + Continuity ports → `*.kenos.space`).
    /// - Parameter force: Owner/manual path — bypasses the prefer toggle.
    @discardableResult
    static func activateProductionFallback(reason: String, force: Bool = false) -> Bool {
        guard force || preferProductionFallback else { return false }
        guard !useProductionOverride else { return false }
        KenosLog.info("daily beta production fallback", category: .network, metadata: [
            "reason": reason,
            "force": force ? "1" : "0",
            "from": configuredLanOrigin.host ?? "",
            "to": productionKenOsOrigin.host ?? "",
        ])
        useProductionOverride = true
        return true
    }

    /// Soft reachability for an origin (`/__health`, then root). Used before auto production switch.
    static func probeOriginReachable(_ origin: URL, timeout: TimeInterval = 3) async -> Bool {
        var health = URLRequest(url: origin.appending(path: "/__health"))
        health.timeoutInterval = timeout
        if let (_, resp) = try? await URLSession.shared.data(for: health),
           let code = (resp as? HTTPURLResponse)?.statusCode,
           (200..<500).contains(code)
        {
            rememberSuccessfulHostname(origin.host)
            return true
        }
        var root = URLRequest(url: origin)
        root.timeoutInterval = timeout
        if let (_, resp) = try? await URLSession.shared.data(for: root),
           let code = (resp as? HTTPURLResponse)?.statusCode,
           (200..<500).contains(code)
        {
            rememberSuccessfulHostname(origin.host)
            return true
        }
        return false
    }

    /// Auto fallback only when production actually answers — never stick on a dead DNS name.
    @discardableResult
    static func activateProductionFallbackIfReachable(reason: String) async -> Bool {
        guard preferProductionFallback else { return false }
        guard !useProductionOverride else { return false }
        let ok = await probeOriginReachable(productionKenOsOrigin)
        guard ok else {
            KenosLog.warning("production fallback skipped — unreachable", category: .network, metadata: [
                "reason": reason,
                "host": productionKenOsOrigin.host ?? "",
            ])
            return false
        }
        return activateProductionFallback(reason: reason)
    }

    /// Leave production override and retry configured LAN origin.
    static func retryLanOrigin() {
        KenosLog.info("daily beta retry LAN", category: .network, metadata: [
            "host": configuredLanOrigin.host ?? "",
            "doctor": KenosOriginResolver.doctorSummary(originSnapshot),
        ])
        UserDefaults.standard.set(false, forKey: useProductionOverrideKey)
        NotificationCenter.default.post(name: .kenosDailyBetaOriginDidChange, object: kenOsOrigin)
    }

    /// True when the *effective* origin is a private LAN / link-local host.
    static var isLanDependentOrigin: Bool {
        isPrivateLanHost(kenOsOrigin.host)
    }

    /// True when the Owner-configured origin (before override) is LAN.
    static var isConfiguredOriginLanDependent: Bool {
        isPrivateLanHost(configuredLanOrigin.host)
    }

    static func isPrivateLanHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased(), !host.isEmpty else { return true }
        if host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".local") { return true }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        if parts[0] == 10 { return true }
        if parts[0] == 127 { return true }
        if parts[0] == 172 && (16...31).contains(parts[1]) { return true }
        if parts[0] == 192 && parts[1] == 168 { return true }
        return false
    }

    static var plannerOrigin: URL {
        if useProductionOverride { return URL(string: "https://planner.kenos.space")! }
        return originSnapshot.plannerOrigin
    }

    static var fitnessOrigin: URL {
        if useProductionOverride { return URL(string: "https://fitness.kenos.space")! }
        return originSnapshot.fitnessOrigin
    }

    static var financeOrigin: URL {
        domainOrigin(port: 5180, production: "https://finance.kenos.space")
    }

    static var musicOrigin: URL {
        domainOrigin(port: 5189, production: "https://music.kenos.space")
    }

    static var homeOrigin: URL {
        domainOrigin(port: 5196, production: "https://home.kenos.space")
    }

    static var knowledgeOrigin: URL {
        domainOrigin(port: 5879, production: "https://knowledge.kenos.space")
    }

    static var healthOrigin: URL {
        domainOrigin(port: 5192, production: "https://health.kenos.space")
    }

    private static func domainOrigin(port: Int, production: String) -> URL {
        if useProductionOverride, let url = URL(string: production) { return url }
        return rewritePort(kenOsOrigin, to: port)
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
