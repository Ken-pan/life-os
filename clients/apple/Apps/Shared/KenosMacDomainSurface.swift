#if os(macOS)
import AppKit
import SwiftUI
import WebKit

extension Notification.Name {
    /// Posted by KenosMac commands (⌘R) to reload the active shell / Continuity WK.
    static let kenosMacReloadWeb = Notification.Name("kenosMacReloadWeb")
}

// MARK: - Shell (Today / Assistant / Inbox)

/// Kenos Mode Daily Beta surface — AIOS shell in-app; domain links flip to Continuity.
struct KenosMacShellSurface: View {
    @ObservedObject var model: KenosAppModel
    let path: String
    @State private var pageTitle = ""
    @State private var loadProgress: Double = 0
    @State private var loadError: String?
    @State private var surfaceEpoch = 0

    private var url: URL {
        KenosDailyBetaConfig.pathURL(path)
    }

    var body: some View {
        ZStack {
            KenosMacWebSurfaceView(
                url: url,
                stayInApp: false,
                reloadToken: surfaceEpoch,
                onTitle: { pageTitle = $0 },
                onProgress: { loadProgress = $0 },
                onURLChange: { live in
                    model.syncMacSidebarFromShellURL(live)
                    // Cross-origin Continuity is handled by navigation policy → Domain Mode.
                    if KenosDomainRegistry.isEmbeddedWebContinuityURL(live)
                        || live.path.hasPrefix("/work")
                        || live.path.hasPrefix("/spaces/work")
                    {
                        model.enterDomainMode(url: live)
                    }
                },
                onLoadError: { message in
                    loadError = message
                },
                onLoadSuccess: {
                    loadError = nil
                }
            )
            .opacity(loadError == nil ? 1 : 0)

            if let errorMessage = loadError {
                ContentUnavailableView {
                    Label("Shell unreachable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                    Text(url.absoluteString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } actions: {
                    Button("Retry") {
                        loadError = nil
                        surfaceEpoch &+= 1
                        KenosWebRuntime.invalidateReachability()
                    }
                    .buttonStyle(.borderedProminent)
                    Button("Use Production") {
                        _ = KenosDailyBetaConfig.activateProductionFallback(
                            reason: "mac_shell_unreachable",
                            force: true
                        )
                        loadError = nil
                        surfaceEpoch &+= 1
                    }
                    Button("Native fallback") {
                        // Force-disable Daily Beta for this session via UserDefaults.
                        UserDefaults.standard.set(false, forKey: KenosDailyBetaConfig.enabledDefaultsKey)
                        KenosWebRuntime.invalidateReachability()
                        model.objectWillChange.send()
                    }
                }
                .accessibilityIdentifier("kenos.mac.shell.unreachable")
            }
        }
        .overlay(alignment: .top) {
            if loadProgress > 0, loadProgress < 1, loadError == nil {
                ProgressView(value: loadProgress)
                    .progressViewStyle(.linear)
                    .frame(height: 2)
            }
        }
        .navigationTitle(pageTitle.isEmpty ? shellTitle : pageTitle)
        .onReceive(NotificationCenter.default.publisher(for: .kenosMacReloadWeb)) { _ in
            loadError = nil
            surfaceEpoch &+= 1
        }
        .accessibilityIdentifier("kenos.mac.shell.surface")
    }

    private var shellTitle: String {
        switch model.macSidebarSelection {
        case .assistant: return "Ask"
        case .inbox: return "Inbox"
        default: return "Today"
        }
    }
}

// MARK: - Domain Continuity

/// Mac Domain Continuity — sidebar selection + detail WKWebView (not iOS Domain Dock).
struct KenosMacDomainSurface: View {
    @ObservedObject var model: KenosAppModel
    @State private var pageTitle = ""
    @State private var canGoBack = false
    @State private var canGoForward = false
    @State private var loadProgress: Double = 0
    @State private var loadError: String?
    @State private var webViewRef: WKWebView?
    @State private var reloadToken = 0

    private var domainId: String {
        KenosDomainRegistry.domainId(fromContinuity: model.continuityURL)
    }

