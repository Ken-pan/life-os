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
        if fixture.contract == "serverScenario" { continue }
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

        let value = try materialize(fixture, validById: validById)
        do {
            _ = try decodeAndValidate(fixture.contract, value: value, createTaskBoundary: fixture.contract == "serverAction", validationContext: fixture.validationContext)
            Issue.record("\(fixture.id) must fail closed")
        } catch {
            // Expected: invalid canonical fixtures must be rejected.
        }
    }
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
}
