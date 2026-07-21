import Foundation
import SwiftUI

/// Swift mirror of `apps/aios/src/lib/kenos/domainIntegration.core.js`.
///
/// **SSOT:** JS `domainIntegration.core.js` (documented). This file must stay
/// ID / port / homePath / dock-slot aligned. Do not invent a second long-term registry.
enum KenosDomainRegistry {
    enum Strategy: String {
        case native
        case embeddedWeb = "embedded_web"
        case legacyFallback = "legacy_fallback"
    }

    struct Definition: Identifiable, Equatable {
        var id: String
        var label: String
        var subtitle: String
        var strategy: Strategy
        var appId: String?
        var productionOrigin: String?
        var devPort: Int?
        var homePath: String
        var systemImage: String
        var aliases: [String]
        var accentRGB: UInt32
    }

    struct DockSlot: Equatable {
        var title: String
        var systemImage: String
        var path: String? = nil
        var opensMore: Bool = false
    }

    struct MoreItem: Equatable {
        var title: String
        var systemImage: String
        var path: String
    }

    struct NavManifest: Equatable {
        var domainId: String
        var slots: [DockSlot]
        var more: [MoreItem]
    }

    /// Legacy product names → frozen domain id (finance→money, knowledge→library).
    static let aliases: [String: String] = [
        "finance": "money",
        "financeos": "money",
        "finance-os": "money",
        "knowledge": "library",
        "knowledgeos": "library",
        "knowledge-os": "library",
        "fitness": "training",
        "fitnessos": "training",
        "planner": "plan",
        "planner-os": "plan",
        "focus": "health",
        "status": "health",
        "paperos": "paper",
        "paper-os": "paper",
        "work-focus": "work",
    ]

    static let definitions: [Definition] = [
        .init(id: "kenos", label: "Kenos", subtitle: "Today · Assistant · Inbox", strategy: .native, appId: "aios", productionOrigin: "https://aios.kenos.space", devPort: 5219, homePath: "/", systemImage: "circle.grid.2x2.fill", aliases: [], accentRGB: 0x5B8CFF),
        .init(id: "plan", label: "Plan", subtitle: "Tasks and schedule", strategy: .embeddedWeb, appId: "planner", productionOrigin: "https://planner.kenos.space", devPort: 5188, homePath: "/", systemImage: "checklist", aliases: ["planner", "planner-os"], accentRGB: 0xC9A227),
        .init(id: "training", label: "Training", subtitle: "Fitness workouts", strategy: .embeddedWeb, appId: "fitness", productionOrigin: "https://fitness.kenos.space", devPort: 5190, homePath: "/", systemImage: "figure.strengthtraining.traditional", aliases: ["fitness", "fitnessos"], accentRGB: 0xC45C4A),
        .init(id: "work", label: "Work", subtitle: "Projects and decisions", strategy: .embeddedWeb, appId: "aios", productionOrigin: "https://aios.kenos.space", devPort: 5219, homePath: "/work", systemImage: "briefcase", aliases: ["work-focus"], accentRGB: 0x6A9BE0),
        .init(id: "money", label: "Money", subtitle: "Finance decisions", strategy: .embeddedWeb, appId: "finance", productionOrigin: "https://finance.kenos.space", devPort: 5180, homePath: "/home/today", systemImage: "dollarsign.circle", aliases: ["finance", "financeos", "finance-os"], accentRGB: 0x3D9B6E),
        .init(id: "library", label: "Library", subtitle: "Knowledge vault", strategy: .embeddedWeb, appId: "knowledge", productionOrigin: "https://knowledge.kenos.space", devPort: 5879, homePath: "/library", systemImage: "books.vertical", aliases: ["knowledge", "knowledgeos", "knowledge-os"], accentRGB: 0x5B6BBF),
        .init(id: "music", label: "Music", subtitle: "Library and playback", strategy: .embeddedWeb, appId: "music", productionOrigin: "https://music.kenos.space", devPort: 5189, homePath: "/", systemImage: "music.note", aliases: [], accentRGB: 0x8B7EC8),
        .init(id: "home", label: "Home", subtitle: "Rooms · Items · Organize", strategy: .embeddedWeb, appId: "home", productionOrigin: "https://home.kenos.space", devPort: 5196, homePath: "/plan", systemImage: "house", aliases: [], accentRGB: 0x7AA0C8),
        .init(id: "health", label: "Health", subtitle: "Status · Focus · Trends", strategy: .embeddedWeb, appId: "health", productionOrigin: "https://health.kenos.space", devPort: 5192, homePath: "/", systemImage: "heart.text.square", aliases: ["focus", "status"], accentRGB: 0x5B6CFF),
        .init(id: "paper", label: "Paper", subtitle: "Notebooks and capture", strategy: .legacyFallback, appId: nil, productionOrigin: nil, devPort: nil, homePath: "/spaces/paper", systemImage: "pencil.and.outline", aliases: ["paperos", "paper-os"], accentRGB: 0x8B7355),
    ]

