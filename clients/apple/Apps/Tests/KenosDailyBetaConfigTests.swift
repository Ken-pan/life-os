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
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.useProductionOverrideKey)
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.preferProductionFallbackKey)
        super.tearDown()
    }

    func testPrivateLanHostDetection() {
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("10.20.202.15"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("192.168.1.1"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("172.16.0.2"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("localhost"))
        XCTAssertTrue(KenosDailyBetaConfig.isPrivateLanHost("Kens-M5-Max-MacBook-Pro.local"))
        XCTAssertFalse(KenosDailyBetaConfig.isPrivateLanHost("aios.kenos.space"))
        XCTAssertFalse(KenosDailyBetaConfig.isPrivateLanHost("planner.kenos.space"))
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
        XCTAssertNotEqual(snap.shellOrigin.host, "aios.kenos.space")
        XCTAssertEqual(snap.fallbackSource, .none)
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
    }

    func testProductionFallbackFlipsEffectiveOrigin() {
        KenosDailyBetaConfig.preferProductionFallback = true
        XCTAssertFalse(KenosDailyBetaConfig.useProductionOverride)
        XCTAssertTrue(
            KenosDailyBetaConfig.activateProductionFallback(reason: "test")
        )
        XCTAssertTrue(KenosDailyBetaConfig.useProductionOverride)
        XCTAssertEqual(
            KenosDailyBetaConfig.kenOsOrigin.host,
            "aios.kenos.space"
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
        XCTAssertEqual(prod?.host, "planner.kenos.space")
        XCTAssertEqual(prod?.path, "/calendar")
        XCTAssertEqual(prod?.scheme, "https")
    }

    func testProductionContinuityURLForTraining() {
        let url = KenosDomainRegistry.productionContinuityURL(for: "training", path: "/session")
        XCTAssertEqual(url?.absoluteString, "https://fitness.kenos.space/session")
    }

    func testWebAuthRelatedHosts() {
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("planner.kenos.space"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("10.20.202.15"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("localhost"))
        XCTAssertTrue(KenosSharedWebAuth.isAuthRelatedHost("financeos-ken.netlify.app"))
        XCTAssertFalse(KenosSharedWebAuth.isAuthRelatedHost("example.com"))
        XCTAssertEqual(KenosSharedWebAuth.authStorageKey, "life_os_auth")
        XCTAssertEqual(KenosSharedWebAuth.ssoCookieName, "lifeos_shared_session")
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

    func testPreferProductionFallbackDefaultsOff() {
        UserDefaults.standard.removeObject(forKey: KenosDailyBetaConfig.preferProductionFallbackKey)
        XCTAssertFalse(KenosDailyBetaConfig.preferProductionFallback)
    }

    func testActivateProductionFallbackIfReachableSkipsDeadHost() async {
        KenosDailyBetaConfig.preferProductionFallback = true
        // aios.kenos.space has no DNS — auto switch must not stick the shell there.
        let switched = await KenosDailyBetaConfig.activateProductionFallbackIfReachable(
            reason: "unit_dead_dns"
        )
        XCTAssertFalse(switched)
        XCTAssertFalse(KenosDailyBetaConfig.useProductionOverride)
        XCTAssertNotEqual(
            KenosDailyBetaConfig.kenOsOrigin.host,
            "aios.kenos.space"
        )
    }
}
#endif
