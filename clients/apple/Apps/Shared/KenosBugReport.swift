#if os(iOS)
import Foundation
import KenosClient
import KenosDesign
import SwiftUI
import UIKit
import WebKit

/// Tracks the most recent shell or Domain WKWebView for auth / route diagnostics.
@MainActor
enum KenosActiveWebRegistry {
    weak static var shellWebView: WKWebView?
    weak static var domainWebView: WKWebView?

    static var preferred: WKWebView? {
        domainWebView ?? shellWebView
    }

    static func preferred(for model: KenosAppModel) -> WKWebView? {
        switch model.shellMode {
        case .domain: return domainWebView ?? shellWebView
        case .kenos, .focus: return shellWebView ?? domainWebView
        }
    }

    static func kind(for model: KenosAppModel) -> String {
        switch model.shellMode {
        case .domain:
            if domainWebView != nil { return "domain" }
            return shellWebView != nil ? "shell" : "none"
        case .kenos, .focus:
            if shellWebView != nil { return "shell" }
            return domainWebView != nil ? "domain" : "none"
        }
    }
}

/// Touches outside the prompt card fall through to the app (and any modal sheet).
///
/// Hit policy is **frame-based**, not class-name / full-bleed heuristics:
/// - Filtering `HostingView` by name made Buttons look tappable but swallow presses
///   (SwiftUI controls often resolve to nested hosting views).
/// - Filtering by "full window bounds" also failed — iOS 26 interactive
///   `glassEffect` can return a large hosting container as the deepest hit even
///   when the finger is on the card, so taps passed through and the CTA did nothing.
final class KenosPassthroughWindow: UIWindow {
    /// Interactive card frame in **this window's** coordinates. `.null` → pass everything.
    static var interactiveFrameInWindow: CGRect = .null

    /// Whether a window-space point should be claimed by the elevated prompt.
    static func shouldClaimPoint(_ point: CGPoint, interactiveFrame: CGRect) -> Bool {
        guard interactiveFrame.isNull == false, interactiveFrame.isEmpty == false else {
            return false
        }
        // Small slop so anti-aliased glass edges still receive the press.
        return interactiveFrame.insetBy(dx: -8, dy: -8).contains(point)
    }

    /// Fallback while the card frame has not laid out yet (first frame after present).
    /// Keep compact controls; pass through full-bleed SwiftUI hosts.
    static func shouldDeliverHitWithoutFrame(
        hit: UIView?,
        root: UIView?,
        windowBounds: CGRect,
        fillSlop: CGFloat = 2
    ) -> Bool {
        guard let hit else { return false }
        if hit === root { return false }
        if hit.bounds.width >= windowBounds.width - fillSlop,
           hit.bounds.height >= windowBounds.height - fillSlop
        {
            return false
        }
        return true
    }

    /// `true` → deliver; `false` → pass through.
    /// Prefer the published card frame; fall back to compact-hit heuristic until layout.
    static func shouldDeliverHit(
        at point: CGPoint,
        interactiveFrame: CGRect,
        hit: UIView?,
        root: UIView?,
        windowBounds: CGRect
    ) -> Bool {
        if shouldClaimPoint(point, interactiveFrame: interactiveFrame) {
            return hit != nil
        }
        if interactiveFrame.isNull || interactiveFrame.isEmpty {
            return shouldDeliverHitWithoutFrame(hit: hit, root: root, windowBounds: windowBounds)
        }
        return false
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let frame = Self.interactiveFrameInWindow
        // Fast path: known card frame — only walk the tree when the point is on-card.
        if frame.isNull == false, frame.isEmpty == false {
            guard Self.shouldClaimPoint(point, interactiveFrame: frame) else { return nil }
            return super.hitTest(point, with: event)
        }
        // Frame not published yet — resolve hit, then keep only compact controls.
        guard let hit = super.hitTest(point, with: event) else { return nil }
        return Self.shouldDeliverHit(
            at: point,
            interactiveFrame: frame,
            hit: hit,
            root: rootViewController?.view,
            windowBounds: bounds
        ) ? hit : nil
    }
}

/// Reports the card's frame in window coordinates for `KenosPassthroughWindow`.
private final class KenosBugPromptHitAnchorView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        publishFrame()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil {
            KenosPassthroughWindow.interactiveFrameInWindow = .null
        } else {
            publishFrame()
        }
    }

    private func publishFrame() {
        guard let window else { return }
        let next = convert(bounds, to: window)
        guard next.isNull == false, next.isEmpty == false else { return }
        KenosPassthroughWindow.interactiveFrameInWindow = next
    }
}

private struct KenosBugPromptHitAnchor: UIViewRepresentable {
    func makeUIView(context: Context) -> KenosBugPromptHitAnchorView {
        KenosBugPromptHitAnchorView()
    }

    func updateUIView(_ uiView: KenosBugPromptHitAnchorView, context: Context) {
        uiView.setNeedsLayout()
    }
}

/// Hosts the quiet screenshot offer above SwiftUI sheets / alerts.
@MainActor
enum KenosScreenshotBugPromptPresenter {
    private static var window: KenosPassthroughWindow?

    static func sync(model: KenosAppModel) {
        // Never keep the elevated window above the full bug-report sheet.
        if model.showScreenshotBugPrompt, !model.showBugReportSheet {
            present(model: model)
        } else {
            dismiss()
        }
    }

    private static func present(model: KenosAppModel) {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive })
            ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
        else { return }

        let root = KenosScreenshotBugPromptWindowRoot(model: model)
        if let existing = window {
            if let host = existing.rootViewController as? UIHostingController<KenosScreenshotBugPromptWindowRoot> {
                host.rootView = root
            }
            existing.isHidden = false
            return
        }

        let host = UIHostingController(rootView: root)
        host.view.backgroundColor = .clear
        let win = KenosPassthroughWindow(windowScene: scene)
        win.windowLevel = .alert + 1
        win.backgroundColor = .clear
        win.rootViewController = host
        // Visible but not key — keep keyboard / first-responder in the app window.
        win.isHidden = false
        window = win
    }

    static func dismiss() {
        KenosPassthroughWindow.interactiveFrameInWindow = .null
        window?.isHidden = true
        window?.rootViewController = nil
        window = nil
    }
}

private struct KenosScreenshotBugPromptWindowRoot: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: .bottom) {
            if model.showScreenshotBugPrompt {
                KenosScreenshotBugPrompt(model: model)
                    .padding(.bottom, model.screenshotBugPromptBottomPadding)
                    .transition(
                        .asymmetric(
                            insertion: reduceMotion
                                ? .opacity
                                : .move(edge: .bottom).combined(with: .opacity),
                            removal: .opacity
                        )
                    )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        // When the card is gone, disable the whole hosting tree so an orphan
        // elevated window cannot sit above the bug-report sheet and eat taps.
        .allowsHitTesting(model.showScreenshotBugPrompt && !model.showBugReportSheet)
        .animation(KenosMotion.chrome(reduceMotion: reduceMotion), value: model.showScreenshotBugPrompt)
    }
}

/// Cached once — avoids uname / Bundle reads on every screenshot.
enum KenosBugDeviceInfo {
    static let model: String = {
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
    }()

    static let build: String =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"

    static let marketingVersion: String =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"

    static var systemVersion: String { UIDevice.current.systemVersion }

    static var localeIdentifier: String { Locale.current.identifier }
}

struct KenosBugReportDraft: Identifiable, Equatable {
    let id: UUID
    var title: String
    var notes: String
    var severity: Severity
    var screenshotJPEG: Data?
    var diagnostics: KenosBugDiagnostics
    var capturedAt: Date

