import Foundation
import Testing
@testable import KenosContracts

private struct FixtureCase: Decodable {
    struct ValidationContext: Decodable {
        let authOwnerId: String?
        let expectedActionId: String?
    }
    let id: String
    let contract: String
    let value: JSONValue?
    let valueFrom: String?
    let patch: JSONValue?
    let expectedError: String?
    let validationContext: ValidationContext?
}

private struct Corpus: Decodable {
    let valid: [FixtureCase]
    let invalid: [FixtureCase]
}

private let fixtureDirectory: URL = {
    let packageRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
    return packageRoot
        .appendingPathComponent("../../../../packages/contracts/fixtures/kenos/v1")
        .standardizedFileURL
}()

private func loadCorpus() throws -> Corpus {
    try JSONDecoder().decode(Corpus.self, from: Data(contentsOf: fixtureDirectory.appendingPathComponent("corpus.json")))
}

private func data(for value: JSONValue) throws -> Data {
    try JSONEncoder().encode(value)
}

private func materialize(_ fixture: FixtureCase, validById: [String: JSONValue]) throws -> JSONValue {
    if let value = fixture.value { return value }
    guard let baseId = fixture.valueFrom,
          case let .object(base)? = validById[baseId],
          case let .object(patch)? = fixture.patch
    else { throw CocoaError(.coderInvalidValue) }
    return .object(base.merging(patch) { _, replacement in replacement })
}

