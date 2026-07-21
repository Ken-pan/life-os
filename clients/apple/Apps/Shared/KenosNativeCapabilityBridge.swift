#if os(iOS)
import Foundation
import LocalAuthentication
import UIKit
import WebKit

/// Unified JS ↔ Native capability surface for Kenos Continuity.
///
/// Web posts `{ id, method, params }` to `kenosNative`; native resolves via
/// `window.__KENOS_NATIVE_BRIDGE__.resolve|reject`.
@MainActor
enum KenosNativeCapabilityBridge {
    /// Navigation Manifest last published by the active Continuity page.
    struct NavManifest: Equatable {
        var domainId: String
        var path: String
        var title: String
        var activeTab: String
        var canGoBack: Bool
        var currentEntity: String
        var liveState: String
        var unsavedDraft: Bool
        var summary: String

        static let empty = NavManifest(
            domainId: "",
            path: "",
            title: "",
            activeTab: "",
            canGoBack: false,
            currentEntity: "",
            liveState: "",
            unsavedDraft: false,
            summary: ""
        )

        init(
            domainId: String = "",
            path: String = "",
            title: String = "",
            activeTab: String = "",
            canGoBack: Bool = false,
            currentEntity: String = "",
            liveState: String = "",
            unsavedDraft: Bool = false,
            summary: String = ""
        ) {
            self.domainId = domainId
            self.path = path
            self.title = title
            self.activeTab = activeTab
            self.canGoBack = canGoBack
            self.currentEntity = currentEntity
            self.liveState = liveState
            self.unsavedDraft = unsavedDraft
            self.summary = summary
        }

        init(dict: [String: Any]) {
            self.init(
                domainId: Self.string(dict["domainId"]),
                path: Self.string(dict["path"]),
                title: Self.string(dict["title"]),
                activeTab: Self.string(dict["activeTab"]),
                canGoBack: Self.bool(dict["canGoBack"]),
                currentEntity: Self.string(dict["currentEntity"]),
                liveState: Self.string(dict["liveState"]),
                unsavedDraft: Self.bool(dict["unsavedDraft"]),
                summary: Self.string(dict["summary"])
            )
        }

        private static func string(_ value: Any?) -> String {
            guard let value else { return "" }
            if let s = value as? String { return s }
            return String(describing: value)
        }

        private static func bool(_ value: Any?) -> Bool {
            if let b = value as? Bool { return b }
            if let n = value as? NSNumber { return n.boolValue }
            if let s = value as? String {
                return s == "1" || s.lowercased() == "true"
            }
            return false
        }
    }

    private(set) static var lastNavManifest: NavManifest = .empty

