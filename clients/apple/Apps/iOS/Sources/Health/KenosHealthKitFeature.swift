import Foundation

/// HealthKit runtime gate.
///
/// Was a temporary kill switch while wildcard / Automatic profiles couldn't carry
/// `com.apple.developer.healthkit`. Re-enabled once the explicit App ID
/// (`space.kenos.app.ios`) gained the HealthKit capability and Xcode signed a
/// Development profile that includes it (`-allowProvisioningUpdates` with an
/// account logged in).
enum KenosHealthKitFeature {
    static let isEnabled = true
}