private func decodeAndValidate(_ contract: String, value: JSONValue, createTaskBoundary: Bool = false, validationContext: FixtureCase.ValidationContext? = nil) throws -> Data {
    let input = try data(for: value)
    let decoder = JSONDecoder()
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    switch contract {
    case "entityRef":
        let decoded = try decoder.decode(EntityRef.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "actionRequest", "serverAction":
        let decoded = try decoder.decode(ActionRequest.self, from: input)
        if createTaskBoundary { try decoded.validateCreateTaskBoundary() } else { try decoded.validate() }
        return try encoder.encode(decoded)
    case "actionDecision": return try encoder.encode(decoder.decode(ActionDecision.self, from: input))
    case "actionResult": return try encoder.encode(decoder.decode(ActionResult.self, from: input))
    case "approvalRequest": return try encoder.encode(decoder.decode(ApprovalRequest.self, from: input))
    case "approvalDecision": return try encoder.encode(decoder.decode(ApprovalDecision.self, from: input))
    case "approvalRecord":
        let decoded = try decoder.decode(ApprovalRecord.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "serverApproval":
        let decoded = try decoder.decode(ApprovalRecord.self, from: input)
        try decoded.validate()
        if let expected = validationContext?.authOwnerId.flatMap(UUID.init(uuidString:)), decoded.ownerId != expected {
            throw KenosContractError.approvalOwnerMismatch
        }
        if let expected = validationContext?.expectedActionId.flatMap(UUID.init(uuidString:)), decoded.actionId != expected {
            throw KenosContractError.approvalActionMismatch
        }
        return try encoder.encode(decoded)
    case "mutationEnvelope": return try encoder.encode(decoder.decode(MutationEnvelope.self, from: input))
    case "commandFailure": return try encoder.encode(decoder.decode(CommandFailure.self, from: input))
    case "activityRecord":
        let decoded = try decoder.decode(ActivityRecord.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "outboxRecord":
        let decoded = try decoder.decode(OutboxRecord.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "captureEnvelope": return try encoder.encode(decoder.decode(CaptureEnvelope.self, from: input))
    case "workProject":
        let decoded = try decoder.decode(WorkProject.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "workDeliverable":
        let decoded = try decoder.decode(WorkDeliverable.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "workMeeting":
        let decoded = try decoder.decode(WorkMeeting.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "workDecision":
        let decoded = try decoder.decode(WorkDecision.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "workActionProposal":
        let decoded = try decoder.decode(WorkActionProposal.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "connectorRegistryEntry":
        return try encoder.encode(decoder.decode(ConnectorRegistryEntry.self, from: input))
    case "focusContext":
        let decoded = try decoder.decode(KenosFocusContext.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "deferredItem":
        let decoded = try decoder.decode(KenosDeferredItem.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "interruptionCandidate":
        return try encoder.encode(decoder.decode(KenosInterruptionCandidate.self, from: input))
    case "proactiveSuggestion":
        let decoded = try decoder.decode(KenosProactiveSuggestion.self, from: input)
        try decoded.validate()
        return try encoder.encode(decoded)
    case "sessionSummary":
        return try encoder.encode(decoder.decode(KenosSessionSummary.self, from: input))
    default: throw CocoaError(.coderInvalidValue)
    }
}

@Test("Swift Codable round-trips every canonical valid fixture")
func validCanonicalFixturesRoundTrip() throws {
    let corpus = try loadCorpus()
    var encoded: [String: Any] = [:]
    for fixture in corpus.valid {
        let value = try #require(fixture.value)
        let output = try decodeAndValidate(fixture.contract, value: value)
        encoded[fixture.id] = try JSONSerialization.jsonObject(with: output)
    }

    if let outputPath = ProcessInfo.processInfo.environment["KENOS_SWIFT_PARITY_OUTPUT"] {
        let output = try JSONSerialization.data(withJSONObject: encoded, options: [.sortedKeys])
        try output.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
    }
}

@Test("Swift rejects the canonical invalid fixtures at contract or create-task boundary")
func invalidCanonicalFixturesFailClosed() throws {
    let corpus = try loadCorpus()
    let validById = Dictionary(uniqueKeysWithValues: corpus.valid.compactMap { fixture in fixture.value.map { (fixture.id, $0) } })

    for fixture in corpus.invalid {
        if fixture.contract == "serverScenario" || fixture.contract == "serverWorkScenario" { continue }
        if fixture.contract == "outboxTransition" {
            guard case let .object(transition) = try materialize(fixture, validById: validById),
                  case let .string(from)? = transition["from"],
                  case let .string(to)? = transition["to"],
                  let fromStatus = KenosOutboxStatus(rawValue: from),
                  let toStatus = KenosOutboxStatus(rawValue: to)
            else { Issue.record("Malformed transition fixture \(fixture.id)"); continue }
            #expect(throws: KenosContractError.invalidOutboxTransition) {
                try OutboxRecord.validateTransition(from: fromStatus, to: toStatus)
            }
            continue
        }
        if fixture.contract == "approvalTransition" {
            guard case let .object(transition) = try materialize(fixture, validById: validById),
                  case let .string(from)? = transition["from"],
                  case let .string(to)? = transition["to"],
                  let fromStatus = KenosApprovalStatus(rawValue: from),
                  let toStatus = KenosApprovalStatus(rawValue: to)
            else { Issue.record("Malformed approval transition fixture \(fixture.id)"); continue }
            #expect(throws: KenosContractError.invalidApprovalTransition) {
                try ApprovalRecord.validateTransition(from: fromStatus, to: toStatus)
            }
            continue
        }
        if fixture.contract == "workActionProposalTransition" {
            guard case let .object(transition) = try materialize(fixture, validById: validById),
                  case let .string(from)? = transition["from"],
                  case let .string(to)? = transition["to"],
                  let fromStatus = KenosWorkActionProposalStatus(rawValue: from),
                  let toStatus = KenosWorkActionProposalStatus(rawValue: to)
            else { Issue.record("Malformed work proposal transition fixture \(fixture.id)"); continue }
            #expect(throws: KenosContractError.invalidApprovalTransition) {
                try WorkActionProposal.validateTransition(from: fromStatus, to: toStatus)
            }
            continue
        }
        if fixture.contract == "focusStatusTransition" {
            guard case let .object(transition) = try materialize(fixture, validById: validById),
                  case let .string(from)? = transition["from"],
                  case let .string(to)? = transition["to"],
                  let fromStatus = KenosFocusStatus(rawValue: from),
                  let toStatus = KenosFocusStatus(rawValue: to)
            else { Issue.record("Malformed focus transition fixture \(fixture.id)"); continue }
            #expect(throws: KenosContractError.invalidFocusTransition) {
                try KenosFocusStatusTransitions.validateTransition(from: fromStatus, to: toStatus)
            }
            continue
        }

        let value = try materialize(fixture, validById: validById)
        do {
            _ = try decodeAndValidate(fixture.contract, value: value, createTaskBoundary: fixture.contract == "serverAction", validationContext: fixture.validationContext)
            Issue.record("\(fixture.id) must fail closed")
        } catch {
            // Expected: invalid canonical fixtures must be rejected.
        }
    }
}

@Test("Focus status transitions match the Phase 5 graph")
func focusStatusTransitions() throws {
    try KenosFocusStatusTransitions.validateTransition(from: .inactive, to: .starting)
    try KenosFocusStatusTransitions.validateTransition(from: .starting, to: .active)
    try KenosFocusStatusTransitions.validateTransition(from: .active, to: .paused)
    try KenosFocusStatusTransitions.validateTransition(from: .active, to: .temporarilyLeft)
    try KenosFocusStatusTransitions.validateTransition(from: .paused, to: .active)
    try KenosFocusStatusTransitions.validateTransition(from: .ending, to: .completed)
    #expect(throws: KenosContractError.invalidFocusTransition) {
        try KenosFocusStatusTransitions.validateTransition(from: .completed, to: .active)
    }
    #expect(throws: KenosContractError.invalidFocusTransition) {
        try KenosFocusStatusTransitions.validateTransition(from: .inactive, to: .active)
    }
    #expect(KenosFocusRuntime.canTransitionFocusStatus(from: .active, to: .ending))
    #expect(!KenosFocusRuntime.canTransitionFocusStatus(from: .cancelled, to: .active))
}

@Test("Unknown Focus mode fails closed")
func unknownFocusModeFailClosed() {
    let parsed = KenosFocusRuntime.parseFocusModeFailClosed("not_a_real_mode")
    #expect(!parsed.isOk)
    #expect(parsed.errorMessage?.contains("fail-closed") == true)
    #expect(KenosFocusRuntime.parseFocusModeFailClosed("training").isOk)
    #expect(KenosFocusRuntime.parseFocusModeFailClosed("deep_work").value == .deepWork)
}

@Test("Focus start hides global navigation only while active")
func focusHidesGlobalNavigation() throws {
    let owner = UUID(uuidString: "20000000-0000-4000-8000-000000000001")!
    let started = KenosFocusRuntime.startFocusSession(
        existingForeground: nil,
        ownerId: owner,
        mode: .training,
        title: "Push Day",
        safeSummary: "Local Training Focus simulation"
    )
    let focus = try #require(started.value)
    #expect(KenosFocusRuntime.hidesGlobalNavigation(focus))
    let paused = try #require(KenosFocusRuntime.transitionFocus(focus, to: .paused).value)
    #expect(!KenosFocusRuntime.hidesGlobalNavigation(paused))
}

@Test("Swift enums and transition graph match the machine-readable manifest")
func manifestParity() throws {
    let manifestData = try Data(contentsOf: fixtureDirectory.appendingPathComponent("manifest.json"))
    let manifest = try #require(try JSONSerialization.jsonObject(with: manifestData) as? [String: Any])

    #expect(manifest["contractVersion"] as? String == KenosSchemaVersion.v1.rawValue)
    #expect(manifest["unknownFields"] as? String == "ignore")
    #expect(manifest["actionTypes"] as? [String] == KenosActionType.allCases.map(\.rawValue))
    #expect(manifest["domains"] as? [String] == KenosDomain.allCases.map(\.rawValue))
    #expect(manifest["securityDomains"] as? [String] == KenosSecurityDomain.allCases.map(\.rawValue))
    #expect(manifest["dataClassifications"] as? [String] == KenosDataClassification.allCases.map(\.rawValue))
    #expect(manifest["riskValues"] as? [String] == KenosRisk.allCases.map(\.rawValue))
    #expect(manifest["actorTypes"] as? [String] == KenosActorType.allCases.map(\.rawValue))
    #expect(manifest["actionDecisionOutcomes"] as? [String] == KenosActionDecisionOutcome.allCases.map(\.rawValue))
    #expect(manifest["actionResultStatuses"] as? [String] == KenosActionResultStatus.allCases.map(\.rawValue))
    #expect(manifest["activityResults"] as? [String] == KenosActivityResult.allCases.map(\.rawValue))
    #expect(manifest["approvalStatuses"] as? [String] == KenosApprovalStatus.allCases.map(\.rawValue))
    #expect(manifest["outboxStatuses"] as? [String] == KenosOutboxStatus.allCases.map(\.rawValue))
    #expect(manifest["errorClasses"] as? [String] == KenosErrorClass.allCases.map(\.rawValue))
    #expect(manifest["workProjectStatuses"] as? [String] == KenosWorkProjectStatus.allCases.map(\.rawValue))
    #expect(manifest["workDeliverableStatuses"] as? [String] == KenosWorkDeliverableStatus.allCases.map(\.rawValue))
    #expect(manifest["workDecisionStatuses"] as? [String] == KenosWorkDecisionStatus.allCases.map(\.rawValue))
    #expect(manifest["workActionProposalStatuses"] as? [String] == KenosWorkActionProposalStatus.allCases.map(\.rawValue))
    #expect(manifest["workPriorities"] as? [String] == KenosWorkPriority.allCases.map(\.rawValue))
    if let focusModes = manifest["focusModes"] as? [String] {
        #expect(focusModes == KenosFocusMode.allCases.map(\.rawValue))
    }
    if let focusStatuses = manifest["focusStatuses"] as? [String] {
        #expect(focusStatuses == KenosFocusStatus.allCases.map(\.rawValue))
    }
}
