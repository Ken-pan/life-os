import WidgetKit
import SwiftUI
import KenosClient
import KenosNotifications

/// Local/dev WidgetKit extension foundation. App Group `group.space.kenos.app` is a placeholder gate.
@main
struct KenosWidgetBundle: WidgetBundle {
    var body: some Widget {
        KenosTodayWidget()
    }
}

struct KenosTodayWidget: Widget {
    let kind = "KenosTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KenosWidgetTimelineProvider()) { entry in
            KenosWidgetView(entry: entry)
        }
        .configurationDisplayName("Kenos Today")
        .description("Next Plan / Approvals glance · read-only")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

struct KenosWidgetEntry: TimelineEntry {
    let date: Date
    let glance: TodayGlance
}

struct KenosWidgetTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> KenosWidgetEntry {
        KenosWidgetEntry(
            date: Date(),
            glance: TodayGlance(freshness: "unavailable", offlineStatus: "unavailable", state: "loading")
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (KenosWidgetEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KenosWidgetEntry>) -> Void) {
        let entry = placeholder(in: context)
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(900))))
    }
}

struct KenosWidgetView: View {
    let entry: KenosWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(KenosComplicationFoundation.summaryLine(for: entry.glance))
                .font(.headline)
            Text(KenosComplicationFoundation.freshnessLabel(for: entry.glance))
                .font(.caption2)
        }
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: KenosComplicationFoundation.deepLink(for: entry.glance)))
    }
}
