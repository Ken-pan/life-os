import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Content chrome appearance for status bar + WK first-paint canvas.
/// Light content → dark status-bar foreground; dark content → light foreground.
enum KenosChromeAppearance: String, Equatable, CaseIterable {
    case light
    case dark

    var colorScheme: ColorScheme {
        self == .light ? .light : .dark
    }

    /// Brand-approximate canvas used under Liquid Glass / load veil (not a flash of the opposite pole).
    var canvasColor: Color {
        switch self {
        case .light:
            return Color(red: 0.961, green: 0.953, blue: 0.941) // planner --bg #f5f3f0
        case .dark:
            return Color(red: 0.031, green: 0.035, blue: 0.039) // Kenos ink #08090a
        }
    }

    #if canImport(UIKit)
    var uiColor: UIColor {
        switch self {
        case .light:
            return UIColor(red: 0.961, green: 0.953, blue: 0.941, alpha: 1)
        case .dark:
            return UIColor(red: 0.031, green: 0.035, blue: 0.039, alpha: 1)
        }
    }
    #endif

    /// Status bar / chrome foreground polarity implied by this canvas.
    var statusBarUsesLightContent: Bool { self == .dark }

    static func parse(_ raw: String?) -> KenosChromeAppearance? {
        switch (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }
}

/// Per-Space semantic accent — never one hex for light + dark + glass.
/// Mirror: `apps/aios/src/lib/kenos/domainIdentity.core.js`.
struct KenosDomainAccent: Equatable {
    var accentLight: UInt32
    var accentDark: UInt32
    var accentOnGlassLight: UInt32
    var accentOnGlassDark: UInt32
    /// Selected dock plate opacity on light glass (~10%).
    var selectionPlateOpacityLight: Double
    /// Selected dock plate opacity on dark glass (~14%).
    var selectionPlateOpacityDark: Double

    /// Legacy single channel (widgets / glances) — prefer dark brand.
    var accentRGB: UInt32 { accentDark }

    init(
        light: UInt32,
        dark: UInt32,
        onGlassLight: UInt32,
        onGlassDark: UInt32,
        plateLight: Double = 0.10,
        plateDark: Double = 0.14
    ) {
        self.accentLight = light
        self.accentDark = dark
        self.accentOnGlassLight = onGlassLight
        self.accentOnGlassDark = onGlassDark
        self.selectionPlateOpacityLight = plateLight
        self.selectionPlateOpacityDark = plateDark
    }

    func rgb(for scheme: ColorScheme) -> UInt32 {
        scheme == .dark ? accentDark : accentLight
    }

    func onGlassRGB(for scheme: ColorScheme) -> UInt32 {
        scheme == .dark ? accentOnGlassDark : accentOnGlassLight
    }

    func selectionPlateOpacity(for scheme: ColorScheme) -> Double {
        scheme == .dark ? selectionPlateOpacityDark : selectionPlateOpacityLight
    }

    func color(for scheme: ColorScheme) -> Color {
        Self.color(rgb: rgb(for: scheme))
    }

    func onGlass(for scheme: ColorScheme) -> Color {
        Self.color(rgb: onGlassRGB(for: scheme))
    }

    /// Adapts with the environment color scheme.
    var adaptiveColor: Color {
        #if canImport(UIKit)
        Color(
            uiColor: UIColor { traits in
                let rgb = traits.userInterfaceStyle == .dark ? accentDark : accentLight
                return Self.uiColor(rgb: rgb)
            }
        )
        #else
        color(for: .dark)
        #endif
    }

    var adaptiveOnGlass: Color {
        #if canImport(UIKit)
        Color(
            uiColor: UIColor { traits in
                let rgb = traits.userInterfaceStyle == .dark
                    ? accentOnGlassDark
                    : accentOnGlassLight
                return Self.uiColor(rgb: rgb)
            }
        )
        #else
        onGlass(for: .dark)
        #endif
    }

    static func color(rgb: UInt32) -> Color {
        Color(
            red: Double((rgb >> 16) & 0xFF) / 255.0,
            green: Double((rgb >> 8) & 0xFF) / 255.0,
            blue: Double(rgb & 0xFF) / 255.0
        )
    }

    #if canImport(UIKit)
    static func uiColor(rgb: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1
        )
    }
    #endif

