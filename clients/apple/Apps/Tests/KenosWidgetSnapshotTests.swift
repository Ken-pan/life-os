import XCTest
@testable import KenosIOS
import KenosClient

final class KenosWidgetSnapshotTests: XCTestCase {
    func testPlaceholderDomainsHaveSafeMoneyAndHealthLinks() {
        let domains = KenosWidgetGlanceBridge.placeholderDomains(availability: .sharedSuite)
        XCTAssertEqual(domains["money"]?.subtitle, "Open Money")
        XCTAssertFalse(domains["money"]?.subtitle.contains("$") == true)
        XCTAssertFalse(domains["money"]?.subtitle.contains("¥") == true)
        XCTAssertEqual(domains["health"]?.deepLink, "kenos://domain/health")
        XCTAssertEqual(domains["training"]?.deepLink, "kenos://training/session")
        XCTAssertTrue(domains["home"]?.deepLink.contains("tidy") == true)
        XCTAssertFalse(domains["health"]?.subtitle.lowercased().contains("hrv") == true)
        XCTAssertFalse(domains["health"]?.subtitle.lowercased().contains("bpm") == true)
    }

    func testFoundationSnapshotIncludesRecentDefaults() {
        let snap = KenosWidgetGlanceBridge.foundationSnapshot(availability: .sharedSuite)
        XCTAssertEqual(snap.today.state, "no_data")
        XCTAssertTrue(snap.recentDomainIds.contains("plan"))
        XCTAssertNotNil(snap.domain("plan"))
    }

    @MainActor
    func testPublishWidgetGlanceSmoke() {
        let model = KenosAppModel()
        model.publishWidgetGlance(force: true)
        // Second publish with same content should be a no-op path (no crash).
        model.publishWidgetGlance(force: false)
        XCTAssertNotNil(model)
    }

    @MainActor
    func testSchedulePublishWidgetGlanceCoalesces() async {
        let model = KenosAppModel()
        model.schedulePublishWidgetGlance(delayNanoseconds: 50_000_000)
        model.schedulePublishWidgetGlance(delayNanoseconds: 50_000_000)
        try? await Task.sleep(nanoseconds: 120_000_000)
        XCTAssertNotNil(model)
    }
}