    private var domainLabel: String {
        KenosDomainRegistry.definition(for: domainId)?.label ?? "Space"
    }

    private var domainAccent: Color {
        KenosDomainRegistry.accentColor(for: domainId)
    }

    var body: some View {
        ZStack {
            if let url = model.continuityURL {
                KenosMacWebSurfaceView(
                    url: url,
                    stayInApp: true,
                    reloadToken: reloadToken,
                    onTitle: { pageTitle = $0 },
                    onCanGoBackChange: { canGoBack = $0 },
                    onCanGoForwardChange: { canGoForward = $0 },
                    onProgress: { loadProgress = $0 },
                    onURLChange: { live in
                        model.syncDomainDockSlot(for: live)
                        if model.continuityURL != live {
                            model.continuityURL = live
                            model.persistDomainContinuityPublic(live)
                        }
                        model.syncMacSidebarFromContinuity()
                    },
                    onWebView: { webViewRef = $0 },
                    onLoadError: { message in
                        loadError = message
                    },
                    onLoadSuccess: {
                        loadError = nil
                    }
                )
                .opacity(loadError == nil ? 1 : 0)
            } else {
                ContentUnavailableView(
                    "No Continuity URL",
                    systemImage: "safari",
                    description: Text("Pick a Space from the sidebar.")
                )
            }

            if let errorMessage = loadError {
                ContentUnavailableView {
                    Label("\(domainLabel) unreachable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Retry") {
                        loadError = nil
                        reloadToken &+= 1
                    }
                    .buttonStyle(.borderedProminent)
                    Button("Use Production") {
                        _ = KenosDailyBetaConfig.activateProductionFallback(
                            reason: "mac_domain_unreachable",
                            force: true
                        )
                        if let next = model.continuityURL.flatMap({ KenosDomainRegistry.rewriteToProduction($0) }) {
                            model.enterDomainMode(url: next)
                        }
                        loadError = nil
                        reloadToken &+= 1
                    }
                    Button("Open in Browser") {
                        if let url = model.continuityURL {
                            NSWorkspace.shared.open(url)
                        }
                    }
                }
                .accessibilityIdentifier("kenos.mac.domain.unreachable")
            }
        }
        .overlay(alignment: .top) {
            if loadProgress > 0, loadProgress < 1, loadError == nil {
                ProgressView(value: loadProgress)
                    .progressViewStyle(.linear)
                    .tint(domainAccent)
                    .frame(height: 2)
            }
        }
        .navigationTitle(pageTitle.isEmpty ? domainLabel : pageTitle)
        .toolbar {
            ToolbarItemGroup(placement: .navigation) {
                Button {
                    webViewRef?.goBack()
                } label: {
                    Label("Back", systemImage: "chevron.backward")
                }
                .disabled(!canGoBack)
                .keyboardShortcut("[", modifiers: [.command])
                .accessibilityIdentifier("kenos.mac.domain.back")

                Button {
                    webViewRef?.goForward()
                } label: {
                    Label("Forward", systemImage: "chevron.forward")
                }
                .disabled(!canGoForward)
                .keyboardShortcut("]", modifiers: [.command])
                .accessibilityIdentifier("kenos.mac.domain.forward")

                Button {
                    loadError = nil
                    reloadToken &+= 1
                    webViewRef?.reload()
                } label: {
                    Label("Reload", systemImage: "arrow.clockwise")
                }
                .keyboardShortcut("r", modifiers: [.command])
                .accessibilityIdentifier("kenos.mac.domain.reload")

                Button {
                    model.returnToKenosFromDomain()
                    model.selectMacSidebar(.today)
                } label: {
                    Label("Kenos", systemImage: "circle.grid.2x2.fill")
                }
                .accessibilityIdentifier("kenos.mac.domain.leave")
            }
            ToolbarItem(placement: .primaryAction) {
                if let url = model.continuityURL {
                    Button {
                        NSWorkspace.shared.open(url)
                    } label: {
                        Label("Open in Browser", systemImage: "safari")
                    }
                    .accessibilityIdentifier("kenos.mac.domain.openBrowser")
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosMacReloadWeb)) { _ in
            loadError = nil
            reloadToken &+= 1
            webViewRef?.reload()
        }
        .accessibilityIdentifier("kenos.mac.domain.surface")
    }
}

// MARK: - Shared WKWebView

/// AppKit WKWebView Continuity / shell surface for KenosMac.
struct KenosMacWebSurfaceView: NSViewRepresentable {
    let url: URL
    var stayInApp: Bool = true
    /// Bump to force a hard reload (Retry / origin flip).
    var reloadToken: Int = 0
    var onTitle: ((String) -> Void)? = nil
    var onCanGoBackChange: ((Bool) -> Void)? = nil
    var onCanGoForwardChange: ((Bool) -> Void)? = nil
    var onProgress: ((Double) -> Void)? = nil
    var onURLChange: ((URL) -> Void)? = nil
    var onWebView: ((WKWebView) -> Void)? = nil
    var onLoadError: ((String) -> Void)? = nil
    var onLoadSuccess: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(
            stayInApp: stayInApp,
            onTitle: onTitle,
            onCanGoBackChange: onCanGoBackChange,
            onCanGoForwardChange: onCanGoForwardChange,
            onProgress: onProgress,
            onURLChange: onURLChange,
            onLoadError: onLoadError,
            onLoadSuccess: onLoadSuccess
        )
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        if stayInApp {
            config.mediaTypesRequiringUserActionForPlayback = []
        }

