import AppIntents
import KenosClient
import KenosNotifications
import SwiftUI
import WidgetKit

struct KenosTodayWidget: Widget {
    let kind = "KenosTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetSnapshotProvider()) { entry in
            KenosTodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Kenos Today")
        .description("Next Plan · Inbox · Approvals glance")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

struct KenosTodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KenosWidgetSnapshotEntry

    private var glance: TodayGlance { entry.snapshot.today }
    private var deepLink: String { KenosComplicationFoundation.deepLink(for: glance) }
    private var summary: String { KenosComplicationFoundation.summaryLine(for: glance) }
    private var freshness: String {
        KenosWidgetChrome.freshnessDisplay(KenosComplicationFoundation.freshnessLabel(for: glance))
    }

    var body: some View {
        Group {
            switch family {
            case .systemMedium:
                mediumBody
            case .accessoryCircular:
                accessoryCircular
            case .accessoryRectangular:
                accessoryRectangular
            case .accessoryInline:
                Text(summary)
            default:
                smallBody
            }
        }
        .containerBackground(for: .widget) {
            KenosWidgetBackground(accentRGB: KenosWidgetChrome.brandRGB, intensity: 0.14)
        }
        .modifier(KenosWidgetDeepLinkModifier(urlString: deepLink))
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            KenosWidgetEyebrow(title: "Today", systemImage: "circle.grid.2x2.fill")
            Text(summary)
                .font(.headline)
                .foregroundStyle(.primary)
                .lineLimit(3)
                .minimumScaleFactor(0.9)
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                if let count = glance.pendingApprovalCount {
                    KenosWidgetBadge(text: "\(count) approvals", accentRGB: 0xD4AE2E)
                }
                if let inbox = glance.pendingInboxCount {
                    KenosWidgetBadge(text: "\(inbox) inbox", accentRGB: KenosWidgetChrome.brandRGB)
                }
                Spacer(minLength: 0)
                Text(freshness)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private var mediumBody: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                KenosWidgetEyebrow(title: "Kenos Today", systemImage: "circle.grid.2x2.fill")
                Text(summary)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                HStack(spacing: 6) {
                    if let count = glance.pendingApprovalCount {
                        KenosWidgetBadge(text: "\(count) approvals", accentRGB: 0xD4AE2E)
                    }
                    if let inbox = glance.pendingInboxCount {
                        KenosWidgetBadge(text: "\(inbox) inbox", accentRGB: KenosWidgetChrome.brandRGB)
                    }
                    Text(freshness)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Spacer(minLength: 0)
            }

            VStack(spacing: 8) {
                Button(intent: KenosWidgetCaptureIntent()) {
                    actionLabel("Capture", systemImage: "plus")
                }
                .buttonStyle(KenosWidgetActionButtonStyle(accentRGB: KenosWidgetChrome.brandRGB, prominent: true))

                Button(intent: KenosWidgetOpenAssistantIntent()) {
                    actionLabel("Ask", systemImage: "sparkles")
                }
                .buttonStyle(KenosWidgetActionButtonStyle(accentRGB: KenosWidgetChrome.brandRGB, prominent: false))
            }
            .frame(width: 108)
        }
    }

    private var accessoryCircular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Image(systemName: "circle.grid.2x2.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(kenosRGB: KenosWidgetChrome.brandRGB))
                if let count = glance.pendingApprovalCount ?? glance.pendingInboxCount {
                    Text("\(count)")
                        .font(.caption.weight(.bold))
                        .minimumScaleFactor(0.8)
                } else {
                    Text("Now")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var accessoryRectangular: some View {
        HStack(spacing: 8) {
            Image(systemName: "circle.grid.2x2.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color(kenosRGB: KenosWidgetChrome.brandRGB))
            VStack(alignment: .leading, spacing: 1) {
                Text("Kenos")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(summary)
                    .font(.caption.weight(.semibold))
                    .lineLimit(2)
            }
        }
    }

    private func actionLabel(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .frame(maxWidth: .infinity)
            .labelStyle(.titleAndIcon)
    }
}

private struct KenosWidgetActionButtonStyle: ButtonStyle {
    var accentRGB: UInt32
    var prominent: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 9)
            .padding(.horizontal, 8)
            .foregroundStyle(prominent ? Color.white : Color(kenosRGB: accentRGB))
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(prominent ? Color(kenosRGB: accentRGB) : Color(kenosRGB: accentRGB).opacity(0.14))
            )
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}
