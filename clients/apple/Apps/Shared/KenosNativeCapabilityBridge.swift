#if os(iOS)
import Foundation
import LocalAuthentication
import UIKit
import WebKit
import KenosClient
import KenosContracts
import KenosNotifications

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
    /// Last `data-theme` / publishChromeAppearance value from Continuity (`light`|`dark`).
    private(set) static var lastChromeAppearance: String = ""

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
            // Face ID / passcode often exceeds 15s; killing the promise while
            // LAContext is still up leaves Money/Work stuck on "Unlocking…".
            var timeoutMs = method === 'authenticate' ? 180000 : 15000;
            setTimeout(function () {
              if (!pending[id]) return;
              delete pending[id];
              reject({ code: 'native_bridge_timeout', message: 'Timed out: ' + method });
            }, timeoutMs);
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
        cancelAuthenticate: function () { return call('cancelAuthenticate', {}); },
        clearUnlockGrant: function (p) { return call('clearUnlockGrant', p || {}); },
        reportAuthSession: function (p) { return call('reportAuthSession', p || {}); },
        getSharedAuthTokens: function () { return call('getSharedAuthTokens', {}); },
        publishNavManifest: function (m) {
          try { window.__KENOS_NAV_MANIFEST__ = m || {}; } catch (e) {}
          return call('publishNavManifest', m || {});
        },
        publishChromeAppearance: function (p) {
          var scheme = (p && (p.colorScheme || p.theme || p.scheme)) || '';
          return call('publishChromeAppearance', { colorScheme: String(scheme || '') });
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
        openContinuity: function (p) { return call('openContinuity', p || {}); },
        shellSettings: {
          get: function () { return call('shellSettingsGet', {}); },
          set: function (p) { return call('shellSettingsSet', p || {}); }
        },
        notifications: {
          requestPermission: function () { return call('notificationsRequestPermission', {}); },
          getStatus: function () { return call('notificationsGetStatus', {}); },
          getPreferences: function () { return call('notificationsGetPreferences', {}); },
          setPreferences: function (p) { return call('notificationsSetPreferences', p || {}); },
          schedule: function (p) { return call('notificationsSchedule', p || {}); },
          cancel: function (p) { return call('notificationsCancel', p || {}); },
          syncReminders: function (p) { return call('notificationsSyncReminders', p || {}); },
          listPending: function () { return call('notificationsListPending', {}); }
        }
      };
      try { window.__KENOS_NAV_MANIFEST__ = window.__KENOS_NAV_MANIFEST__ || {}; } catch (e) {}
      // Keep native status-bar polarity in sync with html[data-theme] (FOUC bootstrap + SPA).
      function reportChromeAppearance(scheme) {
        try {
          if (scheme !== 'light' && scheme !== 'dark') return;
          if (window.__KENOS_LAST_CHROME_APPEARANCE__ === scheme) return;
          window.__KENOS_LAST_CHROME_APPEARANCE__ = scheme;
          if (window.kenosNative && typeof window.kenosNative.publishChromeAppearance === 'function') {
            window.kenosNative.publishChromeAppearance({ colorScheme: scheme });
          }
        } catch (e) {}
      }
      function readTheme() {
        try {
          return String(document.documentElement.getAttribute('data-theme') || '').toLowerCase();
        } catch (e) { return ''; }
      }
      try {
        reportChromeAppearance(readTheme());
        var mo = new MutationObserver(function () { reportChromeAppearance(readTheme()); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        window.addEventListener('kenos:resolved-theme', function (ev) {
          try {
            var t = ev && ev.detail && ev.detail.theme;
            reportChromeAppearance(String(t || '').toLowerCase());
          } catch (e) {}
        });
      } catch (e) {}
    })();
    """

    /// Capability ids currently implemented on-device (Owner gates may flip later).
    static var capabilitySnapshot: [String: Bool] {
        [
            "haptic": true,
            "share": true,
            "authenticate": true,
            "cancelAuthenticate": true,
            "clearUnlockGrant": true,
            "reportAuthSession": true,
            "getSharedAuthTokens": true,
            "sharedAuth": KenosSharedWebAuth.hasSharedTokens,
            "navManifest": true,
            "chromeAppearance": true,
            "shellSettings": true,
            "nowPlaying": true,
            "openContinuity": true,
            "getCapabilities": true,
            "spotlight": KenosSpotlightFoundation.isEnabled,
            "userActivity": KenosUserActivityFoundation.isEnabled,
            // Owner-gated — foundation stubs return false until entitlements land.
            "push": KenosPushFoundation.isEnabled,
            // Local UN scheduling (Planner reminders / Inbox) — shipped.
            "localNotifications": KenosPushFoundation.localSchedulingEnabled,
            // System Dynamic Island / Lock Screen ActivityKit — owner-gated.
            "liveActivity": KenosLiveActivityFoundation.isEnabled,
            // In-shell Live Accessory / Shelf cache always accepts upserts.
            "liveActivityPreview": true,
            "appGroup": KenosAppGroupCapability.isEnabled,
        ]
    }

    /// Human-readable status for gated surfaces (web can surface honestly).
    /// `localNotifications` auth is filled asynchronously in `getCapabilities`.
    static var capabilityStatus: [String: String] {
        [
            "liveActivity": KenosLiveActivityFoundation.statusSummary,
            "liveActivityBlockers": KenosLiveActivityFoundation.readinessBlockers.joined(separator: ","),
            "push": KenosPushFoundation.statusSummary,
            "spotlight": KenosSpotlightFoundation.statusSummary,
            "userActivity": KenosUserActivityFoundation.statusSummary,
            "localNotifications": "pending",
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
            Task { @MainActor in
                var status = capabilityStatus
                status["localNotifications"] = await KenosPushFoundation.localAuthorizationStatus()
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "capabilities": capabilitySnapshot,
                    "status": status,
                    "shell": "ios",
                    "version": 1,
                ])
            }

        case "notificationsRequestPermission":
            Task { @MainActor in
                let status = await KenosPushFoundation.requestPermission()
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "status": status,
                ])
            }

        case "notificationsGetStatus":
            Task { @MainActor in
                let status = await KenosPushFoundation.localAuthorizationStatus()
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "status": status,
                    "localNotifications": KenosPushFoundation.localSchedulingEnabled,
                    "push": KenosPushFoundation.remotePushEnabled,
                ])
            }

        case "notificationsGetPreferences":
            Task { @MainActor in
                let prefs = await KenosLocalNotificationCenter.shared.currentPreferences()
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "preferences": encodeNotificationPreferences(prefs),
                ])
            }

        case "notificationsSetPreferences":
            Task { @MainActor in
                var prefs = await KenosLocalNotificationCenter.shared.currentPreferences()
                applyNotificationPreferences(params, to: &prefs)
                await KenosLocalNotificationCenter.shared.updatePreferences(prefs)
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "preferences": encodeNotificationPreferences(prefs),
                ])
            }

        case "notificationsSchedule":
            Task { @MainActor in
                do {
                    let record = try decodeNotificationRecord(params)
                    let fireAt = resolveFireAtDate(params) ?? KenosNotificationISO.date(from: record.fireAt)
                    try await KenosLocalNotificationCenter.shared.schedule(record, at: fireAt)
                    resolve(id: id, webView: webView, value: [
                        "ok": true,
                        "id": record.id.uuidString,
                        "deduplicationKey": record.deduplicationKey,
                    ])
                } catch {
                    reject(
                        id: id,
                        webView: webView,
                        code: "notification_schedule_failed",
                        message: error.localizedDescription
                    )
                }
            }

        case "notificationsCancel":
            Task { @MainActor in
                let dedupe = stringValue(params["deduplicationKey"])
                let rawId = stringValue(params["id"])
                let typeRaw = stringValue(params["type"])
                if !dedupe.isEmpty {
                    await KenosLocalNotificationCenter.shared.cancel(deduplicationKey: dedupe)
                } else if let uuid = UUID(uuidString: rawId) {
                    await KenosLocalNotificationCenter.shared.cancel(id: uuid)
                } else if let type = KenosNotificationType(rawValue: typeRaw) {
                    await KenosLocalNotificationCenter.shared.cancelAll(type: type)
                } else {
                    reject(
                        id: id,
                        webView: webView,
                        code: "notification_cancel_bad_payload",
                        message: "deduplicationKey, id, or type required"
                    )
                    return
                }
                resolve(id: id, webView: webView, value: ["ok": true])
            }

        case "notificationsSyncReminders":
            Task { @MainActor in
                do {
                    let jobs = decodeReminderJobs(params["jobs"])
                    try await KenosLocalNotificationCenter.shared.syncPlanReminders(jobs)
                    let pending = await KenosLocalNotificationCenter.shared.pending()
                    let planCount = pending.filter { $0.type == .planReminder }.count
                    resolve(id: id, webView: webView, value: [
                        "ok": true,
                        "scheduled": planCount,
                    ])
                } catch {
                    reject(
                        id: id,
                        webView: webView,
                        code: "notification_sync_failed",
                        message: error.localizedDescription
                    )
                }
            }

        case "notificationsListPending":
            Task { @MainActor in
                let pending = await KenosLocalNotificationCenter.shared.pending()
                resolve(id: id, webView: webView, value: [
                    "ok": true,
                    "pending": pending.map(encodeNotificationRecord),
                ])
            }

        case "haptic":
            let style = stringValue(params["style"]).lowercased()
            playHaptic(style)
            resolve(id: id, webView: webView, value: ["ok": true, "style": style])

        case "share":
            share(params: params, id: id, webView: webView)

        case "authenticate":
            authenticate(params: params, id: id, webView: webView)

        case "cancelAuthenticate":
            cancelAuthenticate(id: id, webView: webView)

        case "clearUnlockGrant":
            clearUnlockGrant(params: params, id: id, webView: webView)

        case "reportAuthSession":
            reportAuthSession(params: params, id: id, webView: webView)

        case "getSharedAuthTokens":
            getSharedAuthTokens(params: params, id: id, webView: webView)

        case "publishNavManifest":
            let manifest = NavManifest(dict: params)
            lastNavManifest = manifest
            NotificationCenter.default.post(
                name: .kenosNavManifestDidChange,
                object: nil,
                userInfo: ["manifest": manifest]
            )
            resolve(id: id, webView: webView, value: ["ok": true])

        case "publishChromeAppearance":
            let raw = stringValue(params["colorScheme"]).lowercased()
            guard raw == "light" || raw == "dark" else {
                reject(
                    id: id,
                    webView: webView,
                    code: "invalid_params",
                    message: "colorScheme must be light|dark"
                )
                return
            }
            lastChromeAppearance = raw
            let fromDomain = webView != nil && webView === KenosActiveWebRegistry.domainWebView
            let fromShell = webView != nil && webView === KenosActiveWebRegistry.shellWebView
            NotificationCenter.default.post(
                name: .kenosChromeAppearanceDidChange,
                object: raw,
                userInfo: [
                    "colorScheme": raw,
                    "fromDomain": fromDomain,
                    "fromShell": fromShell,
                ]
            )
            resolve(id: id, webView: webView, value: [
                "ok": true,
                "colorScheme": raw,
                "fromDomain": fromDomain,
                "fromShell": fromShell,
            ])

        case "shellSettingsGet":
            let snap = KenosShellSettingsStore.current
            resolve(id: id, webView: webView, value: [
                "ok": true,
                "settings": KenosShellSettingsStore.encode(snap),
            ])

        case "shellSettingsSet":
            let snap = KenosShellSettingsStore.apply(params: params)
            broadcastShellSettings(snap, excluding: webView)
            resolve(id: id, webView: webView, value: [
                "ok": true,
                "settings": KenosShellSettingsStore.encode(snap),
            ])

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
        guard allowSharedAuth(for: webView, params: params) else {
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
        // 新 token 落库 → 壳偏好同步补一轮(首登/刷新后都可能有增量)
        Task { @MainActor in
            KenosShellStateSync.shared.scheduleSync(after: 2)
        }
        // Owner Device Lock: one-time shell pairing after SSO (server rejects non-owner).
        // Requires shell unlock; concurrent SSO token writes coalesce inside DeviceAuthClient.
        Task { @MainActor in
            guard KenosUnlockGrantStore.isShellUnlocked() else { return }
            guard !KenosDeviceIdentityStore.isPaired else { return }
            do {
                try await KenosDeviceAuthClient.pairWithAccessToken(access)
            } catch {
                KenosLog.notice(
                    "device pair after SSO failed",
                    category: .session,
                    metadata: ["error": String(describing: error)]
                )
            }
        }
        // Never echo tokens back — only presence flags.
        resolve(id: id, webView: webView, value: [
            "ok": true,
            "signedIn": true,
            "userIdPresent": !userId.isEmpty,
        ])
    }

    private static func getSharedAuthTokens(params: [String: Any], id: String, webView: WKWebView?) {
        guard allowSharedAuth(for: webView, params: params) else {
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

    /// Authorize releasing Supabase session tokens to page JS.
    ///
    /// SECURITY (F5-03.4): the decision is anchored on the REAL committed origin
    /// (`webView.url.host`, else our own managed Continuity/shell WebView's
    /// committed host) — NEVER on the JS-supplied `params["host"]`, which a
    /// malicious page fully controls. If the real origin is unverifiable, fail
    /// closed (the page can retry once its URL commits). When `params["host"]`
    /// is present it is only an additional compatibility constraint.
    private static func allowSharedAuth(for webView: WKWebView?, params: [String: Any] = [:]) -> Bool {
        let fromParams = stringValue(params["host"])
        // Authentic origin only: the committed URL of this webview, or of our own
        // managed Continuity/shell webview. Not the client-supplied host.
        let realHost = (webView?.url?.host)
            ?? KenosActiveWebRegistry.domainWebView?.url?.host
            ?? KenosActiveWebRegistry.shellWebView?.url?.host
            ?? ""
        guard !realHost.isEmpty, KenosSharedWebAuth.isAuthRelatedHost(realHost) else {
            return false
        }
        // If the page also declared a host, it must belong to the same auth family
        // as the real origin — a mismatch means a lying/confused caller.
        if !fromParams.isEmpty {
            return KenosSharedWebAuth.hostsCompatible(fromParams, realHost)
        }
        return true
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
    //
    // Apple guidance (LocalAuthentication):
    // - Fresh LAContext per attempt; never reuse across sessions
    // - canEvaluatePolicy before evaluatePolicy
    // - invalidate() to stop pending UI (appCancel) — required for retry / leave
    // - deviceOwnerAuthentication so passcode is the system fallback
    // - localizedCancelTitle so Cancel is intentional, not a dead end
    //
    // Bridge guidance: do NOT kill the JS promise at 15s while the system
    // Face ID sheet is still up (authenticate uses a long timeout). Cancel
    // must call cancelAuthenticate → invalidate so UI + Promise stay in sync.
    //
    // Remount guidance: WK reload / LAN `-1004` clears sessionStorage. Keep a
    // process-scoped grant keyed by `storageKey` so Money/Work do not re-prompt
    // Face ID for every Continuity remount in the same app process.

    /// Single-flight LA evaluation — overlapping Face ID sheets deadlock Continuity.
    @MainActor private static var activeAuthContext: LAContext?
    @MainActor private static var activeAuthRequestId: String?
    @MainActor private static var activeAuthStorageKey: String = ""
    @MainActor private static weak var activeAuthWebView: WKWebView?
    /// Extra bridge callers waiting on the same in-flight `storageKey`.
    @MainActor private static var activeAuthWaiters: [(id: String, webView: WKWebView?)] = []

    private static func authenticate(params: [String: Any], id: String, webView: WKWebView?) {
        let reason = stringValue(params["reason"]).nilIfEmpty
            ?? "Unlock this Kenos surface"
        let storageKey = stringValue(params["storageKey"])
        let force = boolValue(params["force"])
        // prompt=false: restore-only (grant / session). Never present Face ID.
        // Used on Continuity remount so reload storms cannot loop LA UI.
        let allowPrompt = params["prompt"] == nil ? true : boolValue(params["prompt"])
        let grantTTL = (params["grantTTL"] as? NSNumber)?.doubleValue
            ?? (params["grantTTL"] as? Double)
            ?? KenosUnlockGrantStore.defaultTTL

        if force {
            KenosUnlockGrantStore.clear(storageKey)
        } else if KenosUnlockGrantStore.isValid(storageKey) {
            resolve(id: id, webView: webView, value: [
                "ok": true,
                "cached": true,
                "biometryType": "cached",
            ])
            return
        }

        if !allowPrompt {
            resolve(id: id, webView: webView, value: [
                "ok": false,
                "cached": false,
                "code": "auth_required",
                "message": "Unlock required",
            ])
            return
        }

        // Same-key remount: join the in-flight Face ID instead of superseding it.
        if !force,
           activeAuthRequestId != nil,
           !storageKey.isEmpty,
           activeAuthStorageKey == storageKey
        {
            activeAuthWaiters.append((id: id, webView: webView))
            return
        }

        // Different key / force — supersede the previous system sheet.
        cancelActiveAuthentication(code: "auth_superseded", message: "Replaced by a newer unlock request")

        let context = LAContext()
        context.localizedCancelTitle = stringValue(params["cancelTitle"]).nilIfEmpty ?? "Cancel"
        let reuse = (params["reuseDuration"] as? NSNumber)?.doubleValue
            ?? (params["reuseDuration"] as? Double)
            ?? 10
        if reuse > 0 {
            context.touchIDAuthenticationAllowableReuseDuration = min(
                reuse,
                LATouchIDAuthenticationMaximumAllowableReuseDuration
            )
        }

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
        activeAuthContext = context
        activeAuthRequestId = id
        activeAuthStorageKey = storageKey
        activeAuthWebView = webView
        activeAuthWaiters = []

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
            let ok = success
            let mapped = Self.mapAuthFailure(evalError)
            Task { @MainActor in
                guard activeAuthRequestId == id else { return }
                let replyView = activeAuthWebView ?? webView
                let waiters = activeAuthWaiters
                activeAuthContext = nil
                activeAuthRequestId = nil
                activeAuthStorageKey = ""
                activeAuthWebView = nil
                activeAuthWaiters = []
                if ok {
                    KenosUnlockGrantStore.remember(storageKey, ttl: grantTTL)
                    let value: [String: Any] = [
                        "ok": true,
                        "cached": false,
                        "biometryType": biometry,
                    ]
                    resolve(id: id, webView: replyView, value: value)
                    for waiter in waiters {
                        resolve(id: waiter.id, webView: waiter.webView ?? replyView, value: value)
                    }
                } else {
                    reject(
                        id: id,
                        webView: replyView,
                        code: mapped.code,
                        message: mapped.message
                    )
                    for waiter in waiters {
                        reject(
                            id: waiter.id,
                            webView: waiter.webView ?? replyView,
                            code: mapped.code,
                            message: mapped.message
                        )
                    }
                }
            }
        }
    }

    /// Web "Cancel" / explicit leave — invalidate system Face ID and settle the Promise.
    /// Remount dispose must NOT call this (see JS createNativeUnlockController.dispose).
    private static func cancelAuthenticate(id: String, webView: WKWebView?) {
        cancelActiveAuthentication(code: "auth_cancelled", message: "Authentication cancelled")
        resolve(id: id, webView: webView, value: ["ok": true, "cancelled": true])
    }

    /// Drop a process-scoped Continuity unlock grant (Settings → lock / force).
    private static func clearUnlockGrant(params: [String: Any], id: String, webView: WKWebView?) {
        let storageKey = stringValue(params["storageKey"])
        KenosUnlockGrantStore.clear(storageKey.isEmpty ? nil : storageKey)
        resolve(id: id, webView: webView, value: [
            "ok": true,
            "cleared": storageKey.isEmpty ? "all" : storageKey,
        ])
    }

    @MainActor
    private static func cancelActiveAuthentication(code: String, message: String) {
        let prevId = activeAuthRequestId
        let prevView = activeAuthWebView
        let prev = activeAuthContext
        let waiters = activeAuthWaiters
        activeAuthRequestId = nil
        activeAuthStorageKey = ""
        activeAuthWebView = nil
        activeAuthContext = nil
        activeAuthWaiters = []
        prev?.invalidate()
        if let prevId {
            reject(id: prevId, webView: prevView, code: code, message: message)
        }
        for waiter in waiters {
            reject(id: waiter.id, webView: waiter.webView, code: code, message: message)
        }
    }

    private static func mapAuthFailure(_ error: Error?) -> (code: String, message: String) {
        let message = error?.localizedDescription ?? "Authentication failed"
        guard let la = error as? LAError else {
            return ("auth_failed", message)
        }
        switch la.code {
        case .userCancel, .appCancel, .systemCancel:
            return ("auth_cancelled", message)
        case .userFallback:
            return ("auth_fallback", message)
        case .biometryLockout, .biometryNotAvailable, .biometryNotEnrolled,
             .passcodeNotSet, .authenticationFailed:
            return ("auth_failed", message)
        default:
            return ("auth_failed", message)
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

    // MARK: - Local notifications (bridge encode/decode)

    private static func encodeNotificationPreferences(_ prefs: KenosNotificationPreferences) -> [String: Any] {
        var categories: [String: Bool] = [:]
        for type in KenosNotificationType.allCases {
            categories[type.rawValue] = prefs.categoryEnabled[type] ?? true
        }
        var domains: [String: Bool] = [:]
        for (domain, enabled) in prefs.domainEnabled {
            domains[domain.rawValue] = enabled
        }
        var encoded: [String: Any] = [
            "categoryEnabled": categories,
            "sensitivePreviewAllowed": prefs.sensitivePreviewAllowed,
            "watchDeliveryEnabled": prefs.watchDeliveryEnabled,
            "criticalAlertsEnabled": prefs.criticalAlertsEnabled,
            "domainEnabled": domains,
            "syncFailureVisible": prefs.syncFailureVisible,
            "isLocalDistributionPreference": prefs.isLocalDistributionPreference,
        ]
        if let start = prefs.quietHoursStart {
            encoded["quietHoursStart"] = start
        } else {
            encoded["quietHoursStart"] = NSNull()
        }
        if let end = prefs.quietHoursEnd {
            encoded["quietHoursEnd"] = end
        } else {
            encoded["quietHoursEnd"] = NSNull()
        }
        return encoded
    }

    private static func applyNotificationPreferences(_ params: [String: Any], to prefs: inout KenosNotificationPreferences) {
        if let categories = params["categoryEnabled"] as? [String: Any] {
            for (key, value) in categories {
                guard let type = KenosNotificationType(rawValue: key) else { continue }
                prefs.categoryEnabled[type] = boolValue(value)
            }
        }
        if params["quietHoursStart"] is NSNull {
            prefs.quietHoursStart = nil
        } else if let start = params["quietHoursStart"] as? Int {
            prefs.quietHoursStart = start
        } else if let start = params["quietHoursStart"] as? Double {
            prefs.quietHoursStart = Int(start)
        }
        if params["quietHoursEnd"] is NSNull {
            prefs.quietHoursEnd = nil
        } else if let end = params["quietHoursEnd"] as? Int {
            prefs.quietHoursEnd = end
        } else if let end = params["quietHoursEnd"] as? Double {
            prefs.quietHoursEnd = Int(end)
        }
        if params["sensitivePreviewAllowed"] != nil {
            prefs.sensitivePreviewAllowed = boolValue(params["sensitivePreviewAllowed"])
        }
        if params["watchDeliveryEnabled"] != nil {
            prefs.watchDeliveryEnabled = boolValue(params["watchDeliveryEnabled"])
        }
        if params["syncFailureVisible"] != nil {
            prefs.syncFailureVisible = boolValue(params["syncFailureVisible"])
        }
        if let domains = params["domainEnabled"] as? [String: Any] {
            for (key, value) in domains {
                guard let domain = KenosDomain(rawValue: key) else { continue }
                prefs.domainEnabled[domain] = boolValue(value)
            }
        }
    }

    private static func resolveFireAtDate(_ params: [String: Any]) -> Date? {
        if let n = params["fireAt"] as? Double {
            // Heuristic: ms since epoch vs seconds.
            let secs = n > 1_000_000_000_000 ? n / 1000 : n
            return Date(timeIntervalSince1970: secs)
        }
        if let n = params["fireAt"] as? Int {
            let v = Double(n)
            let secs = v > 1_000_000_000_000 ? v / 1000 : v
            return Date(timeIntervalSince1970: secs)
        }
        if let n = params["fireAtMs"] as? Double {
            return Date(timeIntervalSince1970: n / 1000)
        }
        if let n = params["fireAtMs"] as? Int {
            return Date(timeIntervalSince1970: Double(n) / 1000)
        }
        return KenosNotificationISO.date(from: stringValue(params["fireAt"]))
    }

    private static func decodeNotificationRecord(_ params: [String: Any]) throws -> KenosNotificationRecord {
        let typeRaw = stringValue(params["type"])
        guard let type = KenosNotificationType(rawValue: typeRaw.isEmpty ? "plan_reminder" : typeRaw) else {
            throw KenosClientError.malformedPayload
        }
        let title = stringValue(params["safeTitle"]).isEmpty
            ? stringValue(params["title"])
            : stringValue(params["safeTitle"])
        let body = stringValue(params["safeBody"]).isEmpty
            ? stringValue(params["body"])
            : stringValue(params["safeBody"])
        let deepLink = stringValue(params["deepLink"])
        let dedupe = stringValue(params["deduplicationKey"])
        guard !title.isEmpty, !deepLink.isEmpty, !dedupe.isEmpty else {
            throw KenosClientError.malformedPayload
        }
        let risk = KenosRisk(rawValue: stringValue(params["risk"])) ?? .r1
        let classification =
            KenosDataClassification(rawValue: stringValue(params["classification"])) ?? .personal
        let createdAt = stringValue(params["createdAt"]).isEmpty
            ? KenosNotificationISO.nowString()
            : stringValue(params["createdAt"])
        let id = UUID(uuidString: stringValue(params["id"])) ?? UUID()
        return KenosNotificationRecord(
            id: id,
            type: type,
            safeTitle: title,
            safeBody: body.isEmpty ? title : body,
            deepLink: deepLink,
            risk: risk,
            classification: classification,
            createdAt: createdAt,
            expiresAt: {
                let raw = stringValue(params["expiresAt"])
                return raw.isEmpty ? nil : raw
            }(),
            deduplicationKey: dedupe,
            fireAt: {
                let raw = stringValue(params["fireAt"])
                return raw.isEmpty ? nil : raw
            }()
        )
    }

    private static func encodeNotificationRecord(_ record: KenosNotificationRecord) -> [String: Any] {
        var dict: [String: Any] = [
            "id": record.id.uuidString,
            "type": record.type.rawValue,
            "safeTitle": record.safeTitle,
            "safeBody": record.safeBody,
            "deepLink": record.deepLink,
            "risk": record.risk.rawValue,
            "classification": record.classification.rawValue,
            "createdAt": record.createdAt,
            "deduplicationKey": record.deduplicationKey,
        ]
        if let expiresAt = record.expiresAt { dict["expiresAt"] = expiresAt }
        if let fireAt = record.fireAt { dict["fireAt"] = fireAt }
        return dict
    }

    private static func decodeReminderJobs(_ value: Any?) -> [(taskId: String, title: String, fireAtMs: Double)] {
        guard let list = value as? [[String: Any]] else { return [] }
        return list.compactMap { job in
            let taskId = stringValue(job["id"]).isEmpty ? stringValue(job["taskId"]) : stringValue(job["id"])
            let title = stringValue(job["title"])
            let fireAtMs: Double = {
                if let n = job["fireAt"] as? Double { return n }
                if let n = job["fireAt"] as? Int { return Double(n) }
                if let n = job["fireAtMs"] as? Double { return n }
                if let n = job["fireAtMs"] as? Int { return Double(n) }
                return 0
            }()
            guard !taskId.isEmpty, !title.isEmpty, fireAtMs > 0 else { return nil }
            return (taskId: taskId, title: title, fireAtMs: fireAtMs)
        }
    }

    // MARK: - Shell settings broadcast

    /// Push Continuity-wide theme/locale into every live WKWebView (except the writer).
    static func broadcastShellSettings(
        _ snapshot: KenosShellSettingsStore.Snapshot = KenosShellSettingsStore.current,
        excluding writer: WKWebView? = nil
    ) {
        guard let json = jsonString(KenosShellSettingsStore.encode(snapshot)) else { return }
        let js = """
        try {
          window.dispatchEvent(new CustomEvent('kenos:shell-settings', { detail: \(json) }));
        } catch (e) {}
        """
        #if os(iOS)
        for webView in [KenosActiveWebRegistry.shellWebView, KenosActiveWebRegistry.domainWebView]
            .compactMap({ $0 })
        {
            if let writer, webView === writer { continue }
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
        #endif
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
    static let kenosChromeAppearanceDidChange = Notification.Name("kenosChromeAppearanceDidChange")
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
