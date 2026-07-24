import XCTest
#if canImport(UIKit)
@testable import KenosIOS
import CoreSpotlight
#endif

#if os(iOS)
@MainActor
final class KenosSpotlightHandoffTests: XCTestCase {
    override func setUp() {
        super.setUp()
        KenosSystemDiscovery.resetForTests()
    }

    func testSpotlightDeepLinkFromDomainIdentifier() {
        XCTAssertEqual(
            KenosSpotlightFoundation.deepLink(forUniqueIdentifier: "kenos.domain.plan"),
            "kenos://domain/plan"
        )
        XCTAssertEqual(
            KenosSpotlightFoundation.deepLink(forUniqueIdentifier: "kenos.domain.kenos"),
            "kenos://today"
        )
        XCTAssertEqual(
            KenosSpotlightFoundation.deepLink(forUniqueIdentifier: "kenos.surface.training"),
            "kenos://domain/training"
        )
        XCTAssertNil(KenosSpotlightFoundation.deepLink(forUniqueIdentifier: "unknown"))
    }

    func testSurfaceDeepLinkCacheRestoresPath() {
        let surface = KenosSystemDiscovery.publish(
            domainId: "plan",
            path: "/upcoming",
            title: "Upcoming",
            summary: "3 tasks",
            currentDomainId: "plan"
        )
        XCTAssertNotNil(surface)
        XCTAssertEqual(
            KenosSpotlightFoundation.deepLink(forUniqueIdentifier: "kenos.surface.plan"),
            surface?.deepLink
        )
        XCTAssertTrue(surface?.deepLink.contains("upcoming") == true)
    }

    func testUserActivityDeepLinkFromUserInfo() {
        let activity = NSUserActivity(activityType: KenosUserActivityFoundation.activityType)
        activity.userInfo = ["kenosDeepLink": "kenos://domain/plan?path=%2Fupcoming"]
        XCTAssertEqual(
            KenosUserActivityFoundation.deepLink(from: activity),
            "kenos://domain/plan?path=%2Fupcoming"
        )
    }

    func testUserActivityDeepLinkFromSpotlightAction() {
        let activity = NSUserActivity(activityType: CSSearchableItemActionType)
        activity.userInfo = [
            CSSearchableItemActivityIdentifier: "kenos.domain.music",
        ]
        XCTAssertEqual(
            KenosUserActivityFoundation.deepLink(from: activity),
            "kenos://domain/music"
        )
    }

    func testBecomeCurrentPrivacyForMoney() {
        let surface = KenosSystemDiscovery.publish(
            domainId: "money",
            path: "/home/accounts/secret",
            title: "Balance $12,345",
            summary: "Cash $99",
            currentDomainId: "money"
        )
        XCTAssertNotNil(surface)
        // 展示名已随 Korben 品牌统一改为 Finance;域 id 仍冻结为 "money"
        // (深链/持久化契约),两者刻意不同步 —— 下面两条断言正是这条边界的护栏。
        XCTAssertEqual(surface?.title, "Finance")
        XCTAssertEqual(surface?.deepLink, "kenos://domain/money")
        XCTAssertFalse(surface?.deepLink.contains("secret") == true)
        XCTAssertEqual(KenosUserActivityFoundation.lastTitle, "Finance")
        XCTAssertEqual(KenosUserActivityFoundation.lastDeepLink, "kenos://domain/money")
    }

    func testBecomeCurrentKeepsPathForPlan() {
        let surface = KenosSystemDiscovery.publish(
            domainId: "plan",
            path: "/upcoming",
            title: "Upcoming",
            summary: "3 tasks",
            currentDomainId: "plan"
        )
        XCTAssertEqual(KenosUserActivityFoundation.lastTitle, "Upcoming")
        let link = KenosUserActivityFoundation.lastDeepLink ?? ""
        XCTAssertTrue(link.hasPrefix("kenos://domain/plan?path="))
        XCTAssertTrue(link.contains("upcoming"))
        XCTAssertEqual(surface?.path, "/upcoming")
    }

    func testDebounceSkipsIdenticalPublish() {
        _ = KenosSystemDiscovery.publish(
            domainId: "plan",
            path: "/upcoming",
            title: "Upcoming",
            summary: "3",
            currentDomainId: "plan"
        )
        let firstSig = KenosSystemDiscovery.lastSignature
        _ = KenosSystemDiscovery.publish(
            domainId: "plan",
            path: "/upcoming",
            title: "Upcoming",
            summary: "3",
            currentDomainId: "plan"
        )
        XCTAssertEqual(KenosSystemDiscovery.lastSignature, firstSig)
    }

    func testStaleDomainManifestIgnored() {
        _ = KenosSystemDiscovery.publish(
            domainId: "plan",
            path: "/",
            title: "Plan",
            summary: "",
            currentDomainId: "plan"
        )
        let planSig = KenosSystemDiscovery.lastSignature
        let stale = KenosSystemDiscovery.publish(
            domainId: "music",
            path: "/",
            title: "Music",
            summary: "",
            currentDomainId: "plan"
        )
        XCTAssertNil(stale)
        XCTAssertEqual(KenosSystemDiscovery.lastSignature, planSig)
    }

    func testResignClearsUserActivity() {
        _ = KenosSystemDiscovery.publish(
            domainId: "plan",
            path: "/",
            title: "Plan",
            summary: "",
            currentDomainId: "plan"
        )
        XCTAssertNotNil(KenosUserActivityFoundation.lastDeepLink)
        KenosSystemDiscovery.resign()
        XCTAssertNil(KenosUserActivityFoundation.lastDeepLink)
        XCTAssertNil(KenosSystemDiscovery.lastSignature)
    }

    func testCapabilitySnapshotIncludesDiscovery() {
        let caps = KenosNativeCapabilityBridge.capabilitySnapshot
        XCTAssertEqual(caps["spotlight"], true)
        XCTAssertEqual(caps["userActivity"], true)
        XCTAssertEqual(KenosSpotlightFoundation.statusSummary, "spotlight_ready")
        XCTAssertEqual(KenosUserActivityFoundation.statusSummary, "user_activity_ready")
        XCTAssertEqual(KenosNativeCapabilityBridge.capabilityStatus["spotlight"], "spotlight_ready")
        XCTAssertEqual(KenosNativeCapabilityBridge.capabilityStatus["userActivity"], "user_activity_ready")
    }
}
#endif