    enum Severity: String, CaseIterable, Identifiable {
        case low, medium, high
        var id: String { rawValue }
        var label: String {
            switch self {
            case .low: return "Low"
            case .medium: return "Medium"
            case .high: return "High"
            }
        }
    }

    static let maxScreenshotBytes = 6 * 1024 * 1024
}

struct KenosBugDiagnostics: Equatable, Codable {
    var app: String
    var route: String
    var pageTitle: String
    var heading: String
    var href: String
    var tab: String
    var domainLabel: String
    var viewportWidth: Int
    var viewportHeight: Int
    var devicePixelRatio: Double
    var userAgent: String
    var timestamp: String
    var shellMode: String
    var build: String
    var marketingVersion: String
    var originHost: String
    var deviceModel: String
    var systemVersion: String
    var authState: String
    var online: Bool?
    var focusState: String
    var lastErrorClass: String
    var screenshotBytes: Int
    var consoleSummary: String
    /// shell | domain | none
    var webViewKind: String
    /// screenshot | manual
    var captureSource: String
    var captureMs: Int
    var scrapeMs: Int
    var scrapeTimedOut: Bool
    var locale: String
    /// Web localStorage session present (never the token).
    var webSignedIn: Bool?
    /// Comma-separated native chrome open at capture (settings,shelf,capture,…).
    var chromeContext: String = ""
}

enum KenosBugReportCapture {
    /// Cap Retina scale — 3× full-bleed JPEG is costly and rarely helps triage.
    static let maxPixelScale: CGFloat = 2.0

    struct CaptureResult: Sendable {
        var jpeg: Data?
        var elapsedMs: Int
    }

    @MainActor
    static func captureKeyWindowJPEG(
        maxBytes: Int = KenosBugReportDraft.maxScreenshotBytes,
        webViewFallback: WKWebView? = nil
    ) async -> CaptureResult {
        let t0 = CFAbsoluteTimeGetCurrent()
        var image = snapshotKeyWindow(afterScreenUpdates: false)
        // WKWebView can render blank with afterScreenUpdates:false — retry committed frame.
        if image == nil || isVisuallyBlankCapture(image) {
            if let retry = snapshotKeyWindow(afterScreenUpdates: true) {
                image = retry
            }
        }
        // WK-only fallback ONLY when the window hierarchy produced nothing usable.
        // Never replace a real (even dark) window shot — that drops dock/Shelf chrome.
        if image == nil || isVisuallyBlankCapture(image),
           let web = webViewFallback ?? KenosActiveWebRegistry.preferred,
           let webImage = await snapshotWebView(web)
        {
            image = webImage
        }
        guard let image else {
            return CaptureResult(jpeg: nil, elapsedMs: elapsedMs(since: t0))
        }
        // Compress off the main actor — large Retina frames hitch the prompt otherwise.
        let data = await Task.detached(priority: .userInitiated) {
            jpegUnderLimit(image, maxBytes: maxBytes)
        }.value
        return CaptureResult(jpeg: data, elapsedMs: elapsedMs(since: t0))
    }

    /// Sync helper for tests / callers that already hold a UIImage.
    @MainActor
    static func snapshotKeyWindow(afterScreenUpdates: Bool = false) -> UIImage? {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive })
            ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
        else { return nil }

        // Prefer the app key window; skip our elevated bug-prompt overlay window.
        let window = scene.windows.first(where: { $0.isKeyWindow && !($0 is KenosPassthroughWindow) })
            ?? scene.windows.first(where: { !($0 is KenosPassthroughWindow) })
        guard let window else { return nil }

        let format = UIGraphicsImageRendererFormat()
        // Faster + smaller than native 3×; still sharp enough for UI bugs.
        format.scale = min(window.screen.scale, maxPixelScale)
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds, format: format)
        // Default `false`: screenshot notification fires after the frame is committed.
        return renderer.image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: afterScreenUpdates)
        }
    }

    /// Last-resort surface snap when window hierarchy is blank (WKWebView quirk).
    @MainActor
    static func snapshotWebView(_ webView: WKWebView) async -> UIImage? {
        await withCheckedContinuation { (cont: CheckedContinuation<UIImage?, Never>) in
            webView.takeSnapshot(with: nil) { image, _ in
                cont.resume(returning: image)
            }
        }
    }

    /// True only for failed/blank captures (all-white, all-black, or zero-variance).
    /// Must NOT fire on normal Kenos ink UI — a 4×4 average of dark chrome looks "flat"
    /// under a loose threshold and would wrongly trigger WK-only fallback.
    static func isVisuallyBlankCapture(_ image: UIImage?) -> Bool {
        guard let image, let cg = image.cgImage else { return true }
        let w = cg.width
        let h = cg.height
        guard w > 8, h > 8 else { return true }
        let bytesPerPixel = 4
        let bytesPerRow = bytesPerPixel * 8
        var pixel = [UInt8](repeating: 0, count: bytesPerRow * 8)
        guard let ctx = CGContext(
            data: &pixel,
            width: 8,
            height: 8,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return false }
        ctx.interpolationQuality = .low
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 8, height: 8))

        var minL = 255
        var maxL = 0
        var sumR = 0
        var sumG = 0
        var sumB = 0
        for i in 0..<64 {
            let o = i * bytesPerPixel
            let r = Int(pixel[o])
            let g = Int(pixel[o + 1])
            let b = Int(pixel[o + 2])
            let l = (r + g + b) / 3
            minL = min(minL, l)
            maxL = max(maxL, l)
            sumR += r
            sumG += g
            sumB += b
        }
        // Any real UI (dock, text, cards) spreads luminance; keep a tight gate.
        if maxL - minL > 3 { return false }
        let avgR = sumR / 64
        let avgG = sumG / 64
        let avgB = sumB / 64
        // Failed WK/hierarchy snaps tend to be pure white or pure black — not Kenos ink.
        let nearWhite = avgR > 250 && avgG > 250 && avgB > 250
        let nearBlack = avgR < 2 && avgG < 2 && avgB < 2
        return nearWhite || nearBlack
    }

    /// Back-compat alias for tests.
    static func isVisuallyEmpty(_ image: UIImage?) -> Bool {
        isVisuallyBlankCapture(image)
    }

    static func jpegUnderLimit(_ image: UIImage, maxBytes: Int) -> Data? {
        var working = image
        for _ in 0..<4 {
            var quality: CGFloat = 0.72
            while quality >= 0.28 {
                if let data = working.jpegData(compressionQuality: quality), data.count <= maxBytes {
                    return data
                }
                quality -= 0.14
            }
            let nextSize = CGSize(width: working.size.width * 0.65, height: working.size.height * 0.65)
            guard nextSize.width >= 240, nextSize.height >= 240 else { break }
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            working = UIGraphicsImageRenderer(size: nextSize, format: format).image { _ in
                working.draw(in: CGRect(origin: .zero, size: nextSize))
            }
        }
        return working.jpegData(compressionQuality: 0.22)
    }

    private static func elapsedMs(since t0: CFAbsoluteTime) -> Int {
        Int(((CFAbsoluteTimeGetCurrent() - t0) * 1000.0).rounded())
    }
}

/// Page-context snapshot scraped from the active WKWebView (no tokens / no bodies).
struct KenosBugWebSnapshot: Equatable {
    var title: String = ""
    var heading: String = ""
    var path: String = ""
    var href: String = ""
    var userAgent: String = ""
    var online: Bool?
    var consoleSummary: String = ""
    var webSignedIn: Bool?
    var timedOut: Bool = false
}

enum KenosBugDiagnosticsFactory {
    /// JS scrape budget — prompt UX must not wait on a hung WebView.
    static let scrapeTimeoutNs: UInt64 = 200_000_000

