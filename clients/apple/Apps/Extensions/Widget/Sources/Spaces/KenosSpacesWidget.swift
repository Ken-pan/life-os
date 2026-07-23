import KenosClient
import SwiftUI
import WidgetKit

struct KenosSpacesWidget: Widget {
    let kind = "KenosSpacesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetSnapshotProvider()) { entry in
            KenosSpacesWidgetView(entry: entry)
        }
        .configurationDisplayName("Korben Spaces")
        .description("Jump into Plan, Training, Music, and more")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct KenosSpacesWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KenosWidgetSnapshotEntry

    private var spaceIds: [String] {
        let preferred = ["plan", "training", "work", "music", "health", "home", "money", "library"]
        var ordered: [String] = []
        var seen = Set<String>()
        ordered.reserveCapacity(preferred.count)
        for id in entry.snapshot.recentDomainIds + preferred {
            guard preferred.contains(id), !seen.contains(id) else { continue }
            seen.insert(id)
            ordered.append(id)
        }
        return ordered
    }

    var body: some View {
        let columns = 4
        let limit = family == .systemLarge ? 8 : 4
        let ids = Array(spaceIds.prefix(limit))
        let spacing: CGFloat = family == .systemLarge ? 10 : 8
        let placeholders = KenosWidgetGlanceBridge.placeholderDomains(availability: .sharedSuite)
        let rows = stride(from: 0, to: ids.count, by: columns).map { start in
            Array(ids[start..<min(start + columns, ids.count)])
        }

        VStack(alignment: .leading, spacing: family == .systemLarge ? 12 : 10) {
            HStack(spacing: 6) {
                KenosWidgetEyebrow(title: "Spaces", systemImage: "square.grid.2x2")
                Spacer(minLength: 0)
                if !entry.snapshot.recentDomainIds.isEmpty {
                    Text("Recent first")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            // Eager HStacks — LazyVGrid is heavier / flakier inside WidgetKit.
            VStack(spacing: spacing) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: spacing) {
                        ForEach(row, id: \.self) { id in
                            if let glance = entry.snapshot.domain(id) ?? placeholders[id] {
                                Link(destination: KenosWidgetSnapshotLoader.safeURL(glance.deepLink)) {
                                    SpaceTile(glance: glance, large: family == .systemLarge)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        if row.count < columns {
                            ForEach(0..<(columns - row.count), id: \.self) { _ in
                                Color.clear.frame(maxWidth: .infinity)
                            }
                        }
                    }
                }
            }

            if family == .systemLarge {
                Spacer(minLength: 0)
            }
        }
        .containerBackground(for: .widget) {
            KenosWidgetBackground(accentRGB: KenosWidgetChrome.brandRGB, intensity: 0.12)
        }
        .widgetURL(KenosWidgetSnapshotLoader.safeURL("kenos://shelf"))
    }
}

private struct SpaceTile: View {
    let glance: DomainWidgetGlance
    var large: Bool

    var body: some View {
        VStack(spacing: large ? 6 : 5) {
            ZStack {
                RoundedRectangle(cornerRadius: large ? 14 : 12, style: .continuous)
                    .fill(Color(kenosRGB: glance.accentRGB).opacity(0.14))
                Image(systemName: glance.systemImage)
                    .font(.system(size: large ? 20 : 17, weight: .semibold))
                    .foregroundStyle(Color(kenosRGB: glance.accentRGB))
                    .symbolRenderingMode(.hierarchical)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1.05, contentMode: .fit)

            Text(glance.title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }
}
