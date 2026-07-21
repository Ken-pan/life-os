import XCTest
#if canImport(UIKit)
import UIKit
@testable import KenosIOS

@MainActor
final class KenosBugReportTests: XCTestCase {
    private func sampleDiagnostics(
        app: String = "kenos",
        route: String = "/spaces",
        pageTitle: String = "Spaces · Kenos",
        heading: String = "Spaces",
        online: Bool? = true,
        consoleSummary: String = "",
        lastErrorClass: String = ""
    ) -> KenosBugDiagnostics {
        KenosBugDiagnostics(
            app: app,
            route: route,
            pageTitle: pageTitle,
            heading: heading,
            href: "http://127.0.0.1:5219/spaces",
            tab: "Spaces",
            domainLabel: "",
            viewportWidth: 393,
            viewportHeight: 852,
            devicePixelRatio: 3,
            userAgent: "KenosIOSTest",
            timestamp: "2026-07-21T00:00:00Z",
            shellMode: "kenos",
            build: "202607211400",
            marketingVersion: "1.0.0",
            originHost: "127.0.0.1:5219",
            deviceModel: "iPhone17,1",
            systemVersion: "26.0",
            authState: "session_present",
            online: online,
            focusState: "off",
            lastErrorClass: lastErrorClass,
            screenshotBytes: 120_000,
            consoleSummary: consoleSummary,
            webViewKind: "shell",
            captureSource: "screenshot",
            captureMs: 12,
            scrapeMs: 40,
            scrapeTimedOut: false,
            locale: "en_US",
            webSignedIn: true
        )
    }

    func testJpegUnderLimitRespectsMaxBytes() {
        let size = CGSize(width: 1200, height: 2400)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            UIColor.systemBlue.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        let data = KenosBugReportCapture.jpegUnderLimit(image, maxBytes: 80_000)
        XCTAssertNotNil(data)
        XCTAssertLessThanOrEqual(data!.count, 80_000)
    }

    func testBlankCaptureHeuristicIgnoresDarkInkUI() {
        let size = CGSize(width: 400, height: 800)
        let renderer = UIGraphicsImageRenderer(size: size)
        // Kenos ink + a light dock strip — must NOT be treated as a failed blank snap.
        let inkUI = renderer.image { ctx in
            UIColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            UIColor(white: 0.85, alpha: 1).setFill()
            ctx.fill(CGRect(x: 40, y: size.height - 80, width: size.width - 80, height: 48))
        }
        XCTAssertFalse(KenosBugReportCapture.isVisuallyBlankCapture(inkUI))

        let pureWhite = renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        XCTAssertTrue(KenosBugReportCapture.isVisuallyBlankCapture(pureWhite))

        let pureBlack = renderer.image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        XCTAssertTrue(KenosBugReportCapture.isVisuallyBlankCapture(pureBlack))
    }

    func testInferAppFromDomainHost() {
        let model = KenosAppModel()
        model.shellMode = .domain
        model.continuityURL = URL(string: "http://10.20.202.15:5188/today")
        XCTAssertEqual(KenosBugDiagnosticsFactory.inferApp(model: model, route: "/today"), "planner")

        model.continuityURL = URL(string: "http://10.20.202.15:5190/day/1")
        XCTAssertEqual(KenosBugDiagnosticsFactory.inferApp(model: model, route: "/day/1"), "fitness")
    }

    func testInferAppPrefersLiveURLOverStaleContinuity() {
        let model = KenosAppModel()
        model.shellMode = .domain
        model.continuityURL = URL(string: "http://10.20.202.15:5188/today")
        let live = URL(string: "http://10.20.202.15:5190/day/2")
        XCTAssertEqual(
            KenosBugDiagnosticsFactory.inferApp(model: model, route: "/day/2", href: "", liveURL: live),
            "fitness"
        )
    }

    func testInferAppDefaultsToKenos() {
        let model = KenosAppModel()
        model.shellMode = .kenos
        XCTAssertEqual(KenosBugDiagnosticsFactory.inferApp(model: model, route: "/assistant"), "kenos")
    }

