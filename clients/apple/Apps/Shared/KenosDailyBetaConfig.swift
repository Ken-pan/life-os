import Foundation

extension Notification.Name {
    /// Posted when Owner saves a new Daily Beta origin — shell + domain WK must reload.
    static let kenosDailyBetaOriginDidChange = Notification.Name("kenosDailyBetaOriginDidChange")
}

/// Origins for iOS Personal Daily Beta.
/// Prefers phone-reachable stable mDNS hostname over DHCP IPv4 / 127.0.0.1.
/// When LAN is offline, falls back to the hosted AIOS canary + `*.kenos.space` domains.
enum KenosDailyBetaConfig {
    static let originDefaultsKey = "kenos.dailyBeta.origin"
    static let enabledDefaultsKey = "kenos.dailyBeta.enabled"
    static let preferProductionFallbackKey = "kenos.dailyBeta.preferProductionFallback"
    static let useProductionOverrideKey = "kenos.dailyBeta.useProductionOverride"
    static let resolvedProductionShellKey = "kenos.dailyBeta.resolvedProductionShell"
    static let phoneHomeBaseResolvedKey = "kenos.dailyBeta.phoneHomeBaseResolved.v1"

    /// Preferred www primary, then Netlify canary (site renamed off aios-*).
    static let productionShellCandidates: [URL] = [
        URL(string: "https://www.kenos.space")!,
        URL(string: "https://kenos-www.netlify.app")!,
    ]

