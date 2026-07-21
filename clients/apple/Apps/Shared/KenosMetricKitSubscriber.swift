#if os(iOS)
import Foundation
import MetricKit

/// MetricKit subscriber — records launch/memory/hang metrics and crash diagnostics,
/// then hands severe reports to `KenosCrashReporter` for cloud upload / bug_logs.
@MainActor
final class KenosMetricKitSubscriber: NSObject, MXMetricManagerSubscriber {
    static let shared = KenosMetricKitSubscriber()

    private var started = false

    func start() {
        guard !started else { return }
        started = true
        KenosCrashReporter.shared.start()
        MXMetricManager.shared.add(self)
        KenosLog.debug("MetricKit subscriber registered", category: .diagnostics)
    }

    nonisolated func didReceive(_ payloads: [MXMetricPayload]) {
        // Snapshot JSON off the MetricKit queue before hopping to MainActor (Swift 6).
        let blobs: [Data] = payloads.map { $0.jsonRepresentation() }
        Task { @MainActor in
            KenosCrashReporter.shared.handleMetricJSONBlobs(blobs)
        }
    }

    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let blobs: [Data] = payloads.map { $0.jsonRepresentation() }
        let count = blobs.count
        Task { @MainActor in
            KenosLog.info(
                "MetricKit diagnostics received",
                category: .diagnostics,
                metadata: [
                    "count": String(count),
                    "breadcrumb": "1",
                ]
            )
            KenosCrashReporter.shared.handleDiagnosticJSONBlobs(blobs)
        }
    }
}
#endif