    func testInferAppMapsExperimentalDomainsToKenos() {
        let model = KenosAppModel()
        model.shellMode = .domain
        model.continuityURL = URL(string: "http://10.20.202.15:5879/library")
        XCTAssertEqual(
            KenosBugDiagnosticsFactory.inferApp(model: model, route: "/library"),
            "kenos"
        )

        model.continuityURL = URL(string: "http://10.20.202.15:5192/day")
        XCTAssertEqual(
            KenosBugDiagnosticsFactory.inferApp(model: model, route: "/day"),
            "kenos"
        )
    }

    func testNormalizeBugLogApp() {
        XCTAssertEqual(KenosBugDiagnosticsFactory.normalizeBugLogApp("planner"), "planner")
        XCTAssertEqual(KenosBugDiagnosticsFactory.normalizeBugLogApp("knowledge"), "kenos")
        XCTAssertEqual(KenosBugDiagnosticsFactory.normalizeBugLogApp("health"), "kenos")
        XCTAssertEqual(KenosBugDiagnosticsFactory.normalizeBugLogApp("aios"), "kenos")
        XCTAssertEqual(KenosBugDiagnosticsFactory.normalizeBugLogApp("paper"), "kenos")
        XCTAssertTrue(KenosBugDiagnosticsFactory.bugLogAllowedApps.contains("kenos"))
        XCTAssertFalse(KenosBugDiagnosticsFactory.bugLogAllowedApps.contains("knowledge"))
    }

    func testPrefillTitleUsesHeadingAndApp() {
        let d = sampleDiagnostics(app: "planner", route: "/today", pageTitle: "Today", heading: "Today")
        XCTAssertEqual(KenosBugReportPrefill.title(from: d), "[planner] Today")
    }

    func testComposeNotesKeepsFormClean() {
        let d = sampleDiagnostics()
        let composed = KenosBugReportPrefill.composeNotes(userNotes: "Dock overlaps content", diagnostics: d)
        XCTAssertTrue(composed.contains("## What happened"))
        XCTAssertTrue(composed.contains("Dock overlaps content"))
        XCTAssertTrue(composed.contains("## Context (auto)"))
        XCTAssertTrue(composed.contains("- App: kenos"))
        XCTAssertTrue(composed.contains("- Capture: 12ms · scrape: 40ms"))
        XCTAssertEqual(KenosBugReportPrefill.userNotesPlaceholder(from: d), "What looked wrong on Spaces?")
    }

    func testPromptSubtitleIsCompact() {
        let subtitle = KenosBugReportPrefill.promptSubtitle(from: sampleDiagnostics())
        XCTAssertEqual(subtitle, "kenos · Spaces · /spaces")
    }

    func testPrefillSeverityHighOnlyForRealErrors() {
        XCTAssertEqual(KenosBugReportPrefill.severity(from: sampleDiagnostics(online: false)), .high)
        XCTAssertEqual(
            KenosBugReportPrefill.severity(from: sampleDiagnostics(consoleSummary: "TypeError: x is undefined")),
            .high
        )
        XCTAssertEqual(
            KenosBugReportPrefill.severity(from: sampleDiagnostics(consoleSummary: "warn: slow paint")),
            .medium
        )
        XCTAssertEqual(KenosBugReportPrefill.severity(from: sampleDiagnostics()), .medium)
        XCTAssertFalse(KenosBugReportPrefill.consoleLooksLikeError("warn: deprecated"))
        XCTAssertTrue(KenosBugReportPrefill.consoleLooksLikeError("Uncaught TypeError: boom"))
    }

    func testRedactHrefDropsQueryAndFragment() {
        let raw = "http://10.0.0.1:5219/cb?access_token=SECRET&path=/today#frag"
        let redacted = KenosBugDiagnosticsFactory.redactHref(raw)
        XCTAssertFalse(redacted.contains("SECRET"))
        XCTAssertFalse(redacted.contains("access_token"))
        XCTAssertFalse(redacted.contains("frag"))
        XCTAssertTrue(redacted.contains("/cb"))
    }

