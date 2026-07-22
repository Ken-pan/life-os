import Foundation
#if os(iOS)
import SwiftUI
import KenosDesign

/// Production HTTPS hosts for WKAppBoundDomains (max 10 — Apple limit).
/// Excludes LAN-only dev origins; enables Service Worker + persistent cache on iOS.
enum KenosAppBoundDomains {
    static let productionHosts: [String] = [
        "www.kenos.space",
        "planner.kenos.space",
        "fitness.kenos.space",
        "finance.kenos.space",
        "knowledge.kenos.space",
        "music.kenos.space",
        "home.kenos.space",
        "health.kenos.space",
        "kenos-www.netlify.app",
        "portal.kenos.space",
    ]

    static func isListedProductionHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased(), !host.isEmpty else { return false }
        return productionHosts.contains(host)
    }

    /// Broader than the plist list — includes any `*.kenos.space` shell/domain Continuity.
    static func isProductionHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased(), !host.isEmpty else { return false }
        if isListedProductionHost(host) { return true }
        return host == "kenos.space" || host.hasSuffix(".kenos.space") || host.hasSuffix(".netlify.app")
    }

    /// Gate App-Bound navigation limits only for hosts listed in Info.plist (≤10).
    /// Never enable for LAN/Tailscale HTTP, and never for unlisted HTTPS hosts —
    /// WebKit treats non-listed hosts as non-app-bound when limits are on.
    static func shouldLimitNavigations(for url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https" else { return false }
        return isListedProductionHost(url.host)
    }
}

/// Pure policy for Phase 1 offline shell — when to hard-gate vs keep WK mounted + banner.
enum KenosOfflineShellPolicy {
    struct ProbeContext: Equatable {
        var didPaint: Bool
        var originHost: String?
        var isLanDependent: Bool
        var useProductionOverride: Bool

        var mayHaveCachedShell: Bool {
            KenosAppBoundDomains.isProductionHost(originHost) || useProductionOverride
        }
    }

    /// Full-screen ContentUnavailable — only when WK never painted and no SW/cache path.
    static func shouldUseHardUnavailableGate(_ context: ProbeContext) -> Bool {
        if context.didPaint { return false }
        if context.mayHaveCachedShell { return false }
        return true
    }

    static func shouldShowSyncPausedBanner(probeFailed: Bool, context: ProbeContext) -> Bool {
        probeFailed && !shouldUseHardUnavailableGate(context)
    }

    static func shellUnreachableDetail(isLanDependent: Bool) -> String {
        if isLanDependent {
            return "Life OS origin unreachable. Retry, or switch to Production."
        }
        return "Check your network, then Retry."
    }

    static func domainUnreachableDetail(isLanDependent: Bool) -> String {
        if isLanDependent {
            return "This Space origin is unreachable. Retry, or use Production."
        }
        return "This Space did not respond. Check network, then Retry."
    }

    static func hardGateShellDetail(isLanDependent: Bool) -> String {
        if isLanDependent {
            return "Life OS shell is offline. Use Production (cellular) or reconnect Daily Beta."
        }
        return "Kenos shell origin did not respond. Check network, then Retry."
    }

    static func hardGateDomainDetail(isLanDependent: Bool) -> String {
        if isLanDependent {
            return "This Space is offline. Use Production (cellular) or reconnect Daily Beta."
        }
        return "This Space origin did not respond. Check network, then Retry."
    }
}

/// Non-blocking overlay when health probe fails but WK may still show cached / painted UI.
struct KenosShellSyncStatusBanner: View {
    let message: String
    var errorDetail: String? = nil
    var showsUseProduction: Bool = false
    var useProductionIdentifier: String = "kenos.shell.useProduction"
    let onUseProduction: () -> Void
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.subheadline.weight(.semibold))
                    Text("Sync paused")
                        .font(.subheadline.weight(.semibold))
                }
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let errorDetail, !errorDetail.isEmpty {
                    Text(errorDetail)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                HStack(spacing: 12) {
                    if showsUseProduction {
                        Button("Use Production", action: onUseProduction)
                            .font(.caption.weight(.semibold))
                            .accessibilityIdentifier(useProductionIdentifier)
                    }
                    Button("Retry", action: onRetry)
                        .font(.caption.weight(.semibold))
                }
                .padding(.top, 2)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial)
            // Spacer must not steal taps from WK / sheets underneath the banner.
            Spacer(minLength: 0)
                .allowsHitTesting(false)
        }
    }
}
#endif