        let userContent = config.userContentController
        let shellScript = WKUserScript(
            source: """
            window.__KENOS_MAC_NATIVE_SHELL__ = true;
            window.__KENOS_IOS_NATIVE_SHELL__ = true;
            try {
              document.documentElement.dataset.macNativeShell = 'true';
              document.documentElement.dataset.iosNativeShell = 'true';
              sessionStorage.setItem('kenos.iosNativeShell', '1');
              sessionStorage.setItem('kenos.macNativeShell', '1');
            } catch (e) {}
            \(KenosMacNativeBridge.bootstrapScript)
            (function () {
              var s = document.getElementById('kenos-mac-native-shell-css');
              if (!s) {
                s = document.createElement('style');
                s.id = 'kenos-mac-native-shell-css';
                (document.head || document.documentElement).appendChild(s);
              }
              s.textContent = [
                "html[data-mac-native-shell='true'] .bottom-nav-host,",
                "html[data-mac-native-shell='true'] nav.bottom-nav,",
                "html[data-mac-native-shell='true'] .bottom-shell,",
                "html[data-mac-native-shell='true'] [data-testid='aios-shell-bottom-nav'],",
                "html[data-mac-native-shell='true'] [data-testid='fitness-shell-bottom-nav'],",
                "html[data-mac-native-shell='true'] .kenos-system-bar{",
                "display:none!important;height:0!important;visibility:hidden!important;pointer-events:none!important;",
                "}",
                "html[data-mac-native-shell='true'],",
                "html[data-mac-native-shell='true'] body{",
                "background:#08090a!important;",
                "}"
              ].join('');
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        userContent.addUserScript(shellScript)
        let weakNative = KenosWeakScriptHandler(target: context.coordinator)
        userContent.add(weakNative, name: "kenosNative")
        context.coordinator.retainHandlers.append(weakNative)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = NSColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1)
        context.coordinator.webView = webView
        context.coordinator.observeProgress(on: webView)
        context.coordinator.load(url, in: webView)
        context.coordinator.lastReloadToken = reloadToken
        onWebView?(webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.stayInApp = stayInApp
        context.coordinator.onTitle = onTitle
        context.coordinator.onCanGoBackChange = onCanGoBackChange
        context.coordinator.onCanGoForwardChange = onCanGoForwardChange
        context.coordinator.onProgress = onProgress
        context.coordinator.onURLChange = onURLChange
        context.coordinator.onLoadError = onLoadError
        context.coordinator.onLoadSuccess = onLoadSuccess
        onWebView?(webView)
        if context.coordinator.lastReloadToken != reloadToken {
            context.coordinator.lastReloadToken = reloadToken
            context.coordinator.load(url, in: webView)
            return
        }
        context.coordinator.loadIfNeeded(url, in: webView)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var stayInApp: Bool
        var onTitle: ((String) -> Void)?
        var onCanGoBackChange: ((Bool) -> Void)?
        var onCanGoForwardChange: ((Bool) -> Void)?
        var onProgress: ((Double) -> Void)?
        var onURLChange: ((URL) -> Void)?
        var onLoadError: ((String) -> Void)?
        var onLoadSuccess: (() -> Void)?
        weak var webView: WKWebView?
        var retainHandlers: [KenosWeakScriptHandler] = []
        var lastReloadToken: Int = 0
        private var loadedURL: URL?
        private var progressObservation: NSKeyValueObservation?
        private var canGoBackObservation: NSKeyValueObservation?
        private var canGoForwardObservation: NSKeyValueObservation?

        init(
            stayInApp: Bool,
            onTitle: ((String) -> Void)?,
            onCanGoBackChange: ((Bool) -> Void)?,
            onCanGoForwardChange: ((Bool) -> Void)?,
            onProgress: ((Double) -> Void)?,
            onURLChange: ((URL) -> Void)?,
            onLoadError: ((String) -> Void)?,
            onLoadSuccess: (() -> Void)?
        ) {
            self.stayInApp = stayInApp
            self.onTitle = onTitle
            self.onCanGoBackChange = onCanGoBackChange
            self.onCanGoForwardChange = onCanGoForwardChange
            self.onProgress = onProgress
            self.onURLChange = onURLChange
            self.onLoadError = onLoadError
            self.onLoadSuccess = onLoadSuccess
        }

        deinit {
            progressObservation?.invalidate()
            canGoBackObservation?.invalidate()
            canGoForwardObservation?.invalidate()
        }

        func observeProgress(on webView: WKWebView) {
            progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
                let value = view.estimatedProgress
                DispatchQueue.main.async { self?.onProgress?(value) }
            }
            canGoBackObservation = webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
                let value = view.canGoBack
                DispatchQueue.main.async { self?.onCanGoBackChange?(value) }
            }
            canGoForwardObservation = webView.observe(\.canGoForward, options: [.new]) { [weak self] view, _ in
                let value = view.canGoForward
                DispatchQueue.main.async { self?.onCanGoForwardChange?(value) }
            }
        }

        func load(_ url: URL, in webView: WKWebView) {
            loadedURL = url
            webView.load(URLRequest(url: url))
        }

        func loadIfNeeded(_ url: URL, in webView: WKWebView) {
            guard loadedURL != url else { return }
            // Same-origin path soft-nav via SPA when possible.
            if let current = webView.url ?? loadedURL,
               current.host == url.host,
               (current.port ?? defaultPort(for: current)) == (url.port ?? defaultPort(for: url))
            {
                if current.path != url.path || current.query != url.query || current.fragment != url.fragment {
                    let js = "window.location.assign(\(Self.jsString(url.absoluteString)))"
                    webView.evaluateJavaScript(js, completionHandler: nil)
                    loadedURL = url
                    return
                }
                loadedURL = url
                return
            }
            load(url, in: webView)
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "kenosNative" else { return }
            KenosMacNativeBridge.handleMessage(body: message.body, webView: webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            onTitle?(webView.title ?? "")
            onCanGoBackChange?(webView.canGoBack)
            onCanGoForwardChange?(webView.canGoForward)
            if let live = webView.url {
                loadedURL = live
                onURLChange?(live)
            }
            onLoadSuccess?()
            webView.evaluateJavaScript(
                """
                window.__KENOS_MAC_NATIVE_SHELL__=true;
                window.__KENOS_IOS_NATIVE_SHELL__=true;
                try {
                  document.documentElement.dataset.macNativeShell='true';
                  document.documentElement.dataset.iosNativeShell='true';
                } catch (e) {}
                """,
                completionHandler: nil
            )
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            if let url = loadedURL ?? webView.url {
                webView.load(URLRequest(url: url))
            }
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            reportLoadError(error)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            reportLoadError(error)
        }

        private func reportLoadError(_ error: Error) {
            let ns = error as NSError
            if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
            DispatchQueue.main.async { [onLoadError] in
                onLoadError?(error.localizedDescription)
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
            if stayInApp {
                decisionHandler(.allow)
                return
            }
            // Shell mode: domain Continuity leaves this WK for Domain Mode.
            if dest.scheme?.hasPrefix("http") == true,
               (KenosDomainRegistry.isEmbeddedWebContinuityURL(dest)
                || dest.path.hasPrefix("/work")
                || dest.path.hasPrefix("/spaces/work"))
            {
                // Same AIOS origin /work stays Continuity (Domain Mode).
                let openURL = dest
                DispatchQueue.main.async {
                    NotificationCenter.default.post(name: .kenosOpenDomainContinuity, object: openURL)
                }
                decisionHandler(.cancel)
                return
            }
            if navigationAction.navigationType == .linkActivated,
               dest.scheme?.hasPrefix("http") == true
            {
                let current = webView.url ?? loadedURL
                let sameOrigin = current.map {
                    ($0.host ?? "") == (dest.host ?? "")
                        && ($0.port ?? defaultPort(for: $0)) == (dest.port ?? defaultPort(for: dest))
                } ?? false
                if sameOrigin {
                    decisionHandler(.allow)
                    return
                }
                NSWorkspace.shared.open(dest)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        private func defaultPort(for url: URL) -> Int {
            if let port = url.port { return port }
            return (url.scheme?.lowercased() == "https") ? 443 : 80
        }

        private static func jsString(_ value: String) -> String {
            let escaped = value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            return "'\(escaped)'"
        }
    }
}

// MARK: - Native bridge

/// Minimal JS ↔ Native bridge for Mac Continuity (getCapabilities / openContinuity / navManifest).
@MainActor
enum KenosMacNativeBridge {
    static let bootstrapScript = """
    (function () {
      if (window.__KENOS_NATIVE_BRIDGE_BOOT__) return;
      window.__KENOS_NATIVE_BRIDGE_BOOT__ = true;
      var pending = Object.create(null);
      var seq = 0;
      function call(method, params) {
        return new Promise(function (resolve, reject) {
          try {
            var handlers = window.webkit && window.webkit.messageHandlers;
            if (!handlers || !handlers.kenosNative) {
              reject({ code: 'native_bridge_unavailable', message: 'kenosNative handler missing' });
              return;
            }
            var id = 'n' + (++seq) + '_' + Date.now();
            pending[id] = { resolve: resolve, reject: reject };
            handlers.kenosNative.postMessage({ id: id, method: method, params: params || {} });
            setTimeout(function () {
              if (!pending[id]) return;
              delete pending[id];
              reject({ code: 'native_bridge_timeout', message: 'Timed out: ' + method });
            }, 15000);
          } catch (e) {
            reject({ code: 'native_bridge_error', message: String(e && e.message || e) });
          }
        });
      }
      window.__KENOS_NATIVE_BRIDGE__ = {
        resolve: function (id, result) {
          var p = pending[id];
          if (!p) return;
          delete pending[id];
          p.resolve(result);
        },
        reject: function (id, error) {
          var p = pending[id];
          if (!p) return;
          delete pending[id];
          p.reject(error || { code: 'native_bridge_reject', message: 'rejected' });
        },
        call: call
      };
      window.kenosNative = {
        getCapabilities: function () { return call('getCapabilities'); },
        haptic: function () { return Promise.resolve({ ok: true, skipped: true }); },
        share: function () { return Promise.reject({ code: 'unsupported', message: 'share unavailable on macOS shell' }); },
        authenticate: function () { return Promise.resolve({ ok: true, skipped: true }); },
        cancelAuthenticate: function () { return Promise.resolve({ ok: true, cancelled: true, skipped: true }); },
        clearUnlockGrant: function () { return Promise.resolve({ ok: true, skipped: true }); },
        reportAuthSession: function () { return Promise.resolve({ ok: true, skipped: true }); },
        getSharedAuthTokens: function () { return Promise.resolve({ ok: true, signedIn: false, skipped: true }); },
        publishNavManifest: function (m) {
          try { window.__KENOS_NAV_MANIFEST__ = m || {}; } catch (e) {}
          return call('publishNavManifest', m || {});
        },
        nowPlaying: {
          update: function () { return Promise.resolve({ ok: true, skipped: true }); },
          updatePosition: function () { return Promise.resolve({ ok: true, skipped: true }); },
          clear: function () { return Promise.resolve({ ok: true, skipped: true }); }
        },
        liveActivity: {
          upsert: function () { return Promise.resolve({ ok: true, skipped: true }); },
          end: function () { return Promise.resolve({ ok: true, skipped: true }); }
        },
        openContinuity: function (p) { return call('openContinuity', p || {}); }
      };
    })();
    """

    static func handleMessage(body: Any, webView: WKWebView?) {
        guard let dict = body as? [String: Any] else { return }
        let id = stringValue(dict["id"])
        let method = stringValue(dict["method"])
        let params = dict["params"] as? [String: Any] ?? [:]
        guard !id.isEmpty, !method.isEmpty else { return }

        switch method {
        case "getCapabilities":
            resolve(id: id, webView: webView, value: [
                "capabilities": [
                    "haptic": false,
                    "share": false,
                    "authenticate": false,
                    "navManifest": true,
                    "nowPlaying": false,
                    "openContinuity": true,
                    "getCapabilities": true,
                    "liveActivity": false,
                    "liveActivityPreview": false,
                    "push": false,
                    "spotlight": false,
                    "userActivity": false,
                    "appGroup": false,
                ],
                "platform": "macOS",
            ])
        case "openContinuity":
            openContinuity(params: params, id: id, webView: webView)
        case "publishNavManifest":
            if let liveState = params["liveState"] as? String {
                NotificationCenter.default.post(
                    name: Notification.Name("kenosMacNavManifest"),
                    object: nil,
                    userInfo: ["liveState": liveState, "path": stringValue(params["path"])]
                )
            }
            resolve(id: id, webView: webView, value: ["ok": true])
        default:
            resolve(id: id, webView: webView, value: ["ok": true, "skipped": true])
        }
    }

    private static func openContinuity(params: [String: Any], id: String, webView: WKWebView?) {
        let raw = stringValue(params["url"]).isEmpty ? stringValue(params["href"]) : stringValue(params["url"])
        guard let url = URL(string: raw), url.scheme?.hasPrefix("http") == true else {
            reject(id: id, webView: webView, code: "bad_url", message: "openContinuity needs http(s) url")
            return
        }
        NotificationCenter.default.post(name: .kenosOpenDomainContinuity, object: url)
        resolve(id: id, webView: webView, value: ["ok": true])
    }

    private static func resolve(id: String, webView: WKWebView?, value: [String: Any]) {
        guard let webView else { return }
        let json = (try? JSONSerialization.data(withJSONObject: value)).flatMap {
            String(data: $0, encoding: .utf8)
        } ?? "{}"
        let js = "window.__KENOS_NATIVE_BRIDGE__&&window.__KENOS_NATIVE_BRIDGE__.resolve('\(id)', \(json))"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private static func reject(id: String, webView: WKWebView?, code: String, message: String) {
        guard let webView else { return }
        let payload: [String: Any] = ["code": code, "message": message]
        let json = (try? JSONSerialization.data(withJSONObject: payload)).flatMap {
            String(data: $0, encoding: .utf8)
        } ?? "{}"
        let js = "window.__KENOS_NATIVE_BRIDGE__&&window.__KENOS_NATIVE_BRIDGE__.reject('\(id)', \(json))"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private static func stringValue(_ value: Any?) -> String {
        guard let value else { return "" }
        if let s = value as? String { return s }
        return String(describing: value)
    }
}

/// Avoids WKUserContentController ↔ coordinator retain cycles (macOS).
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
#endif
