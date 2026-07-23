import Foundation
import WebKit

#if os(iOS)

/// Debug-only Web surface lifecycle counters — P1 evidence that chrome/overlay
/// state changes never recreate WKWebViews (in BOTH shells; the hooks live in
/// the shared owner `KenosWebSurfaceView`).
///
/// Tracks the **live instance set** per surface kind (`shell` / `domain`) so
/// "two keep-alive layers coexist and update alternately" (normal SwiftUI) is
/// distinguishable from "a WKWebView was recreated" (the P1 regression).
/// WebView identity is a short ObjectIdentifier hash — never URLs or tokens
/// (Release compiles the hooks out entirely).
@MainActor
enum KorbenSurfaceLifecycleLog {
    struct Counters {
        var created = 0
        var updated = 0
        var dismantled = 0
        var navStarted = 0
        var navFinished = 0
        var hardLoads = 0
        var softNavs = 0
        var processTerminations = 0
    }

    private(set) static var byKind: [String: Counters] = [:]
    /// Live (created, not yet dismantled) instance tags per kind.
    private(set) static var liveByKind: [String: Set<String>] = [:]

    private static func instanceTag(_ webView: WKWebView) -> String {
        // 用完整 ObjectIdentifier 哈希做集合键 —— 之前 %0xFFFF 压到 65535 桶,
        // 两个活实例可能撞同 tag 被 Set 去重,liveCount 偏低误导「是否重建」判读。
        String(UInt(bitPattern: ObjectIdentifier(webView).hashValue), radix: 16)
    }

    static func didCreate(_ webView: WKWebView, kind: String) {
        #if DEBUG
        var c = byKind[kind, default: Counters()]
        c.created += 1
        byKind[kind] = c
        let tag = instanceTag(webView)
        liveByKind[kind, default: []].insert(tag)
        // Info level — persisted by `log show` (debug level is not).
        KenosLog.info("korben.surface create", category: .web, metadata: [
            "kind": kind,
            "instance": tag,
            "createCount": String(c.created),
            "liveCount": String(liveByKind[kind]?.count ?? 0),
            "shellV2": KorbenShellV2Feature.isEnabled ? "1" : "0",
        ])
        #endif
    }

    static func didUpdate(_ webView: WKWebView, kind: String) {
        #if DEBUG
        var c = byKind[kind, default: Counters()]
        c.updated += 1
        byKind[kind] = c
        let tag = instanceTag(webView)
        // An update from an instance we never saw created (or already saw
        // dismantled) is the true anomaly — a rebuilt representable.
        if liveByKind[kind]?.contains(tag) != true {
            liveByKind[kind, default: []].insert(tag)
            KenosLog.warning("korben.surface UNTRACKED instance on update", category: .web, metadata: [
                "kind": kind,
                "instance": tag,
                "liveCount": String(liveByKind[kind]?.count ?? 0),
            ])
        }
        #endif
    }

    static func didDismantle(_ webView: WKWebView, kind: String) {
        #if DEBUG
        var c = byKind[kind, default: Counters()]
        c.dismantled += 1
        byKind[kind] = c
        let tag = instanceTag(webView)
        liveByKind[kind]?.remove(tag)
        KenosLog.info("korben.surface dismantle", category: .web, metadata: [
            "kind": kind,
            "instance": tag,
            "dismantleCount": String(c.dismantled),
            "liveCount": String(liveByKind[kind]?.count ?? 0),
            "shellV2": KorbenShellV2Feature.isEnabled ? "1" : "0",
        ])
        #endif
    }

    /// Navigation lifecycle — proves whether returning to a Space re-navigated
    /// the page (state loss) or left the DOM untouched (state preserved).
    /// Records HOST ONLY — never query, fragment, tokens, or page content.
    enum NavEvent: String {
        case start          // didStartProvisionalNavigation
        case finish         // didFinish
        case hardLoad       // explicit load() (loadSeedingSSO / recovery reload)
        case softNav        // SPA client-side navigation (synthetic <a>)
        case processTerm    // webViewWebContentProcessDidTerminate
    }

    static func didNavigate(
        _ webView: WKWebView,
        kind: String,
        event: NavEvent
    ) {
        #if DEBUG
        var c = byKind[kind, default: Counters()]
        switch event {
        case .start: c.navStarted += 1
        case .finish: c.navFinished += 1
        case .hardLoad: c.hardLoads += 1
        case .softNav: c.softNavs += 1
        case .processTerm: c.processTerminations += 1
        }
        byKind[kind] = c
        KenosLog.info("korben.surface nav", category: .web, metadata: [
            "kind": kind,
            "event": event.rawValue,
            "instance": instanceTag(webView),
            "host": webView.url?.host ?? "-",
            "backForwardCount": String(
                webView.backForwardList.backList.count
                    + webView.backForwardList.forwardList.count
                    + (webView.backForwardList.currentItem != nil ? 1 : 0)
            ),
            "navStart": String(c.navStarted),
            "navFinish": String(c.navFinished),
            "hardLoads": String(c.hardLoads),
            "softNavs": String(c.softNavs),
            "procTerm": String(c.processTerminations),
        ])
        #endif
    }

    /// One-line acceptance summary, e.g. `shell c1 u42 d0 live1 · domain c2 u17 d1 live1`.
    static func summary() -> String {
        byKind
            .sorted { $0.key < $1.key }
            .map {
                "\($0.key) c\($0.value.created) u\($0.value.updated) d\($0.value.dismantled) live\(liveByKind[$0.key]?.count ?? 0)"
            }
            .joined(separator: " · ")
    }
}

#endif
