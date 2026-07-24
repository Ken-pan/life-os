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

    /// LAN 冷启动但开启了自动回退 → 不该整屏硬门(回退在路上,给横幅)。
    func testAutoFallbackSuppressesHardGate() {
        let lanColdWithFallback = KenosOfflineShellPolicy.ProbeContext(
            didPaint: false,
            originHost: "kens-mac.tail04e0e6.ts.net",
            isLanDependent: true,
            useProductionOverride: false,
            canAutoFallbackToProduction: true
        )
        XCTAssertFalse(
            KenosOfflineShellPolicy.shouldUseHardUnavailableGate(lanColdWithFallback),
            "生产回退可用时不该硬门"
        )
        XCTAssertTrue(
            KenosOfflineShellPolicy.shouldShowSyncPausedBanner(
                probeFailed: true,
                context: lanColdWithFallback
            ),
            "改为非阻塞横幅"
        )

        // 没有自动回退(用户显式关了 preferProductionFallback)时仍硬门。
        let lanColdNoFallback = KenosOfflineShellPolicy.ProbeContext(
            didPaint: false,
            originHost: "kens-mac.tail04e0e6.ts.net",
            isLanDependent: true,
            useProductionOverride: false,
            canAutoFallbackToProduction: false
        )
        XCTAssertTrue(KenosOfflineShellPolicy.shouldUseHardUnavailableGate(lanColdNoFallback))
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
