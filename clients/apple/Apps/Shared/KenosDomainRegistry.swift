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

    struct NavManifest: Equatable {
        var domainId: String
        var slots: [DockSlot]
        var more: [(title: String, systemImage: String, path: String)]
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
        .init(id: "plan", label: "Plan", subtitle: "Tasks and schedule", strategy: .embeddedWeb, appId: "planner", productionOrigin: "https://planner.kenos.space", devPort: 5188, homePath: "/", systemImage: "checklist", aliases: ["planner"], accentRGB: 0xC9A227),
        .init(id: "training", label: "Training", subtitle: "Fitness workouts", strategy: .embeddedWeb, appId: "fitness", productionOrigin: "https://fitness.kenos.space", devPort: 5190, homePath: "/", systemImage: "figure.strengthtraining.traditional", aliases: ["fitness"], accentRGB: 0xC45C4A),
        .init(id: "work", label: "Work", subtitle: "Projects and decisions", strategy: .embeddedWeb, appId: "aios", productionOrigin: "https://aios.kenos.space", devPort: 5219, homePath: "/work", systemImage: "briefcase", aliases: ["work-focus"], accentRGB: 0x6A9BE0),
        .init(id: "money", label: "Money", subtitle: "Finance decisions", strategy: .embeddedWeb, appId: "finance", productionOrigin: "https://finance.kenos.space", devPort: 5180, homePath: "/home/today", systemImage: "dollarsign.circle", aliases: ["finance"], accentRGB: 0x3D9B6E),
        .init(id: "library", label: "Library", subtitle: "Knowledge vault", strategy: .embeddedWeb, appId: "knowledge", productionOrigin: "https://knowledge.kenos.space", devPort: 5879, homePath: "/", systemImage: "books.vertical", aliases: ["knowledge"], accentRGB: 0x5B6BBF),
        .init(id: "music", label: "Music", subtitle: "Library and playback", strategy: .embeddedWeb, appId: "music", productionOrigin: "https://music.kenos.space", devPort: 5189, homePath: "/", systemImage: "music.note", aliases: [], accentRGB: 0x8B7EC8),
        .init(id: "home", label: "Home", subtitle: "Spaces and items", strategy: .embeddedWeb, appId: "home", productionOrigin: "https://home.kenos.space", devPort: 5196, homePath: "/storage", systemImage: "house", aliases: [], accentRGB: 0x7AA0C8),
        .init(id: "health", label: "Health", subtitle: "Status · Focus · Trends", strategy: .embeddedWeb, appId: "health", productionOrigin: "https://health.kenos.space", devPort: 5192, homePath: "/", systemImage: "heart.text.square", aliases: ["focus", "status"], accentRGB: 0x5B6CFF),
        .init(id: "paper", label: "Paper", subtitle: "Notebooks and capture", strategy: .legacyFallback, appId: nil, productionOrigin: nil, devPort: nil, homePath: "/spaces/paper", systemImage: "pencil.and.outline", aliases: ["paperos"], accentRGB: 0x8B7355),
    ]

    /// Domain capsule slots only (native Kenos chip is separate → 5 chrome total).
    static let navigationManifests: [String: NavManifest] = [
        "plan": .init(
            domainId: "plan",
            slots: [
                .init(title: "Tasks", systemImage: "checklist", path: "/"),
                .init(title: "Calendar", systemImage: "calendar", path: "/calendar"),
                .init(title: "Projects", systemImage: "folder", path: "/projects"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                ("Search", "magnifyingglass", "/search"),
                ("Upcoming", "calendar.badge.clock", "/upcoming"),
                ("Inbox", "tray", "/inbox"),
                ("Completed", "checkmark.circle", "/completed"),
                ("Insights", "chart.bar", "/insights"),
            ]
        ),
        "training": .init(
            domainId: "training",
            slots: [
                .init(title: "Today", systemImage: "sun.max", path: "/"),
                .init(title: "Workout", systemImage: "figure.strengthtraining.traditional", path: "/session"),
                .init(title: "Library", systemImage: "books.vertical", path: "/library"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                ("History", "clock", "/discover/records"),
                ("Program", "list.bullet.rectangle", "/program"),
                ("Discover", "sparkles", "/discover"),
                ("Stats", "chart.xyaxis.line", "/discover/stats"),
                ("Tools", "wrench.and.screwdriver", "/discover/tools"),
            ]
        ),
        "work": .init(
            domainId: "work",
            slots: [
                .init(title: "Today", systemImage: "sun.max", path: "/work"),
                .init(title: "Projects", systemImage: "folder", path: "/work"),
                .init(title: "Focus", systemImage: "target", path: "/spaces/work"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                ("Assistant", "bubble.left", "/assistant?scope=work"),
                ("Inbox", "tray", "/inbox"),
                ("Spaces", "square.grid.2x2", "/spaces"),
            ]
        ),
        "money": .init(
            domainId: "money",
            slots: [
                .init(title: "Today", systemImage: "sun.max", path: "/home/today"),
                .init(title: "Transactions", systemImage: "list.bullet", path: "/transactions"),
                .init(title: "Plan", systemImage: "chart.pie", path: "/plan"),
                .init(title: "More", systemImage: "ellipsis", opensMore: true),
            ],
            more: [
                ("Accounts", "building.columns", "/accounts"),
                ("Insights", "chart.bar", "/insights"),
                ("Settings", "gearshape", "/settings"),
            ]
        ),
        "library": .init(
            domainId: "library",
            slots: [
                .init(title: "Notes", systemImage: "note.text", path: "/"),
                .init(title: "Library", systemImage: "books.vertical", path: "/library"),
                .init(title: "Capture", systemImage: "plus.circle", path: "/inbox"),
                .init(title: "Search", systemImage: "magnifyingglass", path: "/recall"),
            ],
            more: [
                ("Projects", "folder", "/projects"),
                ("Timeline", "clock", "/timeline"),
                ("Settings", "gearshape", "/settings"),
            ]
        ),
        "music": .init(
            domainId: "music",
            slots: [
                .init(title: "Now Playing", systemImage: "play.circle", path: "/"),
                .init(title: "Library", systemImage: "music.note.list", path: "/library"),
                .init(title: "Discover", systemImage: "sparkles", path: "/discover"),
                .init(title: "Search", systemImage: "magnifyingglass", path: "/search"),
            ],
            more: []
        ),
        "home": .init(
            domainId: "home",
            slots: [
                .init(title: "Home", systemImage: "house", path: "/"),
                .init(title: "Rooms", systemImage: "square.grid.3x3", path: "/storage"),
                .init(title: "Items", systemImage: "shippingbox", path: "/items"),
                .init(title: "Organize", systemImage: "arrow.triangle.2.circlepath", path: "/organize"),
            ],
            more: []
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
                ("Settings", "gearshape", "/settings"),
            ]
        ),
        "paper": .init(
            domainId: "paper",
            slots: [
                .init(title: "Recent", systemImage: "clock", path: "/spaces/paper"),
                .init(title: "Notebooks", systemImage: "books.vertical", path: "/spaces/paper"),
                .init(title: "Capture", systemImage: "plus.circle", path: "/spaces/paper"),
                .init(title: "Search", systemImage: "magnifyingglass", path: "/spaces/paper"),
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

    /// Space catalog domains (excludes Kenos system home).
    static var shelfDomainDefinitions: [Definition] {
        definitions.filter { $0.id != "kenos" }
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
        guard let def = definition(for: domainId) else { return nil }
        if def.id == "work" {
            return KenosDailyBetaConfig.isEnabled
                ? KenosDailyBetaConfig.pathURL(def.homePath)
                : URL(string: "https://aios.kenos.space\(def.homePath)")
        }
        if def.id == "paper" {
            return KenosDailyBetaConfig.isEnabled
                ? KenosDailyBetaConfig.pathURL(def.homePath)
                : nil
        }
        if KenosDailyBetaConfig.isEnabled, let port = def.devPort {
            return rewritePort(KenosDailyBetaConfig.kenOsOrigin, to: port, path: def.homePath)
        }
        if let origin = def.productionOrigin {
            return URL(string: origin + def.homePath)
        }
        return nil
    }

    private static func rewritePort(_ base: URL, to port: Int, path: String) -> URL {
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false) ?? URLComponents()
        c.port = port
        c.path = path.hasPrefix("/") ? path : "/\(path)"
        c.query = nil
        c.fragment = nil
        return c.url ?? base
    }
}
