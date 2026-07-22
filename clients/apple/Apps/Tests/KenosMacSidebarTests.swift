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
    func testPresentSettingsDoesNotStealMacSidebar() {
        let model = KenosAppModel()
        model.selectMacSidebar(.today)
        model.presentSettings()
        // MAC-P1-02: Settings opens the system Settings scene; sidebar stays put.
        XCTAssertEqual(model.macSidebarSelection, .today)
        XCTAssertEqual(model.selectedTab, .today)
    }

    @MainActor
    func testSelectSettingsDoesNotStealMacSidebar() {
        let model = KenosAppModel()
        model.selectMacSidebar(.inbox)
        model.selectMacSidebar(.settings)
        XCTAssertEqual(model.macSidebarSelection, .inbox)
        XCTAssertEqual(model.selectedTab, .inbox)
    }

    #if os(macOS)
    @MainActor
    func testOpenCaptureUsesSheetOnMac() {
        let model = KenosAppModel()
        model.openCapture()
        XCTAssertTrue(model.showCaptureSheet)
        XCTAssertNil(model.inboxDestination)
    }

    @MainActor
    func testOpenApprovalsUsesSheetOnMac() {
        let model = KenosAppModel()
        model.open(.approvals)
        XCTAssertTrue(model.showApprovalsSheet)
        XCTAssertNil(model.inboxDestination)
    }

    @MainActor
    func testOpenCaptureDeepLinkUsesSheetOnMac() {
        let model = KenosAppModel()
        model.open(.capture)
        XCTAssertTrue(model.showCaptureSheet)
    }
    #endif

    @MainActor
    func testMacAskConversationCollapsesSidebar() {
        let model = KenosAppModel()
        model.selectMacSidebar(.assistant)
        model.domainWebLiveState = "conversation"
        model.syncMacSplitVisibilityForAsk()
        XCTAssertEqual(model.macSplitVisibility, .detailOnly)

        model.domainWebLiveState = "idle"
        model.syncMacSplitVisibilityForAsk()
        XCTAssertEqual(model.macSplitVisibility, .all)

        model.selectMacSidebar(.today)
        model.domainWebLiveState = "conversation"
        model.syncMacSplitVisibilityForAsk()
        XCTAssertEqual(model.macSplitVisibility, .all)
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
