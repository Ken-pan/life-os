import XCTest
#if os(macOS)
@testable import KenosMac
#else
@testable import KenosIOS
#endif

final class KenosMacSidebarTests: XCTestCase {
    @MainActor
    func testMacSidebarDomainOrderMatchesCommandCenter() {
        XCTAssertEqual(
            KenosAppModel.macSidebarDomainOrder,
            ["work", "plan", "library", "health", "training", "money", "home", "music"]
        )
    }

    @MainActor
    func testSelectMacSidebarDomainEntersContinuity() async {
        let model = KenosAppModel()
        // Production override keeps Continuity on public origins without LAN.
        _ = KenosDailyBetaConfig.activateProductionFallback(reason: "unit_test")
        defer { KenosDailyBetaConfig.retryLanOrigin() }

        model.selectMacSidebar(.domain("plan"))
        XCTAssertEqual(model.shellMode, .domain)
        XCTAssertEqual(model.macSidebarSelection, .domain("plan"))
        XCTAssertNotNil(model.continuityURL)
        XCTAssertTrue(
            KenosDomainRegistry.isEmbeddedWebContinuityURL(model.continuityURL!)
                || (model.continuityURL?.host?.contains("planner") == true)
        )
    }

    @MainActor
    func testOpenSpaceShelfOnMacOpensSwitcherSheet() {
        let model = KenosAppModel()
        model.openSpaceShelf()
        XCTAssertTrue(model.showSpaceSwitcher)
        XCTAssertEqual(model.spaceChromeMode, .switchSpace)
        XCTAssertFalse(model.showSpaceShelf)
    }

    @MainActor
    func testPendingApprovalCountCountsApprovalNotifications() {
        let model = KenosAppModel()
        XCTAssertEqual(model.pendingApprovalCount, 0)
    }

    @MainActor
    func testMacShellTabMapping() {
        let model = KenosAppModel()
        XCTAssertEqual(model.macShellTab(for: .today), .today)
        XCTAssertEqual(model.macShellTab(for: .assistant), .assistant)
        XCTAssertEqual(model.macShellTab(for: .inbox), .inbox)
        XCTAssertNil(model.macShellTab(for: .settings))
        XCTAssertNil(model.macShellTab(for: .domain("plan")))
    }

    @MainActor
    func testSyncMacSidebarFromShellURL() {
        let model = KenosAppModel()
        let assistant = KenosDailyBetaConfig.pathURL("/assistant")
        model.syncMacSidebarFromShellURL(assistant)
        XCTAssertEqual(model.macSidebarSelection, .assistant)
        XCTAssertEqual(model.selectedTab, .assistant)

        let inbox = KenosDailyBetaConfig.pathURL("/inbox")
        model.syncMacSidebarFromShellURL(inbox)
        XCTAssertEqual(model.macSidebarSelection, .inbox)
        XCTAssertEqual(model.selectedTab, .inbox)
    }
}
