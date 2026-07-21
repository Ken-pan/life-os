import KenosClient
import KenosNotifications
import SwiftUI
import WidgetKit

struct KenosWidgetSnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: KenosWidgetSnapshot
}

enum KenosWidgetSnapshotLoader {
    /// Reuse one store per process — App Group probe is not free.
    private static let sharedStore = KenosAppGroupStore(ownerId: nil)

    static func store() -> KenosAppGroupStore { sharedStore }

    static func currentSnapshot() -> KenosWidgetSnapshot {
        let store = sharedStore
        return KenosWidgetGlanceBridge.loadSnapshot(store: store)
            ?? KenosWidgetGlanceBridge.foundationSnapshot(availability: store.availability)
    }

    static func currentEntry() -> KenosWidgetSnapshotEntry {
        KenosWidgetSnapshotEntry(date: Date(), snapshot: currentSnapshot())
    }

    static func safeURL(_ raw: String?, fallback: String = "kenos://today") -> URL {
        if let raw, let url = URL(string: raw), url.scheme != nil {
            return url
        }
        return URL(string: fallback)!
    }
}

struct KenosWidgetSnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> KenosWidgetSnapshotEntry {
        KenosWidgetSnapshotEntry(
            date: Date(),
            snapshot: KenosWidgetGlanceBridge.foundationSnapshot(
                availability: KenosWidgetSnapshotLoader.store().availability
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (KenosWidgetSnapshotEntry) -> Void) {
        completion(KenosWidgetSnapshotLoader.currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KenosWidgetSnapshotEntry>) -> Void) {
        let entry = KenosWidgetSnapshotLoader.currentEntry()
        // Host reloads on change; this is a quiet backstop only.
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(1800))))
    }
}

extension Color {
    init(kenosRGB: UInt32) {
        let r = Double((kenosRGB >> 16) & 0xFF) / 255
        let g = Double((kenosRGB >> 8) & 0xFF) / 255
        let b = Double(kenosRGB & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

enum KenosWidgetChrome {
    static let brandRGB: UInt32 = 0x5B8CFF

    static func freshnessDisplay(_ raw: String) -> String {
        switch raw {
        case "local": return "Just now"
        case "ready": return "Up to date"
        case "stale": return "Stale"
        case "offline", "unavailable": return "Offline"
        case "no_data": return "Idle"
        default: return raw.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

/// Soft accent wash over system widget material — brand signal without flat gray.
struct KenosWidgetBackground: View {
    var accentRGB: UInt32 = KenosWidgetChrome.brandRGB
    var intensity: Double = 0.16

    var body: some View {
        ZStack {
            ContainerRelativeShape()
                .fill(.fill.tertiary)
            LinearGradient(
                colors: [
                    Color(kenosRGB: accentRGB).opacity(intensity),
                    Color(kenosRGB: accentRGB).opacity(intensity * 0.2),
                    .clear,
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

struct KenosWidgetEyebrow: View {
    let title: String
    let systemImage: String
    var accentRGB: UInt32 = KenosWidgetChrome.brandRGB

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Color(kenosRGB: accentRGB))
            .labelStyle(.titleAndIcon)
            .textCase(.uppercase)
            .tracking(0.4)
    }
}

struct KenosWidgetBadge: View {
    let text: String
    var accentRGB: UInt32? = nil

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(accentRGB.map { Color(kenosRGB: $0) } ?? .secondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(
                (accentRGB.map { Color(kenosRGB: $0).opacity(0.16) } ?? Color.primary.opacity(0.06)),
                in: Capsule()
            )
    }
}

struct KenosWidgetIconWell: View {
    let systemImage: String
    var accentRGB: UInt32
    var size: CGFloat = 36

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(Color(kenosRGB: accentRGB))
            .frame(width: size, height: size)
            .background(Color(kenosRGB: accentRGB).opacity(0.16), in: RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
    }
}

/// Domain glance shell — accent rail + icon well + title hierarchy.
struct DomainWidgetChrome: View {
    let glance: DomainWidgetGlance
    var compact: Bool = false
    var showEyebrow: Bool = true

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Color(kenosRGB: glance.accentRGB))
                .frame(width: 3)
                .padding(.trailing, 10)

            HStack(alignment: .top, spacing: 10) {
                KenosWidgetIconWell(
                    systemImage: glance.systemImage,
                    accentRGB: glance.accentRGB,
                    size: compact ? 32 : 40
                )

                VStack(alignment: .leading, spacing: compact ? 3 : 4) {
                    if showEyebrow {
                        Text(glance.domainId.capitalized)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color(kenosRGB: glance.accentRGB).opacity(0.9))
                            .textCase(.uppercase)
                            .tracking(0.3)
                    }
                    Text(glance.title)
                        .font(compact ? .subheadline.weight(.semibold) : .headline)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                    Text(glance.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(compact ? 1 : 2)
                    if let progress = glance.progress {
                        ProgressView(value: progress)
                            .tint(Color(kenosRGB: glance.accentRGB))
                            .padding(.top, 2)
                    }
                }

                Spacer(minLength: 0)

                if let badge = glance.badge, !badge.isEmpty {
                    KenosWidgetBadge(text: badge, accentRGB: glance.accentRGB)
                }
            }
        }
    }
}

struct KenosWidgetDeepLinkModifier: ViewModifier {
    let urlString: String

    func body(content: Content) -> some View {
        content.widgetURL(KenosWidgetSnapshotLoader.safeURL(urlString))
    }
}
