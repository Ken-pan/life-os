import SwiftUI
import WebKit
import KenosClient
import KenosDesign

#if os(iOS)
extension Notification.Name {
    /// Posted when shell WKWebView wants domain Continuity in-app (not Safari).
    static let kenosOpenDomainContinuity = Notification.Name("kenosOpenDomainContinuity")
    /// Posted when WKWebView navigates to `kenos://…` (including Domain stayInApp).
    static let kenosHandleDeepLink = Notification.Name("kenosHandleDeepLink")
    /// Web scroll direction → Live Accessory compact/expand (Music minimize pattern).
    static let kenosLiveAccessoryMinimize = Notification.Name("kenosLiveAccessoryMinimize")
    // kenosWebAuthDidClear / kenosSharedWebAuthDidChange → KenosSharedWebAuth.swift (shared)
}

/// Native chrome the web canvas scrolls under (iOS 26 Liquid Glass).
enum KenosWebChrome: String {
    /// Kenos Mode — system TabView; page title+actions scroll in web content.
    case kenosTabs
    /// Ask conversation — Global Dock hidden; keep status top pad, minimal bottom
    /// (Composer owns keyboard / home-indicator inset).
    case kenosConversation
    /// Domain Mode — custom Domain Dock + title chip float over content.
    case domainDock
    /// Focus / Summary — no floating native chrome (immersive).
    case none

    /// Status-bar clearance — same for Kenos Mode + Domain (Music header scrolls in-page).
    var topPadPx: Int {
        switch self {
        case .kenosTabs, .kenosConversation, .domainDock: return 54
        case .none: return 0
        }
    }

    /// Base dock clearance above home indicator (Live Accessory is added separately).
    /// SSOT: `KenosGlass.dockScrollEndPadPx` — content may scroll under glass, but
    /// scroll-end padding keeps the last item fully above the dock at rest.
    var bottomPadPx: Int {
        switch self {
        case .kenosTabs, .domainDock: return KenosGlass.dockScrollEndPadPx
        /// Composer owns home-indicator inset; keep a small scroll-end cushion only.
        case .kenosConversation: return 8
        case .none: return 24
        }
    }

    /// Expanded Live Accessory strip height (matches KenosLiveAccessoryBar layout).
    static let liveAccessoryExpandedPadPx = 80
    /// Minimized Music-style chip height.
    static let liveAccessoryMinimizedPadPx = 52

    /// Dock + optional Live Accessory. Immersive (`.none`) never adds accessory pad.
    static func resolvedBottomPadPx(chrome: KenosWebChrome, accessoryExtraPx: Int) -> Int {
        let base = chrome.bottomPadPx
        guard chrome != .none, accessoryExtraPx > 0 else { return base }
        return base + accessoryExtraPx
    }
}

/// Shared WK runtime — ink + reachability cache so Space switches avoid white letterbox.
enum KenosWebRuntime {
    static let ink = UIColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1)
    /// Load-cover / under-page canvas — tracks `KenosChromeAppearance` (not stuck on ink for light Domains).
    @MainActor private(set) static var canvasAppearance: KenosChromeAppearance = .dark
    /// Tags must match Coordinator load/freeze overlays.
    private static let loadCoverTag = 0x4B4C4452 // KLDR
    private static let freezeOverlayTag = 0x4B46525A // KFRZ

    @MainActor
    static var canvasUIColor: UIColor { canvasAppearance.uiColor }

    /// Apply content polarity to warm WK surfaces before / during first paint.
    @MainActor
    static func setCanvasAppearance(_ next: KenosChromeAppearance) {
        canvasAppearance = next
        let color = next.uiColor
        for webView in [KenosActiveWebRegistry.domainWebView, KenosActiveWebRegistry.shellWebView].compactMap({ $0 }) {
            webView.backgroundColor = color
            webView.scrollView.backgroundColor = color
            if #available(iOS 15.0, *) {
                webView.underPageBackgroundColor = color
            }
            webView.viewWithTag(loadCoverTag)?.backgroundColor = color
            webView.viewWithTag(freezeOverlayTag)?.backgroundColor = color
        }
    }
    /// Last successful Daily Beta health probe — skip ProgressView on tab remount.
    @MainActor static var dailyBetaReachable = false
    /// Domain Continuity origin keys (`host:port`) that recently answered a probe.
    @MainActor static var domainReachableKeys: Set<String> = []
    /// Hidden WKWebView kept briefly so WebContent process is already warm at first paint.
    @MainActor private static var warmupWebView: WKWebView?
    @MainActor private static var didWarmup = false
    /// Seed used `.default()` data store (aligned with real Kenos surfaces).
    @MainActor private static var warmupUsedDefaultStore = false

    @MainActor
    static func originKey(for url: URL) -> String {
        let host = url.host ?? ""
        let port = url.port ?? ((url.scheme?.lowercased() == "https") ? 443 : 80)
        return "\(host):\(port)"
    }

    /// Clear caches after origin change / Owner Retry — forces honest re-probe.
    @MainActor
    static func invalidateReachability() {
        dailyBetaReachable = false
        domainReachableKeys.removeAll()
    }

    /// Spin WebContent early (launch) so the first Continuity surface skips cold process spawn.
    /// Safe to call multiple times — no-ops after the first successful warm.
    /// Uses the same `.default()` data store as real surfaces (process affinity on modern iOS).
    @MainActor
    static func warmWebContentProcessIfNeeded() {
        guard !didWarmup else { return }
        didWarmup = true
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        warmupUsedDefaultStore = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        webView.isOpaque = true
        webView.backgroundColor = ink
        webView.scrollView.backgroundColor = ink
        webView.loadHTMLString(
            "<!doctype html><html><head><meta charset=utf-8></head><body style=\"background:#08090a\"></body></html>",
            baseURL: URL(string: "about:kenos-warmup")
        )
        warmupWebView = webView
        KenosLog.debug("wk process warmup started", category: .web, metadata: [
            "dataStore": "default",
        ])
        // Drop the seed view once real surfaces own the process (~4s after launch).
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            warmupWebView = nil
            KenosLog.debug("wk process warmup released", category: .web)
        }
    }

    /// Test seam — true after the first successful warm request.
    @MainActor
    static var didWarmWebContentProcess: Bool { didWarmup }

    /// Test seam — seed configuration used persistent default store (not nonPersistent).
    @MainActor
    static var warmupUsesDefaultDataStore: Bool { warmupUsedDefaultStore }

    /// After backgrounding, WKWebView can present a blank layer without terminate callbacks.
    @MainActor
    static func recoverAfterForeground() {
        for webView in [KenosActiveWebRegistry.shellWebView, KenosActiveWebRegistry.domainWebView].compactMap({ $0 }) {
            recoverIfBlank(webView)
        }
    }

    @MainActor
    private static func recoverIfBlank(_ webView: WKWebView) {
        guard !webView.isHidden, !webView.isLoading else { return }
        webView.evaluateJavaScript(
            "(function(){try{return !!(document&&document.documentElement&&document.body&&document.body.childNodes.length);}catch(e){return false;}})()"
        ) { result, error in
            let ok = error == nil && (result as? Bool) == true
            guard !ok else { return }
            Task { @MainActor in
                guard let url = webView.url else { return }
                KenosLog.warning("webview blank after foreground — reloading", category: .web, metadata: [
                    "host": url.host ?? "",
                    "path": url.path,
                    "breadcrumb": "1",
                ])
                webView.load(URLRequest(url: KenosWebSurfaceView.shellURL(url)))
            }
        }
    }
}

/// Avoids WKUserContentController ↔ coordinator retain cycles.
final class KenosWeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(target: WKScriptMessageHandler) { self.target = target }
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// Native shell surface that loads Kenos Web Daily Beta (phone-reachable origin).
struct KenosWebSurfaceView: UIViewRepresentable {
    let url: URL
    var onTitle: ((String) -> Void)? = nil
    /// When true (Domain Mode / Continuity), keep all http navigations inside this WKWebView.
    var stayInApp: Bool = false
    /// Reports WKWebView back-stack — Domain Mode uses this for Back-first Shelf gesture.
    var onCanGoBackChange: ((Bool) -> Void)? = nil
    /// SPA / in-webview path changes (so Domain chrome can react to /focus).
    var onURLChange: ((URL) -> Void)? = nil
    /// Safari-style estimatedProgress (0...1) for the hairline loader.
    var onProgress: ((Double) -> Void)? = nil
    /// Fired when a page load fails and the limited retry budget is spent —
    /// hosts surface a banner/retry instead of leaving a silent blank canvas.
    var onLoadFailed: ((String) -> Void)? = nil
    /// Which floating chrome the page must clear with scroll padding.
    var chrome: KenosWebChrome = .kenosTabs
    /// Extra bottom pad for Live Accessory above the dock (0 when absent).
    var accessoryBottomPadPx: Int = 0
    /// Dual-layer keep-alive: inactive surfaces hide (GPU) instead of opacity-only.
    var isActive: Bool = true

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onTitle: onTitle,
            stayInApp: stayInApp,
            onCanGoBackChange: onCanGoBackChange,
            onURLChange: onURLChange,
            onProgress: onProgress,
            onLoadFailed: onLoadFailed
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        // NOTE: We intentionally do NOT set `limitsNavigationsToAppBoundDomains`.
        // Enabling it requires a `WKAppBoundDomains` array in Info.plist; without one
        // WebKit rejects *every* origin as non-app-bound and the whole process (the
        // flag is process-sticky once any WKWebView sets it) fails Service Worker /
        // module-script / CSS-preload jobs — observed as "Job rejected for non
        // app-bound domain" + "Importing a module script failed" across LAN
        // companions. Service Workers work in WKWebView without app-bound domains
        // since iOS 16.4 (min target here is iOS 17), so the flag is all cost, no
        // benefit for a shell that loads many production + LAN origins.
        // `KenosAppBoundDomains.shouldLimitNavigations` stays as a pure predicate
        // (unit-tested) but is no longer wired to the config.
        // Domain Continuity may host Music — allow remote/lock-screen resume without a
        // fresh user gesture. Kenos shell tabs stay gesture-gated to avoid autoplay noise.
        if stayInApp {
            config.mediaTypesRequiringUserActionForPlayback = []
        } else {
            config.mediaTypesRequiringUserActionForPlayback = .all
        }

