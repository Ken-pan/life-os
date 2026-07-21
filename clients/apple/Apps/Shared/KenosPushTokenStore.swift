import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Stores the latest APNs device token for Owner smoke / TestFlight.
/// Does **not** upload tokens to a server — that stays Owner-gated.
enum KenosPushTokenStore {
    static let tokenDefaultsKey = "kenos.push.deviceTokenHex"
    static let lastErrorKey = "kenos.push.lastRegisterError"
    static let remoteEnabledDefaultsKey = "kenos.push.remoteEnabled"

    /// Hex token for Settings / doctor (safe to copy; not a secret by itself).
    static var lastTokenHex: String? {
        UserDefaults.standard.string(forKey: tokenDefaultsKey)
    }

    static var lastError: String? {
        UserDefaults.standard.string(forKey: lastErrorKey)
    }

    static var hasToken: Bool { lastTokenHex?.isEmpty == false }

    static func remember(deviceToken data: Data) {
        let hex = data.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(hex, forKey: tokenDefaultsKey)
        UserDefaults.standard.removeObject(forKey: lastErrorKey)
        KenosLog.info("apns device token", category: .shell, metadata: [
            "bytes": String(data.count),
            "prefix": String(hex.prefix(12)),
        ])
    }

    static func rememberFailure(_ error: Error) {
        UserDefaults.standard.set(error.localizedDescription, forKey: lastErrorKey)
        KenosLog.warning("apns register failed", category: .shell, metadata: [
            "error": error.localizedDescription,
        ])
    }

    /// Owner toggle — enables `registerForRemoteNotifications` without rebuild.
    static var remoteRegistrationEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: remoteEnabledDefaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: remoteEnabledDefaultsKey) }
    }

    static var statusSummary: String {
        if let hex = lastTokenHex, !hex.isEmpty {
            return "token_\(hex.prefix(8))…"
        }
        if let err = lastError, !err.isEmpty {
            return "error"
        }
        return "no_token"
    }
}
