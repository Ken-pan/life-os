import SwiftUI
import WebKit

#if os(iOS)
/// Native shell surface that loads Kenos Web Daily Beta (phone-reachable origin).
struct KenosWebSurfaceView: UIViewRepresentable {
    let url: URL
    var onTitle: ((String) -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(onTitle: onTitle)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // Hide web BottomNav / SystemBar — native TabView owns IA.
        let shellScript = WKUserScript(
            source: """
            window.__KENOS_IOS_NATIVE_SHELL__ = true;
            try {
              document.documentElement.dataset.iosNativeShell = 'true';
            } catch (e) {}
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(shellScript)

        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.contentInsetAdjustmentBehavior = .automatic
        view.isOpaque = true
        view.backgroundColor = .systemBackground
        view.load(URLRequest(url: Self.shellURL(url)))
        context.coordinator.webView = view
        context.coordinator.loadedURL = Self.shellURL(url)
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        let next = Self.shellURL(url)
        if context.coordinator.loadedURL?.absoluteString != next.absoluteString {
            context.coordinator.loadedURL = next
            uiView.load(URLRequest(url: next))
        }
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

    final class Coordinator: NSObject, WKNavigationDelegate {
        var onTitle: ((String) -> Void)?
        weak var webView: WKWebView?
        var loadedURL: URL?

        init(onTitle: ((String) -> Void)?) {
            self.onTitle = onTitle
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            onTitle?(webView.title ?? "")
            webView.evaluateJavaScript(
                "window.__KENOS_IOS_NATIVE_SHELL__=true;document.documentElement.dataset.iosNativeShell='true';"
            )
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
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
            let host = dest.host ?? ""
            let isLocal =
                host == "127.0.0.1" || host == "localhost" || host.hasPrefix("10.")
                || host.hasPrefix("192.168.") || host.hasPrefix("172.")
            let isKenosShell = host.contains("aios") || host.contains("kenos") || isLocal
            let port = dest.port
            let isDomainPort = port == 5188 || port == 5190 || port == 5180 || port == 5189
            if navigationAction.navigationType == .linkActivated,
               (!isKenosShell || isDomainPort),
               dest.scheme?.hasPrefix("http") == true
            {
                // Rewrite loopback → current shell host before opening domain apps.
                let openURL = Self.rewriteLoopback(dest, shellHost: loadedURL?.host)
                UIApplication.shared.open(openURL)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
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
                KenosWebSurfaceView(url: url)
                    .ignoresSafeArea(edges: .bottom)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
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
#endif