    /// Public Kenos shell — reachable off LAN (cellular / Mac sleep).
    /// Prefers www; falls back to Netlify canary until apex/www DNS + SSL are Ready.
    static var productionKenOsOrigin: URL {
        if let raw = UserDefaults.standard.string(forKey: resolvedProductionShellKey),
           let url = URL(string: raw),
           let host = url.host, !host.isEmpty
        {
            // Migrate stale aios.* / old Netlify hostnames.
            if host == "aios.kenos.space" || host == "aios-kenos.netlify.app" {
                return productionShellCandidates[1]
            }
            return url
        }
        return productionShellCandidates[1]
    }

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
    /// iOS default **on** — cellular / Mac sleep should reach the hosted canary.
    static var preferProductionFallback: Bool {
        get {
            if UserDefaults.standard.object(forKey: preferProductionFallbackKey) == nil {
                #if os(iOS)
                return true
                #else
                return false
                #endif
            }
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

    /// **手机的「家」默认是生产,不是 Mac 上的开发服务器。**
    ///
    /// Debug 构建把 Mac 的 Tailscale dev origin(`…ts.net:5219`)烧进 bundle 当默认
    /// origin。手机通常不在 Mac 旁、或 dev server 没开 —— 冷启动连不上就直接硬门
    /// 「Daily Beta shell offline」。装一次、连不上一次,反复出现。
    ///
    /// 这里在**首次启动**把默认落到生产,幂等一次(靠 `phoneHomeBaseResolvedKey`)。
    /// 只在「用户从未手动配过 origin」且「配置 origin 确实是 LAN 依赖」时生效 ——
    /// 已经手填过 canary/生产地址的用户不受影响。要回到 Daily Beta 的用户仍可在
    /// 设置里「重试 LAN / 填写 origin」,那会清掉这个 override
    /// (见 `retryLanOrigin` / `setUserOrigin`),所以这不是把开发口堵死,
    /// 只是把**默认**从「Mac 依赖」翻成「随处可用」。
    @discardableResult
    static func ensurePhoneHomeBaseDefault() -> Bool {
        #if os(iOS)
        let defaults = UserDefaults.standard
        guard defaults.object(forKey: phoneHomeBaseResolvedKey) == nil else { return false }
        defer { defaults.set(true, forKey: phoneHomeBaseResolvedKey) }
        // 用户已显式配过 LAN/canary origin → 尊重它。
        guard userOrigin == nil else { return false }
        // 已经在生产上(或非 LAN 依赖)→ 无需干预。
        guard isConfiguredOriginLanDependent else { return false }
        // 已经处于 override → 不重复。
        guard !useProductionOverride else { return false }
        useProductionOverride = true
        KenosLog.info("phone home base defaulted to production", category: .network, metadata: [
            "lan": configuredLanOrigin.host ?? "",
            "prod": productionKenOsOrigin.host ?? "",
        ])
        return true
        #else
        return false
        #endif
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
        guard let host else { return }
        // Persist stable Mac↔phone hostnames (.local or Tailscale MagicDNS).
        guard KenosOriginResolver.isMdnsHostname(host)
            || KenosOriginResolver.isTailnetHostname(host)
        else { return }
        lastKnownGoodHostname = host
    }

    static func setUserOrigin(_ url: URL?) {
        if let url {
            UserDefaults.standard.set(url.absoluteString, forKey: originDefaultsKey)
            UserDefaults.standard.set(true, forKey: enabledDefaultsKey)
            if let host = url.host {
                rememberSuccessfulHostname(host)
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

    /// Probe preferred custom domain then Netlify canary; remember the first that answers.
    static func resolveReachableProductionShell(timeout: TimeInterval = 3) async -> URL? {
        // Prefer cached hit first (fast path on cellular).
        let cached = productionKenOsOrigin
        if await probeOriginReachable(cached, timeout: timeout) {
            return cached
        }
        for candidate in productionShellCandidates {
            if candidate.host == cached.host { continue }
            if await probeOriginReachable(candidate, timeout: timeout) {
                UserDefaults.standard.set(candidate.absoluteString, forKey: resolvedProductionShellKey)
                return candidate
            }
        }
        return nil
    }

    /// Auto fallback only when a production shell actually answers — never stick on dead DNS.
    @discardableResult
    static func activateProductionFallbackIfReachable(reason: String) async -> Bool {
        guard preferProductionFallback else { return false }
        guard !useProductionOverride else { return false }
        guard let shell = await resolveReachableProductionShell() else {
            KenosLog.warning("production fallback skipped — unreachable", category: .network, metadata: [
                "reason": reason,
                "tried": productionShellCandidates.compactMap(\.host).joined(separator: ","),
            ])
            return false
        }
        UserDefaults.standard.set(shell.absoluteString, forKey: resolvedProductionShellKey)
        KenosLog.info("production shell resolved", category: .network, metadata: [
            "reason": reason,
            "host": shell.host ?? "",
        ])
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
        let snap = originSnapshot
        if snap.networkScope == .production || snap.networkScope == .phoneReachable {
            return false
        }
        return isPrivateLanHost(kenOsOrigin.host)
    }

    /// True when the Owner-configured origin (before override) is LAN.
    static var isConfiguredOriginLanDependent: Bool {
        isPrivateLanHost(configuredLanOrigin.host)
    }

    static func isPrivateLanHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased(), !host.isEmpty else { return true }
        if host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".local") { return true }
        // Tailscale MagicDNS — preferred Mac↔iPhone pair (stable across Wi‑Fi / cellular).
        if host.hasSuffix(".ts.net") { return true }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        if parts[0] == 10 { return true }
        if parts[0] == 127 { return true }
        if parts[0] == 172 && (16...31).contains(parts[1]) { return true }
        if parts[0] == 192 && parts[1] == 168 { return true }
        // Tailscale CGNAT 100.64.0.0/10
        if parts[0] == 100 && (64...127).contains(parts[1]) { return true }
        return false
    }

    static var plannerOrigin: URL {
        if useProductionOverride { return URL(string: "https://plan.kenos.space")! }
        return originSnapshot.plannerOrigin
    }

    static var fitnessOrigin: URL {
        if useProductionOverride { return URL(string: "https://training.kenos.space")! }
        return originSnapshot.fitnessOrigin
    }

    static var financeOrigin: URL {
        domainOrigin(port: 5180, production: "https://money.kenos.space")
    }

    static var musicOrigin: URL {
        domainOrigin(port: 5189, production: "https://music.kenos.space")
    }

    static var homeOrigin: URL {
        domainOrigin(port: 5196, production: "https://home.kenos.space")
    }

    static var knowledgeOrigin: URL {
        domainOrigin(port: 5879, production: "https://library.kenos.space")
    }

    static var healthOrigin: URL {
        domainOrigin(port: 5192, production: "https://health.kenos.space")
    }

    private static func domainOrigin(port: Int, production: String) -> URL {
        if useProductionOverride, let url = URL(string: production) { return url }
        // Phone-reachable HTTPS shell has no LAN Continuity ports — use production domains.
        let scope = originSnapshot.networkScope
        if scope == .phoneReachable || scope == .production,
           let url = URL(string: production)
        {
            return url
        }
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