    func testLocalPackageWritesScreenshotAndMarkdown() throws {
        let d = sampleDiagnostics()
        let draft = KenosBugReportDraft(
            id: UUID(),
            title: "Dock overlap",
            notes: KenosBugReportPrefill.composeNotes(userNotes: "chip covers content", diagnostics: d),
            severity: .high,
            screenshotJPEG: Data([0xFF, 0xD8, 0xFF, 0xD9]),
            diagnostics: d,
            capturedAt: Date()
        )
        let dir = try KenosBugReportSubmitter.saveLocalPackage(draft: draft, title: "Dock overlap")
        defer { try? FileManager.default.removeItem(at: dir) }

        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.appendingPathComponent("screenshot.jpg").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.appendingPathComponent("report.json").path))
        let md = try String(contentsOf: dir.appendingPathComponent("report.md"), encoding: .utf8)
        XCTAssertTrue(md.contains("Dock overlap"))
        XCTAssertTrue(md.contains("high"))
        XCTAssertTrue(md.contains("## Context (auto)"))
    }

    func testSystemScreenshotPromptRespectsOptOut() async {
        let model = KenosAppModel()
        model.setAskAfterScreenshotEnabled(false)
        await model.handleSystemScreenshot()
        XCTAssertFalse(model.showScreenshotBugPrompt)
        XCTAssertNil(model.bugReportDraft)
    }

    func testSystemScreenshotPromptDoesNotOpenFullSheet() async {
        let model = KenosAppModel()
        model.setAskAfterScreenshotEnabled(true)
        await model.handleSystemScreenshot()
        XCTAssertTrue(model.showScreenshotBugPrompt)
        XCTAssertFalse(model.showBugReportSheet)
        XCTAssertNotNil(model.bugReportDraft)
        XCTAssertEqual(model.bugReportDraft?.notes, "")
        XCTAssertEqual(model.bugReportDraft?.diagnostics.captureSource, "screenshot")
        model.dismissScreenshotBugPrompt()
        XCTAssertNil(model.bugReportDraft)
    }

    func testConfirmScreenshotBugReportKeepsDraft() async {
        let model = KenosAppModel()
        model.setAskAfterScreenshotEnabled(true)
        await model.handleSystemScreenshot()
        model.confirmScreenshotBugReport()
        XCTAssertTrue(model.showBugReportSheet)
        XCTAssertFalse(model.showScreenshotBugPrompt)
        XCTAssertNotNil(model.bugReportDraft)
        XCTAssertFalse(model.bugReportDraft?.title.isEmpty ?? true)
    }

    func testSystemScreenshotPromptWorksOnSettings() async {
        let model = KenosAppModel()
        model.focusStore.logoutClear()
        model.setAskAfterScreenshotEnabled(true)
        model.presentSettings()
        XCTAssertTrue(model.showSettingsSheet)
        XCTAssertEqual(model.selectedTab, .today)
        await model.handleSystemScreenshot()
        XCTAssertTrue(model.showScreenshotBugPrompt)
        XCTAssertEqual(model.bugReportDraft?.diagnostics.chromeContext, "settings")
    }

    func testPresentSettingsKeepsUnderlyingTab() {
        let model = KenosAppModel()
        model.selectedTab = .inbox
        model.presentSettings()
        XCTAssertTrue(model.showSettingsSheet)
        XCTAssertEqual(model.selectedTab, .inbox)
        model.dismissSettings()
        XCTAssertFalse(model.showSettingsSheet)
        XCTAssertEqual(model.selectedTab, .inbox)
    }

    func testBeginBugReportDismissesSettingsSheet() async {
        let model = KenosAppModel()
        model.presentSettings()
        XCTAssertTrue(model.showSettingsSheet)
        await model.beginBugReport(delayCapture: false)
        XCTAssertFalse(model.showSettingsSheet)
        XCTAssertTrue(model.showBugReportSheet)
    }

    func testSystemScreenshotPromptWorksWithShelfOpen() async {
        let model = KenosAppModel()
        model.focusStore.logoutClear()
        model.setAskAfterScreenshotEnabled(true)
        model.showSpaceShelf = true
        await model.handleSystemScreenshot()
        XCTAssertTrue(model.showScreenshotBugPrompt)
        XCTAssertEqual(model.bugReportDraft?.diagnostics.chromeContext, "shelf")
    }

    func testSystemScreenshotPromptWorksWithCaptureSheetOpen() async {
        let model = KenosAppModel()
        model.focusStore.logoutClear()
        model.setAskAfterScreenshotEnabled(true)
        model.showCaptureSheet = true
        await model.handleSystemScreenshot()
        XCTAssertTrue(model.showScreenshotBugPrompt)
        XCTAssertEqual(model.bugReportDraft?.diagnostics.chromeContext, "capture")
    }

    func testSystemScreenshotPromptBlockedOnlyWhileReportSheetOpen() async {
        let model = KenosAppModel()
        model.setAskAfterScreenshotEnabled(true)
        model.showBugReportSheet = true
        await model.handleSystemScreenshot()
        XCTAssertFalse(model.showScreenshotBugPrompt)
        XCTAssertNil(model.bugReportDraft)
    }

    func testClearBugReportDraftIfIdleKeepsDraftWhileSheetOpen() async {
        let model = KenosAppModel()
        model.setAskAfterScreenshotEnabled(true)
        await model.handleSystemScreenshot()
        model.confirmScreenshotBugReport()
        model.clearBugReportDraftIfIdle()
        XCTAssertNotNil(model.bugReportDraft)
        model.showBugReportSheet = false
        model.clearBugReportDraftIfIdle()
        XCTAssertNil(model.bugReportDraft)
    }

    func testPrefillTitleStableUntilContextChanges() {
        let before = sampleDiagnostics(heading: "Spaces")
        let after = sampleDiagnostics(
            route: "/inbox",
            pageTitle: "Inbox · Kenos",
            heading: "Inbox"
        )
        let autoBefore = KenosBugReportPrefill.title(from: before)
        let autoAfter = KenosBugReportPrefill.title(from: after)
        XCTAssertEqual(autoBefore, "[kenos] Spaces")
        XCTAssertEqual(autoAfter, "[kenos] Inbox")
        // Enrich only rewrites title when the field still equals the previous auto value.
        XCTAssertNotEqual(autoBefore, autoAfter)
    }

    func testPromptSubtitleSurfacesChromeContext() {
        var d = sampleDiagnostics()
        d.chromeContext = "shelf"
        XCTAssertEqual(KenosBugReportPrefill.promptSubtitle(from: d), "kenos · Shelf · /spaces")
        d.chromeContext = "settings"
        XCTAssertEqual(KenosBugReportPrefill.promptSubtitle(from: d), "kenos · Settings")
    }

    func testChromeContextListsOpenSurfaces() {
        let model = KenosAppModel()
        model.focusStore.logoutClear()
        model.showSettingsSheet = true
        model.showSpaceShelf = true
        model.showDomainMoreSheet = true
        XCTAssertEqual(model.screenshotChromeContext(), "settings,shelf,domainMore")
    }

    func testChromeContextIncludesFocus() {
        let model = KenosAppModel()
        model.focusStore.logoutClear()
        model.focusStore.startTrainingFocus()
        XCTAssertTrue(model.hideGlobalNavForFocus || model.focusStore.isPaused)
        XCTAssertEqual(model.screenshotChromeContext(), "focus")
    }

    func testPassthroughWindowPassesRootViewHits() {
        let window = KenosPassthroughWindow(frame: CGRect(x: 0, y: 0, width: 200, height: 400))
        let root = UIViewController()
        let host = UIView(frame: window.bounds)
        root.view = host
        window.rootViewController = root
        XCTAssertNil(window.hitTest(CGPoint(x: 10, y: 10), with: nil))
    }

    func testSubmitRequiresTitle() async {
        let draft = KenosBugReportDraft(
            id: UUID(),
            title: "   ",
            notes: "",
            severity: .medium,
            screenshotJPEG: nil,
            diagnostics: sampleDiagnostics(route: "/", pageTitle: "", heading: ""),
            capturedAt: Date()
        )
        do {
            _ = try await KenosBugReportSubmitter.submit(draft: draft, auth: nil, preferRemote: false)
            XCTFail("expected missing title")
        } catch let error as KenosBugReportSubmitter.SubmitError {
            XCTAssertEqual(error.localizedDescription, "Title is required.")
        } catch {
            XCTFail("unexpected \(error)")
        }
    }
}
#endif
