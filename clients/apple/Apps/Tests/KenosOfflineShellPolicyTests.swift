import XCTest
#if os(iOS)
@testable import KenosIOS
#endif

#if os(iOS)
final class KenosOfflineShellPolicyTests: XCTestCase {
    func testAppBoundDomainsCountAndProductionGate() {
        XCTAssertEqual(KenosAppBoundDomains.productionHosts.count, 10)
        XCTAssertTrue(KenosAppBoundDomains.productionHosts.contains("www.kenos.space"))
        XCTAssertTrue(KenosAppBoundDomains.productionHosts.contains("portal.kenos.space"))
        XCTAssertTrue(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "https://www.kenos.space/")!
            )
        )
        XCTAssertTrue(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "https://plan.kenos.space/")!
            )
        )
        XCTAssertTrue(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "https://kenos-www.netlify.app/")!
            )
        )
        // Unlisted HTTPS hosts must not enable limits (plist is the allowlist).
        XCTAssertFalse(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "https://random-preview.netlify.app/")!
            )
        )
        XCTAssertFalse(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "https://unlisted.kenos.space/")!
            )
        )
        // LAN / Tailscale / .local dogfood must stay unbound.
        XCTAssertFalse(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "http://10.20.202.15:5219/")!
            )
        )
        XCTAssertFalse(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "http://Kens-M5-Max-MacBook-Pro.local:5219/")!
            )
        )
        XCTAssertFalse(
            KenosAppBoundDomains.shouldLimitNavigations(
                for: URL(string: "http://kens-m5-max-macbook-pro.tail04e0e6.ts.net:5219/")!
            )
        )
    }

    func testHardGateOnlyWhenNoPaintAndNoCachePath() {
        let lanCold = KenosOfflineShellPolicy.ProbeContext(
            didPaint: false,
            originHost: "10.20.202.15",
            isLanDependent: true,
            useProductionOverride: false
        )
        XCTAssertTrue(KenosOfflineShellPolicy.shouldUseHardUnavailableGate(lanCold))

        let paintedLan = KenosOfflineShellPolicy.ProbeContext(
            didPaint: true,
            originHost: "10.20.202.15",
            isLanDependent: true,
            useProductionOverride: false
        )
        XCTAssertFalse(KenosOfflineShellPolicy.shouldUseHardUnavailableGate(paintedLan))

        let productionCold = KenosOfflineShellPolicy.ProbeContext(
            didPaint: false,
            originHost: "www.kenos.space",
            isLanDependent: false,
            useProductionOverride: true
        )
        XCTAssertFalse(KenosOfflineShellPolicy.shouldUseHardUnavailableGate(productionCold))

        let paintedProduction = KenosOfflineShellPolicy.ProbeContext(
            didPaint: true,
            originHost: "www.kenos.space",
            isLanDependent: false,
            useProductionOverride: true
        )
        XCTAssertFalse(KenosOfflineShellPolicy.shouldUseHardUnavailableGate(paintedProduction))
        XCTAssertTrue(
            KenosOfflineShellPolicy.shouldShowSyncPausedBanner(
                probeFailed: true,
                context: paintedProduction
            )
        )
    }

    func testSyncPausedBannerWhenProductionProbeFailsBeforePaint() {
        let ctx = KenosOfflineShellPolicy.ProbeContext(
            didPaint: false,
            originHost: "www.kenos.space",
            isLanDependent: false,
            useProductionOverride: true
        )
        XCTAssertTrue(KenosOfflineShellPolicy.shouldShowSyncPausedBanner(probeFailed: true, context: ctx))
        XCTAssertFalse(KenosOfflineShellPolicy.shouldUseHardUnavailableGate(ctx))
        XCTAssertFalse(
            KenosOfflineShellPolicy.shouldShowSyncPausedBanner(probeFailed: false, context: ctx)
        )
    }
}
#endif
