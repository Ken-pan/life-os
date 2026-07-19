import Foundation
import KenosClient
import KenosContracts

/// Projection classification + persistence gates (P4A-007 audit remediation).
public enum KenosProjectionClassifier {
    public struct PreparedSnapshot: Equatable, Sendable {
        public var display: KenosProjectionSnapshot
        public var persistable: KenosProjectionSnapshot?
        public var strippedConfidentialWork: Bool
    }

    public static func collectClassifications(from snapshot: KenosProjectionSnapshot) -> [KenosDataClassification] {
        var values: [KenosDataClassification] = []
        if let today = snapshot.today {
            values.append(today.meta.classification)
            for card in today.cards {
                values.append(card.classification)
            }
        }
        values.append(contentsOf: snapshot.inbox.map(\.classification))
        values.append(contentsOf: snapshot.approvals.map(\.dataClassification))
        if let work = snapshot.work {
            values.append(work.meta.classification)
            values.append(contentsOf: work.projects.map(\.dataClassification))
            values.append(contentsOf: work.deliverables.map(\.dataClassification))
            values.append(contentsOf: work.meetings.map(\.dataClassification))
            values.append(contentsOf: work.decisions.map(\.dataClassification))
            values.append(contentsOf: work.proposals.map(\.dataClassification))
        }
        return values
    }

    /// Never coerces unknown classifications to `.personal`. Elevated Work/sensitive content is
    /// kept in-memory for the session when needed, but omitted from disk cache.
    public static func prepareForPersistence(
        _ snapshot: KenosProjectionSnapshot,
        fallbackOwnerId: UUID?
    ) -> PreparedSnapshot {
        var display = snapshot
        var persistable = snapshot
        var stripped = false

        let collected = collectClassifications(from: snapshot)
        guard let dominant = KenosDataClassification.dominant(collected) else {
            display.meta.classification = .personal
            display.meta.ownerId = fallbackOwnerId ?? display.meta.ownerId
            persistable.meta = display.meta
            return PreparedSnapshot(display: display, persistable: persistable, strippedConfidentialWork: false)
        }

        display.meta.classification = dominant
        display.meta.ownerId = fallbackOwnerId ?? display.meta.ownerId

        if !dominant.allowsDiskProjectionCache {
            persistable.work = nil
            stripped = snapshot.work != nil
            // Persist only personal-safe surfaces; reject whole-file elevated meta.
            persistable.meta.classification = .personal
            persistable.meta.ownerId = display.meta.ownerId
            persistable.inbox = persistable.inbox.filter { $0.classification.allowsDiskProjectionCache }
            persistable.approvals = persistable.approvals.filter { $0.dataClassification.allowsDiskProjectionCache }
            if let today = persistable.today {
                var copy = today
                copy.cards = today.cards.filter { $0.classification.allowsDiskProjectionCache }
                persistable.today = copy
            }
            return PreparedSnapshot(display: display, persistable: persistable, strippedConfidentialWork: stripped)
        }

        persistable.meta = display.meta
        return PreparedSnapshot(display: display, persistable: persistable, strippedConfidentialWork: false)
    }
}