    @MainActor
    static func make(
        model: KenosAppModel,
        webView: WKWebView?,
        screenshotBytes: Int = 0,
        captureSource: String = "manual",
        captureMs: Int = 0,
        webViewKind: String = "none",
        scrape: Bool = true
    ) async -> KenosBugDiagnostics {
        let tScrape = CFAbsoluteTimeGetCurrent()
        var snap = KenosBugWebSnapshot()
        var scrapeMs = 0
        if scrape {
            snap = await scrapeWeb(webView, timeoutNs: scrapeTimeoutNs)
            scrapeMs = Int(((CFAbsoluteTimeGetCurrent() - tScrape) * 1000.0).rounded())
        }
        var diagnostics = makeNative(
            model: model,
            webView: webView,
            snap: snap,
            screenshotBytes: screenshotBytes,
            captureSource: captureSource,
            captureMs: captureMs,
            scrapeMs: scrapeMs,
            webViewKind: webViewKind
        )
        if snap.timedOut {
            diagnostics.lastErrorClass = diagnostics.lastErrorClass.isEmpty
                ? "scrape_timeout"
                : diagnostics.lastErrorClass
            KenosLog.warning("web scrape timed out", category: .bugReport, metadata: [
                "scrapeMs": String(scrapeMs),
            ])
        }
        return diagnostics
    }

    /// Native-only draft for instant screenshot prompt (enrich via `apply` next).
    @MainActor
    static func makeNativeFast(
        model: KenosAppModel,
        webView: WKWebView?,
        screenshotBytes: Int,
        captureSource: String,
        captureMs: Int,
        webViewKind: String
    ) -> KenosBugDiagnostics {
        makeNative(
            model: model,
            webView: webView,
            snap: KenosBugWebSnapshot(),
            screenshotBytes: screenshotBytes,
            captureSource: captureSource,
            captureMs: captureMs,
            scrapeMs: 0,
            webViewKind: webViewKind
        )
    }

    @MainActor
    static func apply(
        _ snap: KenosBugWebSnapshot,
        scrapeMs: Int,
        to diagnostics: inout KenosBugDiagnostics,
        model: KenosAppModel,
        webView: WKWebView?
    ) {
        let route = resolveRoute(model: model, webView: webView, snap: snap)
        let hrefRaw = snap.href.isEmpty ? (webView?.url?.absoluteString ?? diagnostics.href) : snap.href
        let href = redactHref(hrefRaw)
        diagnostics.app = inferApp(model: model, route: route, href: href, liveURL: webView?.url)
        diagnostics.route = route
        diagnostics.pageTitle = snap.title
        diagnostics.heading = snap.heading
        diagnostics.href = href
        if let host = URL(string: href)?.host, !host.isEmpty {
            diagnostics.originHost = host
        } else if let liveHost = webView?.url?.host {
            diagnostics.originHost = liveHost
        }
        if !snap.userAgent.isEmpty {
            diagnostics.userAgent = snap.userAgent
        }
        diagnostics.online = snap.online
        diagnostics.consoleSummary = snap.consoleSummary
        diagnostics.scrapeMs = scrapeMs
        diagnostics.scrapeTimedOut = snap.timedOut
        diagnostics.webSignedIn = snap.webSignedIn
        if snap.timedOut, diagnostics.lastErrorClass.isEmpty {
            diagnostics.lastErrorClass = "scrape_timeout"
        }
    }

    @MainActor
    private static func makeNative(
        model: KenosAppModel,
        webView: WKWebView?,
        snap: KenosBugWebSnapshot,
        screenshotBytes: Int,
        captureSource: String,
        captureMs: Int,
        scrapeMs: Int,
        webViewKind: String
    ) -> KenosBugDiagnostics {
        let screen = UIScreen.main.bounds
        let scale = min(UIScreen.main.scale, KenosBugReportCapture.maxPixelScale)
        let device = KenosBugDeviceInfo.self
        let origin = KenosDailyBetaConfig.kenOsOrigin
        let route = resolveRoute(model: model, webView: webView, snap: snap)
        let hrefRaw = snap.href.isEmpty ? (webView?.url?.absoluteString ?? "") : snap.href
        let href = redactHref(hrefRaw)
        let app = inferApp(model: model, route: route, href: href, liveURL: webView?.url)
        let auth: String = (try? model.sessionStore.loadToken()) != nil ? "session_present" : "session_absent"
        let ua = snap.userAgent.isEmpty
            ? "KenosIOS/\(device.marketingVersion) (\(device.model); iOS \(device.systemVersion))"
            : snap.userAgent
        let originHost = URL(string: href)?.host
            ?? webView?.url?.host
            ?? KenosRuntimeHealth.host(from: origin)

        var lastError = model.runtimeHealthLastErrorClass
        if screenshotBytes == 0, captureSource == "screenshot" {
            lastError = lastError.isEmpty ? "capture_empty" : lastError
            KenosLog.error("screenshot capture produced empty JPEG", category: .bugReport)
        }

        return KenosBugDiagnostics(
            app: app,
            route: route,
            pageTitle: snap.title,
            heading: snap.heading,
            href: href,
            tab: model.shellMode == .kenos ? model.selectedTab.title : "",
            domainLabel: model.shellMode == .domain ? model.domainDisplayTitle : "",
            viewportWidth: Int(screen.width),
            viewportHeight: Int(screen.height),
            devicePixelRatio: Double(scale),
            userAgent: ua,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            shellMode: {
                switch model.shellMode {
                case .kenos: return "kenos"
                case .domain: return "domain"
                case .focus: return "focus"
                }
            }(),
            build: device.build,
            marketingVersion: device.marketingVersion,
            originHost: originHost,
            deviceModel: device.model,
            systemVersion: device.systemVersion,
            authState: auth,
            online: snap.online,
            focusState: focusState(model),
            lastErrorClass: lastError,
            screenshotBytes: screenshotBytes,
            consoleSummary: snap.consoleSummary,
            webViewKind: webViewKind,
            captureSource: captureSource,
            captureMs: captureMs,
            scrapeMs: scrapeMs,
            scrapeTimedOut: snap.timedOut,
            locale: device.localeIdentifier,
            webSignedIn: snap.webSignedIn,
            chromeContext: model.screenshotChromeContext()
        )
    }

    @MainActor
    private static func resolveRoute(
        model: KenosAppModel,
        webView: WKWebView?,
        snap: KenosBugWebSnapshot
    ) -> String {
        let fromSnap = pathOnly(snap.path)
        if !fromSnap.isEmpty { return fromSnap }
        // Prefer live WKWebView URL over Continuity bookkeeping — more accurate mid-navigation.
        if let url = webView?.url {
            let path = url.path.isEmpty ? "/" : url.path
            return path
        }
        if model.shellMode == .domain, let continuity = model.continuityURL {
            return continuity.path.isEmpty ? "/" : continuity.path
        }
        return model.dailyBetaPath(for: model.selectedTab)
    }

    private static func pathOnly(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        if let q = trimmed.firstIndex(of: "?") { return String(trimmed[..<q]) }
        if let h = trimmed.firstIndex(of: "#") { return String(trimmed[..<h]) }
        return trimmed
    }

