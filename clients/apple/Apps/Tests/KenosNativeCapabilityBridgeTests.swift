import XCTest
import WebKit
#if canImport(UIKit)
@testable import KenosIOS
#endif

#if os(iOS)
@MainActor
final class KenosNativeCapabilityBridgeTests: XCTestCase {
    func testNavManifestParsesDict() {
        let m = KenosNativeCapabilityBridge.NavManifest(dict: [
            "domainId": "plan",
            "path": "/upcoming",
            "title": "Plan",
            "activeTab": "upcoming",
            "canGoBack": true,
            "currentEntity": "task-1",
            "liveState": "editing",
            "unsavedDraft": true,
            "summary": "Unsaved task",
        ])
        XCTAssertEqual(m.domainId, "plan")
        XCTAssertEqual(m.path, "/upcoming")
        XCTAssertEqual(m.activeTab, "upcoming")
        XCTAssertTrue(m.canGoBack)
        XCTAssertEqual(m.currentEntity, "task-1")
        XCTAssertTrue(m.unsavedDraft)
        XCTAssertEqual(m.summary, "Unsaved task")
    }

    func testCapabilitySnapshotIncludesShippedAndGated() {
        let caps = KenosNativeCapabilityBridge.capabilitySnapshot
        XCTAssertEqual(caps["haptic"], true)
        XCTAssertEqual(caps["share"], true)
        XCTAssertEqual(caps["authenticate"], true)
        XCTAssertEqual(caps["navManifest"], true)
        XCTAssertEqual(caps["nowPlaying"], true)
        XCTAssertEqual(caps["openContinuity"], true)
        XCTAssertEqual(caps["spotlight"], true)
        XCTAssertEqual(caps["userActivity"], true)
        XCTAssertEqual(caps["push"], false)
        // liveActivity mirrors system ActivityAuthorizationInfo (may be true on Simulator).
        XCTAssertEqual(caps["liveActivity"], KenosLiveActivityFoundation.isEnabled)
        XCTAssertEqual(caps["liveActivityPreview"], true)
        XCTAssertTrue(KenosLiveActivityFoundation.isImplementationReady)
    }

    func testOpenContinuityResolvesDomainIdAndPath() {
        let expect = expectation(description: "openContinuity")
        var opened: URL?
        let token = NotificationCenter.default.addObserver(
            forName: .kenosOpenDomainContinuity,
            object: nil,
            queue: .main
        ) { note in
            opened = note.object as? URL
            expect.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(token) }

        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "oc1_test",
                "method": "openContinuity",
                "params": [
                    "domainId": "music",
                    "path": "/import",
                ],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
        wait(for: [expect], timeout: 1.0)
        XCTAssertNotNil(opened)
        XCTAssertEqual(opened?.path, "/import")
    }

    func testBootstrapScriptExposesKenosNative() {
        let js = KenosNativeCapabilityBridge.bootstrapScript
        XCTAssertTrue(js.contains("window.kenosNative"))
        XCTAssertTrue(js.contains("publishNavManifest"))
        XCTAssertTrue(js.contains("nowPlayingUpdate"))
        XCTAssertTrue(js.contains("liveActivityUpsert"))
        XCTAssertTrue(js.contains("openContinuity"))
        XCTAssertTrue(js.contains("kenosNative"))
    }

    func testPushAndLiveActivityFoundationsAreOwnerGated() {
        KenosLiveActivityFoundation.resetForTests()
        KenosLiveActivityFoundation.testingForceDisabled = true
        defer {
            KenosLiveActivityFoundation.testingForceDisabled = false
            KenosLiveActivityFoundation.resetForTests()
        }

        XCTAssertFalse(KenosPushFoundation.remotePushEnabled)
        XCTAssertTrue(KenosPushFoundation.localSchedulingEnabled)
        XCTAssertEqual(KenosPushFoundation.statusSummary, "local_notifications_ready")
        XCTAssertTrue(KenosLiveActivityFoundation.isImplementationReady)
        XCTAssertFalse(KenosLiveActivityFoundation.isEnabled)
        XCTAssertEqual(
            KenosLiveActivityFoundation.upsert(
                .init(kind: .training, title: "Chest", subtitle: "Set 2", progress: 0.4)
            ),
            false
        )
        XCTAssertEqual(KenosLiveActivityFoundation.lastSnapshot?.kind, .training)
        XCTAssertEqual(KenosLiveActivityFoundation.lastSnapshot?.title, "Chest")
        XCTAssertTrue(KenosLiveActivityFoundation.activeKinds.contains(.training))

        let fromDict = KenosLiveActivityFoundation.upsert(params: [
            "kind": "focus",
            "title": "Deep Work",
            "subtitle": "Kenos IA",
            "progress": 0.25,
        ])
        XCTAssertTrue(fromDict.ok)
        XCTAssertFalse(fromDict.enabled)
        XCTAssertEqual(fromDict.kind, "focus")
        XCTAssertEqual(KenosLiveActivityFoundation.lastSnapshot?.kind, .focus)

        let ended = KenosLiveActivityFoundation.end(params: ["kind": "focus"])
        XCTAssertTrue(ended.ok)
        XCTAssertFalse(KenosLiveActivityFoundation.activeKinds.contains(.focus))
    }

    func testLiveActivityAttributesDeepLinks() {
        #if canImport(ActivityKit)
        XCTAssertEqual(
            KenosDomainActivityAttributes(kind: .training).deepLinkURL.absoluteString,
            "kenos://training/session"
        )
        XCTAssertEqual(
            KenosDomainActivityAttributes(kind: .focus).deepLinkURL.absoluteString,
            "kenos://work"
        )
        XCTAssertTrue(
            KenosDomainActivityAttributes(kind: .tidy).deepLinkURL.absoluteString
                .contains("home")
        )
        #endif
    }

    func testHandlePublishNavManifestUpdatesCache() {
        let webView: WKWebView? = nil
        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "n1_test",
                "method": "publishNavManifest",
                "params": [
                    "domainId": "training",
                    "path": "/session",
                    "title": "Training",
                    "liveState": "active",
                    "unsavedDraft": false,
                ],
            ] as [String: Any],
            webView: webView
        )
        XCTAssertEqual(KenosNativeCapabilityBridge.lastNavManifest.domainId, "training")
        XCTAssertEqual(KenosNativeCapabilityBridge.lastNavManifest.path, "/session")
        XCTAssertEqual(KenosDomainWebBridge.navManifest.domainId, "training")
    }
}
#endif
