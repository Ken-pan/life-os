import Foundation
import Combine
import KenosContracts

/// Local Focus session store — mirrors AIOS `focusStore.core.js`. No production Executor / APNs.
@MainActor
public final class KenosFocusStore: ObservableObject {
    public static let defaultOwnerId = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    public static let storageFileName = "kenos.focus.v1.json"

    public struct FocusActivityEntry: Codable, Equatable, Sendable, Identifiable {
        public var id: UUID
        public var eventType: String
        public var summary: String
        public var focusId: UUID
        public var occurredAt: String
        public var safeDetail: String?
        public var suggestionId: UUID?
        public var count: Int?

        public init(
            id: UUID = UUID(),
            eventType: String,
            summary: String,
            focusId: UUID,
            occurredAt: String,
            safeDetail: String? = nil,
            suggestionId: UUID? = nil,
            count: Int? = nil
        ) {
            self.id = id
            self.eventType = eventType
            self.summary = summary
            self.focusId = focusId
            self.occurredAt = occurredAt
            self.safeDetail = safeDetail
            self.suggestionId = suggestionId
            self.count = count
        }
    }

    private struct PersistableState: Codable, Equatable, Sendable {
        var ownerId: UUID
        var focus: KenosFocusContext?
        var deferred: [KenosDeferredItem]
        var suggestions: [KenosProactiveSuggestion]
        var budget: KenosInterventionBudget
        var activity: [FocusActivityEntry]
        var summary: KenosSessionSummary?
    }

    @Published public private(set) var ownerId: UUID
    @Published public private(set) var focus: KenosFocusContext?
    @Published public private(set) var deferred: [KenosDeferredItem] = []
    @Published public private(set) var suggestions: [KenosProactiveSuggestion] = []
    @Published public private(set) var budget: KenosInterventionBudget
    @Published public private(set) var activity: [FocusActivityEntry] = []
    @Published public private(set) var summary: KenosSessionSummary?
    @Published public private(set) var lastError: String?

    private let fileURL: URL

    public var hidesGlobalNavigation: Bool {
        KenosFocusRuntime.hidesGlobalNavigation(focus)
    }

    public var showReturnBanner: Bool {
        focus?.status == .temporarilyLeft
    }

    public var isActiveSession: Bool {
        focus?.status == .active
    }

    public var isPaused: Bool {
        focus?.status == .paused
    }

    public var isForeground: Bool {
        KenosFocusRuntime.isForegroundFocus(focus)
    }

    public var showCompletedSummary: Bool {
        focus?.status == .completed && summary != nil
    }

    public var pendingDeferredCount: Int {
        guard let focusId = focus?.id else { return 0 }
        return deferred.filter { $0.focusContextId == focusId && $0.status == .pending }.count
    }

    public init(
        ownerId: UUID = KenosFocusStore.defaultOwnerId,
        directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("kenos-phase5-focus")
    ) {
        self.ownerId = ownerId
        self.budget = KenosFocusRuntime.createDefaultBudget(ownerId: ownerId)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.fileURL = directory.appendingPathComponent(Self.storageFileName)
        load()
    }

    public func startTrainingFocus(title: String = "Push Day", safeSummary: String = "Local Training Focus simulation") {
        let sessionRef = EntityRef(
            id: UUID(uuidString: "60000000-0000-4000-8000-000000000001")!,
            type: "training.workout_session",
            ownerDomain: .training,
            ownerId: ownerId
        )
        let result = KenosFocusRuntime.startFocusSession(
            existingForeground: KenosFocusRuntime.isForegroundFocus(focus) ? focus : nil,
            ownerId: ownerId,
            mode: .training,
            title: title,
            safeSummary: safeSummary,
            activeSessionRef: sessionRef,
            returnDestination: KenosFocusReturnDestination(
                kind: .space,
                space: .training,
                route: "/spaces/training",
                label: "Return to Training"
            )
        )
        guard applyStart(result) else { return }
        seedTrainingSuggestions()
        ingestCrossDomainNoise()
        persist()
    }

    public func startDeepWorkFocus(title: String = "Kenos IA", safeSummary: String = "Local Deep Work Focus simulation") {
        let sessionRef = EntityRef(
            id: UUID(uuidString: "a1000000-0000-4000-8000-000000000001")!,
            type: "work.project",
            ownerDomain: .work,
            ownerId: ownerId
        )
        let result = KenosFocusRuntime.startFocusSession(
            existingForeground: KenosFocusRuntime.isForegroundFocus(focus) ? focus : nil,
            ownerId: ownerId,
            mode: .deepWork,
            title: title,
            safeSummary: safeSummary,
            activeSessionRef: sessionRef,
            classification: .workConfidential,
            returnDestination: KenosFocusReturnDestination(
                kind: .space,
                space: .work,
                route: "/work",
                label: "Return to Work"
            )
        )
        guard applyStart(result) else { return }
        seedDeepWorkSuggestions()
        ingestCrossDomainNoise()
        persist()
    }

