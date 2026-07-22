import Foundation
import WebKit
import KenosClient

extension Notification.Name {
    /// Native logout cleared WKWebView auth (Cookie + localStorage) — surfaces should reload.
    static let kenosWebAuthDidClear = Notification.Name("kenosWebAuthDidClear")
    /// Shared web SSO tokens saved/cleared in Keychain (Settings status).
    static let kenosSharedWebAuthDidChange = Notification.Name("kenosSharedWebAuthDidChange")
}

/// Life OS web SSO vault + WKWebsiteDataStore cleanup.
/// Mirrors `packages/sync` SSO: cookie `lifeos_shared_session` + storage key `life_os_auth`.
/// Named distinctly from `KenosWebAuthSession` (scraped JWT used by bug/log upload).
enum KenosSharedWebAuth {
    #if os(iOS)
    private static let keychainService = "space.kenos.app.ios.webAuth"
    #else
    private static let keychainService = "space.kenos.app.macos.webAuth"
    #endif

    static let ssoCookieName = "lifeos_shared_session"
    static let authStorageKey = "life_os_auth"

    private static let accessAccount = "kenos.sharedWebAuth.accessToken"
    private static let refreshAccount = "kenos.sharedWebAuth.refreshToken"
    private static let userIdAccount = "kenos.sharedWebAuth.userId"
    private static let secureStore: KenosSecureStore = SecItemSecureStore(
        service: KenosSharedWebAuth.keychainService
    )

    struct SharedTokens: Equatable {
        var accessToken: String
        var refreshToken: String
        var userId: String?
    }

    /// Hosts that may hold Life OS Supabase session (production + LAN Daily Beta).
    static func isAuthRelatedHost(_ displayName: String) -> Bool {
        let name = displayName.lowercased()
        if name.contains("kenos.space") { return true }
        if name.contains("netlify.app") { return true }
        if name.contains("localhost") || name.contains("127.0.0.1") { return true }
        if name.hasSuffix(".local") || name.contains(".local") { return true }
        if let lan = KenosDailyBetaConfig.configuredLanOrigin.host?.lowercased(),
           !lan.isEmpty,
           name.contains(lan)
        {
            return true
        }
        // Private LAN IPs used by Daily Beta Continuity ports.
        if name.range(of: #"^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)"#, options: .regularExpression) != nil {
            return true
        }
        return false
    }