    @MainActor
    static func scrapeWeb(
        _ webView: WKWebView?,
        timeoutNs: UInt64 = scrapeTimeoutNs
    ) async -> KenosBugWebSnapshot {
        guard let webView else { return KenosBugWebSnapshot() }
        let js = """
        (function(){
          function text(el){
            if (!el) return '';
            return String(el.innerText || el.textContent || '').replace(/\\s+/g,' ').trim().slice(0,120);
          }
          try {
            var h = document.querySelector('h1,[data-testid$="-title"],.page-title,.life-os-page-title');
            var errs = [];
            try {
              if (window.__KENOS_BUG_CONSOLE__ && Array.isArray(window.__KENOS_BUG_CONSOLE__)) {
                errs = window.__KENOS_BUG_CONSOLE__.slice(-8).map(function(x){ return String(x).slice(0,160); });
              }
            } catch (e) {}
            var signedIn = false;
            try {
              var raw = localStorage.getItem('life_os_auth');
              if (raw) {
                var data = JSON.parse(raw);
                var session = data && data.access_token ? data : (data && (data.currentSession || data.session)) || data;
                signedIn = !!(session && session.access_token);
              }
            } catch (e) {}
            return JSON.stringify({
              title: String(document.title || '').slice(0,120),
              heading: text(h),
              path: String(location.pathname || ''),
              href: String(location.origin || '') + String(location.pathname || ''),
              userAgent: String(navigator.userAgent || ''),
              online: !!navigator.onLine,
              consoleSummary: errs.join(' | ').slice(0,500),
              webSignedIn: signedIn
            });
          } catch (e) {
            return JSON.stringify({ title:'', heading:'', path:'', href:'', userAgent:'', online:null, consoleSummary:'', webSignedIn:null });
          }
        })();
        """
        // Race JS vs timeout without TaskGroup (Swift 6 region checker trips on WKWebView capture).
        return await withCheckedContinuation { (cont: CheckedContinuation<KenosBugWebSnapshot, Never>) in
            final class Once: @unchecked Sendable {
                private var done = false
                private let lock = NSLock()
                func finish(_ snap: KenosBugWebSnapshot, _ resume: (KenosBugWebSnapshot) -> Void) {
                    lock.lock()
                    defer { lock.unlock() }
                    guard !done else { return }
                    done = true
                    resume(snap)
                }
            }
            let once = Once()
            let timeout = DispatchWorkItem {
                once.finish(KenosBugWebSnapshot(timedOut: true)) { snap in
                    KenosLog.warning("web scrape timed out", category: .bugReport, metadata: [
                        "timeoutMs": String(timeoutNs / 1_000_000),
                    ])
                    cont.resume(returning: snap)
                }
            }
            DispatchQueue.main.asyncAfter(
                deadline: .now() + .nanoseconds(Int(timeoutNs)),
                execute: timeout
            )
            webView.evaluateJavaScript(js) { result, error in
                if let error {
                    KenosLog.warning("scrape JS error", category: .bugReport, metadata: [
                        "error": String(describing: error),
                    ])
                }
                let snap: KenosBugWebSnapshot = {
                    guard let raw = result as? String,
                          let data = raw.data(using: .utf8),
                          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                    else { return KenosBugWebSnapshot() }
                    return KenosBugWebSnapshot(
                        title: obj["title"] as? String ?? "",
                        heading: obj["heading"] as? String ?? "",
                        path: obj["path"] as? String ?? "",
                        href: obj["href"] as? String ?? "",
                        userAgent: obj["userAgent"] as? String ?? "",
                        online: obj["online"] as? Bool,
                        consoleSummary: obj["consoleSummary"] as? String ?? "",
                        webSignedIn: obj["webSignedIn"] as? Bool,
                        timedOut: false
                    )
                }()
                once.finish(snap) { value in
                    timeout.cancel()
                    cont.resume(returning: value)
                }
            }
        }
    }

    @MainActor
    private static func focusState(_ model: KenosAppModel) -> String {
        if model.focusStore.showCompletedSummary { return "summary" }
        if model.focusStore.isPaused { return "paused" }
        if model.hideGlobalNavForFocus { return "active" }
        return "off"
    }

    static func deviceModelIdentifier() -> String {
        KenosBugDeviceInfo.model
    }

    /// Drop query/fragment/userinfo — Continuity and auth redirects often embed secrets there.
    static func redactHref(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        guard var comps = URLComponents(string: trimmed) else {
            if let q = trimmed.firstIndex(of: "?") { return String(String(trimmed[..<q]).prefix(300)) }
            if let h = trimmed.firstIndex(of: "#") { return String(String(trimmed[..<h]).prefix(300)) }
            return String(trimmed.prefix(300))
        }
        comps.query = nil
        comps.fragment = nil
        comps.user = nil
        comps.password = nil
        return String((comps.string ?? trimmed).prefix(300))
    }

    /// Allowed by `public.bug_logs_app_check` (+ RLS membership / portal fallback for `kenos`).
    static let bugLogAllowedApps: Set<String> = [
        "portal", "planner", "fitness", "music", "finance", "home", "kenos",
    ]

    /// Map shell-adjacent / experimental domain ids onto a writable bug_logs.app value.
    static func normalizeBugLogApp(_ raw: String) -> String {
        let id = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if bugLogAllowedApps.contains(id) { return id }
        switch id {
        case "aios", "knowledge", "health", "paper", "library", "work":
            return "kenos"
        default:
            return "kenos"
        }
    }

    @MainActor
    static func inferApp(
        model: KenosAppModel,
        route: String,
        href: String = "",
        liveURL: URL? = nil
    ) -> String {
        // Live WebView URL beats Continuity — user may have navigated in-page.
        for candidate in [liveURL, URL(string: href), model.shellMode == .domain ? model.continuityURL : nil].compactMap({ $0 }) {
            if let id = appID(from: candidate) { return normalizeBugLogApp(id) }
        }
        if model.shellMode == .domain,
           let id = KenosDomainRegistry.canonicalize(model.domainSpaceId)
        {
            if let appId = KenosDomainRegistry.definition(for: id)?.appId, !appId.isEmpty {
                return normalizeBugLogApp(appId)
            }
            return normalizeBugLogApp(id)
        }
        let hay = (href + " " + route).lowercased()
        if hay.contains(":5188") || hay.contains("planner") { return "planner" }
        if hay.contains(":5190") || hay.contains("fitness") { return "fitness" }
        if hay.contains(":5180") || hay.contains("finance") { return "finance" }
        if hay.contains(":5189") || hay.contains("music") { return "music" }
        if hay.contains(":5196") || hay.contains("home") { return "home" }
        return "kenos"
    }

    private static func appID(from url: URL) -> String? {
        let host = (url.host ?? "").lowercased()
        let port = url.port
        if host.contains("planner") || port == 5188 { return "planner" }
        if host.contains("fitness") || port == 5190 { return "fitness" }
        if host.contains("finance") || port == 5180 { return "finance" }
        if host.contains("music") || port == 5189 { return "music" }
        if host.contains("home") || port == 5196 { return "home" }
        // Experimental Continuity surfaces — normalizeBugLogApp maps these to `kenos`.
        if host.contains("knowledge") || port == 5879 { return "knowledge" }
        if host.contains("health") || port == 5192 { return "health" }
        if host.contains("portal") { return "portal" }
        if host.contains("aios") || host.contains("kenos") { return "kenos" }
        return nil
    }
}