    /// Domain capsule slots only (native Kenos chip is separate → 5 chrome total).
    static let navigationManifests: [String: NavManifest] = [
        "plan": .init(
            domainId: "plan",
            slots: [
                .init(title: "Tasks", systemImage: "checklist", path: "/"),
                .init(title: "Calendar", systemImage: "calendar", path: "/calendar"),
                .init(title: "Inbox", systemImage: "tray", path: "/inbox"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                .init(title: "Search", systemImage: "magnifyingglass", path: "/search"),
                .init(title: "Upcoming", systemImage: "calendar.badge.clock", path: "/upcoming"),
                .init(title: "Triage", systemImage: "sparkles", path: "/triage"),
                .init(title: "Projects", systemImage: "folder", path: "/projects"),
                .init(title: "Completed", systemImage: "checkmark.circle", path: "/completed"),
                .init(title: "Insights", systemImage: "chart.bar", path: "/insights"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        "training": .init(
            domainId: "training",
            slots: [
                .init(title: "Today", systemImage: "sun.max", path: "/"),
                .init(title: "Program", systemImage: "list.bullet.rectangle", path: "/program"),
                .init(title: "Discover", systemImage: "sparkles", path: "/discover"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                .init(title: "Workout", systemImage: "figure.strengthtraining.traditional", path: "/session"),
                .init(title: "History", systemImage: "clock", path: "/discover/records"),
                .init(title: "Library", systemImage: "books.vertical", path: "/library"),
                .init(title: "Stats", systemImage: "chart.xyaxis.line", path: "/discover/stats"),
                .init(title: "Tools", systemImage: "wrench.and.screwdriver", path: "/discover/tools"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        "work": .init(
            domainId: "work",
            slots: [
                .init(title: "Today", systemImage: "sun.max", path: "/work"),
                .init(title: "Focus", systemImage: "target", path: "/spaces/work"),
                .init(title: "Inbox", systemImage: "tray", path: "/inbox"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                .init(title: "Assistant", systemImage: "bubble.left", path: "/assistant?scope=work"),
                .init(title: "Spaces", systemImage: "square.grid.2x2", path: "/spaces"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        "money": .init(
            domainId: "money",
            slots: [
                .init(title: "Today", systemImage: "sun.max", path: "/home/today"),
                .init(title: "History", systemImage: "list.bullet", path: "/history/insights"),
                .init(title: "Accounts", systemImage: "building.columns", path: "/accounts"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                .init(title: "Forecast", systemImage: "chart.line.uptrend.xyaxis", path: "/forecast/forecast"),
                .init(title: "Stocks", systemImage: "chart.bar", path: "/stocks"),
                .init(title: "Decision", systemImage: "arrow.left.arrow.right", path: "/decision/compare"),
                .init(title: "Review", systemImage: "checklist", path: "/review/import"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings/app#cloud"),
            ]
        ),
        "library": .init(
            domainId: "library",
            slots: [
                .init(title: "Inbox", systemImage: "tray", path: "/"),
                .init(title: "Library", systemImage: "books.vertical", path: "/library"),
                .init(title: "Recall", systemImage: "magnifyingglass", path: "/recall"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                .init(title: "Projects", systemImage: "folder", path: "/projects"),
                .init(title: "Timeline", systemImage: "clock", path: "/timeline"),
                .init(title: "Overview", systemImage: "chart.bar", path: "/overview"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        "music": .init(
            domainId: "music",
            slots: [
                .init(title: "Home", systemImage: "house", path: "/"),
                .init(title: "Search", systemImage: "magnifyingglass", path: "/search"),
                .init(title: "Library", systemImage: "music.note.list", path: "/library"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                .init(title: "Playlists", systemImage: "list.bullet", path: "/playlists"),
                .init(title: "Liked", systemImage: "heart", path: "/liked"),
                .init(title: "Browse", systemImage: "sparkles", path: "/browse"),
                .init(title: "Import", systemImage: "square.and.arrow.down", path: "/import"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        "home": .init(
            domainId: "home",
            slots: [
                .init(title: "Rooms", systemImage: "square.grid.2x2", path: "/plan"),
                .init(title: "Items", systemImage: "archivebox", path: "/storage"),
                .init(title: "Organize", systemImage: "checklist", path: "/tidy"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                // Companion HomeScan (ios/home-scan) — RoomPlan / AR; not embedded WKWebView.
                .init(title: "Scan", systemImage: "camera.metering.matrix", path: "homescan://scan"),
                .init(title: "Find", systemImage: "location.magnifyingglass", path: "homescan://find"),
                .init(title: "Cabinet", systemImage: "shippingbox", path: "homescan://container"),
                .init(title: "Cloud scans", systemImage: "icloud.and.arrow.down", path: "/settings#cloud"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        "health": .init(
            domainId: "health",
            slots: [
                .init(title: "Status", systemImage: "heart.text.square", path: "/"),
                .init(title: "Focus", systemImage: "target", path: "/focus"),
                .init(title: "Trends", systemImage: "chart.line.uptrend.xyaxis", path: "/trends"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        // Paper is legacy_fallback (hosted stub) — single honest slot, no fake multi-tab docks.
        "paper": .init(
            domainId: "paper",
            slots: [
                .init(title: "Paper", systemImage: "pencil.and.outline", path: "/spaces/paper"),
            ],
            more: []
        ),
    ]

    static func canonicalize(_ raw: String?) -> String? {
        guard var key = raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !key.isEmpty else {
            return nil
        }
        if key.hasPrefix("hosted:") || key.hasPrefix("external:") {
            key = String(key.split(separator: ":", maxSplits: 1).last ?? Substring(key))
            key = key.split(separator: "#").first.map(String.init) ?? key
        }
        if let aliased = aliases[key] { return aliased }
        if definitions.contains(where: { $0.id == key }) { return key }
        return nil
    }

    static func definition(for raw: String?) -> Definition? {
        guard let id = canonicalize(raw) else { return nil }
        return definitions.first(where: { $0.id == id })
    }

    static func navigationManifest(for raw: String?) -> NavManifest? {
        guard let id = canonicalize(raw), id != "kenos" else { return nil }
        return navigationManifests[id]
    }

    /// Primary capsule path (first non-More slot), else registry `homePath`.
    static func primaryDockPath(for raw: String?) -> String {
        guard let id = canonicalize(raw) else { return "/" }
        if let path = navigationManifest(for: id)?.slots.first(where: { !$0.opensMore })?.path,
           !path.isEmpty
        {
            return path
        }
        return definition(for: id)?.homePath ?? "/"
    }

    /// Normalize Continuity paths for dock / home matching (aliases mirror `syncDomainDockSlot`).
    static func normalizeContinuityPath(_ raw: String, domainId rawDomainId: String?) -> String {
        var path = raw.lowercased()
        if path.isEmpty { path = "/" }
        guard let id = canonicalize(rawDomainId) else { return path }
        switch id {
        case "plan":
            if path.hasPrefix("/triage") || path.hasPrefix("/today") { return "/" }
            if path.hasPrefix("/schedule") { return "/calendar" }
        case "training":
            if path.hasPrefix("/day/"),
               !path.hasSuffix("/focus"),
               !path.hasSuffix("/summary")
            {
                return "/program"
            }
        default:
            break
        }
        return path
    }

    /// True when the path is the domain's primary dock surface (app "home" tab).
    static func isDomainHomePath(_ raw: String, domainId rawDomainId: String?) -> Bool {
        guard let id = canonicalize(rawDomainId) else { return true }
        let path = normalizeContinuityPath(raw, domainId: id)
        let home = primaryDockPath(for: id).lowercased()
        if home == "/" || home.isEmpty {
            return path == "/" || path.isEmpty
        }
        return path == home
    }

    /// Space catalog domains (excludes Kenos system home).
    static var shelfDomainDefinitions: [Definition] {
        definitions.filter { $0.id != "kenos" }
    }

    /// Continuity WKWebView Daily Beta ports (embedded_web apps only; excludes aios/work).
    static var embeddedWebDevPorts: Set<Int> {
        Set(
            definitions.compactMap { def -> Int? in
                guard def.strategy == .embeddedWeb, def.appId != "aios", let port = def.devPort else {
                    return nil
                }
                return port
            }
        )
    }

    /// Health Continuity may receive raw day aggregates (`__KENOS_APPLE_HEALTH__`).
    static func allowsAppleHealthDaysInjection(for url: URL?) -> Bool {
        guard let url else { return false }
        return domainId(fromContinuity: url) == "health"
    }

    /// Kenos shell (+ Health) may receive privacy-safe readiness only.
    /// Other Continuity domains get neither days nor readiness.
    static func allowsHealthReadinessInjection(for url: URL?) -> Bool {
        guard let url else { return false }
        if allowsAppleHealthDaysInjection(for: url) { return true }
        return !isEmbeddedWebContinuityURL(url)
    }

    /// True when URL is an embedded domain Continuity origin (LAN port or *.kenos.space).
    static func isEmbeddedWebContinuityURL(_ url: URL) -> Bool {
        let path = url.path
        // Work shares AIOS origin but owns Domain Mode dock (not Kenos tabs).
        if path.hasPrefix("/work") || path.hasPrefix("/spaces/work") {
            return true
        }
        if let port = url.port, embeddedWebDevPorts.contains(port) {
            return true
        }
        let host = (url.host ?? "").lowercased()
        for def in definitions where def.strategy == .embeddedWeb && def.appId != "aios" {
            if let origin = def.productionOrigin,
               let originHost = URL(string: origin)?.host?.lowercased(),
               host == originHost || host.contains(originHost)
            {
                return true
            }
            if host.contains("\(def.id).kenos") { return true }
            if def.aliases.contains(where: { host.contains("\($0).kenos") || host.contains($0) }) {
                return true
            }
        }
        return false
    }

    static func accentColor(for spaceId: String) -> Color {
        let id = canonicalize(spaceId) ?? spaceId
        let rgb = definition(for: id)?.accentRGB ?? 0x5B8CFF
        return Color(
            red: Double((rgb >> 16) & 0xFF) / 255.0,
            green: Double((rgb >> 8) & 0xFF) / 255.0,
            blue: Double(rgb & 0xFF) / 255.0
        )
    }

    static func domainId(fromContinuity url: URL?) -> String {
        guard let url else { return "domain" }
        let host = (url.host ?? "").lowercased()
        let port = url.port
        let path = url.path

        if path.hasPrefix("/work") || path.hasPrefix("/spaces/work") { return "work" }
        if path.hasPrefix("/spaces/paper") { return "paper" }

        for def in definitions where def.id != "kenos" {
            if let p = def.devPort, port == p {
                if def.id == "work" || def.appId == "aios" {
                    if path.hasPrefix("/work") || path.hasPrefix("/spaces/work") { return "work" }
                    continue
                }
                return def.id
            }
            if let origin = def.productionOrigin,
               let originHost = URL(string: origin)?.host?.lowercased(),
               host == originHost || host.contains(def.id)
            {
                return def.id
            }
            if def.aliases.contains(where: { host.contains($0) }) { return def.id }
        }

        if host.contains("planner") || port == 5188 { return "plan" }
        if host.contains("fitness") || port == 5190 { return "training" }
        if host.contains("finance") || port == 5180 { return "money" }
        if host.contains("music") || port == 5189 { return "music" }
        if host.contains("home") || port == 5196 { return "home" }
        if host.contains("knowledge") || port == 5879 { return "library" }
        if host.contains("health") || port == 5192 { return "health" }
        return "domain"
    }

    /// Home URL for Continuity launch (Daily Beta LAN ports when enabled).
    static func homeURL(for domainId: String) -> URL? {
        continuityURL(for: domainId, path: nil)
    }

    /// Continuity URL with optional path override (App Intents / Shortcuts).
    static func continuityURL(for domainId: String, path: String? = nil) -> URL? {
        guard let def = definition(for: domainId) else { return nil }
        let resolvedPath: String = {
            guard let path, !path.isEmpty else { return def.homePath }
            return path.hasPrefix("/") ? path : "/\(path)"
        }()
        // Production override (LAN offline / Owner choice) — always use public origins.
        if KenosDailyBetaConfig.useProductionOverride {
            return productionContinuityURL(for: domainId, path: resolvedPath)
        }
        if def.id == "work" || def.id == "paper" || def.id == "kenos" {
            if KenosDailyBetaConfig.isEnabled {
                return KenosDailyBetaConfig.pathURL(resolvedPath)
            }
            if def.id == "paper" { return nil }
            return URL(string: "https://aios.kenos.space\(resolvedPath)")
        }
        if KenosDailyBetaConfig.isEnabled, let port = def.devPort {
            return rewritePort(KenosDailyBetaConfig.kenOsOrigin, to: port, path: resolvedPath)
        }
        if let origin = def.productionOrigin {
            return URL(string: origin + resolvedPath)
        }
        return nil
    }

    /// Public `*.kenos.space` Continuity URL (cellular-reachable).
    static func productionContinuityURL(for domainId: String, path: String? = nil) -> URL? {
        guard let def = definition(for: domainId) else { return nil }
        let resolvedPath: String = {
            guard let path, !path.isEmpty else { return def.homePath }
            return path.hasPrefix("/") ? path : "/\(path)"
        }()
        if def.id == "paper" {
            return URL(string: "https://aios.kenos.space\(resolvedPath)")
        }
        if def.id == "work" || def.id == "kenos" {
            return URL(string: "https://aios.kenos.space\(resolvedPath)")
        }
        guard let origin = def.productionOrigin else { return nil }
        return URL(string: origin + resolvedPath)
    }

    /// Rewrite a live Continuity URL onto the domain's production origin (keep path/query).
    static func rewriteToProduction(_ url: URL) -> URL? {
        let id = domainId(fromContinuity: url)
        guard id != "domain" else { return nil }
        var path = url.path.isEmpty ? "/" : url.path
        if let query = url.query, !query.isEmpty { path += "?\(query)" }
        if let fragment = url.fragment, !fragment.isEmpty { path += "#\(fragment)" }
        return productionContinuityURL(for: id, path: path)
    }

    private static func rewritePort(_ base: URL, to port: Int, path: String) -> URL {
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        c.port = port
        applyPathQueryFragment(path, to: &c)
        return c.url ?? base
    }

    /// Split `/path?query#fragment` into URLComponents fields (More sheet `#cloud` deep links).
    private static func applyPathQueryFragment(_ raw: String, to components: inout URLComponents) {
        var remainder = raw
        var fragment: String?
        if let hash = remainder.firstIndex(of: "#") {
            fragment = String(remainder[remainder.index(after: hash)...])
            remainder = String(remainder[..<hash])
        }
        var query: String?
        if let q = remainder.firstIndex(of: "?") {
            query = String(remainder[remainder.index(after: q)...])
            remainder = String(remainder[..<q])
        }
        if remainder.isEmpty {
            components.path = "/"
        } else {
            components.path = remainder.hasPrefix("/") ? remainder : "/\(remainder)"
        }
        components.query = query
        components.fragment = fragment
    }
}
