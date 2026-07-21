#if os(iOS) || os(macOS)
import AppIntents
import Foundation
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

/// Continuity domains exposeable to Shortcuts / Siri.
enum KenosContinuityDomain: String, AppEnum, CaseIterable, Sendable {
    case plan
    case training
    case work
    case money
    case library
    case music
    case home
    case health

    nonisolated static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Kenos Space")

    nonisolated static let caseDisplayRepresentations: [KenosContinuityDomain: DisplayRepresentation] = [
        .plan: "Plan",
        .training: "Training",
        .work: "Work",
        .money: "Money",
        .library: "Library",
        .music: "Music",
        .home: "Home",
        .health: "Health",
    ]
}

enum KenosShellDestination: String, AppEnum, CaseIterable, Sendable {
    case today
    case assistant
    case inbox
    case shelf
    case settings
    case compose

    nonisolated static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Kenos Shell")

    nonisolated static let caseDisplayRepresentations: [KenosShellDestination: DisplayRepresentation] = [
        .today: "Today",
        .assistant: "Ask",
        .inbox: "Inbox",
        .shelf: "Spaces Shelf",
        .settings: "Settings",
        .compose: "Compose",
    ]

    var deepLink: URL {
        URL(string: "kenos://\(rawValue)")!
    }
}

enum KenosIntentError: Error, CustomLocalizedStringResourceConvertible {
    case unknownDomain(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case let .unknownDomain(id):
            return "Unknown Kenos space: \(id)"
        }
    }
}

@MainActor
enum KenosIntentURLOpener {
    static func open(_ url: URL) async {
        #if canImport(UIKit)
        await UIApplication.shared.open(url)
        #elseif canImport(AppKit)
        _ = NSWorkspace.shared.open(url)
        #endif
    }
}

/// Open a Continuity space (Plan / Training / …) inside Kenos.
struct OpenKenosDomainIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Open Kenos Space"
    nonisolated static let description = IntentDescription("Open a Life OS space in Kenos Continuity.")
    nonisolated static let openAppWhenRun = true

    @Parameter(title: "Space")
    var domain: KenosContinuityDomain

    static var parameterSummary: some ParameterSummary {
        Summary("Open \(\.$domain) in Kenos")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let url = KenosDomainRegistry.continuityURL(for: domain.rawValue) else {
            throw KenosIntentError.unknownDomain(domain.rawValue)
        }
        await KenosIntentURLOpener.open(url)
        return .result()
    }
}

/// Open Kenos shell destinations (`kenos://today`, shelf, compose, …).
struct OpenKenosShellIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Open Kenos"
    nonisolated static let description = IntentDescription("Open Today, Ask, Inbox, Shelf, or Compose in Kenos.")
    nonisolated static let openAppWhenRun = true

    @Parameter(title: "Destination")
    var destination: KenosShellDestination

    static var parameterSummary: some ParameterSummary {
        Summary("Open \(\.$destination) in Kenos")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        await KenosIntentURLOpener.open(destination.deepLink)
        return .result()
    }
}

/// Jump straight into Training workout Continuity (`/session`).
struct StartTrainingIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Start Training"
    nonisolated static let description = IntentDescription("Open Training workout in Kenos Continuity.")
    nonisolated static let openAppWhenRun = true

    static var parameterSummary: some ParameterSummary {
        Summary("Start Training in Kenos")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let url = KenosDomainRegistry.continuityURL(for: "training", path: "/session") else {
            throw KenosIntentError.unknownDomain("training")
        }
        await KenosIntentURLOpener.open(url)
        return .result()
    }
}

/// Capture / compose entry (domain compose or Kenos capture).
struct CaptureInKenosIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Capture in Kenos"
    nonisolated static let description = IntentDescription("Open compose / capture in Kenos.")
    nonisolated static let openAppWhenRun = true

    static var parameterSummary: some ParameterSummary {
        Summary("Capture in Kenos")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        await KenosIntentURLOpener.open(URL(string: "kenos://compose")!)
        return .result()
    }
}

/// Start Deep Work Continuity surface.
struct StartDeepWorkIntent: AppIntent {
    nonisolated static let title: LocalizedStringResource = "Start Deep Work"
    nonisolated static let description = IntentDescription("Open Work Deep Work focus in Kenos.")
    nonisolated static let openAppWhenRun = true

    static var parameterSummary: some ParameterSummary {
        Summary("Start Deep Work in Kenos")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let url = KenosDomainRegistry.continuityURL(for: "work", path: "/spaces/work") else {
            throw KenosIntentError.unknownDomain("work")
        }
        await KenosIntentURLOpener.open(url)
        return .result()
    }
}

/// Siri / Shortcuts phrases for Daily Beta.
struct KenosAppShortcuts: AppShortcutsProvider {
    nonisolated static let shortcutTileColor: ShortcutTileColor = .navy

    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenKenosDomainIntent(),
            phrases: [
                "Open \(\.$domain) in \(.applicationName)",
                "打开 \(\.$domain) in \(.applicationName)",
            ],
            shortTitle: "Open Space",
            systemImageName: "circle.grid.2x2"
        )
        AppShortcut(
            intent: StartTrainingIntent(),
            phrases: [
                "Start Training in \(.applicationName)",
                "开始训练 in \(.applicationName)",
                "Start workout in \(.applicationName)",
            ],
            shortTitle: "Start Training",
            systemImageName: "figure.strengthtraining.traditional"
        )
        AppShortcut(
            intent: CaptureInKenosIntent(),
            phrases: [
                "Capture in \(.applicationName)",
                "记一条 in \(.applicationName)",
                "Add a note in \(.applicationName)",
            ],
            shortTitle: "Capture",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: StartDeepWorkIntent(),
            phrases: [
                "Start Deep Work in \(.applicationName)",
                "开始 Deep Work in \(.applicationName)",
                "Start focus in \(.applicationName)",
            ],
            shortTitle: "Deep Work",
            systemImageName: "target"
        )
        AppShortcut(
            intent: OpenKenosShellIntent(),
            phrases: [
                "Open \(\.$destination) in \(.applicationName)",
                "打开 \(\.$destination) in \(.applicationName)",
            ],
            shortTitle: "Open Kenos",
            systemImageName: "tray"
        )
    }
}
#endif
