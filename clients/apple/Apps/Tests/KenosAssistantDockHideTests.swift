import XCTest
@testable import KenosIOS

@MainActor
final class KenosAssistantDockHideTests: XCTestCase {
    func testHidesDockOnlyOnAskConversationLiveState() {
        let model = KenosAppModel()
        model.shellMode = .kenos
        model.selectedTab = .assistant
        model.domainWebLiveState = "idle"
        XCTAssertFalse(model.hideGlobalDockForAssistantConversation)

        model.domainWebLiveState = "conversation"
        XCTAssertTrue(model.hideGlobalDockForAssistantConversation)

        model.domainWebLiveState = "compose"
        XCTAssertTrue(model.hideGlobalDockForAssistantConversation)

        model.selectedTab = .today
        XCTAssertFalse(model.hideGlobalDockForAssistantConversation)

        model.selectedTab = .assistant
        model.domainWebLiveState = "conversation"
        model.shellMode = .domain
        XCTAssertFalse(model.hideGlobalDockForAssistantConversation)
    }

    func testConversationChromeHasMinimalBottomPad() {
        XCTAssertEqual(KenosWebChrome.kenosConversation.topPadPx, KenosWebChrome.kenosTabs.topPadPx)
        XCTAssertLessThan(
            KenosWebChrome.kenosConversation.bottomPadPx,
            KenosWebChrome.kenosTabs.bottomPadPx
        )
    }
}
