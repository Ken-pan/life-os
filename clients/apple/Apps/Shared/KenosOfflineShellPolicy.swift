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

    /// Offline copy follows the in-app language like the rest of the shell chrome.
    static var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    static func shellUnreachableDetail(isLanDependent: Bool) -> String {
        let zh = prefersChinese
        if isLanDependent {
            return zh
                ? "连不上本机测试版服务。可以重试，或切换到云端版本。"
                : "The Daily Beta origin is unreachable. Retry, or switch to the cloud version."
        }
        return zh ? "请检查网络后重试。" : "Check your network, then retry."
    }

    static func domainUnreachableDetail(isLanDependent: Bool) -> String {
        let zh = prefersChinese
        if isLanDependent {
            return zh
                ? "连不上这个空间的本机服务。可以重试，或切换到云端版本。"
                : "This Space's origin is unreachable. Retry, or switch to the cloud version."
        }
        return zh
            ? "这个空间暂时没有响应。请检查网络后重试。"
            : "This Space did not respond. Check your network, then retry."
    }

    static func hardGateShellDetail(isLanDependent: Bool) -> String {
        let zh = prefersChinese
        if isLanDependent {
            return zh
                ? "本机测试版服务离线。可切换到云端版本，或重新连接 Daily Beta。"
                : "The Daily Beta shell is offline. Switch to the cloud version, or reconnect Daily Beta."
        }
        return zh
            ? "Kenos 暂时无法连接。请检查网络后重试。"
            : "Kenos did not respond. Check your network, then retry."
    }

    static func hardGateDomainDetail(isLanDependent: Bool) -> String {
        let zh = prefersChinese
        if isLanDependent {
            return zh
                ? "这个空间的本机服务离线。可切换到云端版本，或重新连接 Daily Beta。"
                : "This Space is offline. Switch to the cloud version, or reconnect Daily Beta."
        }
        return zh
            ? "这个空间暂时无法连接。请检查网络后重试。"
            : "This Space did not respond. Check your network, then retry."
    }

    /// Shared UI strings for gates/banners (localized once, used by shell + domain surfaces).
    static var retryLabel: String { prefersChinese ? "重试" : "Retry" }
    static var useProductionLabel: String { prefersChinese ? "切换到云端" : "Use cloud version" }
    static var syncPausedTitle: String { prefersChinese ? "同步已暂停" : "Sync paused" }
    static var backToKenosLabel: String { prefersChinese ? "返回 Kenos" : "Back to Kenos" }
    static func unreachableTitle(_ name: String) -> String {
        prefersChinese ? "无法连接“\(name)”" : "\(name) unreachable"
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
                    Text(KenosOfflineShellPolicy.syncPausedTitle)
                        .font(.subheadline.weight(.semibold))
                }
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let errorDetail, !errorDetail.isEmpty {
                    Text(errorDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 12) {
                    if showsUseProduction {
                        Button(KenosOfflineShellPolicy.useProductionLabel, action: onUseProduction)
                            .font(.caption.weight(.semibold))
                            .accessibilityIdentifier(useProductionIdentifier)
                    }
                    Button(KenosOfflineShellPolicy.retryLabel, action: onRetry)
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
