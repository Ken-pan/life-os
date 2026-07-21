import SwiftUI
import WidgetKit

/// Kenos WidgetKit extension — Home Screen / Lock Screen glances + Continuity Live Activities.
@main
struct KenosWidgetBundle: WidgetBundle {
    var body: some Widget {
        KenosTodayWidget()
        KenosSpacesWidget()
        KenosPlanWidget()
        KenosTrainingWidget()
        KenosMusicWidget()
        KenosHealthWidget()
        KenosHomeWidget()
        #if canImport(ActivityKit)
        KenosLiveActivityWidget()
        #endif
    }
}
