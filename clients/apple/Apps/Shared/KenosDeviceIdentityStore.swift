import CryptoKit
import Foundation
import KenosClient

#if os(iOS)
import UIKit
#endif

/// Secure device keypair for Owner Device Lock (never exposed to WKWebView / JS).
/// Prefers Secure Enclave P-256 when available; falls back to software key in Keychain.
enum KenosDeviceIdentityStore {
    private static let secureStore: KenosSecureStore = SecItemSecureStore(
        service: "space.kenos.app.deviceIdentity"
    )
    /// Software private key raw bytes (32) — only used when SE unavailable.
    private static let softwareKeyAccount = "kenos.device.privateKey.p256"
    /// Secure Enclave key dataRepresentation (opaque reference blob).
    private static let seKeyAccount = "kenos.device.privateKey.se.p256"
    private static let keyStorageAccount = "kenos.device.keyStorage"
    private static let deviceIdAccount = "kenos.device.id"
    private static let pairedFlagAccount = "kenos.device.paired"
    private static let pairedRowIdAccount = "kenos.device.pairedRowId"
    private static let sessionEpochAccount = "kenos.device.sessionEpoch"

    enum KeyStorage: String {
        case secureEnclave = "secure_enclave"
        case software = "software"
    }

    struct Identity: Equatable {
        var deviceId: String
        var publicKeyBase64: String
        var deviceClass: String
        var platform: String
        var label: String
        var keyStorage: KeyStorage
    }

    static var isPaired: Bool {
        guard
            let data = try? secureStore.readSecret(account: pairedFlagAccount),
            let flag = String(data: data, encoding: .utf8)
        else { return false }
        return flag == "1"
    }

    static var pairedRowId: String? {
        guard
            let data = try? secureStore.readSecret(account: pairedRowIdAccount),
            let id = String(data: data, encoding: .utf8),
            !id.isEmpty
        else { return nil }
        return id
    }

    static var keyStorage: KeyStorage {
        guard
            let data = try? secureStore.readSecret(account: keyStorageAccount),
            let raw = String(data: data, encoding: .utf8),
            let value = KeyStorage(rawValue: raw)
        else { return .software }
        return value
    }

    static var storedSessionEpoch: Int {
        guard
            let data = try? secureStore.readSecret(account: sessionEpochAccount),
            let raw = String(data: data, encoding: .utf8),
            let value = Int(raw)
        else { return 0 }
        return value
    }

    static func rememberSessionEpoch(_ epoch: Int) {
        try? secureStore.writeSecret(Data(String(epoch).utf8), account: sessionEpochAccount)
    }

    static func markPaired(rowId: String?) {
        try? secureStore.writeSecret(Data("1".utf8), account: pairedFlagAccount)
        if let rowId, !rowId.isEmpty {
            try? secureStore.writeSecret(Data(rowId.utf8), account: pairedRowIdAccount)
        }
    }

    static func clearPairing() {
        try? secureStore.deleteSecret(account: pairedFlagAccount)
        try? secureStore.deleteSecret(account: pairedRowIdAccount)
        // Keep keypair + deviceId so re-pair reuses the same slot when possible.
    }

    static func clearAllForTests() {
        try? secureStore.deleteSecret(account: softwareKeyAccount)
        try? secureStore.deleteSecret(account: seKeyAccount)
        try? secureStore.deleteSecret(account: keyStorageAccount)
        try? secureStore.deleteSecret(account: deviceIdAccount)
        try? secureStore.deleteSecret(account: pairedFlagAccount)
        try? secureStore.deleteSecret(account: pairedRowIdAccount)
        try? secureStore.deleteSecret(account: sessionEpochAccount)
    }

    /// Ensure local device id + P-256 keypair exist; returns public identity for pairing.
    static func ensureIdentity() throws -> Identity {
        let deviceId = try ensureDeviceId()
        let material = try ensureSigningMaterial()
        return Identity(
            deviceId: deviceId,
            publicKeyBase64: material.publicKeyBase64,
            deviceClass: deviceClass(),
            platform: platform(),
            label: deviceLabel(),
            keyStorage: material.storage
        )
    }

