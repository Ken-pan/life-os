import XCTest
#if canImport(UIKit)
import MediaPlayer
import UIKit
@testable import KenosIOS
#endif

#if os(iOS)
@MainActor
final class KenosNowPlayingBridgeTests: XCTestCase {
    override func tearDown() async throws {
        KenosNowPlayingBridge.clear()
        try await super.tearDown()
    }

    func testEmptyUpdateIsIgnored() {
        KenosNowPlayingBridge.clear()
        KenosNowPlayingBridge.update(params: [
            "trackId": "",
            "title": "",
            "playing": true,
        ])
        XCTAssertFalse(KenosNowPlayingBridge.hasLiveTrack)
    }

    func testUpdateSetsLiveTrackAndClearResets() {
        KenosNowPlayingBridge.update(params: [
            "trackId": "t1",
            "title": "Demo",
            "artist": "Ken",
            "playing": true,
            "duration": 120,
        ])
        XCTAssertTrue(KenosNowPlayingBridge.hasLiveTrack)
        XCTAssertTrue(KenosNowPlayingBridge.isPlaying)
        XCTAssertEqual(KenosNowPlayingBridge.liveAccessoryTitle, "Demo")
        XCTAssertEqual(KenosNowPlayingBridge.liveAccessorySubtitle, "Ken")

        KenosNowPlayingBridge.clear()
        XCTAssertFalse(KenosNowPlayingBridge.hasLiveTrack)
        XCTAssertNil(KenosNowPlayingBridge.liveAccessoryTitle)
    }

    func testShouldKeepMediaAliveRequiresMusicOrigin() {
        KenosNowPlayingBridge.update(params: [
            "trackId": "t2",
            "title": "Keep",
            "playing": true,
        ])
        let music = URL(string: "http://127.0.0.1:5189/?iosNativeShell=1")
        let plan = URL(string: "http://127.0.0.1:5188/?iosNativeShell=1")
        XCTAssertTrue(KenosNowPlayingBridge.shouldKeepMediaAlive(for: music))
        XCTAssertFalse(KenosNowPlayingBridge.shouldKeepMediaAlive(for: plan))
        XCTAssertFalse(KenosNowPlayingBridge.shouldKeepMediaAlive(for: nil))
    }

    func testOversizeArtworkIsIgnored() {
        let huge = String(repeating: "A", count: 300_000)
        KenosNowPlayingBridge.update(params: [
            "trackId": "t3",
            "title": "BigArt",
            "playing": true,
            "artwork": "data:image/jpeg;base64,\(huge)",
        ])
        XCTAssertTrue(KenosNowPlayingBridge.hasLiveTrack)
        XCTAssertEqual(KenosNowPlayingBridge.liveAccessoryTitle, "BigArt")
    }

    /// Regression: Music Continuity crashed when MediaPlayer invoked the
    /// artwork request handler off-main (EXC_BREAKPOINT in decodeArtwork).
    func testArtworkRequestHandlerSafeOffMainActor() async {
        // 2×2 PNG (width/height > 1 — decoder rejects 1×1 placeholders)
        let png =
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII="
        let art = KenosNowPlayingBridge.testingMakeArtwork(
            fromBase64: "data:image/png;base64,\(png)"
        )
        XCTAssertNotNil(art, "artwork decode should succeed for tiny PNG covers")
        let image = await withCheckedContinuation { (cont: CheckedContinuation<UIImage?, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                // Same path as MediaPlayer `*/accessQueue` — must not trap.
                cont.resume(returning: art?.image(at: CGSize(width: 64, height: 64)))
            }
        }
        XCTAssertNotNil(image)
    }
}
#endif
