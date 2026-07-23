import CryptoKit
import Foundation
import KenosClient

#if os(iOS) && !targetEnvironment(simulator)
import DeviceCheck
#endif

/// Apple App Attest helpers for Owner Device Lock pairing / exchange.
enum KenosAppAttest {
    private static let secureStore: KenosSecureStore = SecItemSecureStore(
        service: "space.kenos.app.appAttest"
    )
    private static let keyIdAccount = "kenos.appAttest.keyId"

    struct AttestationBundle: Equatable {
        var keyId: String
        var attestationBase64: String
        var challenge: String
    }

    static var storedKeyId: String? {
        guard
            let data = try? secureStore.readSecret(account: keyIdAccount),
            let id = String(data: data, encoding: .utf8),
            !id.isEmpty
        else { return nil }
        return id
    }

    static func clearForTests() {
        try? secureStore.deleteSecret(account: keyIdAccount)
    }

    /// Fetch server challenge then produce attestation (no-op when App Attest unavailable).
    static func prepareAttestation(apiBase: URL) async -> AttestationBundle? {
        #if os(iOS) && !targetEnvironment(simulator)
        guard DCAppAttestService.shared.isSupported else { return nil }
        do {
            let challenge = try await fetchAttestChallenge(apiBase: apiBase)
            let keyId: String
            if let existing = storedKeyId {
                keyId = existing
            } else {
                keyId = try await generateKey()
                try secureStore.writeSecret(Data(keyId.utf8), account: keyIdAccount)
            }
            let hash = Data(SHA256.hash(data: Data(challenge.utf8)))
            let attestation: Data
            do {
                attestation = try await attestKey(keyId: keyId, clientDataHash: hash)
            } catch {
                // 卸载重装后 Keychain 里的旧 keyId 仍在,但 App Attest 密钥本体已被系统
                // 销毁(DCError.invalidKey)。清掉残留、换新 key 重试一次,避免 attest 死锁。
                guard isInvalidKeyError(error), storedKeyId != nil else { throw error }
                KenosLog.notice("app attest key invalid — regenerating", category: .session)
                try? secureStore.deleteSecret(account: keyIdAccount)
                let freshKeyId = try await generateKey()
                try secureStore.writeSecret(Data(freshKeyId.utf8), account: keyIdAccount)
                attestation = try await attestKey(keyId: freshKeyId, clientDataHash: hash)
                return AttestationBundle(
                    keyId: freshKeyId,
                    attestationBase64: attestation.base64EncodedString(),
                    challenge: challenge
                )
            }
            return AttestationBundle(
                keyId: keyId,
                attestationBase64: attestation.base64EncodedString(),
                challenge: challenge
            )
        } catch {
            KenosLog.notice(
                "app attest prepare failed",
                category: .session,
                metadata: ["error": String(describing: error)]
            )
            return nil
        }
        #else
        return nil
        #endif
    }

    /// Assertion over an exchange challenge (requires prior attestation key).
    static func prepareAssertion(challenge: String) async -> String? {
        #if os(iOS) && !targetEnvironment(simulator)
        guard DCAppAttestService.shared.isSupported, let keyId = storedKeyId else { return nil }
        do {
            let hash = Data(SHA256.hash(data: Data(challenge.utf8)))
            let assertion = try await generateAssertion(keyId: keyId, clientDataHash: hash)
            return assertion.base64EncodedString()
        } catch {
            KenosLog.notice(
                "app attest assertion failed",
                category: .session,
                metadata: ["error": String(describing: error)]
            )
            // 密钥本体已失效(通常是卸载重装):清掉残留 keyId,
            // 下次 pair 会注册新 key,attest 保护自动恢复。
            if isInvalidKeyError(error) {
                try? secureStore.deleteSecret(account: keyIdAccount)
            }
            return nil
        }
        #else
        return nil
        #endif
    }

    #if os(iOS) && !targetEnvironment(simulator)
    /// DCError.invalidKey — the stored keyId no longer maps to a live App Attest key.
    private static func isInvalidKeyError(_ error: Error) -> Bool {
        let ns = error as NSError
        return ns.domain == DCError.errorDomain && ns.code == DCError.invalidKey.rawValue
    }
    #endif

    private static func fetchAttestChallenge(apiBase: URL) async throws -> String {
        let url = apiBase.appendingPathComponent("api/device/attest-challenge")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status >= 200, status < 300,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let challenge = json["challenge"] as? String,
              !challenge.isEmpty
        else {
            throw NSError(domain: "KenosAppAttest", code: status, userInfo: [
                NSLocalizedDescriptionKey: "attest-challenge failed",
            ])
        }
        return challenge
    }

    #if os(iOS) && !targetEnvironment(simulator)
    private static func generateKey() async throws -> String {
        try await withCheckedThrowingContinuation { cont in
            DCAppAttestService.shared.generateKey { keyId, error in
                if let error {
                    cont.resume(throwing: error)
                } else if let keyId {
                    cont.resume(returning: keyId)
                } else {
                    cont.resume(throwing: NSError(domain: "KenosAppAttest", code: 2))
                }
            }
        }
    }

    private static func attestKey(keyId: String, clientDataHash: Data) async throws -> Data {
        try await withCheckedThrowingContinuation { cont in
            DCAppAttestService.shared.attestKey(keyId, clientDataHash: clientDataHash) { attestation, error in
                if let error {
                    cont.resume(throwing: error)
                } else if let attestation {
                    cont.resume(returning: attestation)
                } else {
                    cont.resume(throwing: NSError(domain: "KenosAppAttest", code: 3))
                }
            }
        }
    }

    private static func generateAssertion(keyId: String, clientDataHash: Data) async throws -> Data {
        try await withCheckedThrowingContinuation { cont in
            DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, error in
                if let error {
                    cont.resume(throwing: error)
                } else if let assertion {
                    cont.resume(returning: assertion)
                } else {
                    cont.resume(throwing: NSError(domain: "KenosAppAttest", code: 4))
                }
            }
        }
    }
    #endif
}
