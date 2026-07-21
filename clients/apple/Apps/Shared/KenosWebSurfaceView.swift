import SwiftUI
import WebKit

#if os(iOS)
extension Notification.Name {
    /// Posted when shell WKWebView wants domain Continuity in-app (not Safari).
    static let kenosOpenDomainContinuity = Notification.Name("kenosOpenDomainContinuity")
    /// Posted when WKWebView navigates to `kenos://…` (including Domain stayInApp).
    static let kenosHandleDeepLink = Notification.Name("kenosHandleDeepLink")
}

/// Native chrome the web canvas scrolls under (iOS 26 Liquid Glass).
enum KenosWebChrome: String {
    /// Kenos Mode — system TabView; page title+actions scroll in web content.
    case kenosTabs
    /// Domain Mode — custom Domain Dock + title chip float over content.
    case domainDock
    /// Focus / Summary — no floating native chrome (immersive).
    case none

    /// Status-bar clearance — same for Kenos Mode + Domain (Music header scrolls in-page).
    var topPadPx: Int {
        switch self {
        case .kenosTabs, .domainDock: return 54
        case .none: return 0
        }
    }

    /// Dock clearance above home indicator — same KenosGlobalDock geometry in both modes.
    var bottomPadPx: Int {
        switch self {
        case .kenosTabs, .domainDock: return 80
        case .none: return 24
        }
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
    /// Which floating chrome the page must clear with scroll padding.
    var chrome: KenosWebChrome = .kenosTabs

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onTitle: onTitle,
            stayInApp: stayInApp,
            onCanGoBackChange: onCanGoBackChange,
            onURLChange: onURLChange
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let topPad = chrome.topPadPx
        let bottomPad = chrome.bottomPadPx
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
                "}",
                "html[data-ios-native-shell='true'] .bottom-nav-host,",
                "html[data-ios-native-shell='true'] nav.bottom-nav,",
                "html[data-ios-native-shell='true'] .bottom-shell,",
                "html[data-ios-native-shell='true'] [data-testid='aios-shell-bottom-nav'],",
                "html[data-ios-native-shell='true'] [data-testid='fitness-shell-bottom-nav'],",
                "html[data-ios-native-shell='true'] .kenos-system-bar,",
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
                /* ONE scroll-root pad only — never nest .app-shell + .main-col + workspace. */
                "html[data-ios-native-shell='true'] #main-content,",
                "html[data-ios-native-shell='true'] .life-os-app-shell__main,",
                "html[data-ios-native-shell='true'] .main-col{",
                "padding-top:\(topPad)px!important;",
                "padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;",
                "padding-left:0!important;",
                "padding-right:0!important;",
                "box-sizing:border-box!important;",
                "}",
                /* Nested shells must not stack another 54/80. */
                "html[data-ios-native-shell='true'] .app-shell,",
                "html[data-ios-native-shell='true'] .life-os-app-shell,",
                "html[data-ios-native-shell='true'] .life-os-page-workspace,",
                "html[data-ios-native-shell='true'] .page{",
                "padding-top:0!important;",
                "padding-bottom:0!important;",
                "}",
                /* Planner FAB — hide on native shell; compose lives in DomainMusicHeader. */
                "html[data-ios-native-shell='true'] .fab{",
                "display:none!important;",
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
              function report() {
                try {
                  var href = String(location.href || '');
                  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kenosPath) {
                    window.webkit.messageHandlers.kenosPath.postMessage(href);
                  }
                } catch (e) {}
              }
              var _push = history.pushState;
              var _replace = history.replaceState;
              history.pushState = function () {
                var r = _push.apply(this, arguments);
                report();
                return r;
              };
              history.replaceState = function () {
                var r = _replace.apply(this, arguments);
                report();
                return r;
              };
              window.addEventListener('popstate', report);
              document.addEventListener('DOMContentLoaded', report);
              report();
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(pathHook)
        config.userContentController.add(context.coordinator, name: "kenosPath")

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
        let ink = UIColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1)
        view.backgroundColor = ink
        view.scrollView.backgroundColor = ink
        view.underPageBackgroundColor = ink
        view.load(URLRequest(url: Self.shellURL(url)))
        context.coordinator.webView = view
        context.coordinator.loadedURL = Self.shellURL(url)
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
        // Keep scroll padding in sync when Focus hides/shows Domain dock —
        // skip when pads unchanged (dock tab switches spam updateUIView).
        let topPad = chrome.topPadPx
        let bottomPad = chrome.bottomPadPx
        if context.coordinator.lastChromeRaw != chrome.rawValue
            || context.coordinator.lastTopPad != topPad
            || context.coordinator.lastBottomPad != bottomPad
        {
            context.coordinator.lastChromeRaw = chrome.rawValue
            context.coordinator.lastTopPad = topPad
            context.coordinator.lastBottomPad = bottomPad
            uiView.evaluateJavaScript(
                """
                try {
                  document.documentElement.dataset.kenosWebChrome = '\(chrome.rawValue)';
                  var s = document.getElementById('kenos-ios-native-shell-css');
                  if (s && s.textContent) {
                    s.textContent = s.textContent
                      .replace(/padding-top:\\d+px!important;/g, 'padding-top:\(topPad)px!important;')
                      .replace(/padding-bottom:calc\\(env\\(safe-area-inset-bottom,0px\\) \\+ \\d+px\\)!important;/g,
                        'padding-bottom:calc(env(safe-area-inset-bottom,0px) + \(bottomPad)px)!important;');
                  }
                } catch (e) {}
                """
            )
        }
        let next = Self.shellURL(url)
        if stayInApp {
            // Domain Continuity: SPA owns path. Only hard-reload when origin changes
            // or native dock pushes a different path than the live WebView.
            let live = uiView.url ?? context.coordinator.loadedURL
            let liveOrigin = live.map(Self.originKey)
            let nextOrigin = Self.originKey(next)
            let livePath = (live?.path ?? "").lowercased()
            let nextPath = next.path.lowercased()
            let nativePathJump = liveOrigin == nextOrigin && livePath != nextPath
                && context.coordinator.lastNativePath != nextPath
            if liveOrigin != nextOrigin || nativePathJump {
                // Freeze last-known pixels so cross-origin Continuity doesn't white-flash.
                if liveOrigin != nextOrigin {
                    context.coordinator.installFreezeOverlay(on: uiView)
                }
                context.coordinator.loadedURL = next
                context.coordinator.lastNativePath = nextPath
                uiView.load(URLRequest(url: next))
            }
        } else if context.coordinator.loadedURL?.absoluteString != next.absoluteString {
            context.coordinator.installFreezeOverlay(on: uiView)
            context.coordinator.loadedURL = next
            uiView.load(URLRequest(url: next))
        }
        context.coordinator.publishCanGoBack()
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
        weak var webView: WKWebView?
        var loadedURL: URL?
        /// Last path loaded because native dock requested it (vs SPA self-nav).
        var lastNativePath: String = ""
        /// Last applied chrome pads — avoid JS on every SwiftUI refresh.
        var lastChromeRaw: String = ""
        var lastTopPad: Int = -1
        var lastBottomPad: Int = -1

        private static let freezeOverlayTag = 0x4B46525A // KFRZ

        init(
            onTitle: ((String) -> Void)?,
            stayInApp: Bool,
            onCanGoBackChange: ((Bool) -> Void)?,
            onURLChange: ((URL) -> Void)?
        ) {
            self.onTitle = onTitle
            self.stayInApp = stayInApp
            self.onCanGoBackChange = onCanGoBackChange
            self.onURLChange = onURLChange
        }

        /// Keep last-painted Continuity pixels while the next origin loads.
        func installFreezeOverlay(on webView: WKWebView) {
            removeFreezeOverlay(from: webView)
            guard let snap = webView.snapshotView(afterScreenUpdates: false) else { return }
            snap.tag = Self.freezeOverlayTag
            snap.frame = webView.bounds
            snap.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            snap.isUserInteractionEnabled = false
            webView.addSubview(snap)
        }

        func removeFreezeOverlay(from webView: WKWebView) {
            webView.viewWithTag(Self.freezeOverlayTag)?.removeFromSuperview()
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "kenosPath" else { return }
            let href = (message.body as? String) ?? ""
            guard let url = URL(string: href), url.scheme?.hasPrefix("http") == true else { return }
            loadedURL = url
            DispatchQueue.main.async { [onURLChange] in
                onURLChange?(url)
            }
            publishCanGoBack()
        }

        func publishCanGoBack() {
            let value = webView?.canGoBack ?? false
            DispatchQueue.main.async { [onCanGoBackChange] in
                onCanGoBackChange?(value)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            removeFreezeOverlay(from: webView)
            onTitle?(webView.title ?? "")
            publishCanGoBack()
            if let live = webView.url {
                loadedURL = live
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
            webView.evaluateJavaScript(
                """
                window.__KENOS_IOS_NATIVE_SHELL__=true;
                try {
                  document.documentElement.dataset.iosNativeShell='true';
                  sessionStorage.setItem('kenos.iosNativeShell','1');
                } catch (e) {}
                """
            )
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            removeFreezeOverlay(from: webView)
            // Blank WebView recovery (Apple / Embrace guidance).
            if let url = loadedURL ?? webView.url {
                webView.load(URLRequest(url: url))
            }
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            removeFreezeOverlay(from: webView)
            // Transient ATS / network — one retry
            if let url = loadedURL {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    webView.load(URLRequest(url: url))
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            removeFreezeOverlay(from: webView)
            if let url = loadedURL {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    webView.load(URLRequest(url: url))
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
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
            // Continuity cover (Plan/Training): keep http(s) in this WKWebView.
            if stayInApp {
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
    @State private var unreachable = false
    @State private var checking = true
    @State private var loadError: String?

    private var url: URL { KenosDailyBetaConfig.pathURL(path) }
    private let ink = Color(red: 0.031, green: 0.035, blue: 0.039)

    var body: some View {
        Group {
            if checking {
                ProgressView("Connecting to Kenos…")
                    .task { await probe() }
            } else if unreachable {
                ContentUnavailableView {
                    Label("Kenos unreachable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("Open Settings to set your Mac Daily Beta LAN address (not 127.0.0.1). Mac must be on and kenos-start healthy.\n\nOn iOS 17+, HTTP to LAN IPs also needs ATS local exceptions (bundled).")
                } actions: {
                    Button("Retry") {
                        checking = true
                        unreachable = false
                    }
                }
            } else {
                // iOS 26 Liquid Glass TabView: content must extend under the floating
                // tab bar + tools (Donny Wals / Apple). No NavigationStack inset.
                ZStack {
                    ink
                    KenosWebSurfaceView(url: url, chrome: .kenosTabs)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(.container, edges: [.top, .bottom])
                .ignoresSafeArea()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ink.ignoresSafeArea())
        // No navigationBar modifiers — Kenos Mode Daily Beta has no NavigationStack.
    }

    private func probe() async {
        var req = URLRequest(url: KenosDailyBetaConfig.kenOsOrigin.appending(path: "/__health"))
        req.timeoutInterval = 3
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let ok = (resp as? HTTPURLResponse)?.statusCode == 200
            await MainActor.run {
                unreachable = !ok
                checking = false
            }
        } catch {
            await MainActor.run {
                unreachable = true
                checking = false
                loadError = error.localizedDescription
            }
        }
    }
}
#else
struct KenosDailyBetaSurface: View {
    let path: String
    var body: some View { EmptyView() }
}
#endif