    /// encodeURIComponent-compatible cookie payload (matches `packages/sync` SSO).
    static func encodeSsoCookieValue(accessToken: String, refreshToken: String) -> String? {
        let payload: [String: String] = [
            "access_token": accessToken,
            "refresh_token": refreshToken,
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
            let json = String(data: data, encoding: .utf8)
        else { return nil }
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        return json.addingPercentEncoding(withAllowedCharacters: allowed)
    }

    /// True when both hosts are Life OS auth surfaces that may share one vault.
    /// Exact host, or same `*.kenos.space` / Netlify site family.
    static func hostsCompatible(_ a: String, _ b: String) -> Bool {
        let x = a.lowercased()
        let y = b.lowercased()
        if x.isEmpty || y.isEmpty { return false }
        if x == y { return true }
        let xKenos = x == "kenos.space" || x.hasSuffix(".kenos.space")
        let yKenos = y == "kenos.space" || y.hasSuffix(".kenos.space")
        if xKenos && yKenos { return true }
        let xNetlify = x.hasSuffix(".netlify.app")
        let yNetlify = y.hasSuffix(".netlify.app")
        if xNetlify && yNetlify { return true }
        return false
    }

    static var hasSharedTokens: Bool { loadSharedTokens() != nil }

    @MainActor private static var seedInFlight = false
    @MainActor private static var seedAgain = false

    static func loadSharedTokens() -> SharedTokens? {
        guard
            let accessData = try? secureStore.readSecret(account: accessAccount),
            let refreshData = try? secureStore.readSecret(account: refreshAccount),
            let access = String(data: accessData, encoding: .utf8),
            let refresh = String(data: refreshData, encoding: .utf8),
            !access.isEmpty,
            !refresh.isEmpty
        else { return nil }
        let userId = (try? secureStore.readSecret(account: userIdAccount))
            .flatMap { String(data: $0, encoding: .utf8) }
            .flatMap { $0.isEmpty ? nil : $0 }
        return SharedTokens(accessToken: access, refreshToken: refresh, userId: userId)
    }

    static func saveSharedTokens(accessToken: String, refreshToken: String, userId: String?) {
        let access = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        let refresh = refreshToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !access.isEmpty, !refresh.isEmpty else { return }
        try? secureStore.writeSecret(Data(access.utf8), account: accessAccount)
        try? secureStore.writeSecret(Data(refresh.utf8), account: refreshAccount)
        if let userId, !userId.isEmpty {
            try? secureStore.writeSecret(Data(userId.utf8), account: userIdAccount)
        } else {
            try? secureStore.deleteSecret(account: userIdAccount)
        }
        KenosLog.notice(
            "shared web auth saved",
            category: .session,
            metadata: [
                "user": userId?.isEmpty == false ? "present" : "absent",
            ]
        )
        NotificationCenter.default.post(name: .kenosSharedWebAuthDidChange, object: nil)
        // Push Cookie into shared WKWebsiteDataStore so every Continuity origin
        // can restore via `lifeos_shared_session` without waiting for Keychain.
        Task { @MainActor in
            await seedSharedSessionCookies()
        }
    }

    static func clearSharedTokens() {
        try? secureStore.deleteSecret(account: accessAccount)
        try? secureStore.deleteSecret(account: refreshAccount)
        try? secureStore.deleteSecret(account: userIdAccount)
        NotificationCenter.default.post(name: .kenosSharedWebAuthDidChange, object: nil)
        Task { @MainActor in
            await clearSsoCookiesOnly()
        }
    }

    /// Hosts / domains that should receive the mirrored SSO cookie.
    static func ssoCookieTargets() -> [(domain: String, secure: Bool)] {
        var targets: [(domain: String, secure: Bool)] = [
            (domain: ".kenos.space", secure: true),
            (domain: "localhost", secure: false),
            (domain: "127.0.0.1", secure: false),
        ]
        if let lan = KenosDailyBetaConfig.configuredLanOrigin.host?.lowercased(),
           !lan.isEmpty,
           !targets.contains(where: { $0.domain == lan })
        {
            targets.append((domain: lan, secure: false))
        }
        for def in KenosDomainRegistry.definitions {
            guard let origin = def.productionOrigin,
                  let host = URL(string: origin)?.host?.lowercased(),
                  !host.isEmpty,
                  !targets.contains(where: { $0.domain == host || $0.domain == ".\(host)" })
            else { continue }
            // Parent `.kenos.space` already covers these; keep host-only belt for Netlify.
            if host.hasSuffix("netlify.app") {
                targets.append((domain: host, secure: true))
            }
        }
        return targets
    }

    @MainActor
    static func seedSharedSessionCookies() async {
        // Coalesce concurrent seeds (login + Continuity hard-load + launch warm).
        if seedInFlight {
            seedAgain = true
            return
        }
        seedInFlight = true
        defer { seedInFlight = false }
        repeat {
            seedAgain = false
            await seedSharedSessionCookiesOnce()
        } while seedAgain
    }

    @MainActor
    private static func seedSharedSessionCookiesOnce() async {
        // Owner Device Lock: never hydrate WK SSO cookies while the shell is locked.
        guard KenosUnlockGrantStore.isShellUnlocked() else {
            KenosLog.notice(
                "shared web auth seed skipped — shell locked",
                category: .session
            )
            return
        }
        guard let tokens = loadSharedTokens(),
              let value = encodeSsoCookieValue(
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken
              )
        else { return }

        // WKHTTPCookieStore soft-drops oversized cookies; skip rather than half-write.
        if value.utf8.count > 3500 {
            KenosLog.notice(
                "shared web auth cookie skipped — oversized",
                category: .session,
                metadata: ["bytes": String(value.utf8.count)]
            )
            return
        }

        let store = WKWebsiteDataStore.default().httpCookieStore
        let expires = Date().addingTimeInterval(365 * 24 * 60 * 60)
        var written = 0
        for target in ssoCookieTargets() {
            var props: [HTTPCookiePropertyKey: Any] = [
                .name: ssoCookieName,
                .value: value,
                .path: "/",
                .domain: target.domain,
                .expires: expires,
                // HttpOnly: Continuity JS cannot exfiltrate via document.cookie XSS.
                // Restore path on iOS is Keychain vault (+ Cookie sent on HTTP).
                HTTPCookiePropertyKey("HttpOnly"): "TRUE",
            ]
            if target.secure {
                props[.secure] = "TRUE"
            }
            props[.sameSitePolicy] = HTTPCookieStringPolicy.sameSiteLax
            guard let cookie = HTTPCookie(properties: props) else { continue }
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                store.setCookie(cookie) { cont.resume() }
            }
            written += 1
        }
        KenosLog.notice(
            "shared web auth cookies seeded",
            category: .session,
            metadata: ["cookies": String(written)]
        )
    }

    @MainActor
    private static func clearSsoCookiesOnly() async {
        let cookieStore = WKWebsiteDataStore.default().httpCookieStore
        let cookies = await withCheckedContinuation { (cont: CheckedContinuation<[HTTPCookie], Never>) in
            cookieStore.getAllCookies { cont.resume(returning: $0) }
        }
        for cookie in cookies where cookie.name == ssoCookieName {
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                cookieStore.delete(cookie) { cont.resume() }
            }
        }
    }

    @MainActor
    static func clearSharedWebAuth() async {
        // Clear Keychain without scheduling a second cookie Task — we clear below.
        try? secureStore.deleteSecret(account: accessAccount)
        try? secureStore.deleteSecret(account: refreshAccount)
        try? secureStore.deleteSecret(account: userIdAccount)
        NotificationCenter.default.post(name: .kenosSharedWebAuthDidChange, object: nil)

        let store = WKWebsiteDataStore.default()
        let cookieStore = store.httpCookieStore
        let cookies = await withCheckedContinuation { (cont: CheckedContinuation<[HTTPCookie], Never>) in
            cookieStore.getAllCookies { cont.resume(returning: $0) }
        }
        for cookie in cookies where cookie.name == ssoCookieName {
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                cookieStore.delete(cookie) { cont.resume() }
            }
        }

        let types: Set<String> = [
            WKWebsiteDataTypeCookies,
            WKWebsiteDataTypeLocalStorage,
            WKWebsiteDataTypeSessionStorage,
        ]
        let records = await withCheckedContinuation { (cont: CheckedContinuation<[WKWebsiteDataRecord], Never>) in
            store.fetchDataRecords(ofTypes: types) { cont.resume(returning: $0) }
        }
        let targets = records.filter { isAuthRelatedHost($0.displayName) }
        if !targets.isEmpty {
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                store.removeData(ofTypes: types, for: targets) { cont.resume() }
            }
        }

        KenosLog.notice(
            "web auth cleared",
            category: .session,
            metadata: [
                "cookies": String(cookies.filter { $0.name == ssoCookieName }.count),
                "records": String(targets.count),
            ]
        )
        NotificationCenter.default.post(name: .kenosWebAuthDidClear, object: nil)
    }
}