enum KenosBugReportPrefill {
    /// Short editable title from live context.
    static func title(from d: KenosBugDiagnostics) -> String {
        let label: String = {
            if !d.heading.isEmpty { return d.heading }
            if !d.pageTitle.isEmpty {
                // Drop trailing brand suffixes like " · Korben" (legacy " · Kenos" titles too)
                let cleaned = d.pageTitle
                    .replacingOccurrences(of: " | Korben", with: "")
                    .replacingOccurrences(of: " · Korben", with: "")
                    .replacingOccurrences(of: " | Kenos", with: "")
                    .replacingOccurrences(of: " · Kenos", with: "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !cleaned.isEmpty { return cleaned }
            }
            if !d.domainLabel.isEmpty { return d.domainLabel }
            if !d.tab.isEmpty { return d.tab }
            let route = d.route.split(separator: "?").first.map(String.init) ?? d.route
            return route.isEmpty ? "Screen" : route
        }()
        let clipped = String(label.prefix(72))
        return "[\(d.app)] \(clipped)"
    }

    /// User-facing notes start empty — context lives in the disclosure / submit payload.
    static func userNotesPlaceholder(from d: KenosBugDiagnostics) -> String {
        if !d.heading.isEmpty { return "What looked wrong on \(d.heading)?" }
        if !d.tab.isEmpty { return "What looked wrong on \(d.tab)?" }
        if !d.domainLabel.isEmpty { return "What looked wrong in \(d.domainLabel)?" }
        return "What looked wrong?"
    }

    static func contextBlock(from d: KenosBugDiagnostics) -> String {
        var lines: [String] = [
            "## Context (auto)",
            "- App: \(d.app)",
            "- Route: \(d.route)",
        ]
        if !d.pageTitle.isEmpty { lines.append("- Page: \(d.pageTitle)") }
        if !d.heading.isEmpty { lines.append("- Heading: \(d.heading)") }
        if !d.tab.isEmpty { lines.append("- Tab: \(d.tab)") }
        if !d.domainLabel.isEmpty { lines.append("- Domain: \(d.domainLabel)") }
        if !d.chromeContext.isEmpty { lines.append("- Chrome: \(d.chromeContext)") }
        lines.append(contentsOf: [
            "- Shell: \(d.shellMode)",
            "- Focus: \(d.focusState)",
            "- WebView: \(d.webViewKind)",
            "- Source: \(d.captureSource)",
            "- Build: \(d.marketingVersion) (\(d.build))",
            "- Device: \(d.deviceModel) · iOS \(d.systemVersion)",
            "- Locale: \(d.locale)",
            "- Viewport: \(d.viewportWidth)×\(d.viewportHeight)@\(formatDPR(d.devicePixelRatio))",
            "- Origin: \(d.originHost)",
            "- Auth: \(d.authState)",
        ])
        if let webSignedIn = d.webSignedIn {
            lines.append("- Web signed-in: \(webSignedIn ? "yes" : "no")")
        }
        if let online = d.online {
            lines.append("- Online: \(online ? "yes" : "no")")
        }
        if !d.href.isEmpty { lines.append("- URL: \(d.href)") }
        if d.screenshotBytes > 0 {
            lines.append("- Screenshot: \(max(1, d.screenshotBytes / 1024))KB")
        }
        lines.append("- Capture: \(d.captureMs)ms · scrape: \(d.scrapeMs)ms\(d.scrapeTimedOut ? " (timeout)" : "")")
        if !d.lastErrorClass.isEmpty {
            lines.append("- Last error class: \(d.lastErrorClass)")
        }
        if !d.consoleSummary.isEmpty {
            lines.append("- Console: \(d.consoleSummary)")
        }
        let crumbs = KenosLog.breadcrumbSummary(limit: 20)
        if !crumbs.isEmpty {
            lines.append("- Native breadcrumbs:")
            for line in crumbs.split(separator: "\n") {
                lines.append("  - \(line)")
            }
        }
        lines.append("- Log session: \(KenosLog.shared.sessionId)")
        lines.append("- Captured: \(d.timestamp)")
        return lines.joined(separator: "\n")
    }

    /// Compose submit notes: user text + auto context (keeps form clean).
    static func composeNotes(userNotes: String, diagnostics: KenosBugDiagnostics) -> String {
        let user = userNotes.trimmingCharacters(in: .whitespacesAndNewlines)
        let context = contextBlock(from: diagnostics)
        if user.isEmpty { return context }
        return "## What happened\n\n\(user)\n\n\(context)"
    }

    /// Compact one-liner for the floating prompt subtitle.
    static func promptSubtitle(from d: KenosBugDiagnostics) -> String {
        var parts: [String] = [d.app]
        if d.chromeContext.contains("shelf") {
            parts.append("Shelf")
        } else if d.chromeContext.contains("capture") {
            parts.append("Capture")
        } else if d.chromeContext.contains("spaceSwitcher") {
            parts.append("Spaces")
        } else if d.chromeContext.contains("domainMore") {
            parts.append("More")
        } else if d.chromeContext.contains("settings") {
            parts.append("Settings")
        } else if d.chromeContext.contains("focus") {
            parts.append("Focus")
        } else if !d.domainLabel.isEmpty {
            parts.append(d.domainLabel)
        } else if !d.tab.isEmpty {
            parts.append(d.tab)
        }
        let route = d.route.split(separator: "?").first.map(String.init) ?? d.route
        if !route.isEmpty, !d.chromeContext.contains("settings") { parts.append(route) }
        return parts.joined(separator: " · ")
    }

    private static func formatDPR(_ value: Double) -> String {
        if value.rounded() == value { return String(Int(value)) }
        return String(format: "%.1f", value)
    }

    static func severity(from d: KenosBugDiagnostics) -> KenosBugReportDraft.Severity {
        if d.online == false { return .high }
        if consoleLooksLikeError(d.consoleSummary) { return .high }
        if !d.lastErrorClass.isEmpty, d.lastErrorClass != "scrape_timeout", d.lastErrorClass != "capture_empty" {
            return .medium
        }
        return .medium
    }

    /// Only real error signals bump severity — not every warn/log line.
    static func consoleLooksLikeError(_ summary: String) -> Bool {
        let lower = summary.lowercased()
        guard !lower.isEmpty else { return false }
        for needle in ["error:", "typeerror", "referenceerror", "unhandled", "onerror", "uncaught"] {
            if lower.contains(needle) { return true }
        }
        return false
    }
}

struct KenosWebAuthSession: Equatable {
    var accessToken: String
    var userId: String
}

enum KenosBugReportWebAuth {
    @MainActor
    static func load(from webView: WKWebView?) async -> KenosWebAuthSession? {
        guard let webView else { return nil }
        let js = """
        (function(){
          function pick(raw) {
            if (!raw) return null;
            try {
              var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
              var session = data && data.access_token ? data : (data && (data.currentSession || data.session)) || data;
              if (!session || !session.access_token) return null;
              var user = session.user || {};
              var id = user.id || session.user_id || '';
              if (!id) return null;
              return { accessToken: String(session.access_token), userId: String(id) };
            } catch (e) { return null; }
          }
          try {
            var keys = ['life_os_auth'];
            for (var i = 0; i < localStorage.length; i++) {
              var k = localStorage.key(i);
              if (k && /auth-token|supabase|life_os/i.test(k)) keys.push(k);
            }
            for (var j = 0; j < keys.length; j++) {
              var hit = pick(localStorage.getItem(keys[j]));
              if (hit) return JSON.stringify({ ok: true, session: hit });
            }
            return JSON.stringify({ ok: false, reason: 'no_session' });
          } catch (e) {
            return JSON.stringify({ ok: false, reason: String(e && e.message || e) });
          }
        })();
        """
        let raw: String? = await withCheckedContinuation { cont in
            webView.evaluateJavaScript(js) { result, _ in
                cont.resume(returning: result as? String)
            }
        }
        guard let raw,
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              obj["ok"] as? Bool == true,
              let session = obj["session"] as? [String: Any],
              let token = session["accessToken"] as? String,
              let userId = session["userId"] as? String,
              !token.isEmpty,
              !userId.isEmpty
        else { return nil }
        return KenosWebAuthSession(accessToken: token, userId: userId)
    }
}

enum KenosBugReportConfig {
    static var supabaseURL: URL? { KenosSupabaseConfig.url }
    static var supabaseAnonKey: String { KenosSupabaseConfig.anonKey }
}

enum KenosBugReportSubmitResult: Equatable {
    case remote(bugId: String)
    case local(directoryURL: URL)
}

enum KenosBugReportSubmitter {
    enum SubmitError: LocalizedError {
        case missingTitle
        case screenshotTooLarge
        case remoteFailed(String)

