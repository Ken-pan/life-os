import XCTest
import KenosDesign
@testable import KenosIOS

#if os(iOS)
@MainActor
final class KenosWebWarmupTests: XCTestCase {
    func testWarmWebContentProcessIsIdempotentAndUsesDefaultStore() {
        KenosWebRuntime.warmWebContentProcessIfNeeded()
        KenosWebRuntime.warmWebContentProcessIfNeeded()
        XCTAssertTrue(KenosWebRuntime.didWarmWebContentProcess)
        XCTAssertTrue(KenosWebRuntime.warmupUsesDefaultDataStore)
    }

    func testResolvedBottomPadIncludesLiveAccessory() {
        let dockPad = KenosGlass.dockScrollEndPadPx
        XCTAssertEqual(dockPad, 78) // 56 row + 6 inset + 16 clearance
        XCTAssertEqual(
            KenosWebChrome.resolvedBottomPadPx(chrome: .kenosTabs, accessoryExtraPx: 0),
            dockPad
        )
        XCTAssertEqual(
            KenosWebChrome.resolvedBottomPadPx(
                chrome: .domainDock,
                accessoryExtraPx: KenosWebChrome.liveAccessoryExpandedPadPx
            ),
            dockPad + KenosWebChrome.liveAccessoryExpandedPadPx
        )
        XCTAssertEqual(
            KenosWebChrome.resolvedBottomPadPx(
                chrome: .kenosTabs,
                accessoryExtraPx: KenosWebChrome.liveAccessoryMinimizedPadPx
            ),
            dockPad + KenosWebChrome.liveAccessoryMinimizedPadPx
        )
        XCTAssertEqual(
            KenosWebChrome.resolvedBottomPadPx(chrome: .none, accessoryExtraPx: 80),
            24
        )
    }

    func testInactiveContinuityTTLPredicate() {
        XCTAssertFalse(
            KenosAppModel.shouldReleaseInactiveContinuity(
                shellIsDomain: true,
                hasContinuity: true,
                isMusicWithNowPlaying: false,
                hiddenDuration: 120
            )
        )
        XCTAssertFalse(
            KenosAppModel.shouldReleaseInactiveContinuity(
                shellIsDomain: false,
                hasContinuity: true,
                isMusicWithNowPlaying: true,
                hiddenDuration: 120
            )
        )
        XCTAssertFalse(
            KenosAppModel.shouldReleaseInactiveContinuity(
                shellIsDomain: false,
                hasContinuity: true,
                isMusicWithNowPlaying: false,
                hiddenDuration: 30
            )
        )
        XCTAssertTrue(
            KenosAppModel.shouldReleaseInactiveContinuity(
                shellIsDomain: false,
                hasContinuity: true,
                isMusicWithNowPlaying: false,
                hiddenDuration: 90
            )
        )
    }

    func testLiveAccessoryMinimizeToggles() {
        let model = KenosAppModel()
        XCTAssertFalse(model.liveAccessoryMinimized)
        model.setLiveAccessoryMinimized(true)
        XCTAssertTrue(model.liveAccessoryMinimized)
        model.setLiveAccessoryMinimized(true)
        XCTAssertTrue(model.liveAccessoryMinimized)
        model.setLiveAccessoryMinimized(false)
        XCTAssertFalse(model.liveAccessoryMinimized)
    }
}
#endif