    // Brand presets — light = deeper for cream/glass; dark = brighter brand.
    static let kenos = KenosDomainAccent(
        light: 0x3D6FD4, dark: 0x5B8CFF,
        onGlassLight: 0x2F5BB8, onGlassDark: 0x7AA3FF
    )
    /// Plan — light ochre aligns planner `--accent` #c47a08; never use #C9A227 on light glass.
    /// onGlassLight ~12% deeper than #9A6410 so check / icon hold on cream Shelf tint.
    static let plan = KenosDomainAccent(
        light: 0xC47A08, dark: 0xD4AE2E,
        onGlassLight: 0x87580E, onGlassDark: 0xE0B83A,
        plateLight: 0.10, plateDark: 0.14
    )
    static let training = KenosDomainAccent(
        light: 0xA8483A, dark: 0xC45C4A,
        onGlassLight: 0x943C30, onGlassDark: 0xE0705C
    )
    static let work = KenosDomainAccent(
        light: 0x4A7AB0, dark: 0x6A9BE0,
        onGlassLight: 0x3A6494, onGlassDark: 0x86B4EB
    )
    static let money = KenosDomainAccent(
        light: 0x2F7A52, dark: 0x3D9B6E,
        onGlassLight: 0x276645, onGlassDark: 0x4DB882
    )
    static let library = KenosDomainAccent(
        light: 0x4A58A0, dark: 0x5B6BBF,
        onGlassLight: 0x3D4A8A, onGlassDark: 0x7A88D4
    )
    static let music = KenosDomainAccent(
        light: 0x6E629E, dark: 0x8B7EC8,
        onGlassLight: 0x5A4F88, onGlassDark: 0xA698DB
    )
    static let home = KenosDomainAccent(
        light: 0x5A7088, dark: 0x8AADC8,
        onGlassLight: 0x4A5F74, onGlassDark: 0x9BBDD4
    )
    static let health = KenosDomainAccent(
        light: 0x4556D4, dark: 0x5B6CFF,
        onGlassLight: 0x3846B8, onGlassDark: 0x7A88FF
    )
    static let paper = KenosDomainAccent(
        light: 0x6E5A42, dark: 0x8B7355,
        onGlassLight: 0x5A4834, onGlassDark: 0xC4A882
    )
}

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
        var accent: KenosDomainAccent

        /// Legacy RGB — dark brand channel (widgets / App Group glances).
        var accentRGB: UInt32 { accent.accentRGB }
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
        .init(id: "kenos", label: "Kenos", subtitle: "Today · Ask · Inbox", strategy: .native, appId: "aios", productionOrigin: "https://www.kenos.space", devPort: 5219, homePath: "/", systemImage: "circle.grid.2x2.fill", aliases: [], accent: .kenos),
        .init(id: "plan", label: "Plan", subtitle: "Tasks and schedule", strategy: .embeddedWeb, appId: "planner", productionOrigin: "https://planner.kenos.space", devPort: 5188, homePath: "/", systemImage: "checklist", aliases: ["planner", "planner-os"], accent: .plan),
        .init(id: "training", label: "Training", subtitle: "Fitness workouts", strategy: .embeddedWeb, appId: "fitness", productionOrigin: "https://fitness.kenos.space", devPort: 5190, homePath: "/", systemImage: "figure.strengthtraining.traditional", aliases: ["fitness", "fitnessos"], accent: .training),
        .init(id: "work", label: "Work", subtitle: "Projects and decisions", strategy: .embeddedWeb, appId: "aios", productionOrigin: "https://www.kenos.space", devPort: 5219, homePath: "/work", systemImage: "briefcase", aliases: ["work-focus"], accent: .work),
        .init(id: "money", label: "Money", subtitle: "Finance decisions", strategy: .embeddedWeb, appId: "finance", productionOrigin: "https://finance.kenos.space", devPort: 5180, homePath: "/home/today", systemImage: "dollarsign.circle", aliases: ["finance", "financeos", "finance-os"], accent: .money),
        .init(id: "library", label: "Library", subtitle: "Knowledge vault", strategy: .embeddedWeb, appId: "knowledge", productionOrigin: "https://knowledge.kenos.space", devPort: 5879, homePath: "/library", systemImage: "books.vertical", aliases: ["knowledge", "knowledgeos", "knowledge-os"], accent: .library),
        .init(id: "music", label: "Music", subtitle: "Library and playback", strategy: .embeddedWeb, appId: "music", productionOrigin: "https://music.kenos.space", devPort: 5189, homePath: "/", systemImage: "music.note", aliases: [], accent: .music),
        // Household Space — zh UI shows 「家」; never collide with Kenos system home.
        .init(id: "home", label: "Home", subtitle: "Rooms · Items · Organize", strategy: .embeddedWeb, appId: "home", productionOrigin: "https://home.kenos.space", devPort: 5196, homePath: "/plan", systemImage: "house", aliases: [], accent: .home),
        .init(id: "health", label: "Health", subtitle: "Status · Focus · Trends", strategy: .embeddedWeb, appId: "health", productionOrigin: "https://health.kenos.space", devPort: 5192, homePath: "/", systemImage: "heart.text.square", aliases: ["focus", "status"], accent: .health),
        .init(id: "paper", label: "Paper", subtitle: "Notebooks and capture", strategy: .legacyFallback, appId: nil, productionOrigin: nil, devPort: nil, homePath: "/spaces/paper", systemImage: "pencil.and.outline", aliases: ["paperos", "paper-os"], accent: .paper),
    ]

    /// Domain capsule destinations only (Spaces Orb separate; More lives in domain header).
    static let navigationManifests: [String: NavManifest] = [
        "plan": .init(
            domainId: "plan",
            slots: [
                .init(title: "Tasks", systemImage: "checklist", path: "/"),
                .init(title: "Calendar", systemImage: "calendar", path: "/calendar"),
                .init(title: "Inbox", systemImage: "tray", path: "/inbox")
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
                // "Resources" avoids colliding with Knowledge/Music dock title "Library".
                .init(title: "Resources", systemImage: "books.vertical", path: "/discover")
            ],
            more: [
                .init(title: "Workout", systemImage: "figure.strengthtraining.traditional", path: "/session"),
                .init(title: "History", systemImage: "clock", path: "/discover/records"),
                .init(title: "Exercises", systemImage: "dumbbell.fill", path: "/library"),
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
                .init(title: "Inbox", systemImage: "tray", path: "/inbox")
            ],
            more: [
                .init(title: "Ask", systemImage: "bubble.left", path: "/assistant?scope=work"),
                .init(title: "Spaces", systemImage: "square.grid.2x2", path: "/spaces"),
                .init(title: "Settings", systemImage: "gearshape", path: "/settings#cloud"),
            ]
        ),
        "money": .init(
            domainId: "money",
            slots: [
                .init(title: "Today", systemImage: "sun.max", path: "/home/today"),
                .init(title: "History", systemImage: "list.bullet", path: "/history/insights"),
                .init(title: "Accounts", systemImage: "building.columns", path: "/accounts")
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
                .init(title: "Recall", systemImage: "magnifyingglass", path: "/recall")
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
                .init(title: "Library", systemImage: "music.note.list", path: "/library")
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
                .init(title: "Organize", systemImage: "checklist", path: "/tidy")
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
                .init(title: "Trends", systemImage: "chart.line.uptrend.xyaxis", path: "/trends")
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

    /// Default content appearance before the Continuity page reports `data-theme`.
    /// Mirrors brand CSS `color-scheme` defaults (planner/music/finance light; fitness/health dark).
    static func defaultChromeAppearance(forDomainId raw: String?) -> KenosChromeAppearance {
        switch canonicalize(raw) ?? (raw ?? "") {
        case "plan", "money", "music", "library", "home":
            return .light
        case "training", "health", "work", "kenos", "paper":
            return .dark
        default:
            return .dark
        }
    }

    static func defaultChromeAppearance(forContinuity url: URL?) -> KenosChromeAppearance {
        defaultChromeAppearance(forDomainId: domainId(fromContinuity: url))
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

    static func accentPalette(for spaceId: String) -> KenosDomainAccent {
        let id = canonicalize(spaceId) ?? spaceId
        return definition(for: id)?.accent ?? .kenos
    }

    /// Adaptive brand accent (shelf cards, tints) — light/dark pair, not a single hex.
    static func accentColor(for spaceId: String) -> Color {
        accentPalette(for: spaceId).adaptiveColor
    }

    /// Dock / Liquid Glass chrome — higher contrast than content accent.
    static func accentOnGlass(for spaceId: String) -> Color {
        accentPalette(for: spaceId).adaptiveOnGlass
    }

    static func selectionPlateOpacity(for spaceId: String, scheme: ColorScheme) -> Double {
        accentPalette(for: spaceId).selectionPlateOpacity(for: scheme)
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
            return URL(string: "https://www.kenos.space\(resolvedPath)")
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
            return URL(string: "https://www.kenos.space\(resolvedPath)")
        }
        if def.id == "work" || def.id == "kenos" {
            return URL(string: "https://www.kenos.space\(resolvedPath)")
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