        var errorDescription: String? {
            switch self {
            case .missingTitle: return "Title is required."
            case .screenshotTooLarge: return "Screenshot must not exceed 6MB."
            case .remoteFailed(let message): return message
            }
        }
    }

    static func submit(
        draft: KenosBugReportDraft,
        auth: KenosWebAuthSession?,
        preferRemote: Bool = true,
        attachLogs: Bool = true
    ) async throws -> KenosBugReportSubmitResult {
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw SubmitError.missingTitle }
        if let shot = draft.screenshotJPEG, shot.count > KenosBugReportDraft.maxScreenshotBytes {
            throw SubmitError.screenshotTooLarge
        }

        if preferRemote, let auth {
            do {
                let bugId = try await submitRemote(
                    draft: draft,
                    title: title,
                    auth: auth,
                    attachLogs: attachLogs
                )
                return .remote(bugId: bugId)
            } catch {
                // Fall through to local package so dogfood never loses the report.
            }
        }
        let dir = try saveLocalPackage(draft: draft, title: title, attachLogs: attachLogs)
        return .local(directoryURL: dir)
    }

    private static func submitRemote(
        draft: KenosBugReportDraft,
        title: String,
        auth: KenosWebAuthSession,
        attachLogs: Bool = true
    ) async throws -> String {
        guard let base = KenosBugReportConfig.supabaseURL else {
            throw SubmitError.remoteFailed("Supabase URL missing.")
        }
        let bugId = UUID().uuidString.lowercased()
        var screenshotPath: String?

        if let jpeg = draft.screenshotJPEG {
            screenshotPath = "\(auth.userId)/bugs/\(bugId).jpg"
            try await uploadScreenshot(
                base: base,
                path: screenshotPath!,
                jpeg: jpeg,
                accessToken: auth.accessToken
            )
        }

        do {
            try await insertBugLog(
                base: base,
                bugId: bugId,
                userId: auth.userId,
                title: title,
                draft: draft,
                screenshotPath: screenshotPath,
                accessToken: auth.accessToken
            )
        } catch {
            if let screenshotPath {
                try? await deleteScreenshot(base: base, path: screenshotPath, accessToken: auth.accessToken)
            }
            throw error
        }

        // Attach recent native breadcrumbs/events to the same bug row (best-effort).
        if attachLogs {
            let syncResult = await KenosLogCloudSync.shared.uploadPending(
                reason: "bugReport",
                bugId: bugId,
                auth: auth
            )
            KenosLog.info("bug report log attach", category: .bugReport, metadata: [
                "bugId": String(bugId.prefix(8)),
                "result": syncResult.summary,
            ])
        } else {
            KenosLog.info("bug report log attach skipped", category: .bugReport, metadata: [
                "bugId": String(bugId.prefix(8)),
            ])
        }
        return bugId
    }

    private static func storageObjectURL(base: URL, path: String) -> URL? {
        let encoded = path
            .split(separator: "/")
            .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        return URL(string: "\(base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/storage/v1/object/bug-attachments/\(encoded)")
    }

    private static func uploadScreenshot(
        base: URL,
        path: String,
        jpeg: Data,
        accessToken: String
    ) async throws {
        guard let url = storageObjectURL(base: base, path: path) else {
            throw SubmitError.remoteFailed("Invalid screenshot path.")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue(KenosSupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        req.setValue("3600", forHTTPHeaderField: "cache-control")
        req.setValue("true", forHTTPHeaderField: "x-upsert")
        req.httpBody = jpeg
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw SubmitError.remoteFailed("Screenshot upload failed (\(code)).")
        }
    }

    private static func deleteScreenshot(base: URL, path: String, accessToken: String) async throws {
        guard let url = storageObjectURL(base: base, path: path) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue(KenosSupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        _ = try await URLSession.shared.data(for: req)
    }

    private static func insertBugLog(
        base: URL,
        bugId: String,
        userId: String,
        title: String,
        draft: KenosBugReportDraft,
        screenshotPath: String?,
        accessToken: String
    ) async throws {
        guard let url = KenosSupabaseConfig.restURL("bug_logs") else {
            throw SubmitError.remoteFailed("Invalid Supabase URL.")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue(KenosSupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")

        let d = draft.diagnostics
        var body: [String: Any] = [
            "id": bugId,
            "user_id": userId,
            "app": d.app,
            "route": d.route,
            "title": title,
            "notes": draft.notes.trimmingCharacters(in: .whitespacesAndNewlines),
            "severity": draft.severity.rawValue,
            "status": "open",
            "user_agent": d.userAgent,
            "viewport_width": d.viewportWidth,
            "viewport_height": d.viewportHeight,
            "device_pixel_ratio": d.devicePixelRatio,
            "console_summary": d.consoleSummary,
            "error_message": d.lastErrorClass,
            "error_stack": "",
            "metadata": metadataDictionary(from: d),
        ]
        if let screenshotPath {
            body["screenshot_path"] = screenshotPath
        } else {
            body["screenshot_path"] = NSNull()
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw SubmitError.remoteFailed("Bug log insert failed (\(code)). Sign in on the Korben web shell, then retry.")
        }
    }

    private static func metadataDictionary(from d: KenosBugDiagnostics) -> [String: Any] {
        var meta: [String: Any] = [
            "shellMode": d.shellMode,
            "build": d.build,
            "marketingVersion": d.marketingVersion,
            "originHost": d.originHost,
            "pageTitle": d.pageTitle,
            "heading": d.heading,
            "tab": d.tab,
            "domainLabel": d.domainLabel,
            "deviceModel": d.deviceModel,
            "systemVersion": d.systemVersion,
            "authState": d.authState,
            "focusState": d.focusState,
            "href": d.href,
            "screenshotBytes": d.screenshotBytes,
            "webViewKind": d.webViewKind,
            "captureSource": d.captureSource,
            "captureMs": d.captureMs,
            "scrapeMs": d.scrapeMs,
            "scrapeTimedOut": d.scrapeTimedOut,
            "locale": d.locale,
            "chromeContext": d.chromeContext,
            "source": "kenos-ios-native",
            "logSessionId": KenosLog.shared.sessionId,
            "nativeBreadcrumbs": KenosLog.breadcrumbSummary(limit: 16),
        ]
        if let online = d.online { meta["online"] = online }
        if let webSignedIn = d.webSignedIn { meta["webSignedIn"] = webSignedIn }
        return meta
    }

    static func saveLocalPackage(
        draft: KenosBugReportDraft,
        title: String,
        attachLogs: Bool = true
    ) throws -> URL {
        let fm = FileManager.default
        let root = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("BugReports", isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        let stamp = ISO8601DateFormatter().string(from: draft.capturedAt)
            .replacingOccurrences(of: ":", with: "-")
        let dir = root.appendingPathComponent("\(stamp)-\(draft.id.uuidString.prefix(8))", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)

        if let jpeg = draft.screenshotJPEG {
            try jpeg.write(to: dir.appendingPathComponent("screenshot.jpg"), options: .atomic)
        }

        let d = draft.diagnostics
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let diagData = try encoder.encode(d)
        let diagObj = try JSONSerialization.jsonObject(with: diagData)
        var payload: [String: Any] = [
            "id": draft.id.uuidString,
            "title": title,
            "notes": draft.notes,
            "severity": draft.severity.rawValue,
            "diagnostics": diagObj,
            "source": "kenos-ios-native-local",
            "attachLogs": attachLogs,
        ]
        if attachLogs {
            payload["nativeBreadcrumbs"] = KenosLog.breadcrumbSummary(limit: 48)
            payload["logSessionId"] = KenosLog.shared.sessionId
        }
        let json = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
        try json.write(to: dir.appendingPathComponent("report.json"), options: .atomic)

        let md = """
        # Bug: \(title)

        - Severity: \(draft.severity.rawValue)
        - App: \(d.app)
        - Route: \(d.route)
        - Page: \(d.pageTitle)
        - Shell: \(d.shellMode)
        - Build: \(d.marketingVersion) (\(d.build))
        - Device: \(d.deviceModel) · iOS \(d.systemVersion)
        - Origin: \(d.originHost)
        - Captured: \(d.timestamp)
        - Logs attached: \(attachLogs ? "yes" : "no")

        ## Notes

        \(draft.notes.isEmpty ? "_none_" : draft.notes)
        """
        try Data(md.utf8).write(to: dir.appendingPathComponent("report.md"), options: .atomic)
        return dir
    }
}

/// Quiet post-screenshot offer — Liquid Glass card above the dock.
/// Layout: thumbnail + copy + dismiss, then one full-width primary CTA (avoids cramped dual buttons).
struct KenosScreenshotBugPrompt: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var dragOffset: CGFloat = 0
    @State private var hapticToken = 0

    private var diagnostics: KenosBugDiagnostics? { model.bugReportDraft?.diagnostics }
    private var thumb: UIImage? {
        guard let data = model.bugReportDraft?.screenshotJPEG else { return nil }
        return UIImage(data: data)
    }

    private var subtitle: String {
        diagnostics.map(KenosBugReportPrefill.promptSubtitle(from:))
            ?? "Report a problem with this screenshot"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: KenosSpacing.sm) {
            // Drag only on the header — a parent DragGesture steals Button taps.
            HStack(alignment: .center, spacing: KenosSpacing.md) {
                thumbnail

                VStack(alignment: .leading, spacing: 2) {
                    Text("Looks off?")
                        .font(KenosTypography.headline)
                    Text(subtitle)
                        .font(KenosTypography.caption)
                        .foregroundStyle(KenosColorToken.secondary)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .gesture(dismissDrag)

                Button {
                    model.dismissScreenshotBugPrompt()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(KenosColorToken.secondary)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.primary.opacity(0.08)))
                        .contentShape(Circle())
                }
                .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
                .accessibilityLabel("Not now")
                .accessibilityIdentifier("kenos.bug.prompt.dismiss")
            }

            Button {
                model.confirmScreenshotBugReport()
            } label: {
                Text("Report a Bug")
                    .font(KenosTypography.headline)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.regular)
            .tint(model.dockSelectionAccent)
            .accessibilityIdentifier("kenos.bug.prompt.report")
        }
        .padding(KenosSpacing.md)
        // Non-interactive glass: interactive Liquid Glass competes with Button hit-testing.
        .kenosLiquidGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous), interactive: false)
        .shadow(color: .black.opacity(0.28), radius: 18, y: 8)
        .background {
            KenosBugPromptHitAnchor()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(false)
        }
        .padding(.horizontal, KenosGlass.dockHorizontalInset)
        .offset(y: dragOffset)
        .scaleEffect(appeared || reduceMotion ? 1 : 0.96)
        .opacity(appeared || reduceMotion ? 1 : max(0, 1 - Double(dragOffset) / 120))
        .onAppear {
            withAnimation(KenosMotion.chrome(reduceMotion: reduceMotion)) {
                appeared = true
            }
            hapticToken += 1
        }
        .onDisappear {
            KenosPassthroughWindow.interactiveFrameInWindow = .null
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("kenos.bug.prompt")
        .accessibilityHint("Swipe down to dismiss. Auto-hides in a few seconds.")
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.7), trigger: hapticToken)
    }

    @ViewBuilder
    private var thumbnail: some View {
        Group {
            if let thumb {
                Image(uiImage: thumb)
                    .resizable()
                    .scaledToFill()
            } else {
                Image(systemName: "ladybug.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(model.dockSelectionAccent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.primary.opacity(0.06))
            }
        }
        .frame(width: 40, height: 58)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Color.white.opacity(0.16), lineWidth: 0.5)
        }
        .accessibilityHidden(true)
    }

    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { value in
                dragOffset = max(0, value.translation.height)
            }
            .onEnded { value in
                if value.translation.height > 56 || value.predictedEndTranslation.height > 100 {
                    model.dismissScreenshotBugPrompt()
                } else {
                    withAnimation(KenosMotion.press(reduceMotion: reduceMotion)) {
                        dragOffset = 0
                    }
                }
            }
    }
}