    public func pause() {
        guard let current = focus else { return }
        let result = KenosFocusRuntime.transitionFocus(current, to: .paused)
        applyTransition(result, event: "focus.paused")
    }

    public func resume() {
        guard let current = focus else { return }
        let result = KenosFocusRuntime.transitionFocus(current, to: .active)
        applyTransition(result, event: "focus.resumed")
    }

    public func temporarilyLeave() {
        guard let current = focus else { return }
        let result = KenosFocusRuntime.transitionFocus(current, to: .temporarilyLeft)
        applyTransition(result, event: "focus.temporarily_left")
    }

    public func returnToFocus() {
        guard let current = focus else { return }
        let result = KenosFocusRuntime.transitionFocus(current, to: .active)
        applyTransition(result, event: "focus.resumed")
    }

    public func end() {
        guard var current = focus else { return }
        if current.status != .ending {
            let ending = KenosFocusRuntime.transitionFocus(current, to: .ending)
            guard case let .ok(value) = ending else {
                lastError = ending.errorMessage
                return
            }
            current = value
        }
        let completed = KenosFocusRuntime.transitionFocus(current, to: .completed)
        guard case let .ok(done) = completed else {
            lastError = completed.errorMessage
            return
        }
        let released = KenosFocusRuntime.releaseDeferredBatch(deferred, focusContextId: done.id)
        let summaryResult = KenosFocusRuntime.buildSessionSummary(
            focus: done,
            deferred: released,
            completedActions: defaultCompletedActions(done.mode),
            progress: defaultProgress(done.mode),
            nextRecommendedStep: "Review deferred items, or return to Today"
        )
        focus = done
        deferred = released
        summary = summaryResult.value
        lastError = summaryResult.errorMessage
        pushActivity("focus.ended", focus: done)
        pushActivity(
            "deferred.released",
            focus: done,
            count: released.filter { $0.status == .released }.count
        )
        persist()
    }

    public func dismissCompletedSummary() {
        focus = nil
        summary = nil
        persist()
    }

    public func logoutClear() {
        ownerId = Self.defaultOwnerId
        focus = nil
        deferred = []
        suggestions = []
        budget = KenosFocusRuntime.createDefaultBudget(ownerId: ownerId)
        activity = []
        summary = nil
        lastError = nil
        try? FileManager.default.removeItem(at: fileURL)
    }

    public func elapsedSeconds(at date: Date = Date()) -> Int {
        guard let focus, let started = focus.startedAt else { return 0 }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var startDate = parser.date(from: started.rawValue)
        if startDate == nil {
            parser.formatOptions = [.withInternetDateTime]
            startDate = parser.date(from: started.rawValue)
        }
        guard let startDate else { return 0 }
        if focus.status == .paused, let paused = focus.pausedAt {
            var pauseDate = parser.date(from: paused.rawValue)
            if pauseDate == nil {
                parser.formatOptions = [.withInternetDateTime]
                pauseDate = parser.date(from: paused.rawValue)
            }
            if let pauseDate {
                return max(0, Int(pauseDate.timeIntervalSince(startDate).rounded()))
            }
        }
        if let ended = focus.endedAt {
            var endDate = parser.date(from: ended.rawValue)
            if endDate == nil {
                parser.formatOptions = [.withInternetDateTime]
                endDate = parser.date(from: ended.rawValue)
            }
            if let endDate {
                return max(0, Int(endDate.timeIntervalSince(startDate).rounded()))
            }
        }
        return max(0, Int(date.timeIntervalSince(startDate).rounded()))
    }

    public static func formatDuration(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%02d:%02d", m, s)
    }

    // MARK: - Private

    @discardableResult
    private func applyStart(_ result: FocusRuntimeResult<KenosFocusContext>) -> Bool {
        guard case let .ok(value) = result else {
            lastError = result.errorMessage
            return false
        }
        focus = value
        budget = KenosFocusRuntime.createDefaultBudget(ownerId: ownerId, focusContextId: value.id)
        summary = nil
        lastError = nil
        pushActivity("focus.started", focus: value)
        return true
    }

    private func applyTransition(_ result: FocusRuntimeResult<KenosFocusContext>, event: String) {
        guard case let .ok(value) = result else {
            lastError = result.errorMessage
            return
        }
        focus = value
        lastError = nil
        pushActivity(event, focus: value)
        persist()
    }

    private func pushActivity(
        _ eventType: String,
        focus: KenosFocusContext,
        safeDetail: String? = nil,
        suggestionId: UUID? = nil,
        count: Int? = nil
    ) {
        let entry = FocusActivityEntry(
            eventType: eventType,
            summary: KenosFocusRuntime.focusActivitySummary(eventType: eventType, focus: focus),
            focusId: focus.id,
            occurredAt: KenosFocusRuntime.nowIso(),
            safeDetail: safeDetail,
            suggestionId: suggestionId,
            count: count
        )
        activity = [entry] + activity
        if activity.count > 40 { activity = Array(activity.prefix(40)) }
    }

