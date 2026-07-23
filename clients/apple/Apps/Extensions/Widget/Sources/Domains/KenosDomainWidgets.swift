import AppIntents
import KenosClient
import SwiftUI
import WidgetKit

// MARK: - Plan

struct KenosPlanWidget: Widget {
    let kind = "KenosPlanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetSnapshotProvider()) { entry in
            KenosDomainWidgetView(
                entry: entry,
                domainId: "plan",
                emptySubtitle: "Nothing due"
            )
        }
        .configurationDisplayName("Plan")
        .description("Next task from Korben Plan")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Training

struct KenosTrainingWidget: Widget {
    let kind = "KenosTrainingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetSnapshotProvider()) { entry in
            KenosTrainingWidgetView(entry: entry)
        }
        .configurationDisplayName("Training")
        .description("Workout session glance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct KenosTrainingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KenosWidgetSnapshotEntry

    private var glance: DomainWidgetGlance {
        entry.snapshot.domain("training")
            ?? KenosWidgetGlanceBridge.placeholderDomain("training")
            ?? DomainWidgetGlance(
                domainId: "training",
                title: "Training",
                subtitle: "Start workout",
                deepLink: "kenos://training/session",
                accentRGB: 0xC45C4A,
                systemImage: "figure.strengthtraining.traditional"
            )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            DomainWidgetChrome(glance: glance, compact: family == .systemSmall)
            Spacer(minLength: 0)
            if family == .systemMedium {
                Button(intent: KenosWidgetStartTrainingIntent()) {
                    Label("Start Training", systemImage: "figure.strengthtraining.traditional")
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .foregroundStyle(.white)
                        .background(
                            Color(kenosRGB: glance.accentRGB),
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                        )
                }
                .buttonStyle(.plain)
            } else if glance.progress == nil {
                Text("Tap to open session")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .containerBackground(for: .widget) {
            KenosWidgetBackground(accentRGB: glance.accentRGB, intensity: 0.18)
        }
        .modifier(KenosWidgetDeepLinkModifier(urlString: glance.deepLink))
    }
}

// MARK: - Music

struct KenosMusicWidget: Widget {
    let kind = "KenosMusicWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetSnapshotProvider()) { entry in
            KenosDomainWidgetView(
                entry: entry,
                domainId: "music",
                emptySubtitle: "Open Music"
            )
        }
        .configurationDisplayName("Music")
        .description("Now playing / recent track")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Health

struct KenosHealthWidget: Widget {
    let kind = "KenosHealthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetSnapshotProvider()) { entry in
            KenosHealthWidgetView(entry: entry)
        }
        .configurationDisplayName("Health")
        .description("Readiness levels only — no vitals")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct KenosHealthWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KenosWidgetSnapshotEntry

    private var glance: DomainWidgetGlance {
        entry.snapshot.domain("health")
            ?? KenosWidgetGlanceBridge.placeholderDomain("health")
            ?? DomainWidgetGlance(
                domainId: "health",
                title: "Health",
                subtitle: "Readiness",
                deepLink: "kenos://domain/health",
                accentRGB: 0x5B6CFF,
                systemImage: "heart.text.square"
            )
    }

    var body: some View {
        Group {
            if family == .accessoryCircular {
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 1) {
                        Image(systemName: glance.systemImage)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(kenosRGB: glance.accentRGB))
                        Text(glance.title)
                            .font(.caption2.weight(.bold))
                            .minimumScaleFactor(0.7)
                            .lineLimit(1)
                    }
                    .padding(2)
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    DomainWidgetChrome(glance: glance, compact: true)
                    Spacer(minLength: 0)
                    Text("Levels only · no vitals")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .containerBackground(for: .widget) {
            KenosWidgetBackground(accentRGB: glance.accentRGB, intensity: 0.16)
        }
        .modifier(KenosWidgetDeepLinkModifier(urlString: glance.deepLink))
    }
}

// MARK: - Home

struct KenosHomeWidget: Widget {
    let kind = "KenosHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetSnapshotProvider()) { entry in
            KenosDomainWidgetView(
                entry: entry,
                domainId: "home",
                emptySubtitle: "Start tidy"
            )
        }
        .configurationDisplayName("Home")
        .description("Tidy / organize glance")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Shared domain shell

struct KenosDomainWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KenosWidgetSnapshotEntry
    let domainId: String
    let emptySubtitle: String

    private var glance: DomainWidgetGlance {
        if let live = entry.snapshot.domain(domainId) {
            return live
        }
        if var placeholder = KenosWidgetGlanceBridge.placeholderDomain(domainId) {
            placeholder.subtitle = emptySubtitle
            return placeholder
        }
        return DomainWidgetGlance(
            domainId: domainId,
            title: domainId.capitalized,
            subtitle: emptySubtitle,
            deepLink: "kenos://domain/\(domainId)",
            accentRGB: KenosWidgetChrome.brandRGB,
            systemImage: "circle.grid.2x2"
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemMedium ? 12 : 8) {
            DomainWidgetChrome(
                glance: glance,
                compact: family != .systemMedium,
                showEyebrow: true
            )
            Spacer(minLength: 0)
            if family == .systemMedium {
                Text("Open \(glance.domainId.capitalized)")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.tertiary)
            }
        }
        .containerBackground(for: .widget) {
            KenosWidgetBackground(accentRGB: glance.accentRGB, intensity: 0.17)
        }
        .modifier(KenosWidgetDeepLinkModifier(urlString: glance.deepLink))
    }
}
