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
        XCTAssertEqual(caps["cancelAuthenticate"], true)
        XCTAssertEqual(caps["clearUnlockGrant"], true)
        XCTAssertEqual(caps["navManifest"], true)
        XCTAssertEqual(caps["chromeAppearance"], true)
        XCTAssertEqual(caps["shellSettings"], true)
        XCTAssertEqual(caps["nowPlaying"], true)
        XCTAssertEqual(caps["openContinuity"], true)
        XCTAssertEqual(caps["spotlight"], true)
        XCTAssertEqual(caps["userActivity"], true)
        XCTAssertEqual(caps["push"], false)
        XCTAssertEqual(caps["localNotifications"], true)
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
        XCTAssertTrue(js.contains("publishChromeAppearance"))
        XCTAssertTrue(js.contains("data-theme"))
        XCTAssertTrue(js.contains("nowPlayingUpdate"))
        XCTAssertTrue(js.contains("liveActivityUpsert"))
        XCTAssertTrue(js.contains("openContinuity"))
        XCTAssertTrue(js.contains("kenosNative"))
        XCTAssertTrue(js.contains("notifications"))
        XCTAssertTrue(js.contains("syncReminders"))
        XCTAssertTrue(js.contains("notificationsSyncReminders"))
        XCTAssertTrue(js.contains("shellSettings"))
        XCTAssertTrue(js.contains("shellSettingsGet"))
        XCTAssertTrue(js.contains("shellSettingsSet"))
        // Face ID must not share the default 15s bridge timeout.
        XCTAssertTrue(js.contains("method === 'authenticate'"))
        XCTAssertTrue(js.contains("180000"))
        XCTAssertTrue(js.contains("cancelAuthenticate"))
        XCTAssertTrue(js.contains("clearUnlockGrant"))
    }

    func testUnlockGrantStoreSurvivesRemountWindow() {
        KenosUnlockGrantStore.resetForTests()
        defer { KenosUnlockGrantStore.resetForTests() }

        let key = "kenos.unlock.money"
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertFalse(KenosUnlockGrantStore.isValid(key, now: t0))
        KenosUnlockGrantStore.remember(key, ttl: 60, now: t0)
        XCTAssertTrue(KenosUnlockGrantStore.isValid(key, now: t0.addingTimeInterval(30)))
        XCTAssertFalse(KenosUnlockGrantStore.isValid(key, now: t0.addingTimeInterval(61)))

        KenosUnlockGrantStore.remember(key, ttl: 120, now: t0)
        KenosUnlockGrantStore.clear(key)
        XCTAssertFalse(KenosUnlockGrantStore.isValid(key, now: t0.addingTimeInterval(1)))

        KenosUnlockGrantStore.remember("a", ttl: 60, now: t0)
        KenosUnlockGrantStore.remember("b", ttl: 60, now: t0)
        KenosUnlockGrantStore.clear(nil)
        XCTAssertFalse(KenosUnlockGrantStore.isValid("a", now: t0))
        XCTAssertFalse(KenosUnlockGrantStore.isValid("b", now: t0))
    }

    func testClearUnlockGrantViaBridge() {
        KenosUnlockGrantStore.resetForTests()
        defer { KenosUnlockGrantStore.resetForTests() }
        KenosUnlockGrantStore.remember("kenos.unlock.work", ttl: 600)
        XCTAssertTrue(KenosUnlockGrantStore.isValid("kenos.unlock.work"))

        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "clear_grant_test",
                "method": "clearUnlockGrant",
                "params": ["storageKey": "kenos.unlock.work"],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
        XCTAssertFalse(KenosUnlockGrantStore.isValid("kenos.unlock.work"))
    }

    func testAuthenticatePromptFalseDoesNotRequireLA() {
        KenosUnlockGrantStore.resetForTests()
        defer { KenosUnlockGrantStore.resetForTests() }
        // No grant + prompt:false must not present Face ID (restore-only path).
        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "prompt_false_test",
                "method": "authenticate",
                "params": [
                    "storageKey": "kenos.unlock.money",
                    "prompt": false,
                    "reason": "Unlock Money",
                ],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
        // With grant, prompt:false still opens via cache.
        KenosUnlockGrantStore.remember("kenos.unlock.money", ttl: 600)
        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "prompt_false_cached",
                "method": "authenticate",
                "params": [
                    "storageKey": "kenos.unlock.money",
                    "prompt": false,
                ],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
    }

    func testShellSettingsRoundTripViaBridge() {
        KenosShellSettingsStore.resetForTests()
        defer { KenosShellSettingsStore.resetForTests() }

        XCTAssertFalse(KenosShellSettingsStore.hasStoredTheme)
        XCTAssertFalse(KenosShellSettingsStore.hasStoredLocale)
        let empty = KenosShellSettingsStore.encode()
        XCTAssertEqual(empty["hasTheme"] as? Bool, false)
        XCTAssertEqual(empty["hasLocale"] as? Bool, false)

        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "shell_set_test",
                "method": "shellSettingsSet",
                "params": [
                    "theme": "dark",
                    "locale": "zh",
                ],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
        let snap = KenosShellSettingsStore.current
        XCTAssertEqual(snap.theme, "dark")
        XCTAssertEqual(snap.locale, "zh")
        XCTAssertEqual(snap.resolvedLocale(), "zh")
        XCTAssertTrue(KenosShellSettingsStore.hasStoredTheme)
        XCTAssertTrue(KenosShellSettingsStore.hasStoredLocale)

        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "shell_set_system",
                "method": "shellSettingsSet",
                "params": ["locale": "system"],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
        XCTAssertEqual(KenosShellSettingsStore.current.locale, "system")
        XCTAssertTrue(KenosShellSettingsStore.hasStoredLocale)
    }

    func testCancelAuthenticateClearsActiveSlotWithoutCrash() {
        // No in-flight LAContext — cancel must still resolve cleanly.
        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "cancel_idle_test",
                "method": "cancelAuthenticate",
                "params": [:] as [String: Any],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
        // Second call stays idempotent.
        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "cancel_idle_test_2",
                "method": "cancelAuthenticate",
                "params": [:] as [String: Any],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
    }

    func testDomainDefaultChromeAppearanceMatchesBrandPolarity() {
        XCTAssertEqual(KenosDomainRegistry.defaultChromeAppearance(forDomainId: "plan"), .light)
        XCTAssertEqual(KenosDomainRegistry.defaultChromeAppearance(forDomainId: "planner"), .light)
        XCTAssertEqual(KenosDomainRegistry.defaultChromeAppearance(forDomainId: "training"), .dark)
        XCTAssertEqual(KenosDomainRegistry.defaultChromeAppearance(forDomainId: "fitness"), .dark)
        XCTAssertEqual(KenosDomainRegistry.defaultChromeAppearance(forDomainId: "music"), .light)
        XCTAssertEqual(KenosDomainRegistry.defaultChromeAppearance(forDomainId: "health"), .dark)
        XCTAssertFalse(KenosChromeAppearance.light.statusBarUsesLightContent)
        XCTAssertTrue(KenosChromeAppearance.dark.statusBarUsesLightContent)
    }

    func testDomainAccentSemanticPairsForGlassContrast() {
        let plan = KenosDomainAccent.plan
        XCTAssertEqual(plan.accentLight, 0xC47A08)
        XCTAssertEqual(plan.accentOnGlassLight, 0x87580E)
        XCTAssertNotEqual(plan.accentOnGlassLight, 0xC9A227)
        XCTAssertNotEqual(plan.accentOnGlassLight, 0x9A6410)
        XCTAssertEqual(plan.selectionPlateOpacity(for: .light), 0.10, accuracy: 0.001)
        XCTAssertEqual(plan.selectionPlateOpacity(for: .dark), 0.14, accuracy: 0.001)
        XCTAssertEqual(KenosDomainAccent.training.accentDark, 0xC45C4A)
        XCTAssertEqual(KenosDomainAccent.money.accentOnGlassLight, 0x276645)
        XCTAssertEqual(KenosDomainAccent.paper.accentLight, 0x6E5A42)
        XCTAssertEqual(KenosDomainAccent.home.accentDark, 0x8AADC8)
        XCTAssertEqual(KenosDomainRegistry.definition(for: "plan")?.accentRGB, plan.accentDark)
    }

    func testPublishChromeAppearancePostsAndCaches() {
        let expect = expectation(description: "chromeAppearance")
        var scheme: String?
        let token = NotificationCenter.default.addObserver(
            forName: .kenosChromeAppearanceDidChange,
            object: nil,
            queue: .main
        ) { note in
            scheme = (note.userInfo?["colorScheme"] as? String) ?? (note.object as? String)
            expect.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(token) }

        KenosNativeCapabilityBridge.handleMessage(
            body: [
                "id": "ca1_test",
                "method": "publishChromeAppearance",
                "params": ["colorScheme": "light"],
            ] as [String: Any],
            webView: nil as WKWebView?
        )
        wait(for: [expect], timeout: 1.0)
        XCTAssertEqual(scheme, "light")
        XCTAssertEqual(KenosNativeCapabilityBridge.lastChromeAppearance, "light")
    }

    func testPushAndLiveActivityFoundationsAreOwnerGated() {
        KenosLiveActivityFoundation.resetForTests()
        KenosLiveActivityFoundation.testingForceDisabled = true
        UserDefaults.standard.removeObject(forKey: KenosPushTokenStore.remoteEnabledDefaultsKey)
        defer {
            KenosLiveActivityFoundation.testingForceDisabled = false
            KenosLiveActivityFoundation.resetForTests()
            UserDefaults.standard.removeObject(forKey: KenosPushTokenStore.remoteEnabledDefaultsKey)
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