        let topPad = chrome.topPadPx
        let bottomPad = KenosWebChrome.resolvedBottomPadPx(
            chrome: chrome,
            accessoryExtraPx: accessoryBottomPadPx
        )
        // Hide web BottomNav / SystemBar — native TabView / Domain Dock owns IA.
        // Full-bleed canvas + CSS env() padding (Tauri/iOS 26 research pattern):
        // contentInsetAdjustmentBehavior=.never, viewport-fit=cover, own safe-area in CSS.
        let shellScript = WKUserScript(
            source: """
            window.__KENOS_IOS_NATIVE_SHELL__ = true;
            try {
              document.documentElement.dataset.iosNativeShell = 'true';
              document.documentElement.dataset.kenosWebChrome = '\(chrome.rawValue)';
              sessionStorage.setItem('kenos.iosNativeShell', '1');
            } catch (e) {}
            // Ring-buffer recent console errors for native bug-report autofill (no PII bodies).
            // Also forward warn/error/onerror to native KenosLog via kenosNativeLog.
            (function () {
              if (window.__KENOS_BUG_CONSOLE_HOOK__) return;
              window.__KENOS_BUG_CONSOLE_HOOK__ = true;
              window.__KENOS_BUG_CONSOLE__ = window.__KENOS_BUG_CONSOLE__ || [];
              function push(kind, args) {
                try {
                  var msg = Array.prototype.slice.call(args || []).map(function (a) {
                    if (a && a.message) return String(a.message);
                    try { return String(a); } catch (e) { return '[unprintable]'; }
                  }).join(' ').slice(0, 160);
                  if (!msg) return;
                  window.__KENOS_BUG_CONSOLE__.push(kind + ': ' + msg);
                  if (window.__KENOS_BUG_CONSOLE__.length > 12) window.__KENOS_BUG_CONSOLE__.shift();
                  try {
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kenosNativeLog) {
                      window.webkit.messageHandlers.kenosNativeLog.postMessage({
                        level: kind === 'warn' ? 'warning' : (kind === 'error' || kind === 'onerror' || kind === 'unhandled' ? 'error' : 'info'),
                        category: 'web',
                        message: msg.slice(0, 240),
                        source: kind
                      });
                    }
                  } catch (bridgeErr) {}
                } catch (e) {}
              }
              var _err = console.error; var _warn = console.warn;
              console.error = function () { push('error', arguments); return _err.apply(console, arguments); };
              console.warn = function () { push('warn', arguments); return _warn.apply(console, arguments); };
              window.addEventListener('error', function (ev) {
                push('onerror', [ev && (ev.message || ev.error) || 'error']);
              });
              window.addEventListener('unhandledrejection', function (ev) {
                push('unhandled', [ev && ev.reason || 'rejection']);
              });
            })();
            (function () {
              var s = document.getElementById('kenos-ios-native-shell-css');
              if (!s) {
                s = document.createElement('style');
                s.id = 'kenos-ios-native-shell-css';
                (document.head || document.documentElement).appendChild(s);
              }
              s.textContent = [
                "html[data-ios-native-shell='true']{",
                "--kenos-system-bar-h:0px!important;",
                "--kenos-mobile-bottom-pad:0px!important;",
                "--mobile-tabbar-total-h:0px!important;",
                "--mobile-content-inset:0px!important;",
                "--mobile-content-inset-tabbar:0px!important;",
                "--bottom-chrome-h:0px!important;",
                "--safe-top-effective:0px!important;",
                "--safe-top:0px!important;",
                "--kenos-dock-scroll-end-pad:\(bottomPad)px;",
                "}",
                /* Immersive Focus/Summary — restore real inset; chrome pad is 0. */
                "html[data-ios-native-shell='true'][data-immersive-route='true'],",
                "html[data-ios-native-shell='true'][data-kenos-web-chrome='none']{",
                "--safe-top-effective:env(safe-area-inset-top,0px)!important;",
                "--safe-top:env(safe-area-inset-top,0px)!important;",
                "}",
                "html[data-ios-native-shell='true'] .bottom-nav-host,",
                "html[data-ios-native-shell='true'] nav.bottom-nav,",
                "html[data-ios-native-shell='true'] .bottom-shell,",
                "html[data-ios-native-shell='true'] [data-testid='aios-shell-bottom-nav'],",
                "html[data-ios-native-shell='true'] [data-testid='fitness-shell-bottom-nav'],",
                /* KenosSystemBar is the Music-style title chrome — do NOT hide it.
                 * Only hide legacy AppBar duplicates. */
                "html[data-ios-native-shell='true'] .appbar,",
                "html[data-ios-native-shell='true'] .life-os-app-bar,",
                "html[data-ios-native-shell='true'] header.appbar,",
                "html[data-ios-native-shell='true'] .app-bar{",
                "display:none!important;height:0!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important;",
                "}",
                "html[data-ios-native-shell='true'],",
                "html[data-ios-native-shell='true'] body{",
                "margin:0!important;padding:0!important;",
                "min-height:100%!important;min-height:100dvh!important;",
                "background:var(--bg,#08090a)!important;",
                "}",
                "html[data-ios-native-shell='true'] #main-content,",
                "html[data-ios-native-shell='true'] .life-os-app-shell,",
                "html[data-ios-native-shell='true'] .life-os-app-shell__main,",
                "html[data-ios-native-shell='true'] .life-os-page-workspace,",
                "html[data-ios-native-shell='true'] .app-shell{",
                "width:100%!important;",
                "max-width:100%!important;",
                "margin:0!important;",
                "box-sizing:border-box!important;",
                "background:transparent!important;",
                "}",
                /* ONE scroll-root pad only — never nest .app-shell + .main-col + workspace.
                 * Canvas is full-bleed under Liquid Glass dock; padding-bottom is scroll-end
                 * clearance so the last content/action rests fully above the dock at rest. */
                "html[data-ios-native-shell='true'] #main-content,",
                "html[data-ios-native-shell='true'] .life-os-app-shell__main,",
                "html[data-ios-native-shell='true'] .main-col{",
                "padding-top:\(topPad)px!important;",
                "padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;",
                "scroll-padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;",
                "padding-left:0!important;",
                "padding-right:0!important;",
                "box-sizing:border-box!important;",
                "}",
                /* Immersive: force zero top pad even if stylesheet rewrite lags. */
                "html[data-ios-native-shell='true'][data-immersive-route='true'] #main-content,",
                "html[data-ios-native-shell='true'][data-immersive-route='true'] .life-os-app-shell__main,",
                "html[data-ios-native-shell='true'][data-immersive-route='true'] .main-col,",
                "html[data-ios-native-shell='true'][data-kenos-web-chrome='none'] #main-content,",
                "html[data-ios-native-shell='true'][data-kenos-web-chrome='none'] .life-os-app-shell__main,",
                "html[data-ios-native-shell='true'][data-kenos-web-chrome='none'] .main-col{",
                "padding-top:0!important;",
                "}",
                /* Nested shells must not stack another 54/80. */
                "html[data-ios-native-shell='true'] .app-shell,",
                "html[data-ios-native-shell='true'] .life-os-app-shell,",
                "html[data-ios-native-shell='true'] .life-os-page-workspace,",
                "html[data-ios-native-shell='true'] .page{",
                "padding-top:0!important;",
                "padding-bottom:0!important;",
                "}",
                /* Domain FABs — hide on native shell; compose lives in DomainMusicHeader / dock. */
                "html[data-ios-native-shell='true'] .fab,",
                "html[data-ios-native-shell='true'] .fab-host,",
                "html[data-ios-native-shell='true'] .lib-top-fab{",
                "display:none!important;",
                "}",
                "html[data-ios-native-shell='true'] .tw{",
                "bottom:calc(\(bottomPad)px + 18px + env(safe-area-inset-bottom,0px))!important;",
                "}",
                /* Kenos space pages — pack under Music-style scroll header. */
                "html[data-ios-native-shell='true'] .space-page{",
                "padding-top:0!important;",
                "}",
                "html[data-ios-native-shell='true'] .life-os-app-shell{",
                "height:100dvh!important;",
                "min-height:100dvh!important;",
                "}",
                "html[data-ios-native-shell='true'] .life-os-app-shell__overlay-spacer{",
                "flex-basis:0!important;height:0!important;min-height:0!important;",
                "}",
                "html[data-ios-native-shell='true'] .wrap,",
                "html[data-ios-native-shell='true'] .life-os-grid,",
                "html[data-ios-native-shell='true'] .life-os-grid__main{",
                "padding-top:0!important;",
                "margin-top:0!important;",
                "min-height:0!important;",
                "}",
                "html[data-ios-native-shell='true'] .quick-add,",
                "html[data-ios-native-shell='true'] .quick-add-bar{",
                "margin-top:0!important;",
                "}",
                "html[data-ios-native-shell='true'] .safari-chrome-tint-top,",
                "html[data-ios-native-shell='true'] .safari-chrome-tint-bottom{",
                "display:none!important;",
                "}",
                /* Kenos Today — pack under scroll header; kill PWA letterbox padding. */
                "html[data-ios-native-shell='true'] .today-page{",
                "padding-top:0!important;",
                "padding-bottom:12px!important;",
                "margin-top:0!important;",
                "}",
                "html[data-ios-native-shell='true'] .today-header{",
                "padding-top:0!important;",
                "padding-bottom:16px!important;",
                "}",
                /* Hierarchical SPA settle only — dock/tab peer swaps set __KENOS_PEER_SWAP_UNTIL__. */
                "html[data-ios-native-shell='true']{",
                "--kenos-motion-page:320ms;",
                "--kenos-ease-page:cubic-bezier(0.22,1,0.36,1);",
                "}",
                "html[data-ios-native-shell='true'] #main-content.kenos-page-enter,",
                "html[data-ios-native-shell='true'] .life-os-app-shell__main.kenos-page-enter,",
                "html[data-ios-native-shell='true'] .main-col.kenos-page-enter,",
                "html[data-ios-native-shell='true'] .life-os-page-workspace.kenos-page-enter{",
                "animation:kenos-page-enter var(--kenos-motion-page) var(--kenos-ease-page) both;",
                "}",
                "@keyframes kenos-page-enter{",
                "from{opacity:0.78;transform:translateY(8px) scale(0.994);}",
                "to{opacity:1;transform:translateY(0) scale(1);}",
                "}",
                "@media (prefers-reduced-motion:reduce){",
                "html[data-ios-native-shell='true'] #main-content.kenos-page-enter,",
                "html[data-ios-native-shell='true'] .life-os-app-shell__main.kenos-page-enter,",
                "html[data-ios-native-shell='true'] .main-col.kenos-page-enter,",
                "html[data-ios-native-shell='true'] .life-os-page-workspace.kenos-page-enter{",
                "animation:kenos-page-enter-fade 160ms ease-out both;",
                "}",
                "@keyframes kenos-page-enter-fade{from{opacity:0.85;}to{opacity:1;}}",
                "}"
              ].join('');
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(shellScript)

        // SPA History API → native path (SvelteKit goto does not fire didFinish).
        let pathHook = WKUserScript(
            source: """
            (function () {
              if (window.__KENOS_PATH_HOOK__) return;
              window.__KENOS_PATH_HOOK__ = true;
              var lastPath = '';
              var lastHref = '';
              var enterCooldownUntil = 0;
              function pageRoot() {
                return document.querySelector('#main-content')
                  || document.querySelector('.life-os-app-shell__main')
                  || document.querySelector('.main-col')
                  || document.querySelector('.life-os-page-workspace');
              }
              function playPageEnter() {
                try {
                  var now = Date.now();
                  // Native dock/tab peer swap — HIG: no settle travel (Music/Phone tabs).
                  if (now < (window.__KENOS_PEER_SWAP_UNTIL__ || 0)) return;
                  if (now < enterCooldownUntil) return;
                  enterCooldownUntil = now + 280;
                  var root = pageRoot();
                  if (!root) return;
                  root.classList.remove('kenos-page-enter');
                  void root.offsetWidth;
                  root.classList.add('kenos-page-enter');
                } catch (e) {}
              }
              function report(opts) {
                try {
                  var href = String(location.href || '');
                  var path = String(location.pathname || '').toLowerCase();
                  var peerSwap = Date.now() < (window.__KENOS_PEER_SWAP_UNTIL__ || 0);
                  var animate = !!(opts && opts.animate) && !peerSwap;
                  if (href !== lastHref) {
                    lastHref = href;
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kenosPath) {
                      window.webkit.messageHandlers.kenosPath.postMessage(href);
                    }
                  }
                  if (animate && path && path !== lastPath) {
                    var first = !lastPath;
                    lastPath = path;
                    if (!first) {
                      requestAnimationFrame(function () {
                        requestAnimationFrame(playPageEnter);
                      });
                    }
                  } else if (path) {
                    lastPath = path;
                  }
                } catch (e) {}
              }
              var _push = history.pushState;
              var _replace = history.replaceState;
              history.pushState = function () {
                var r = _push.apply(this, arguments);
                report({ animate: true });
                return r;
              };
              history.replaceState = function () {
                var r = _replace.apply(this, arguments);
                // replaceState is often SvelteKit bookkeeping — report path, skip enter anim.
                report({ animate: false });
                return r;
              };
              window.addEventListener('popstate', function () { report({ animate: true }); });
              document.addEventListener('DOMContentLoaded', function () { report({ animate: false }); });
              report({ animate: false });
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(pathHook)
        // Scroll direction → Live Accessory minimize (Music tabBarMinimize / bottomAccessory pattern).
        let chromeScrollHook = WKUserScript(
            source: """
            (function () {
              if (window.__KENOS_CHROME_SCROLL__) return;
              window.__KENOS_CHROME_SCROLL__ = true;
              var lastY = 0;
              var lastPost = 0;
              function scrollY() {
                try {
                  var root = document.scrollingElement
                    || document.documentElement
                    || document.body;
                  var nested = document.querySelector('#main-content')
                    || document.querySelector('.life-os-app-shell__main')
                    || document.querySelector('.main-col');
                  var y = root && root.scrollTop || 0;
                  if (nested && nested.scrollTop > y) y = nested.scrollTop;
                  return y;
                } catch (e) { return 0; }
              }
              function post(direction, y) {
                try {
                  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kenosChromeScroll) {
                    window.webkit.messageHandlers.kenosChromeScroll.postMessage({
                      direction: direction,
                      y: Math.round(y)
                    });
                  }
                } catch (e) {}
              }
              document.addEventListener('scroll', function () {
                var now = Date.now();
                if (now - lastPost < 140) return;
                var y = scrollY();
                var dir = y > lastY + 10 ? 'down' : (y < lastY - 10 ? 'up' : '');
                if (!dir) return;
                lastPost = now;
                lastY = y;
                post(dir, y);
              }, { capture: true, passive: true });
            })();
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(chromeScrollHook)
        // Unified capability bridge bootstrap — available before SPA modules load.
        let nativeBridgeBoot = WKUserScript(
            source: KenosNativeCapabilityBridge.bootstrapScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(nativeBridgeBoot)
        let weakHandler = KenosWeakScriptHandler(target: context.coordinator)
        context.coordinator.scriptHandlerProxy = weakHandler
        config.userContentController.add(weakHandler, name: "kenosPath")
        config.userContentController.add(weakHandler, name: "kenosNativeLog")
        config.userContentController.add(weakHandler, name: "kenosPaintReady")
        config.userContentController.add(weakHandler, name: "kenosNative")
        config.userContentController.add(weakHandler, name: "kenosChromeScroll")

        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        // Own safe-area in CSS (viewport-fit=cover). Automatic insets fight
        // fixed web chrome and create top/bottom black bands (Tauri 2026 writeup).
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.contentInset = .zero
        view.scrollView.scrollIndicatorInsets = .zero
        view.scrollView.automaticallyAdjustsScrollIndicatorInsets = false
        view.isOpaque = true
        let canvas = KenosWebRuntime.canvasUIColor
        view.backgroundColor = canvas
        view.scrollView.backgroundColor = canvas
        view.underPageBackgroundColor = canvas
        view.isHidden = !isActive
        // First mount: solid canvas cover until first paint (blank WKWebView is white).
        // Light Domains must not veil with dark ink while status bar already flipped.
        context.coordinator.installLoadCover(on: view)
        let initial = Self.shellURL(url)
        KenosLog.info("webview load", category: .web, metadata: [
            "host": initial.host ?? "",
            "path": initial.path,
            "mode": stayInApp ? "domain" : "shell",
            "chrome": chrome.rawValue,
        ])
        context.coordinator.webView = view
        context.coordinator.observeProgress(on: view)
        context.coordinator.applyActivation(isActive, on: view)
        context.coordinator.loadSeedingSSO(on: view, url: initial)
        if stayInApp {
            KenosDomainWebBridge.activeWebView = view
            KenosActiveWebRegistry.domainWebView = view
        } else {
            KenosActiveWebRegistry.shellWebView = view
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.stayInApp = stayInApp
        if stayInApp {
            KenosDomainWebBridge.activeWebView = uiView
            KenosActiveWebRegistry.domainWebView = uiView
        } else {
            KenosActiveWebRegistry.shellWebView = uiView
        }
        context.coordinator.onTitle = onTitle
        context.coordinator.onCanGoBackChange = onCanGoBackChange
        context.coordinator.onURLChange = onURLChange
        context.coordinator.onProgress = onProgress
        context.coordinator.onLoadFailed = onLoadFailed
        context.coordinator.applyActivation(isActive, on: uiView)
        // Keep scroll padding in sync when Focus / Live Accessory chrome changes —
        // skip when pads unchanged (dock tab switches spam updateUIView).
        let topPad = chrome.topPadPx
        let bottomPad = KenosWebChrome.resolvedBottomPadPx(
            chrome: chrome,
            accessoryExtraPx: accessoryBottomPadPx
        )
        // WKWebView with contentInsetAdjustmentBehavior=.never can report
        // env(safe-area-inset-top)=0 — push the real UIKit inset for Focus chrome.
        let safeTop = max(0, Int(uiView.safeAreaInsets.top.rounded(.up)))
        let safeBottom = max(0, Int(uiView.safeAreaInsets.bottom.rounded(.up)))
        let chromeChanged = context.coordinator.lastChromeRaw != chrome.rawValue
            || context.coordinator.lastTopPad != topPad
            || context.coordinator.lastBottomPad != bottomPad
        let safeChanged = context.coordinator.lastSafeTop != safeTop
            || context.coordinator.lastSafeBottom != safeBottom
        if chromeChanged || safeChanged {
            context.coordinator.lastChromeRaw = chrome.rawValue
            context.coordinator.lastTopPad = topPad
            context.coordinator.lastBottomPad = bottomPad
            context.coordinator.lastSafeTop = safeTop
            context.coordinator.lastSafeBottom = safeBottom
            // Don't spend JS on a hidden Continuity/Kenos layer.
            if isActive {
                uiView.evaluateJavaScript(
                    """
                    try {
                      document.documentElement.dataset.kenosWebChrome = '\(chrome.rawValue)';
                      document.documentElement.style.setProperty('--kenos-native-safe-top', '\(safeTop)px');
                      document.documentElement.style.setProperty('--kenos-native-safe-bottom', '\(safeBottom)px');
                      var s = document.getElementById('kenos-ios-native-shell-css');
                      if (s && s.textContent) {
                        s.textContent = s.textContent
                          .replace(/padding-top:\\d+px!important;/g, 'padding-top:\(topPad)px!important;')
                          .replace(/padding-bottom:calc\\(env\\(safe-area-inset-bottom,0px\\) \\+ \\d+px\\)!important;/g,
                            'padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;')
                          .replace(/scroll-padding-bottom:calc\\(env\\(safe-area-inset-bottom,0px\\) \\+ \\d+px\\)!important;/g,
                            'scroll-padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;')
                          .replace(/--kenos-dock-scroll-end-pad:\\d+px;/g,
                            '--kenos-dock-scroll-end-pad:\(bottomPad)px;');
                      }
                    } catch (e) {}
                    """
                )
            }
        }
        // Inactive keep-alive layer: never navigate (avoids burning CPU while hidden).
        guard isActive else { return }

        let next = Self.shellURL(url)
        let live = uiView.url ?? context.coordinator.loadedURL
        let liveOrigin = live.map(Self.originKey)
        let nextOrigin = Self.originKey(next)
        let livePath = (live?.path ?? "").lowercased()
        let nextPath = next.path.lowercased()

        if stayInApp {
            // Domain Continuity: SPA owns path. Cross-origin = hard load;
            // same-origin dock jumps prefer SvelteKit client nav (synthetic <a>).
            let nativePathJump = liveOrigin == nextOrigin && livePath != nextPath
                && context.coordinator.lastNativePath != nextPath
            if liveOrigin != nextOrigin {
                #if os(iOS)
                // Space↔Space hard load tears down the previous origin's <audio>.
                if KenosDomainRegistry.domainId(fromContinuity: live) == "music" {
                    KenosNowPlayingBridge.clear()
                }
                #endif
                context.coordinator.beginProtectedNavigation(on: uiView, freezePixels: true)
                context.coordinator.lastNativePath = nextPath
                context.coordinator.loadRetryCount = 0
                context.coordinator.loadSeedingSSO(on: uiView, url: next)
            } else if nativePathJump {
                context.coordinator.loadedURL = next
                context.coordinator.lastNativePath = nextPath
                context.coordinator.softNavigate(uiView, to: next)
            }
        } else if !Self.sameNavigationTarget(live, next) {
            let sameOrigin = liveOrigin == nextOrigin
            context.coordinator.lastNativePath = nextPath
            context.coordinator.loadRetryCount = 0
            if sameOrigin, live != nil {
                context.coordinator.loadedURL = next
                context.coordinator.softNavigate(uiView, to: next)
            } else {
                context.coordinator.beginProtectedNavigation(on: uiView, freezePixels: true)
                context.coordinator.loadSeedingSSO(on: uiView, url: next)
            }
        }
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.teardown(uiView)
    }

    /// Path + query identity ignoring fragment (SPA hash noise).
    static func sameNavigationTarget(_ a: URL?, _ b: URL) -> Bool {
        guard let a else { return false }
        if originKey(a) != originKey(b) { return false }
        if a.path.lowercased() != b.path.lowercased() { return false }
        let aq = a.query ?? ""
        let bq = b.query ?? ""
        return aq == bq
    }

    static func originKey(_ url: URL) -> String {
        let host = (url.host ?? "").lowercased()
        let port = url.port ?? ((url.scheme?.lowercased() == "https") ? 443 : 80)
        return "\(host):\(port)"
    }

    /// Ensure iosNativeShell=1 query (survives SPA boot before user-script if needed).
    static func shellURL(_ url: URL) -> URL {
        guard var c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        var items = c.queryItems ?? []
        if items.contains(where: { $0.name == "iosNativeShell" }) == false {
            items.append(URLQueryItem(name: "iosNativeShell", value: "1"))
        }
        c.queryItems = items
        return c.url ?? url
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var onTitle: ((String) -> Void)?
        var stayInApp: Bool
        var onCanGoBackChange: ((Bool) -> Void)?
        var onURLChange: ((URL) -> Void)?
        var onProgress: ((Double) -> Void)?
        var onLoadFailed: ((String) -> Void)?
        weak var webView: WKWebView?
        var loadedURL: URL?
        /// Last path loaded because native dock requested it (vs SPA self-nav).
        var lastNativePath: String = ""
        /// Last applied chrome pads — avoid JS on every SwiftUI refresh.
        var lastChromeRaw: String = ""
        var lastTopPad: Int = -1
        var lastBottomPad: Int = -1
        var lastSafeTop: Int = -1
        var lastSafeBottom: Int = -1
        /// Transient load retries (cancelled / network). Cap prevents infinite loops.
        var loadRetryCount: Int = 0
        var scriptHandlerProxy: KenosWeakScriptHandler?
        /// Generation token so delayed uncover ignores stale navigations.
        private var coverGeneration: UInt = 0
        /// Cancels in-flight softNavigate callbacks when the user taps another tab quickly.
        private var softNavGeneration: UInt = 0
        private var uncoverWorkItem: DispatchWorkItem?
        private var softNavFallbackWorkItem: DispatchWorkItem?
        /// SPA soft-nav → hard load only after this delay (slow routes false-positive at ~0.32s).
        private static let softNavigateFallbackDelay: TimeInterval = 0.65
        private var progressObservation: NSKeyValueObservation?
        private var lastPublishedCanGoBack: Bool?
        private var lastPublishedProgress: Double = -1
        private var lastReportedURL: URL?
        private var isActiveSurface = true
        private var didSignalFirstContent = false
        /// Removed in `teardown` — avoid nonisolated deinit touching NSObjectProtocol.
        nonisolated(unsafe) private var nowPlayingObserver: NSObjectProtocol?

        private static let freezeOverlayTag = 0x4B46525A // KFRZ
        private static let loadCoverTag = 0x4B4C4452 // KLDR
        private static let softVeilTag = 0x4B534654 // KSFT
        private static let maxLoadRetries = 1
        private static let progressPublishEpsilon: Double = 0.03

        init(
            onTitle: ((String) -> Void)?,
            stayInApp: Bool,
            onCanGoBackChange: ((Bool) -> Void)?,
            onURLChange: ((URL) -> Void)?,
            onProgress: ((Double) -> Void)?,
            onLoadFailed: ((String) -> Void)? = nil
        ) {
            self.onTitle = onTitle
            self.stayInApp = stayInApp
            self.onCanGoBackChange = onCanGoBackChange
            self.onURLChange = onURLChange
            self.onProgress = onProgress
            self.onLoadFailed = onLoadFailed
            super.init()
            if stayInApp {
                nowPlayingObserver = NotificationCenter.default.addObserver(
                    forName: .kenosNowPlayingDidChange,
                    object: nil,
                    queue: .main
                ) { [weak self] _ in
                    Task { @MainActor in
                        self?.syncMediaKeepAlive()
                    }
                }
            }
        }

        func observeProgress(on webView: WKWebView) {
            progressObservation?.invalidate()
            progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
                let value = view.estimatedProgress
                DispatchQueue.main.async {
                    self?.publishProgress(value)
                }
            }
        }

        /// Throttle progress → SwiftUI: every KVO tick was redrawing the hairline bar.
        func publishProgress(_ value: Double) {
            let clamped = min(1, max(0, value))
            if clamped >= 0.995 || clamped <= 0.02 {
                if abs(clamped - lastPublishedProgress) < 0.001 { return }
                lastPublishedProgress = clamped
                onProgress?(clamped)
                return
            }
            if abs(clamped - lastPublishedProgress) < Self.progressPublishEpsilon { return }
            lastPublishedProgress = clamped
            onProgress?(clamped)
        }

        func signalFirstContentReady() {
            guard !didSignalFirstContent else { return }
            didSignalFirstContent = true
            NotificationCenter.default.post(name: .kenosFirstContentReady, object: nil)
        }

        func applyActivation(_ active: Bool, on webView: WKWebView) {
            let wasActive = isActiveSurface
            guard wasActive != active else { return }
            isActiveSurface = active
            syncMediaKeepAlive(on: webView)
            // Becoming visible again: chrome pads may have changed while hidden.
            if active,
               lastTopPad >= 0,
               !lastChromeRaw.isEmpty
            {
                let topPad = lastTopPad
                let bottomPad = lastBottomPad
                let chromeRaw = lastChromeRaw
                webView.evaluateJavaScript(
                    """
                    try {
                      document.documentElement.dataset.kenosWebChrome = '\(chromeRaw)';
                      var s = document.getElementById('kenos-ios-native-shell-css');
                      if (s && s.textContent) {
                        s.textContent = s.textContent
                          .replace(/padding-top:\\d+px!important;/g, 'padding-top:\(topPad)px!important;')
                          .replace(/padding-bottom:calc\\(env\\(safe-area-inset-bottom,0px\\) \\+ \\d+px\\)!important;/g,
                            'padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;')
                          .replace(/scroll-padding-bottom:calc\\(env\\(safe-area-inset-bottom,0px\\) \\+ \\d+px\\)!important;/g,
                            'scroll-padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;')
                          .replace(/--kenos-dock-scroll-end-pad:\\d+px;/g,
                            '--kenos-dock-scroll-end-pad:\(bottomPad)px;');
                      }
                    } catch (e) {}
                    """
                )
            }
        }

        /// Re-evaluate hide/suspend after Now Playing starts or clears while Domain is idle.
        func syncMediaKeepAlive(on webView: WKWebView? = nil) {
            guard stayInApp, let webView = webView ?? self.webView else { return }
            if isActiveSurface {
                webView.isHidden = false
                webView.scrollView.isScrollEnabled = true
                if #available(iOS 15.0, *) {
                    webView.setAllMediaPlaybackSuspended(false)
                }
                return
            }
            // Idle layer: stop scroll while Kenos↔Domain keep-alive hides it.
            // Music Now Playing must keep HTML5 audio alive under the opacity-0 Continuity
            // layer — isHidden + setAllMediaPlaybackSuspended would kill lock-screen playback.
            let keepMusicAlive = KenosNowPlayingBridge.shouldKeepMediaAlive(for: webView.url)
            webView.isHidden = !keepMusicAlive
            webView.scrollView.isScrollEnabled = false
            if #available(iOS 15.0, *) {
                webView.setAllMediaPlaybackSuspended(!keepMusicAlive)
            }
        }

        func teardown(_ webView: WKWebView) {
            uncoverWorkItem?.cancel()
            softNavFallbackWorkItem?.cancel()
            softNavGeneration &+= 1
            progressObservation?.invalidate()
            progressObservation = nil
            if let nowPlayingObserver {
                NotificationCenter.default.removeObserver(nowPlayingObserver)
                self.nowPlayingObserver = nil
            }
            KenosNowPlayingBridge.clearIfOwned(by: webView)
            webView.navigationDelegate = nil
            if scriptHandlerProxy != nil {
                webView.configuration.userContentController.removeScriptMessageHandler(forName: "kenosPath")
                webView.configuration.userContentController.removeScriptMessageHandler(forName: "kenosNativeLog")
                webView.configuration.userContentController.removeScriptMessageHandler(forName: "kenosPaintReady")
                webView.configuration.userContentController.removeScriptMessageHandler(forName: "kenosNative")
                webView.configuration.userContentController.removeScriptMessageHandler(forName: "kenosChromeScroll")
                scriptHandlerProxy = nil
            }
            if KenosDomainWebBridge.activeWebView === webView {
                KenosDomainWebBridge.activeWebView = nil
            }
            if KenosActiveWebRegistry.domainWebView === webView {
                KenosActiveWebRegistry.domainWebView = nil
            }
            if KenosActiveWebRegistry.shellWebView === webView {
                KenosActiveWebRegistry.shellWebView = nil
            }
            self.webView = nil
            lastPublishedProgress = -1
            publishProgress(0)
        }

        /// Same-origin: synthetic link click so SvelteKit client-router can handle it
        /// Peer dock/tab path jump via SPA click — without a full WK document reload.
        /// HIG: peer destinations swap instantly (no ink veil / page-enter travel).
        /// Falls back to hard load if path stuck.
        func softNavigate(_ webView: WKWebView, to url: URL) {
            softNavFallbackWorkItem?.cancel()
            // Drop any leftover veil from an older path (hard-load / interrupted).
            endSoftVeil(on: webView, animated: false)
            softNavGeneration &+= 1
            let generation = softNavGeneration
            let targetPath = url.path.lowercased()
            let href = url.absoluteString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            KenosLog.debug("webview soft navigate", category: .web, metadata: [
                "host": url.host ?? "",
                "path": url.path,
                "mode": stayInApp ? "domain" : "shell",
            ])
            webView.evaluateJavaScript(
                """
                (function () {
                  var next = '\(href)';
                  try {
                    if (location.href === next) return 'same';
                    // Gate CSS kenos-page-enter for this SPA hop (dock/tab peer swap).
                    window.__KENOS_PEER_SWAP_UNTIL__ = Date.now() + 500;
                    var a = document.createElement('a');
                    a.href = next;
                    a.setAttribute('data-sveltekit-preload-data', 'off');
                    a.style.display = 'none';
                    (document.body || document.documentElement).appendChild(a);
                    a.click();
                    a.remove();
                    return 'spa';
                  } catch (e) {
                    try { location.assign(next); return 'assign'; } catch (e2) { return 'fail'; }
                  }
                })();
                """
            ) { [weak self] result, _ in
                guard let self else { return }
                DispatchQueue.main.async {
                    guard self.softNavGeneration == generation else { return }
                    let kind = result as? String ?? "fail"
                    if kind == "same" { return }
                    if kind == "assign" || kind == "fail" {
                        self.beginProtectedNavigation(on: webView, freezePixels: true)
                        if kind == "fail" {
                            self.loadSeedingSSO(on: webView, url: url)
                        }
                        return
                    }
                    // SPA click accepted — if path still stale after delay, hard load.
                    // kenosPath / didFinish cancel this work when the client router wins.
                    let work = DispatchWorkItem { [weak self, weak webView] in
                        guard let self, let webView else { return }
                        guard self.softNavGeneration == generation else { return }
                        let livePath = (webView.url?.path ?? "").lowercased()
                        guard livePath != targetPath else {
                            KenosLog.debug("soft navigate settled before fallback", category: .web, metadata: [
                                "host": url.host ?? "",
                                "path": url.path,
                            ])
                            return
                        }
                        guard self.lastNativePath == targetPath else { return }
                        KenosLog.info("soft navigate fallback → hard load", category: .web, metadata: [
                            "host": url.host ?? "",
                            "path": url.path,
                            "delayMs": String(Int(Self.softNavigateFallbackDelay * 1000)),
                        ])
                        self.beginProtectedNavigation(on: webView, freezePixels: true)
                        self.loadRetryCount = 0
                        self.loadSeedingSSO(on: webView, url: url)
                    }
                    self.softNavFallbackWorkItem = work
                    DispatchQueue.main.asyncAfter(
                        deadline: .now() + Self.softNavigateFallbackDelay,
                        execute: work
                    )
                }
            }
        }

        /// Remove residual soft veil (peer softNavigate no longer paints one).
        func endSoftVeil(on webView: WKWebView, animated: Bool) {
            guard let veil = webView.viewWithTag(Self.softVeilTag) else { return }
            veil.layer.removeAllAnimations()
            let finish = { veil.removeFromSuperview() }
            guard animated else {
                finish()
                return
            }
            UIView.animate(
                withDuration: KenosMotion.softVeilOutDuration,
                delay: 0,
                options: [.curveEaseOut, .beginFromCurrentState, .allowUserInteraction]
            ) {
                veil.alpha = 0
            } completion: { finished in
                if finished { finish() }
            }
        }

        /// Ink underlay + optional pixel freeze before any navigation that would flash white.
        func beginProtectedNavigation(on webView: WKWebView, freezePixels: Bool) {
            uncoverWorkItem?.cancel()
            softNavFallbackWorkItem?.cancel()
            coverGeneration &+= 1
            installLoadCover(on: webView)
            if freezePixels {
                installFreezeOverlay(on: webView)
            }
        }

        /// Seed Keychain → WKCookieStore before Continuity hard loads so Cookie SSO
        /// works on Music/Finance/etc. without a second interactive login.
        func loadSeedingSSO(on webView: WKWebView, url: URL) {
            loadedURL = url
            Task { @MainActor [weak self, weak webView] in
                await KenosSharedWebAuth.seedSharedSessionCookies()
                guard let self, let webView else { return }
                // Drop stale loads if a newer Continuity target won the race.
                guard self.loadedURL == url else { return }
                webView.load(URLRequest(url: url))
            }
        }

        func installLoadCover(on webView: WKWebView) {
            let canvas = KenosWebRuntime.canvasUIColor
            if let existing = webView.viewWithTag(Self.loadCoverTag) {
                existing.backgroundColor = canvas
                existing.alpha = 1
                return
            }
            let cover = UIView(frame: webView.bounds)
            cover.tag = Self.loadCoverTag
            cover.backgroundColor = canvas
            cover.alpha = 1
            cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            cover.isUserInteractionEnabled = false
            webView.addSubview(cover)
        }

        /// Keep last-painted Continuity pixels while the next origin loads.
        func installFreezeOverlay(on webView: WKWebView) {
            removeFreezeOverlay(from: webView)
            let bounds = webView.bounds
            let host = UIView(frame: bounds)
            host.tag = Self.freezeOverlayTag
            host.backgroundColor = KenosWebRuntime.canvasUIColor
            host.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            host.isUserInteractionEnabled = false
            host.clipsToBounds = true

            // Prefer lightweight snapshotView — never layer.render (main-thread jank on large canvases).
            // Solid ink host alone is an acceptable fallback if snapshot fails.
            if let snap = webView.snapshotView(afterScreenUpdates: false) {
                snap.frame = host.bounds
                snap.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                host.addSubview(snap)
            }
            webView.addSubview(host)
        }

        func removeFreezeOverlay(from webView: WKWebView) {
            webView.viewWithTag(Self.freezeOverlayTag)?.removeFromSuperview()
        }

        func removeLoadCover(from webView: WKWebView) {
            webView.viewWithTag(Self.loadCoverTag)?.removeFromSuperview()
        }

        /// Ease covers out — hard remove reads as a flash on modern OLED.
        func fadeUncover(from webView: WKWebView, animated: Bool = true) {
            let freeze = webView.viewWithTag(Self.freezeOverlayTag)
            let cover = webView.viewWithTag(Self.loadCoverTag)
            let soft = webView.viewWithTag(Self.softVeilTag)
            guard freeze != nil || cover != nil || soft != nil else { return }
            let finish = {
                freeze?.removeFromSuperview()
                cover?.removeFromSuperview()
                soft?.removeFromSuperview()
            }
            guard animated else {
                finish()
                return
            }
            UIView.animate(
                withDuration: KenosMotion.unveilDuration,
                delay: 0,
                options: [.curveEaseOut, .allowUserInteraction, .beginFromCurrentState]
            ) {
                freeze?.alpha = 0
                cover?.alpha = 0
                soft?.alpha = 0
            } completion: { _ in
                finish()
            }
        }

        /// Drop covers only after the next document has painted (or a short failsafe).
        func scheduleUncover(after webView: WKWebView) {
            let gen = coverGeneration
            uncoverWorkItem?.cancel()
            webView.evaluateJavaScript(
                """
                (function () {
                  function ping() {
                    try {
                      if (window.webkit && window.webkit.messageHandlers
                          && window.webkit.messageHandlers.kenosPaintReady) {
                        window.webkit.messageHandlers.kenosPaintReady.postMessage(1);
                      }
                    } catch (e) {}
                  }
                  if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    requestAnimationFrame(function () { requestAnimationFrame(ping); });
                  } else {
                    document.addEventListener('DOMContentLoaded', function () {
                      requestAnimationFrame(function () { requestAnimationFrame(ping); });
                    }, { once: true });
                  }
                })();
                """
            )
            let failsafe = DispatchWorkItem { [weak self, weak webView] in
                guard let self, let webView, self.coverGeneration == gen else { return }
                self.fadeUncover(from: webView)
                self.signalFirstContentReady()
                self.publishProgress(1)
            }
            uncoverWorkItem = failsafe
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: failsafe)
        }

        func uncoverIfCurrent(webView: WKWebView) {
            uncoverWorkItem?.cancel()
            uncoverWorkItem = nil
            fadeUncover(from: webView)
            signalFirstContentReady()
            publishProgress(1)
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            if message.name == "kenosNativeLog" {
                Self.ingestNativeLog(message.body)
                return
            }
            if message.name == "kenosPaintReady" {
                if let webView {
                    uncoverIfCurrent(webView: webView)
                }
                return
            }
            if message.name == "kenosNative" {
                KenosNativeCapabilityBridge.handleMessage(body: message.body, webView: webView)
                return
            }
            if message.name == "kenosChromeScroll" {
                Self.ingestChromeScroll(message.body)
                return
            }
            guard message.name == "kenosPath" else { return }
            let href = (message.body as? String) ?? ""
            guard let url = URL(string: href), url.scheme?.hasPrefix("http") == true else { return }
            loadedURL = url
            // SPA reached the dock target — cancel hard-load fallback.
            if lastNativePath == url.path.lowercased() {
                softNavFallbackWorkItem?.cancel()
                softNavFallbackWorkItem = nil
            }
            // Deduplicate — SvelteKit can emit push+replace bursts for one navigation.
            if let last = lastReportedURL,
               KenosWebSurfaceView.sameNavigationTarget(last, url)
            {
                publishCanGoBack()
                return
            }
            lastReportedURL = url
            KenosLog.debug("spa path", category: .web, metadata: [
                "host": url.host ?? "",
                "path": url.path,
                "mode": stayInApp ? "domain" : "shell",
            ])
            let notify = onURLChange
            if Thread.isMainThread {
                notify?(url)
            } else {
                DispatchQueue.main.async { notify?(url) }
            }
            publishCanGoBack()
        }

        private static func ingestChromeScroll(_ body: Any) {
            let direction: String
            if let dict = body as? [String: Any] {
                direction = String(describing: dict["direction"] ?? "")
            } else if let text = body as? String {
                direction = text
            } else {
                return
            }
            let minimized = direction == "down"
            let expand = direction == "up"
            guard minimized || expand else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .kenosLiveAccessoryMinimize,
                    object: nil,
                    userInfo: ["minimized": minimized]
                )
            }
        }

        private static func ingestNativeLog(_ body: Any) {
            let level: KenosLogLevel
            let category: KenosLogCategory
            let message: String
            var metadata: [String: String] = ["bridge": "kenosNativeLog"]

            if let dict = body as? [String: Any] {
                level = KenosLogLevel.parse(String(describing: dict["level"] ?? "info")) ?? .info
                category = KenosLogCategory.parse(String(describing: dict["category"] ?? "web"))
                message = String(describing: dict["message"] ?? "")
                if let source = dict["source"] {
                    metadata["source"] = String(describing: source)
                }
            } else if let text = body as? String {
                level = .info
                category = .web
                message = text
            } else {
                return
            }
            guard !message.isEmpty else { return }
            KenosLog.shared.log(
                level,
                category: category,
                message: message,
                metadata: metadata,
                file: "KenosWebSurfaceView.swift",
                function: "kenosNativeLog",
                line: 0
            )
        }

        func publishCanGoBack() {
            let value = webView?.canGoBack ?? false
            guard lastPublishedCanGoBack != value else { return }
            lastPublishedCanGoBack = value
            DispatchQueue.main.async { [onCanGoBackChange] in
                onCanGoBackChange?(value)
            }
        }

        private func isCancelledNavigation(_ error: Error) -> Bool {
            let ns = error as NSError
            return ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled
        }

        private func scheduleLimitedRetry(on webView: WKWebView, error: Error) {
            if isCancelledNavigation(error) { return }
            guard let url = loadedURL else { return }
            guard loadRetryCount < Self.maxLoadRetries else {
                // Retry budget spent — tell the host so the user gets a banner, not a blank canvas.
                onLoadFailed?(error.localizedDescription)
                return
            }
            loadRetryCount += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self, weak webView] in
                guard let self, let webView else { return }
                self.beginProtectedNavigation(on: webView, freezePixels: false)
                self.loadSeedingSSO(on: webView, url: url)
            }
        }

        func webView(
            _ webView: WKWebView,
            didStartProvisionalNavigation navigation: WKNavigation!
        ) {
            // Only reinforce cover when we already started a protected nav.
            // Unconditional ink here blanks back-forward / in-page navigations.
            if webView.viewWithTag(Self.freezeOverlayTag) != nil
                || webView.viewWithTag(Self.loadCoverTag) != nil
            {
                installLoadCover(on: webView)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loadRetryCount = 0
            softNavFallbackWorkItem?.cancel()
            softNavFallbackWorkItem = nil
            onTitle?(webView.title ?? "")
            publishCanGoBack()
            if let live = webView.url {
                loadedURL = live
                KenosLog.info("webview didFinish", category: .web, metadata: [
                    "host": live.host ?? "",
                    "path": live.path,
                    "mode": stayInApp ? "domain" : "shell",
                    "title": String((webView.title ?? "").prefix(80)),
                ])
                // Auth JWT is readable from localStorage after shell/domain paint.
                KenosLogCloudSync.shared.kick(reason: "webview")
                DispatchQueue.main.async { [onURLChange] in
                    onURLChange?(live)
                }
                // Belt: if Kenos shell somehow finished loading a domain origin,
                // force Domain Mode (fixes stuck Kenos dock over Plan/Training).
                if !stayInApp {
                    if KenosDomainRegistry.isEmbeddedWebContinuityURL(live) {
                        DispatchQueue.main.async {
                            NotificationCenter.default.post(
                                name: .kenosOpenDomainContinuity,
                                object: live
                            )
                        }
                    }
                }
            }
            // Health privacy boundary: raw days → Health Continuity only;
            // Kenos shell gets readiness summary levels/codes only.
            let injectURL = webView.url ?? loadedURL
            let injectDays = KenosDomainRegistry.allowsAppleHealthDaysInjection(for: injectURL)
            let injectReadiness = KenosDomainRegistry.allowsHealthReadinessInjection(for: injectURL)
            let healthDaysJSON = injectDays ? KenosHealthSyncer.shared.injectionJSON() : "null"
            let readinessJSON = injectReadiness
                ? KenosHealthSyncer.shared.readinessInjectionJSON()
                : "null"
            let injectDaysJS = injectDays ? "true" : "false"
            let injectReadinessJS = injectReadiness ? "true" : "false"
            webView.evaluateJavaScript(
                """
                window.__KENOS_IOS_NATIVE_SHELL__=true;
                try {
                  document.documentElement.dataset.iosNativeShell='true';
                  sessionStorage.setItem('kenos.iosNativeShell','1');
                } catch (e) {}
                try {
                  if (\(injectDaysJS)) {
                    window.__KENOS_APPLE_HEALTH__ = \(healthDaysJSON);
                    window.dispatchEvent(new CustomEvent('kenos-apple-health', {
                      detail: window.__KENOS_APPLE_HEALTH__
                    }));
                  } else {
                    try { delete window.__KENOS_APPLE_HEALTH__; } catch (e2) {
                      window.__KENOS_APPLE_HEALTH__ = undefined;
                    }
                  }
                  var __kenosReadiness = \(readinessJSON);
                  if (\(injectReadinessJS) && __kenosReadiness != null) {
                    window.__KENOS_HEALTH_READINESS__ = __kenosReadiness;
                    window.dispatchEvent(new CustomEvent('kenos-health-readiness', {
                      detail: window.__KENOS_HEALTH_READINESS__
                    }));
                  } else if (!\(injectReadinessJS)) {
                    try { delete window.__KENOS_HEALTH_READINESS__; } catch (e3) {
                      window.__KENOS_HEALTH_READINESS__ = undefined;
                    }
                  }
                } catch (e) {}
                """
            )
            // Uncover after first paint — didFinish alone still flashes white.
            scheduleUncover(after: webView)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            loadRetryCount = 0
            beginProtectedNavigation(on: webView, freezePixels: false)
            KenosLog.breadcrumb("webview process terminated — reloading", category: .web, metadata: [
                "kind": "webview_terminate",
                "host": (loadedURL ?? webView.url)?.host ?? "",
                "path": (loadedURL ?? webView.url)?.path ?? "",
            ])
            KenosLog.error("webview process terminated — reloading", category: .web, metadata: [
                "kind": "webview_terminate",
                "host": (loadedURL ?? webView.url)?.host ?? "",
                "path": (loadedURL ?? webView.url)?.path ?? "",
            ])
            // Blank WebView recovery (Apple / Embrace guidance).
            if let url = loadedURL ?? webView.url {
                loadSeedingSSO(on: webView, url: url)
            }
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            if isCancelledNavigation(error) { return }
            uncoverIfCurrent(webView: webView)
            KenosLog.warning("webview didFail", category: .web, metadata: [
                "error": error.localizedDescription,
                "host": loadedURL?.host ?? "",
                "path": loadedURL?.path ?? "",
                "retry": String(loadRetryCount),
            ])
            scheduleLimitedRetry(on: webView, error: error)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            if isCancelledNavigation(error) { return }
            uncoverIfCurrent(webView: webView)
            KenosLog.warning("webview provisional fail", category: .web, metadata: [
                "error": error.localizedDescription,
                "host": loadedURL?.host ?? "",
                "path": loadedURL?.path ?? "",
                "retry": String(loadRetryCount),
            ])
            scheduleLimitedRetry(on: webView, error: error)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            guard let dest = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            // Custom scheme → AppModel (works in Domain Continuity stayInApp too).
            if dest.scheme?.lowercased() == "kenos" {
                DispatchQueue.main.async {
                    NotificationCenter.default.post(
                        name: .kenosHandleDeepLink,
                        object: dest.absoluteString
                    )
                }
                decisionHandler(.cancel)
                return
            }
            // Continuity cover (Plan/Training): keep http(s) in this WKWebView —
            // except tapped external sites, which would trap the user in a chrome-less surface.
            if stayInApp {
                if navigationAction.navigationType == .linkActivated,
                   dest.scheme?.hasPrefix("http") == true
                {
                    let destHost = (dest.host ?? "").lowercased()
                    let current = webView.url ?? loadedURL
                    let currentHost = (current?.host ?? "").lowercased()
                    let sameHost = !destHost.isEmpty && destHost == currentHost
                    if !sameHost,
                       !KenosDomainRegistry.isEmbeddedWebContinuityURL(dest),
                       !KenosAppBoundDomains.isProductionHost(destHost)
                    {
                        UIApplication.shared.open(dest)
                        decisionHandler(.cancel)
                        return
                    }
                }
                decisionHandler(.allow)
                return
            }
            guard dest.scheme?.hasPrefix("http") == true else {
                decisionHandler(.allow)
                return
            }

            let destHost = (dest.host ?? "").lowercased()
            let destPort = dest.port ?? defaultPort(for: dest)
            let current = webView.url ?? loadedURL
            let currentHost = (current?.host ?? "").lowercased()
            let currentPort = current.flatMap { $0.port ?? defaultPort(for: $0) }

            // Same-origin SPA navigations stay in this WKWebView (host + port).
            if let currentPort, currentHost == destHost, currentPort == destPort {
                decisionHandler(.allow)
                return
            }

            // Cross-origin Continuity → Domain Mode (covers window.location.assign).
            if KenosDomainRegistry.isEmbeddedWebContinuityURL(dest) {
                let openURL = Self.rewriteLoopback(dest, shellHost: loadedURL?.host)
                DispatchQueue.main.async {
                    NotificationCenter.default.post(
                        name: .kenosOpenDomainContinuity,
                        object: openURL
                    )
                }
                decisionHandler(.cancel)
                return
            }

            if navigationAction.navigationType == .linkActivated {
                let openURL = Self.rewriteLoopback(dest, shellHost: loadedURL?.host)
                UIApplication.shared.open(openURL)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        private func defaultPort(for url: URL) -> Int {
            if let port = url.port { return port }
            return (url.scheme?.lowercased() == "https") ? 443 : 80
        }

        static func rewriteLoopback(_ url: URL, shellHost: String?) -> URL {
            guard let shellHost,
                  url.host == "127.0.0.1" || url.host == "localhost",
                  shellHost != "127.0.0.1",
                  shellHost != "localhost",
                  var c = URLComponents(url: url, resolvingAgainstBaseURL: false)
            else { return url }
            c.host = shellHost
            return c.url ?? url
        }
    }
}

struct KenosDailyBetaSurface: View {
    let path: String
    var isActive: Bool = true
    /// Live Accessory height above Kenos dock (0 when absent).
    var accessoryBottomPadPx: Int = 0
    /// Defaults to `.kenosTabs`; Ask conversation uses `.kenosConversation` (dock hidden).
    var chrome: KenosWebChrome = .kenosTabs
    @State private var hardUnreachable = false
    @State private var syncPaused = false
    @State private var shellDidPaint = false
    @State private var loadProgress: Double = 0
    @State private var loadError: String?
    @State private var surfaceEpoch = 0
    @State private var originEpoch = 0

    private var url: URL { KenosDailyBetaConfig.pathURL(path) }

    private var shellProbeContext: KenosOfflineShellPolicy.ProbeContext {
        KenosOfflineShellPolicy.ProbeContext(
            didPaint: shellDidPaint,
            originHost: KenosDailyBetaConfig.kenOsOrigin.host,
            isLanDependent: KenosDailyBetaConfig.isLanDependentOrigin,
            useProductionOverride: KenosDailyBetaConfig.useProductionOverride
        )
    }

    private var showsUseProductionAction: Bool {
        KenosDailyBetaConfig.isConfiguredOriginLanDependent
            && !KenosDailyBetaConfig.useProductionOverride
    }

    var body: some View {
        // Optimistic: paint WKWebView immediately on the current chrome canvas —
        // never gate first frame behind a health probe (ProgressView was a flash).
        ZStack {
            KenosChromeAppearance.dark.canvasColor
            if !hardUnreachable {
                KenosWebSurfaceView(
                    url: url,
                    onTitle: { _ in
                        shellDidPaint = true
                        syncPaused = false
                        hardUnreachable = false
                    },
                    onProgress: { loadProgress = $0 },
                    onLoadFailed: { detail in
                        // Retries exhausted — show the banner path instead of a silent blank canvas.
                        loadError = detail
                        if !hardUnreachable { syncPaused = true }
                    },
                    chrome: chrome,
                    accessoryBottomPadPx: accessoryBottomPadPx,
                    isActive: isActive
                )
                .id("\(surfaceEpoch)-\(originEpoch)-\(url.host ?? "")")
            }

            if hardUnreachable {
                ContentUnavailableView {
                    Label(
                        KenosOfflineShellPolicy.unreachableTitle("Kenos"),
                        systemImage: "wifi.exclamationmark"
                    )
                } description: {
                    VStack(spacing: 8) {
                        Text(
                            KenosOfflineShellPolicy.hardGateShellDetail(
                                isLanDependent: KenosDailyBetaConfig.isLanDependentOrigin
                            )
                        )
                        if let loadError, !loadError.isEmpty {
                            Text(loadError).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } actions: {
                    if showsUseProductionAction {
                        Button(KenosOfflineShellPolicy.useProductionLabel, action: activateProductionFromShell)
                            .accessibilityIdentifier("kenos.shell.useProduction")
                    }
                    Button(KenosOfflineShellPolicy.retryLabel, action: retryShellOrigin)
                }
            }

            if syncPaused, !hardUnreachable {
                KenosShellSyncStatusBanner(
                    message: KenosOfflineShellPolicy.shellUnreachableDetail(
                        isLanDependent: KenosDailyBetaConfig.isLanDependentOrigin
                    ),
                    errorDetail: loadError,
                    showsUseProduction: showsUseProductionAction,
                    onUseProduction: activateProductionFromShell,
                    onRetry: retryShellOrigin
                )
            }

            if isActive, !hardUnreachable {
                VStack {
                    KenosLoadProgressBar(
                        progress: loadProgress,
                        accent: KenosAppModel.accentColor(for: "kenos")
                    )
                    .padding(.top, 0)
                    Spacer(minLength: 0)
                }
                .safeAreaPadding(.top, 0)
                .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(KenosChromeAppearance.dark.canvasColor.ignoresSafeArea())
        .ignoresSafeArea(.container, edges: [.top, .bottom])
        .ignoresSafeArea()
        .task(id: "\(originEpoch)-\(KenosDailyBetaConfig.kenOsOrigin.absoluteString)") {
            await probeInBackground()
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosDailyBetaOriginDidChange)) { _ in
            KenosWebRuntime.invalidateReachability()
            shellDidPaint = false
            loadError = nil
            syncPaused = false
            hardUnreachable = false
            originEpoch &+= 1
            surfaceEpoch &+= 1
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosWebAuthDidClear)) { _ in
            shellDidPaint = false
            surfaceEpoch &+= 1
        }
    }

    private func activateProductionFromShell() {
        KenosWebRuntime.invalidateReachability()
        _ = KenosDailyBetaConfig.activateProductionFallback(
            reason: "shell_manual",
            force: true
        )
        shellDidPaint = false
        loadError = nil
        syncPaused = false
        hardUnreachable = false
        surfaceEpoch &+= 1
        originEpoch &+= 1
    }

    private func retryShellOrigin() {
        KenosWebRuntime.invalidateReachability()
        if KenosDailyBetaConfig.useProductionOverride,
           KenosDailyBetaConfig.isConfiguredOriginLanDependent
        {
            KenosDailyBetaConfig.retryLanOrigin()
            originEpoch &+= 1
        }
        shellDidPaint = false
        loadError = nil
        syncPaused = false
        hardUnreachable = false
        surfaceEpoch &+= 1
    }

    /// Soft health check. Never steals a canvas that already painted.
    private func probeInBackground() async {
        if KenosWebRuntime.dailyBetaReachable { return }
        let origin = KenosDailyBetaConfig.kenOsOrigin
        KenosLog.debug("shell health probe", category: .network, metadata: [
            "host": origin.host ?? "",
            "productionOverride": KenosDailyBetaConfig.useProductionOverride ? "1" : "0",
        ])
        var req = URLRequest(url: origin.appending(path: "/__health"))
        req.timeoutInterval = 3
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            // Production may not expose /__health — any HTTP answer counts as reachable.
            let ok = (200..<500).contains(code)
            KenosLog.info("shell health probe result", category: .network, metadata: [
                "host": origin.host ?? "",
                "status": String(code),
                "ok": ok ? "1" : "0",
            ])
            await MainActor.run {
                KenosWebRuntime.dailyBetaReachable = ok
                if ok {
                    syncPaused = false
                    hardUnreachable = false
                    loadError = nil
                }
            }
            if !ok {
                await handleShellProbeFailure()
            }
        } catch {
            KenosLog.warning("shell health probe failed", category: .network, metadata: [
                "host": origin.host ?? "",
                "error": error.localizedDescription,
            ])
            // Production root fallback when /__health missing / blocked.
            if KenosDailyBetaConfig.useProductionOverride || !KenosDailyBetaConfig.isLanDependentOrigin {
                var rootReq = URLRequest(url: origin)
                rootReq.timeoutInterval = 3
                if let (_, resp) = try? await URLSession.shared.data(for: rootReq),
                   let code = (resp as? HTTPURLResponse)?.statusCode,
                   (200..<500).contains(code)
                {
                    await MainActor.run {
                        KenosWebRuntime.dailyBetaReachable = true
                        syncPaused = false
                        hardUnreachable = false
                        loadError = nil
                    }
                    return
                }
            }
            await MainActor.run {
                KenosWebRuntime.dailyBetaReachable = false
                loadError = error.localizedDescription
            }
            await handleShellProbeFailure()
        }
    }

    private func handleShellProbeFailure() async {
        try? await Task.sleep(nanoseconds: 900_000_000)
        let painted = await MainActor.run { shellDidPaint }
        guard !painted else { return }

        // Already on production and it failed (DNS / offline) → recover to configured LAN.
        let recoverLan = await MainActor.run { () -> Bool in
            KenosDailyBetaConfig.useProductionOverride
                && KenosDailyBetaConfig.isConfiguredOriginLanDependent
        }
        if recoverLan {
            await MainActor.run {
                KenosLog.warning("production shell unreachable — retry LAN", category: .network, metadata: [
                    "host": KenosDailyBetaConfig.productionKenOsOrigin.host ?? "",
                    "lan": KenosDailyBetaConfig.configuredLanOrigin.host ?? "",
                ])
                KenosWebRuntime.invalidateReachability()
                KenosDailyBetaConfig.retryLanOrigin()
                loadError = nil
                syncPaused = false
                hardUnreachable = false
                originEpoch &+= 1
                surfaceEpoch &+= 1
            }
            return
        }

        // Auto fallback only when production actually answers — never stick on dead DNS.
        if await MainActor.run(body: { KenosDailyBetaConfig.isLanDependentOrigin }),
           await KenosDailyBetaConfig.activateProductionFallbackIfReachable(reason: "shell_probe_failed")
        {
            await MainActor.run {
                KenosWebRuntime.invalidateReachability()
                loadError = nil
                syncPaused = false
                hardUnreachable = false
                originEpoch &+= 1
                surfaceEpoch &+= 1
            }
            return
        }

        let ctx = await MainActor.run { shellProbeContext }
        await MainActor.run {
            if KenosOfflineShellPolicy.shouldUseHardUnavailableGate(ctx) {
                hardUnreachable = true
                syncPaused = false
            } else {
                syncPaused = true
                hardUnreachable = false
            }
        }
    }
}
#else
import Foundation
import SwiftUI

extension Notification.Name {
    static let kenosOpenDomainContinuity = Notification.Name("kenosOpenDomainContinuity")
    static let kenosHandleDeepLink = Notification.Name("kenosHandleDeepLink")
}

/// macOS stub — reachability cache shared with Settings Retry LAN / origin save.
enum KenosWebRuntime {
    @MainActor static var dailyBetaReachable = false
    @MainActor static var domainReachableKeys: Set<String> = []

    @MainActor
    static func originKey(for url: URL) -> String {
        let host = url.host ?? ""
        let port = url.port ?? ((url.scheme?.lowercased() == "https") ? 443 : 80)
        return "\(host):\(port)"
    }

    @MainActor
    static func invalidateReachability() {
        dailyBetaReachable = false
        domainReachableKeys.removeAll()
    }

    @MainActor
    static func warmWebContentProcessIfNeeded() {}

    @MainActor
    static var didWarmWebContentProcess: Bool { false }

    @MainActor
    static var warmupUsesDefaultDataStore: Bool { false }

    @MainActor
    static func recoverAfterForeground() {}
}

struct KenosDailyBetaSurface: View {
    let path: String
    var isActive: Bool = true
    var accessoryBottomPadPx: Int = 0
    var body: some View { EmptyView() }
}
#endif
