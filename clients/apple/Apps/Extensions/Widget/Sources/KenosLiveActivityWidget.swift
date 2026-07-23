#if canImport(ActivityKit)
import ActivityKit
import SwiftUI
import WidgetKit

/// Lock Screen + Dynamic Island presentations for Kenos Continuity Live Activities.
struct KenosLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: KenosDomainActivityAttributes.self) { context in
            KenosLiveActivityLockScreenView(context: context)
                .widgetURL(context.attributes.deepLinkURL)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.attributes.systemImageName)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Color(kenosRGB: context.attributes.accentRGB))
                        .symbolRenderingMode(.hierarchical)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(kindLabel(context.attributes.resolvedKind))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color(kenosRGB: context.attributes.accentRGB).opacity(0.95))
                            .textCase(.uppercase)
                            .tracking(0.3)
                        Text(context.state.title)
                            .font(.headline)
                            .lineLimit(1)
                        Text(context.state.subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let progress = context.state.progress {
                        Text("\(Int((progress * 100).rounded()))%")
                            .font(.body.monospacedDigit().weight(.semibold))
                            .foregroundStyle(Color(kenosRGB: context.attributes.accentRGB))
                    } else if let endsAt = context.state.endsAt {
                        Text(timerInterval: Date.now ... max(endsAt, Date.now.addingTimeInterval(1)), countsDown: true)
                            .font(.body.monospacedDigit().weight(.medium))
                            .multilineTextAlignment(.trailing)
                            .frame(width: 58)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 10) {
                        if let progress = context.state.progress {
                            ProgressView(value: progress)
                                .tint(Color(kenosRGB: context.attributes.accentRGB))
                        }
                        Spacer(minLength: 0)
                        Link(destination: context.attributes.deepLinkURL) {
                            Text("Open")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .foregroundStyle(.white)
                                .background(
                                    Color(kenosRGB: context.attributes.accentRGB).opacity(0.85),
                                    in: Capsule()
                                )
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: context.attributes.systemImageName)
                    .foregroundStyle(Color(kenosRGB: context.attributes.accentRGB))
            } compactTrailing: {
                if let endsAt = context.state.endsAt, endsAt > Date.now {
                    Text(timerInterval: Date.now ... endsAt, countsDown: true)
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 44)
                        .foregroundStyle(Color(kenosRGB: context.attributes.accentRGB))
                } else if let progress = context.state.progress {
                    Text("\(Int((progress * 100).rounded()))%")
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .foregroundStyle(Color(kenosRGB: context.attributes.accentRGB))
                } else {
                    Text(context.state.subtitle.isEmpty ? context.state.title : context.state.subtitle)
                        .font(.caption2.weight(.medium))
                        .lineLimit(1)
                }
            } minimal: {
                Image(systemName: context.attributes.systemImageName)
                    .foregroundStyle(Color(kenosRGB: context.attributes.accentRGB))
            }
            .widgetURL(context.attributes.deepLinkURL)
        }
    }

    private func kindLabel(_ kind: KenosDomainActivityAttributes.Kind?) -> String {
        switch kind {
        case .training: return "Training"
        case .focus: return "Focus"
        case .tidy: return "Tidy"
        case .none: return "Korben"
        }
    }
}

private struct KenosLiveActivityLockScreenView: View {
    let context: ActivityViewContext<KenosDomainActivityAttributes>

    private var accent: Color { Color(kenosRGB: context.attributes.accentRGB) }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(accent.opacity(0.22))
                    .frame(width: 44, height: 44)
                Image(systemName: context.attributes.systemImageName)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(accent)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(kindCaption)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(accent.opacity(0.95))
                    .textCase(.uppercase)
                    .tracking(0.35)
                Text(context.state.title)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(context.state.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.72))
                    .lineLimit(1)
                if let progress = context.state.progress {
                    ProgressView(value: progress)
                        .tint(accent)
                        .padding(.top, 2)
                }
            }

            Spacer(minLength: 4)

            if let endsAt = context.state.endsAt, endsAt > Date.now {
                Text(timerInterval: Date.now ... endsAt, countsDown: true)
                    .font(.title3.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.trailing)
                    .frame(minWidth: 52)
            } else if let progress = context.state.progress {
                Text("\(Int((progress * 100).rounded()))%")
                    .font(.title3.monospacedDigit().weight(.semibold))
                    .foregroundStyle(accent)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .activityBackgroundTint(Color.black.opacity(0.78))
        .activitySystemActionForegroundColor(.white)
    }

    private var kindCaption: String {
        switch context.attributes.resolvedKind {
        case .training: return "Training"
        case .focus: return "Focus"
        case .tidy: return "Tidy"
        case .none: return "Korben"
        }
    }
}
#endif