    private func ingestCrossDomainNoise() {
        guard let focus else { return }
        let seeds: [(KenosDomain, String, KenosInterruptionUrgency, KenosRisk, String, String)] = [
            (.work, "inbox_update", .normal, .r1, "Work project update", "Non-urgent Work update while focused"),
            (.money, "money_review", .low, .r0, "Monthly review reminder", "Money review is out of current Focus"),
            (.home, "home_task", .low, .r0, "Shelf organizing task", "Home task deferred during Focus"),
        ]
        var nextDeferred = deferred
        for seed in seeds {
            guard let candidate = KenosFocusRuntime.interruptionCandidate(
                ownerId: ownerId,
                focusContextId: focus.id,
                sourceDomain: seed.0,
                category: seed.1,
                urgency: seed.2,
                risk: seed.3,
                safeSummary: seed.4,
                explanation: seed.5
            ) else { continue }
            let decision = KenosFocusRuntime.evaluateInterruption(focus: focus, candidate: candidate)
            guard case let .ok(value) = decision,
                  value.handling == .defer || value.handling == .suppressUntilEnd
            else { continue }
            let item = KenosFocusRuntime.deferInterruption(focus: focus, candidate: candidate, existing: nextDeferred)
            if case let .ok(deferredItem) = item {
                nextDeferred = nextDeferred.filter { $0.id != deferredItem.id } + [deferredItem]
                pushActivity("item.deferred", focus: focus, safeDetail: deferredItem.safeSummary)
            }
        }
        deferred = nextDeferred
    }

    private func seedTrainingSuggestions() {
        guard let focus else { return }
        let created = KenosFocusRuntime.createExplainableSuggestion(
            ownerId: ownerId,
            source: .rule,
            targetDomain: .training,
            focusContextId: focus.id,
            suggestionType: "training.next_exercise",
            title: "Next: Overhead press",
            safeSummary: "Next exercise from the local workout order",
            rationale: "Deterministic R0 rule from session plan order",
            whyNow: "Session started",
            signalsUsed: ["workout_order"],
            impactSummary: "Guidance only — no write",
            confidence: 0.92,
            risk: .r0,
            writes: false,
            requiresApproval: false
        )
        if case let .ok(suggestion) = created {
            suggestions = [suggestion] + suggestions
            maybeShowSuggestion(id: suggestion.id)
        }
    }

    private func seedDeepWorkSuggestions() {
        guard let focus else { return }
        let created = KenosFocusRuntime.createExplainableSuggestion(
            ownerId: ownerId,
            source: .rule,
            targetDomain: .work,
            focusContextId: focus.id,
            suggestionType: "work.recent_decision",
            title: "Recent decision on scope",
            safeSummary: "Keep the current deliverable scope frozen for this session",
            rationale: "R0 information suggestion from Work projection",
            whyNow: "Deep Work started on this project",
            signalsUsed: ["work.project", "work.decision"],
            impactSummary: "Read-only reminder",
            confidence: 0.8,
            risk: .r0,
            writes: false,
            requiresApproval: false
        )
        if case let .ok(suggestion) = created {
            suggestions = [suggestion] + suggestions
            maybeShowSuggestion(id: suggestion.id)
        }
    }

    private func maybeShowSuggestion(id: UUID) {
        guard let suggestion = suggestions.first(where: { $0.id == id }) else { return }
        let gate = KenosFocusRuntime.canShowSuggestion(budget: budget, suggestion: suggestion)
        guard case let .ok(value) = gate, value.allowed else { return }
        var shown = suggestion
        shown.status = .shown
        suggestions = suggestions.map { $0.id == id ? shown : $0 }
        budget = KenosFocusRuntime.markSuggestionShown(budget: budget, suggestion: shown)
        if let focus {
            pushActivity("suggestion.shown", focus: focus, suggestionId: id)
        }
    }

    private func defaultCompletedActions(_ mode: KenosFocusMode) -> [String] {
        switch mode {
        case .training: return ["4 exercises", "16 sets", "1 body note"]
        case .deepWork: return ["Stayed on current project", "Reviewed recent decision"]
        default: return []
        }
    }

    private func defaultProgress(_ mode: KenosFocusMode) -> String {
        switch mode {
        case .training: return "4 exercises · 16 sets · 1 body note"
        case .deepWork: return "Stayed within Work/Plan scope"
        default: return "Session completed"
        }
    }

    private func persist() {
        let state = PersistableState(
            ownerId: ownerId,
            focus: focus,
            deferred: deferred,
            suggestions: suggestions,
            budget: budget,
            activity: Array(activity.prefix(40)),
            summary: summary
        )
        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Quota / disk — ignore for local foundation
        }
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let state = try? JSONDecoder().decode(PersistableState.self, from: data)
        else { return }
        if state.ownerId != ownerId {
            logoutClear()
            return
        }
        focus = state.focus
        deferred = state.deferred
        suggestions = state.suggestions
        budget = state.budget
        activity = state.activity
        summary = state.summary
        lastError = nil
    }
}