struct KenosBugReportSheet: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var notes = ""
    @State private var severity: KenosBugReportDraft.Severity = .medium
    @State private var errorMsg = ""
    @State private var submitting = false
    @State private var successKind: SuccessKind?
    @State private var shareItems: [Any] = []
    @State private var showShare = false
    @State private var contextExpanded = false
    @State private var contextCopiedPulse = 0
    @State private var successPulse = 0
    @State private var detent: PresentationDetent = .large
    /// Default ON — dogfood needs log attach; Owner can opt out.
    @State private var attachLogs = true
    /// Last auto-generated title we pushed into the field — used to absorb enrich updates.
    @State private var lastAutoTitle = ""

    private enum SuccessKind: Equatable {
        case remote(String)
        case local
    }

    private var placeholder: String {
        guard let d = model.bugReportDraft?.diagnostics else { return "What looked wrong?" }
        return KenosBugReportPrefill.userNotesPlaceholder(from: d)
    }

    private var formDisabled: Bool { successKind != nil || submitting }

    var body: some View {
        NavigationStack {
            Form {
                if let successKind {
                    Section {
                        successBanner(successKind)
                            .listRowInsets(EdgeInsets(
                                top: KenosSpacing.sm,
                                leading: KenosSpacing.md,
                                bottom: KenosSpacing.sm,
                                trailing: KenosSpacing.md
                            ))
                            .listRowBackground(Color.clear)
                    }
                }

                Section {
                    screenshotBlock
                } header: {
                    Text("Screenshot")
                } footer: {
                    Text("Frozen at capture time — close and screenshot again if the screen changed.")
                }

                Section("Report") {
                    TextField("Title", text: $title, prompt: Text("Short summary"))
                        .font(KenosTypography.body)
                        .disabled(formDisabled)
                        .accessibilityIdentifier("kenos.bug.title")

                    TextField(
                        "What happened",
                        text: $notes,
                        prompt: Text(placeholder),
                        axis: .vertical
                    )
                    .lineLimit(3...8)
                    .font(KenosTypography.body)
                    .disabled(formDisabled)
                    .accessibilityIdentifier("kenos.bug.notes")

                    Picker("Severity", selection: $severity) {
                        ForEach(KenosBugReportDraft.Severity.allCases) { level in
                            Text(level.label).tag(level)
                        }
                    }
                    .pickerStyle(.segmented)
                    .disabled(formDisabled)
                    .accessibilityIdentifier("kenos.bug.severity")
                    .listRowInsets(EdgeInsets(
                        top: KenosSpacing.md,
                        leading: KenosSpacing.md,
                        bottom: KenosSpacing.md,
                        trailing: KenosSpacing.md
                    ))
                }

                if let d = model.bugReportDraft?.diagnostics {
                    Section {
                        Toggle("Attach diagnostics logs", isOn: $attachLogs)
                            .disabled(formDisabled)
                            .accessibilityIdentifier("kenos.bug.attachLogs")
                        DisclosureGroup(isExpanded: $contextExpanded) {
                            contextRows(d)
                            Button {
                                UIPasteboard.general.string = KenosBugReportPrefill.contextBlock(from: d)
                                contextCopiedPulse += 1
                                Task { @MainActor in
                                    try? await Task.sleep(nanoseconds: 1_400_000_000)
                                    if contextCopiedPulse > 0 { contextCopiedPulse = 0 }
                                }
                            } label: {
                                Label(
                                    contextCopiedPulse > 0 ? "Copied" : "Copy context",
                                    systemImage: contextCopiedPulse > 0 ? "checkmark" : "doc.on.doc"
                                )
                            }
                            .accessibilityIdentifier("kenos.bug.context.copy")
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Context included")
                                    .font(KenosTypography.headline)
                                Text(KenosBugReportPrefill.promptSubtitle(from: d))
                                    .font(KenosTypography.caption)
                                    .foregroundStyle(KenosColorToken.secondary)
                                    .lineLimit(1)
                            }
                        }
                        .accessibilityIdentifier("kenos.bug.context")
                    } footer: {
                        Text(
                            attachLogs
                                ? "Device, route, build, and recent native log breadcrumbs ride along. No tokens or message bodies."
                                : "Device, route, and build only. Log attach is off for this report."
                        )
                    }
                }

                if !errorMsg.isEmpty {
                    Section {
                        KenosStatusBanner(title: "Couldn’t submit", detail: errorMsg, tone: .danger)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                            .accessibilityIdentifier("kenos.bug.error")
                    }
                }
            }
            .navigationTitle("Report a Bug")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(successKind == nil ? "Cancel" : "Done") { dismiss() }
                        .accessibilityIdentifier("kenos.bug.close")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if submitting {
                            ProgressView()
                        } else {
                            Text("Submit")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(
                        formDisabled
                            || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                    .accessibilityIdentifier("kenos.bug.submit")
                }
            }
            .interactiveDismissDisabled(submitting)
            .sheet(isPresented: $showShare) {
                KenosShareSheet(items: shareItems)
            }
        }
        .presentationDetents([.large, .medium], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
        .sensoryFeedback(.success, trigger: successPulse)
        .onAppear { syncFieldsFromDraft(force: true) }
        .onChange(of: model.bugReportDraft?.id) { _, _ in syncFieldsFromDraft(force: true) }
        // Absorb background scrape enrich without clobbering user edits.
        .onChange(of: model.bugReportDraft?.diagnostics.scrapeMs) { _, _ in
            syncFieldsFromDraft(force: false)
        }
        .onChange(of: model.bugReportDraft?.title) { _, newTitle in
            guard let newTitle, !formDisabled else { return }
            if title == lastAutoTitle || title.isEmpty {
                title = newTitle
                lastAutoTitle = newTitle
            }
        }
    }

    @ViewBuilder
    private var screenshotBlock: some View {
        if let data = model.bugReportDraft?.screenshotJPEG,
           let uiImage = UIImage(data: data)
        {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 220)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.12), lineWidth: 0.5)
                }
                .listRowInsets(EdgeInsets(
                    top: KenosSpacing.sm,
                    leading: KenosSpacing.md,
                    bottom: KenosSpacing.sm,
                    trailing: KenosSpacing.md
                ))
                .accessibilityLabel("Attached screenshot")
                .accessibilityIdentifier("kenos.bug.screenshot")
        } else {
            Label("No screenshot attached", systemImage: "camera.viewfinder")
                .font(KenosTypography.body)
                .foregroundStyle(KenosColorToken.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("kenos.bug.screenshot.missing")
        }
    }

    @ViewBuilder
    private func contextRows(_ d: KenosBugDiagnostics) -> some View {
        LabeledContent("App", value: d.app)
        LabeledContent("Route", value: d.route)
        if !d.pageTitle.isEmpty { LabeledContent("Page", value: d.pageTitle) }
        if !d.heading.isEmpty { LabeledContent("Heading", value: d.heading) }
        if !d.tab.isEmpty { LabeledContent("Tab", value: d.tab) }
        if !d.domainLabel.isEmpty { LabeledContent("Domain", value: d.domainLabel) }
        LabeledContent("Shell", value: d.shellMode)
        LabeledContent("Focus", value: d.focusState)
        LabeledContent("WebView", value: d.webViewKind)
        LabeledContent("Source", value: d.captureSource)
        LabeledContent("Build", value: "\(d.marketingVersion) (\(d.build))")
        LabeledContent("Device", value: "\(d.deviceModel) · iOS \(d.systemVersion)")
        LabeledContent("Locale", value: d.locale)
        LabeledContent("Viewport", value: "\(d.viewportWidth)×\(d.viewportHeight)")
        LabeledContent("Origin", value: d.originHost)
        LabeledContent("Auth", value: d.authState)
        if let webSignedIn = d.webSignedIn {
            LabeledContent("Web signed-in", value: webSignedIn ? "yes" : "no")
        }
        if let online = d.online {
            LabeledContent("Online", value: online ? "yes" : "no")
        }
        if d.screenshotBytes > 0 {
            LabeledContent("Screenshot", value: "\(max(1, d.screenshotBytes / 1024))KB")
        }
        LabeledContent(
            "Timing",
            value: "\(d.captureMs)ms / \(d.scrapeMs)ms\(d.scrapeTimedOut ? " timeout" : "")"
        )
        if !d.lastErrorClass.isEmpty {
            LabeledContent("Error class", value: d.lastErrorClass)
        }
        if !d.consoleSummary.isEmpty {
            LabeledContent("Console", value: d.consoleSummary)
        }
    }

    @ViewBuilder
    private func successBanner(_ kind: SuccessKind) -> some View {
        switch kind {
        case .remote(let bugId):
            KenosStatusBanner(
                title: "Bug submitted",
                detail: "Logged as \(bugId.prefix(8))… Thank you.",
                tone: .success
            )
            .accessibilityIdentifier("kenos.bug.success")
        case .local:
            VStack(alignment: .leading, spacing: KenosSpacing.sm) {
                KenosStatusBanner(
                    title: "Saved on device",
                    detail: "Couldn’t reach bug_logs — package is ready to share.",
                    tone: .warning
                )
                Button {
                    showShare = true
                } label: {
                    Label("Share package", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .accessibilityIdentifier("kenos.bug.success")
        }
    }

    private func syncFieldsFromDraft(force: Bool) {
        guard let draft = model.bugReportDraft else { return }
        if force {
            title = draft.title
            notes = draft.notes
            severity = draft.severity
            lastAutoTitle = draft.title
            return
        }
        // Enrich path: refresh title only while the field still mirrors the last auto value.
        if title == lastAutoTitle || title.isEmpty {
            title = draft.title
            lastAutoTitle = draft.title
        }
    }

    @MainActor
    private func submit() async {
        errorMsg = ""
        submitting = true
        defer { submitting = false }
        guard var draft = model.bugReportDraft else {
            errorMsg = "Nothing to submit."
            return
        }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            errorMsg = "Title is required."
            return
        }
        draft.title = trimmedTitle
        draft.notes = KenosBugReportPrefill.composeNotes(userNotes: notes, diagnostics: draft.diagnostics)
        draft.severity = severity
        model.bugReportDraft = draft

        let web = KenosActiveWebRegistry.preferred(for: model)
        let auth = await KenosBugReportWebAuth.load(from: web)
        do {
            let result = try await KenosBugReportSubmitter.submit(
                draft: draft,
                auth: auth,
                attachLogs: attachLogs
            )
            switch result {
            case .remote(let bugId):
                successKind = .remote(bugId)
                successPulse += 1
                try? await Task.sleep(nanoseconds: 1_100_000_000)
                dismiss()
            case .local(let dir):
                successKind = .local
                successPulse += 1
                var items: [Any] = [dir]
                let shot = dir.appendingPathComponent("screenshot.jpg")
                if FileManager.default.fileExists(atPath: shot.path) {
                    items.insert(shot, at: 0)
                }
                shareItems = items
            }
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}

private struct KenosShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#endif