    /// Injected at document start so `window.kenosNative` works before SPA modules load.
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
        haptic: function (style) { return call('haptic', { style: style || 'light' }); },
        share: function (payload) { return call('share', payload || {}); },
        authenticate: function (opts) { return call('authenticate', opts || {}); },
        reportAuthSession: function (p) { return call('reportAuthSession', p || {}); },
        getSharedAuthTokens: function () { return call('getSharedAuthTokens', {}); },
        publishNavManifest: function (m) {
          try { window.__KENOS_NAV_MANIFEST__ = m || {}; } catch (e) {}
          return call('publishNavManifest', m || {});
        },
        nowPlaying: {
          update: function (p) { return call('nowPlayingUpdate', p || {}); },
          updatePosition: function (p) { return call('nowPlayingUpdatePosition', p || {}); },
          clear: function () { return call('nowPlayingClear', {}); }
        },
        liveActivity: {
          upsert: function (p) { return call('liveActivityUpsert', p || {}); },
          end: function (p) {
            var kind = (p && typeof p === 'object') ? p : { kind: p };
            return call('liveActivityEnd', kind || {});
          }
        },
        openContinuity: function (p) { return call('openContinuity', p || {}); }
      };
      try { window.__KENOS_NAV_MANIFEST__ = window.__KENOS_NAV_MANIFEST__ || {}; } catch (e) {}
    })();
    """

    /// Capability ids currently implemented on-device (Owner gates may flip later).
    static var capabilitySnapshot: [String: Bool] {
        [
            "haptic": true,
            "share": true,
            "authenticate": true,
            "reportAuthSession": true,
            "getSharedAuthTokens": true,
            "sharedAuth": KenosSharedWebAuth.hasSharedTokens,
            "navManifest": true,
            "nowPlaying": true,
            "openContinuity": true,
            "getCapabilities": true,
            "spotlight": KenosSpotlightFoundation.isEnabled,
            "userActivity": KenosUserActivityFoundation.isEnabled,
            // Owner-gated — foundation stubs return false until entitlements land.
            "push": KenosPushFoundation.isEnabled,
            // System Dynamic Island / Lock Screen ActivityKit — owner-gated.
            "liveActivity": KenosLiveActivityFoundation.isEnabled,
            // In-shell Live Accessory / Shelf cache always accepts upserts.
            "liveActivityPreview": true,
            "appGroup": KenosAppGroupCapability.isEnabled,
        ]
    }

    /// Human-readable status for gated surfaces (web can surface honestly).
    static var capabilityStatus: [String: String] {
        [
            "liveActivity": KenosLiveActivityFoundation.statusSummary,
            "liveActivityBlockers": KenosLiveActivityFoundation.readinessBlockers.joined(separator: ","),
            "push": KenosPushFoundation.statusSummary,
            "spotlight": KenosSpotlightFoundation.statusSummary,
            "userActivity": KenosUserActivityFoundation.statusSummary,
        ]
    }

    static func handleMessage(body: Any, webView: WKWebView?) {
        guard let dict = body as? [String: Any] else {
            KenosLog.warning("kenosNative bad body", category: .bridge)
            return
        }
        let id = stringValue(dict["id"])
        let method = stringValue(dict["method"])
        let params = dict["params"] as? [String: Any] ?? [:]
        guard !id.isEmpty, !method.isEmpty else {
            KenosLog.warning("kenosNative missing id/method", category: .bridge)
            return
        }

        KenosLog.debug("kenosNative call", category: .bridge, metadata: [
            "method": method,
            "id": String(id.prefix(24)),
        ])

        switch method {
        case "getCapabilities":
            // Warm Taptic generators while Continuity probes capabilities.
            warmGeneratorsIfNeeded()
            resolve(id: id, webView: webView, value: [
                "ok": true,
                "capabilities": capabilitySnapshot,
                "status": capabilityStatus,
                "shell": "ios",
                "version": 1,
            ])

        case "haptic":
            let style = stringValue(params["style"]).lowercased()
            playHaptic(style)
            resolve(id: id, webView: webView, value: ["ok": true, "style": style])

        case "share":
            share(params: params, id: id, webView: webView)

        case "authenticate":
            authenticate(params: params, id: id, webView: webView)

        case "reportAuthSession":
            reportAuthSession(params: params, id: id, webView: webView)

        case "getSharedAuthTokens":
            getSharedAuthTokens(id: id, webView: webView)

        case "publishNavManifest":
            let manifest = NavManifest(dict: params)
            lastNavManifest = manifest
            NotificationCenter.default.post(
                name: .kenosNavManifestDidChange,
                object: nil,
                userInfo: ["manifest": manifest]
            )
            resolve(id: id, webView: webView, value: ["ok": true])

        case "openContinuity":
            openContinuity(params: params, id: id, webView: webView)

        case "nowPlayingUpdate":
            KenosNowPlayingBridge.update(params: params)
            resolve(id: id, webView: webView, value: ["ok": true])

        case "nowPlayingUpdatePosition":
            KenosNowPlayingBridge.updatePosition(params: params)
            resolve(id: id, webView: webView, value: ["ok": true])

        case "nowPlayingClear":
            KenosNowPlayingBridge.clear()
            resolve(id: id, webView: webView, value: ["ok": true])

        case "liveActivityUpsert":
            let result = KenosLiveActivityFoundation.upsert(params: params)
            if result.ok {
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "enabled": result.enabled,
                    "gated": !KenosLiveActivityFoundation.isEnabled,
                    "kind": result.kind,
                    "status": KenosLiveActivityFoundation.statusSummary,
                ])
            } else {
                reject(
                    id: id,
                    webView: webView,
                    code: "live_activity_bad_payload",
                    message: "kind/title required (training|focus|tidy)"
                )
            }

        case "liveActivityEnd":
            let result = KenosLiveActivityFoundation.end(params: params)
            if result.ok {
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "enabled": result.enabled,
                    "gated": !KenosLiveActivityFoundation.isEnabled,
                    "kind": result.kind,
                    "status": KenosLiveActivityFoundation.statusSummary,
                ])
            } else {
                reject(
                    id: id,
                    webView: webView,
                    code: "live_activity_bad_kind",
                    message: "kind required (training|focus|tidy)"
                )
            }

        default:
            reject(id: id, webView: webView, code: "unknown_method", message: "Unknown method: \(method)")
        }
    }

    // MARK: - Shared web SSO (Keychain vault ↔ Continuity origins)

    private static func reportAuthSession(params: [String: Any], id: String, webView: WKWebView?) {
        guard allowSharedAuth(for: webView) else {
            reject(id: id, webView: webView, code: "host_not_allowed", message: "Auth host not allowed")
            return
        }
        let signedIn = boolValue(params["signedIn"])
        if !signedIn {
            KenosSharedWebAuth.clearSharedTokens()
            resolve(id: id, webView: webView, value: ["ok": true, "signedIn": false])
            return
        }
        let access = stringValue(params["access_token"])
        let refresh = stringValue(params["refresh_token"])
        guard !access.isEmpty, !refresh.isEmpty else {
            reject(id: id, webView: webView, code: "bad_tokens", message: "access_token and refresh_token required")
            return
        }
        let userId = stringValue(params["userId"])
        KenosSharedWebAuth.saveSharedTokens(
            accessToken: access,
            refreshToken: refresh,
            userId: userId.isEmpty ? nil : userId
        )
        // Never echo tokens back — only presence flags.
        resolve(id: id, webView: webView, value: [
            "ok": true,
            "signedIn": true,
            "userIdPresent": !userId.isEmpty,
        ])
    }

    private static func getSharedAuthTokens(id: String, webView: WKWebView?) {
        guard allowSharedAuth(for: webView) else {
            reject(id: id, webView: webView, code: "host_not_allowed", message: "Auth host not allowed")
            return
        }
        guard let tokens = KenosSharedWebAuth.loadSharedTokens() else {
            resolve(id: id, webView: webView, value: ["ok": true, "signedIn": false])
            return
        }
        var payload: [String: Any] = [
            "ok": true,
            "signedIn": true,
            "access_token": tokens.accessToken,
            "refresh_token": tokens.refreshToken,
        ]
        if let userId = tokens.userId, !userId.isEmpty {
            payload["userId"] = userId
        }
        resolve(id: id, webView: webView, value: payload)
    }

    private static func allowSharedAuth(for webView: WKWebView?) -> Bool {
        guard let host = webView?.url?.host, !host.isEmpty else { return false }
        return KenosSharedWebAuth.isAuthRelatedHost(host)
    }

    private static func boolValue(_ value: Any?) -> Bool {
        if let b = value as? Bool { return b }
        if let n = value as? NSNumber { return n.boolValue }
        if let s = value as? String {
            return s == "1" || s.lowercased() == "true"
        }
        return false
    }

    // MARK: - Continuity open (skip DomainLaunch intermediate page)

    private static func openContinuity(params: [String: Any], id: String, webView: WKWebView?) {
        let urlString = stringValue(params["url"])
        let domainId = stringValue(params["domainId"])
        let path = stringValue(params["path"])

        let resolved: URL?
        if !urlString.isEmpty, let url = URL(string: urlString) {
            resolved = KenosWebSurfaceView.Coordinator.rewriteLoopback(
                url,
                shellHost: webView?.url?.host
            )
        } else if !domainId.isEmpty {
            resolved = KenosDomainRegistry.continuityURL(
                for: domainId,
                path: path.isEmpty ? nil : path
            )
        } else {
            resolved = nil
        }

        guard let openURL = resolved else {
            reject(
                id: id,
                webView: webView,
                code: "bad_url",
                message: "url or domainId required"
            )
            return
        }
        NotificationCenter.default.post(name: .kenosOpenDomainContinuity, object: openURL)
        resolve(id: id, webView: webView, value: [
            "ok": true,
            "url": openURL.absoluteString,
            "domainId": domainId,
            "path": path,
        ])
    }

    // MARK: - Haptics

    /// Cached generators — `prepare()` after fire warms the next Continuity cue.
    private static let notificationGenerator = UINotificationFeedbackGenerator()
    private static let selectionGenerator = UISelectionFeedbackGenerator()
    private static let lightImpact = UIImpactFeedbackGenerator(style: .light)
    private static let mediumImpact = UIImpactFeedbackGenerator(style: .medium)
    private static let heavyImpact = UIImpactFeedbackGenerator(style: .heavy)
    private static let softImpact = UIImpactFeedbackGenerator(style: .soft)
    private static let rigidImpact = UIImpactFeedbackGenerator(style: .rigid)
    private static var generatorsWarmed = false

    /// One-time warm so the first Continuity haptic is not cold.
    private static func warmGeneratorsIfNeeded() {
        guard !generatorsWarmed else { return }
        generatorsWarmed = true
        notificationGenerator.prepare()
        selectionGenerator.prepare()
        lightImpact.prepare()
        mediumImpact.prepare()
        heavyImpact.prepare()
        softImpact.prepare()
        rigidImpact.prepare()
    }

    private static func playHaptic(_ style: String) {
        warmGeneratorsIfNeeded()
        switch style {
        case "success":
            notificationGenerator.notificationOccurred(.success)
            notificationGenerator.prepare()
        case "warning":
            notificationGenerator.notificationOccurred(.warning)
            notificationGenerator.prepare()
        case "error":
            notificationGenerator.notificationOccurred(.error)
            notificationGenerator.prepare()
        case "selection":
            selectionGenerator.selectionChanged()
            selectionGenerator.prepare()
        case "medium":
            mediumImpact.impactOccurred()
            mediumImpact.prepare()
        case "heavy":
            heavyImpact.impactOccurred()
            heavyImpact.prepare()
        case "soft":
            softImpact.impactOccurred()
            softImpact.prepare()
        case "rigid":
            rigidImpact.impactOccurred()
            rigidImpact.prepare()
        case "pulse":
            // Rest-complete double pulse: heavy then delayed medium on-main.
            heavyImpact.impactOccurred()
            heavyImpact.prepare()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                mediumImpact.impactOccurred()
                mediumImpact.prepare()
            }
        default:
            lightImpact.impactOccurred()
            lightImpact.prepare()
        }
    }

    // MARK: - Share

    private static func share(params: [String: Any], id: String, webView: WKWebView?) {
        var items: [Any] = []
        let title = stringValue(params["title"])
        let text = stringValue(params["text"])
        let urlString = stringValue(params["url"])
        if !title.isEmpty { items.append(title) }
        if !text.isEmpty { items.append(text) }
        if !urlString.isEmpty, let url = URL(string: urlString) {
            items.append(url)
        }
        guard !items.isEmpty else {
            reject(id: id, webView: webView, code: "empty_share", message: "Nothing to share")
            return
        }
        guard let presenter = topViewController() else {
            reject(id: id, webView: webView, code: "no_presenter", message: "No view controller to present share sheet")
            return
        }
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let pop = vc.popoverPresentationController {
            pop.sourceView = presenter.view
            pop.sourceRect = CGRect(
                x: presenter.view.bounds.midX,
                y: presenter.view.bounds.midY,
                width: 1,
                height: 1
            )
            pop.permittedArrowDirections = []
        }
        presenter.present(vc, animated: true) {
            resolve(id: id, webView: webView, value: ["ok": true])
        }
    }

    // MARK: - Biometrics

    private static func authenticate(params: [String: Any], id: String, webView: WKWebView?) {
        let reason = stringValue(params["reason"]).nilIfEmpty
            ?? "Unlock this Kenos surface"
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            reject(
                id: id,
                webView: webView,
                code: "auth_unavailable",
                message: error?.localizedDescription ?? "Biometrics unavailable"
            )
            return
        }
        let biometry = biometryName(context.biometryType)
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
            Task { @MainActor in
                if success {
                    resolve(id: id, webView: webView, value: [
                        "ok": true,
                        "biometryType": biometry,
                    ])
                } else {
                    reject(
                        id: id,
                        webView: webView,
                        code: "auth_failed",
                        message: evalError?.localizedDescription ?? "Authentication failed"
                    )
                }
            }
        }
    }

    private static func biometryName(_ type: LABiometryType) -> String {
        switch type {
        case .faceID: return "faceID"
        case .touchID: return "touchID"
        case .opticID: return "opticID"
        case .none: return "none"
        @unknown default: return "unknown"
        }
    }

    // MARK: - Reply helpers

    private static func resolve(id: String, webView: WKWebView?, value: [String: Any]) {
        guard let webView else { return }
        guard let json = jsonString(value) else {
            reject(id: id, webView: webView, code: "encode_error", message: "Failed to encode result")
            return
        }
        let escapedId = id.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript(
            "try{window.__KENOS_NATIVE_BRIDGE__&&window.__KENOS_NATIVE_BRIDGE__.resolve('\(escapedId)',\(json))}catch(e){}"
        )
    }

    private static func reject(id: String, webView: WKWebView?, code: String, message: String) {
        guard let webView else { return }
        let payload: [String: Any] = ["code": code, "message": message]
        guard let json = jsonString(payload) else { return }
        let escapedId = id.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        KenosLog.info("kenosNative reject", category: .bridge, metadata: [
            "code": code,
            "method_id": String(id.prefix(24)),
        ])
        webView.evaluateJavaScript(
            "try{window.__KENOS_NATIVE_BRIDGE__&&window.__KENOS_NATIVE_BRIDGE__.reject('\(escapedId)',\(json))}catch(e){}"
        )
    }

    private static func jsonString(_ value: [String: Any]) -> String? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: []),
              let raw = String(data: data, encoding: .utf8)
        else { return nil }
        return raw
    }

    private static func stringValue(_ value: Any?) -> String {
        guard let value else { return "" }
        if let s = value as? String { return s }
        return String(describing: value)
    }

    private static func topViewController(
        base: UIViewController? = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    ) -> UIViewController? {
        if let nav = base as? UINavigationController {
            return topViewController(base: nav.visibleViewController)
        }
        if let tab = base as? UITabBarController {
            return topViewController(base: tab.selectedViewController)
        }
        if let presented = base?.presentedViewController {
            return topViewController(base: presented)
        }
        return base
    }
}

extension Notification.Name {
    static let kenosNavManifestDidChange = Notification.Name("kenosNavManifestDidChange")
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

/// App Group readiness — true only when the suite is provisioned (Owner gate).
enum KenosAppGroupCapability {
    static var isEnabled: Bool {
        // Mirrors KenosAppGroupStore: process-local fallback until suite exists.
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.space.kenos.app"
        ) != nil
    }
}
#endif
