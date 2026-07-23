import XCTest
#if os(iOS)
@testable import KenosIOS
#endif

#if os(iOS)
@MainActor
final class KenosDailyBetaConfigTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.useProductionOverrideKey)
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.preferProductionFallbackKey)
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.resolvedProductionShellKey)
        UserDefaults.standard.removeObject(forKey: KenosPushTokenStore.remoteEnabledDefaultsKey)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.useProductionOverrideKey)
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.preferProductionFallbackKey)
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.resolvedProductionShellKey)
        UserDefaults.standard.removeObject(forKey: KenosPushTokenStore.remoteEnabledDefaultsKey)
        super.tearDown()
    }

    func testPrivateLanHostDetection() {
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("10.20.202.15"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("192.168.1.1"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("172.16.0.2"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("localhost"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("Kens-M5-Max-MacBook-Pro.local"))
        XCTAssertTrue(
            KenosDailyBetaConfig.isPrivateLanHost("kens-m5-max-macbook-pro.tail04e0e6.ts.net")
        )
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("100.111.7.15"))
        XCTAssertFalse(KenosDailyBetaConfig.isPrivateLanHost("www.kenos.space"))
        XCTAssertFalse(KenosDailyBetaConfig.isPrivateLanHost("kenos-www.netlify.app"))
        XCTAssertFalse(KenosDailyBetaConfig.isPrivateLanHost("plan.kenos.space"))
    }

    func testTailnetOriginKeepsContinuityPortRewrite() {
        let snap = KenosOriginResolver.snapshot(
            userOrigin: URL(string: "http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5219"),
            bundleOrigin: URL(string: "http://Kens-M5-Max-MacBook-Pro.local:5219"),
            lastKnownGoodHostname: nil,
            useProductionOverride: false,
            productionShell: KenosDailyBetaConfig.productionKenOsOrigin
        )
        XCTAssertEqual(snap.networkScope, .lanHostname)
        XCTAssertEqual(snap.shellOrigin.port, 5219)
        XCTAssertEqual(snap.plannerOrigin.port, 5188)
        XCTAssertEqual(snap.plannerOrigin.host, "kens-m5-max-macbook-pro.tail04e0e6.ts.net")
        XCTAssertFalse(
            KenosOriginResolver.isPhoneReachableAbsoluteOrigin(
                URL(string: "http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5219")
            )
        )
    }

    func testOriginResolverPrefersMdnsHostnameOverMissingUser() {
        let snap = KenosOriginResolver.snapshot(
            userOrigin: nil,
            bundleOrigin: URL(string: "http://Kens-M5-Max-MacBook-Pro.local:5219"),
            lastKnownGoodHostname: nil,
            useProductionOverride: false,
            productionShell: KenosDailyBetaConfig.productionKenOsOrigin
        )
        XCTAssertEqual(snap.networkScope, .lanHostname)
        XCTAssertEqual(snap.hostname, "Kens-M5-Max-MacBook-Pro.local")
        XCTAssertEqual(snap.shellOrigin.port, 5219)
        XCTAssertEqual(snap.plannerOrigin.port, 5188)
        XCTAssertEqual(snap.fitnessOrigin.port, 5190)
        XCTAssertEqual(snap.shellOrigin.host, snap.plannerOrigin.host)
        XCTAssertEqual(snap.fallbackSource, .bundle)
        XCTAssertEqual(snap.resolutionStatus, .ok)
    }

    func testOriginResolverMigratesDhcpUserOverrideToBundleHostname() {
        let snap = KenosOriginResolver.snapshot(
            userOrigin: URL(string: "http://10.20.202.15:5219"),
            bundleOrigin: URL(string: "http://Kens-M5-Max-MacBook-Pro.local:5219"),
            lastKnownGoodHostname: nil,
            useProductionOverride: false,
            productionShell: KenosDailyBetaConfig.productionKenOsOrigin,
            migrateDhcpUserOverride: true
        )
        XCTAssertEqual(snap.networkScope, .lanHostname)
        XCTAssertEqual(snap.hostname, "Kens-M5-Max-MacBook-Pro.local")
        XCTAssertNotEqual(snap.hostname, "10.20.202.15")
    }

    func testOriginResolverDoesNotSilentFallbackToProduction() {
        let snap = KenosOriginResolver.snapshot(
            userOrigin: nil,
            bundleOrigin: nil,
            lastKnownGoodHostname: nil,
            useProductionOverride: false,
            productionShell: KenosDailyBetaConfig.productionKenOsOrigin
        )
        XCTAssertEqual(snap.networkScope, .unavailable)
        XCTAssertNotEqual(snap.shellOrigin.host, "kenos-www.netlify.app")
        XCTAssertEqual(snap.fallbackSource, .none)
    }

    func testOriginResolverPreservesPhoneReachableHttpsCanary() {
        let snap = KenosOriginResolver.snapshot(
            userOrigin: URL(string: "https://kenos-www.netlify.app/"),
            bundleOrigin: URL(string: "http://Kens-M5-Max-MacBook-Pro.local:5219"),
            lastKnownGoodHostname: nil,
            useProductionOverride: false,
            productionShell: KenosDailyBetaConfig.productionKenOsOrigin
        )
        XCTAssertEqual(snap.networkScope, .phoneReachable)
        XCTAssertEqual(snap.shellOrigin.host, "kenos-www.netlify.app")
        XCTAssertEqual(snap.shellOrigin.scheme, "https")
        XCTAssertEqual(snap.plannerOrigin.host, "plan.kenos.space")
        XCTAssertEqual(snap.fitnessOrigin.host, "training.kenos.space")
        XCTAssertFalse(KenosDailyBetaConfig.isPrivateLanHost(snap.hostname))
    }

    func testOriginResolverUsesLastKnownGoodHostname() {
        let snap = KenosOriginResolver.snapshot(
            userOrigin: nil,
            bundleOrigin: nil,
            lastKnownGoodHostname: "Kens-M5-Max-MacBook-Pro.local",
            useProductionOverride: false,
            productionShell: KenosDailyBetaConfig.productionKenOsOrigin
        )
        XCTAssertEqual(snap.hostname, "Kens-M5-Max-MacBook-Pro.local")
        XCTAssertEqual(snap.fallbackSource, .lastKnownGoodHostname)
        XCTAssertEqual(snap.resolutionStatus, .staleCache)
    }

    func testOriginResolverUsesLastKnownGoodTailnetHostname() {
        let host = "kens-m5-max-macbook-pro.tail04e0e6.ts.net"
        let snap = KenosOriginResolver.snapshot(
            userOrigin: nil,
            bundleOrigin: nil,
            lastKnownGoodHostname: host,
            useProductionOverride: false,
            productionShell: KenosDailyBetaConfig.productionKenOsOrigin
        )
        XCTAssertEqual(snap.hostname, host)
        XCTAssertEqual(snap.fallbackSource, .lastKnownGoodHostname)
        XCTAssertEqual(snap.resolutionStatus, .staleCache)
        XCTAssertTrue(KenosOriginResolver.isTailnetHostname(host))
    }

    func testRememberSuccessfulHostnameAcceptsTailnet() {
        let key = KenosOriginResolver.lastKnownGoodHostnameKey
        let host = "kens-m5-max-macbook-pro.tail04e0e6.ts.net"
        UserDefaults.standard.removeObject(forKey: key)
        KenosDailyBetaConfig.rememberSuccessfulHostname(host)
        XCTAssertEqual(UserDefaults.standard.string(forKey: key), host)
        KenosDailyBetaConfig.rememberSuccessfulHostname("www.kenos.space")
        XCTAssertEqual(UserDefaults.standard.string(forKey: key), host)
        UserDefaults.standard.removeObject(forKey: key)
    }

    func testOriginResolverRejectsLoopbackAsPhoneOrigin() {
        let resolved = KenosOriginResolver.resolveConfiguredLanHost(
            userOrigin: URL(string: "http://127.0.0.1:5219"),
            bundleOrigin: nil,
            lastKnownGoodHostname: nil,
            migrateDhcpUserOverride: false
        )
        XCTAssertEqual(resolved.status, .invalid)
    }

    func testIpv4DetectionHelpers() {
        XCTAssertTrue(KenosOriginResolver.isIpv4Host("10.20.202.15"))
        XCTAssertFalse(KenosOriginResolver.isIpv4Host("Kens-M5-Max-MacBook-Pro.local"))
        XCTAssertTrue(KenosOriginResolver.isMdnsHostname("foo.local"))
        XCTAssertFalse(KenosOriginResolver.isMdnsHostname("10.20.202.15"))
        XCTAssertTrue(
            KenosOriginResolver.isPhoneReachableAbsoluteOrigin(
                URL(string: "https://kenos-www.netlify.app")
            )
        )
        XCTAssertFalse(
            KenosOriginResolver.isPhoneReachableAbsoluteOrigin(
                URL(string: "http://10.20.202.15:5219")
            )
        )
    }

    func testProductionFallbackFlipsEffectiveOrigin() {
        KenosDailyBetaConfig.preferProductionFallback = true
        UserDefaults.standard.set(
            "https://kenos-www.netlify.app",
            forKey: KenosDailyBetaConfig.resolvedProductionShellKey
        )
        XCTAssertFalse(KenosDailyBetaConfig.useProductionOverride)
        XCTAssertTrue(
            KenosDailyBetaConfig.activateProductionFallback(reason: "test")
        )
        XCTAssertTrue(KenosDailyBetaConfig.useProductionOverride)
        XCTAssertEqual(
            KenosDailyBetaConfig.kenOsOrigin.host,
            "kenos-www.netlify.app"
        )
        // Second call is a no-op once already on production.
        XCTAssertFalse(
            KenosDailyBetaConfig.activateProductionFallback(reason: "test-again")
        )
        KenosDailyBetaConfig.retryLanOrigin()
        XCTAssertFalse(KenosDailyBetaConfig.useProductionOverride)
    }

    func testProductionFallbackRespectsPreferToggleUnlessForced() {
        KenosDailyBetaConfig.preferProductionFallback = false
        XCTAssertFalse(
            KenosDailyBetaConfig.activateProductionFallback(reason: "auto")
        )
        XCTAssertFalse(KenosDailyBetaConfig.useProductionOverride)
        XCTAssertTrue(
            KenosDailyBetaConfig.activateProductionFallback(reason: "manual", force: true)
        )
        XCTAssertTrue(KenosDailyBetaConfig.useProductionOverride)
        KenosDailyBetaConfig.retryLanOrigin()
    }

    func testRewritePlanContinuityToProduction() {
        let lan = URL(string: "http://10.20.202.15:5188/calendar")!
        let prod = KenosDomainRegistry.rewriteToProduction(lan)
        XCTAssertEqual(prod?.host, "plan.kenos.space")
        XCTAssertEqual(prod?.path, "/calendar")
        XCTAssertEqual(prod?.scheme, "https")
    }

    func testProductionContinuityURLForTraining() {
        let url = KenosDomainRegistry.productionContinuityURL(for: "training", path: "/session")
        XCTAssertEqual(url?.absoluteString, "https://training.kenos.space/session")
    }

    func testWebAuthRelatedHosts() {
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("plan.kenos.space"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("kenos.space"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("10.20.202.15"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("localhost"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("kenos-money.netlify.app"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("example.com"))
        XCTAssertEqual(KenosSharedWebAuth.authStorageKey, "life_os_auth")
        XCTAssertEqual(KenosSharedWebAuth.ssoCookieName, "lifeos_shared_session")
    }

    // F5-03.4: substring-satisfiable spoof hosts must NOT be treated as auth hosts.
    // Previously `.contains()` matching let these steal the shared Supabase session.
    func testWebAuthRelatedHostSpoofRejected() {
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("kenos.space.attacker.com"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("x.netlify.app.evil.com"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("a.local.evil.com"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("evilkenos.space"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("kenos.space.evil"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("10.evil.com"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("localhost.evil.com"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost(""))
        // Genuine LAN/Tailscale forms still accepted.
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("192.168.1.42"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("kens-mac.local"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("kens-mac.tail04e0e6.ts.net"))
    }

    func testSharedWebAuthTokenRoundTrip() {
        KenosSharedWebAuth.clearSharedTokens()
        XCTAssertFalse(KenosSharedWebAuth.hasSharedTokens)
        KenosSharedWebAuth.saveSharedTokens(
            accessToken: "access-test",
            refreshToken: "refresh-test",
            userId: "user-test-id"
        )
        let loaded = KenosSharedWebAuth.loadSharedTokens()
        XCTAssertEqual(loaded?.accessToken, "access-test")
        XCTAssertEqual(loaded?.refreshToken, "refresh-test")
        XCTAssertEqual(loaded?.userId, "user-test-id")
        XCTAssertTrue(KenosSharedWebAuth.hasSharedTokens)
        KenosSharedWebAuth.clearSharedTokens()
        XCTAssertFalse(KenosSharedWebAuth.hasSharedTokens)
    }

    func testSharedWebAuthCookieEncodingRoundTrip() {
        guard
            let encoded = KenosSharedWebAuth.encodeSsoCookieValue(
                accessToken: "at/1",
                refreshToken: "rt+2"
            ),
            let unescaped = encoded.removingPercentEncoding,
            let json = unescaped.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: json) as? [String: String]
        else {
            XCTFail("cookie payload should encode/decode")
            return
        }
        XCTAssertEqual(obj["access_token"], "at/1")
        XCTAssertEqual(obj["refresh_token"], "rt+2")
        XCTAssertTrue(KenosSharedWebAuth.ssoCookieTargets().contains { $0.domain == ".kenos.space" })
    }

    func testSharedWebAuthHostsCompatible() {
        XCTAssertTrue(KenosSharedWebAuth.hostsCompatible("music.kenos.space", "money.kenos.space"))
        XCTAssertTrue(KenosSharedWebAuth.hostsCompatible("www.kenos.space", "kenos.space"))
        XCTAssertTrue(KenosSharedWebAuth.hostsCompatible("10.20.202.15", "10.20.202.15"))
        XCTAssertFalse(KenosSharedWebAuth.hostsCompatible("music.kenos.space", "evil.example"))
        XCTAssertFalse(KenosSharedWebAuth.hostsCompatible("10.20.202.15", "10.20.202.16"))
    }

    func testPreferProductionFallbackDefaultsOnForIOS() {
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.preferProductionFallbackKey)
        XCTAssertTrue(KenosDailyBetaConfig.preferProductionFallback)
    }

    func testActivateProductionFallbackIfReachableUsesHostedCanary() async {
        KenosDailyBetaConfig.preferProductionFallback = true
        let switched = await KenosDailyBetaConfig.activateProductionFallbackIfReachable(
            reason: "unit_hosted_canary"
        )
        XCTAssertTrue(switched)
        XCTAssertTrue(KenosDailyBetaConfig.useProductionOverride)
        XCTAssertEqual(KenosDailyBetaConfig.kenOsOrigin.host, "kenos-www.netlify.app")
        XCTAssertFalse(KenosDailyBetaConfig.isLanDependentOrigin)
        KenosDailyBetaConfig.retryLanOrigin()
    }

    func testRemotePushDefaultsOffUntilOwnerToggle() {
        XCTAssertFalse(KenosPushFoundation.remotePushEnabled)
        KenosPushTokenStore.remoteRegistrationEnabled = true
        XCTAssertTrue(KenosPushFoundation.remotePushEnabled)
        KenosPushTokenStore.remoteRegistrationEnabled = false
        XCTAssertFalse(KenosPushFoundation.remotePushEnabled)
    }
}
#endif
