import Foundation

/// Temporary HealthKit kill switch for daily-beta device signing.
///
/// Wildcard / Automatic profiles cannot carry `com.apple.developer.healthkit`.
/// Flip back to `true` once the App ID has HealthKit and Xcode can refresh a
/// Development profile that includes it.
enum KenosHealthKitFeature {
    static let isEnabled = false
}