    /// ECDSA P-256 signature (IEEE P1363 / raw) over UTF-8 challenge bytes.
    static func sign(challenge: String) throws -> String {
        let material = try ensureSigningMaterial()
        return try material.sign(Data(challenge.utf8)).base64EncodedString()
    }

    private struct SigningMaterial {
        var storage: KeyStorage
        var publicKeyBase64: String
        var sign: (Data) throws -> Data
    }

    private static func ensureSigningMaterial() throws -> SigningMaterial {
        if let se = try loadSecureEnclaveMaterial() {
            return se
        }
        if SecureEnclave.isAvailable, let created = try? createSecureEnclaveMaterial() {
            return created
        }
        return try ensureSoftwareMaterial()
    }

    private static func loadSecureEnclaveMaterial() throws -> SigningMaterial? {
        guard let data = try secureStore.readSecret(account: seKeyAccount) else { return nil }
        #if targetEnvironment(simulator)
        return nil
        #else
        guard SecureEnclave.isAvailable else { return nil }
        let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: data)
        try secureStore.writeSecret(Data(KeyStorage.secureEnclave.rawValue.utf8), account: keyStorageAccount)
        return SigningMaterial(
            storage: .secureEnclave,
            publicKeyBase64: key.publicKey.x963Representation.base64EncodedString(),
            sign: { message in
                try key.signature(for: message).rawRepresentation
            }
        )
        #endif
    }

    private static func createSecureEnclaveMaterial() throws -> SigningMaterial {
        #if targetEnvironment(simulator)
        throw NSError(domain: "KenosDeviceIdentity", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Secure Enclave unavailable on simulator",
        ])
        #else
        let key = try SecureEnclave.P256.Signing.PrivateKey()
        try secureStore.writeSecret(key.dataRepresentation, account: seKeyAccount)
        try? secureStore.deleteSecret(account: softwareKeyAccount)
        try secureStore.writeSecret(Data(KeyStorage.secureEnclave.rawValue.utf8), account: keyStorageAccount)
        KenosLog.notice("device identity key created in Secure Enclave", category: .session)
        return SigningMaterial(
            storage: .secureEnclave,
            publicKeyBase64: key.publicKey.x963Representation.base64EncodedString(),
            sign: { message in
                try key.signature(for: message).rawRepresentation
            }
        )
        #endif
    }

    private static func ensureSoftwareMaterial() throws -> SigningMaterial {
        let privateKey: P256.Signing.PrivateKey
        if let data = try secureStore.readSecret(account: softwareKeyAccount) {
            privateKey = try P256.Signing.PrivateKey(rawRepresentation: data)
        } else {
            privateKey = P256.Signing.PrivateKey()
            try secureStore.writeSecret(privateKey.rawRepresentation, account: softwareKeyAccount)
            KenosLog.notice("device identity key created in software Keychain", category: .session)
        }
        try secureStore.writeSecret(Data(KeyStorage.software.rawValue.utf8), account: keyStorageAccount)
        return SigningMaterial(
            storage: .software,
            publicKeyBase64: privateKey.publicKey.x963Representation.base64EncodedString(),
            sign: { message in
                try privateKey.signature(for: message).rawRepresentation
            }
        )
    }

    private static func ensureDeviceId() throws -> String {
        if let data = try secureStore.readSecret(account: deviceIdAccount),
           let id = String(data: data, encoding: .utf8),
           !id.isEmpty
        {
            return id
        }
        let id = UUID().uuidString.lowercased()
        try secureStore.writeSecret(Data(id.utf8), account: deviceIdAccount)
        return id
    }

    static func deviceClass() -> String {
        #if os(iOS)
        return UIDevice.current.userInterfaceIdiom == .phone || UIDevice.current.userInterfaceIdiom == .pad
            ? "mobile"
            : "desktop"
        #else
        return "desktop"
        #endif
    }

    static func platform() -> String {
        #if os(iOS)
        return "ios"
        #else
        return "macos"
        #endif
    }

    static func deviceLabel() -> String {
        #if os(iOS)
        return UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        #else
        return "Mac"
        #endif
    }
}
