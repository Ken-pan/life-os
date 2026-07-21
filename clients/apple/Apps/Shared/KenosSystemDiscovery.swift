#if os(iOS)
import Foundation

/// Shared privacy + deep-link helpers for Spotlight / Apple Handoff.
///
/// Orchestrates publish from Navigation Manifest with debounce + stale-domain
/// filtering so SPA path chatter does not thrash Core Spotlight / NSUserActivity.
enum KenosSystemDiscovery {
    static let privacyDomains: Set<String> = ["money", "work"]

    struct Surface: Equatable {
        var domainId: String
        var path: String
        var title: String
        var summary: String
        var deepLink: String
        var privacy: Bool
    }

    /// Last published signature — skip identical re-publishes.
    nonisolated(unsafe) private(set) static var lastSignature: String?
    /// Surface uniqueId → full deep link (Spotlight open must restore path).
    nonisolated(unsafe) private(set) static var surfaceDeepLinks: [String: String] = [:]

    /// Build a privacy-safe Continuity surface descriptor.
    static func makeSurface(
        domainId: String,
        path: String,
        title: String,
        summary: String
    ) -> Surface? {
        guard let canonical = KenosDomainRegistry.canonicalize(domainId),
              let def = KenosDomainRegistry.definition(for: canonical)
        else { return nil }

        let privacy = privacyDomains.contains(canonical)
        let safeTitle = privacy ? def.label : (title.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? def.label)
        let safeSummary = privacy
            ? def.subtitle
            : (summary.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? def.subtitle)
        let normalizedPath = normalizePath(path)
        let safePath = privacy ? def.homePath : (normalizedPath.isEmpty ? def.homePath : normalizedPath)
        let deepLink = deepLink(domainId: canonical, path: safePath, homePath: def.homePath)

        return Surface(
            domainId: canonical,
            path: safePath,
            title: safeTitle,
            summary: safeSummary,
            deepLink: deepLink,
            privacy: privacy
        )
    }

    static func deepLink(domainId: String, path: String, homePath: String) -> String {
        if domainId == "kenos" { return "kenos://today" }
        let normalizedHome = normalizePath(homePath)
        let normalized = normalizePath(path)
        if normalized.isEmpty || normalized == normalizedHome {
            return "kenos://domain/\(domainId)"
        }
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&+=")
        let encoded = normalized.addingPercentEncoding(withAllowedCharacters: allowed) ?? normalized
        return "kenos://domain/\(domainId)?path=\(encoded)"
    }

    static func normalizePath(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        let noQuery = trimmed.split(separator: "?", maxSplits: 1).map(String.init).first ?? trimmed
        if noQuery.hasPrefix("/") { return noQuery }
        return "/\(noQuery)"
    }

    static func signature(for surface: Surface) -> String {
        "\(surface.domainId)|\(surface.path)|\(surface.title)|\(surface.deepLink)"
    }

    /// Whether this manifest belongs to the currently active Continuity domain.
    static func isCurrentDomain(_ domainId: String, currentDomainId: String) -> Bool {
        let mid = domainId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let current = currentDomainId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !mid.isEmpty else { return false }
        // No active Continuity domain yet — allow first publish.
        guard !current.isEmpty else { return true }
        if mid == current { return true }
        if KenosDomainRegistry.aliases[mid] == current { return true }
        if mid == KenosDomainRegistry.aliases[current] { return true }
        return KenosDomainRegistry.canonicalize(mid) == KenosDomainRegistry.canonicalize(current)
    }

    /// Publish Spotlight + Handoff from a Navigation Manifest (debounced).
    @MainActor
    @discardableResult
    static func publish(
        domainId: String,
        path: String,
        title: String,
        summary: String,
        currentDomainId: String
    ) -> Surface? {
        let resolvedId = domainId.isEmpty ? currentDomainId : domainId
        guard isCurrentDomain(resolvedId, currentDomainId: currentDomainId) else { return nil }
        guard let surface = makeSurface(
            domainId: resolvedId,
            path: path,
            title: title,
            summary: summary
        ) else { return nil }

        let sig = signature(for: surface)
        if sig == lastSignature { return surface }
        lastSignature = sig

        let surfaceKey = KenosSpotlightFoundation.surfacePrefix + surface.domainId
        surfaceDeepLinks[surfaceKey] = surface.deepLink

        KenosSpotlightFoundation.upsert(surface)
        _ = KenosUserActivityFoundation.becomeCurrent(surface)
        return surface
    }

    @MainActor
    static func resign() {
        lastSignature = nil
        KenosUserActivityFoundation.resignCurrent()
    }

    static func cachedSurfaceDeepLink(forUniqueIdentifier id: String) -> String? {
        surfaceDeepLinks[id]
    }

    @MainActor
    static func resetForTests() {
        lastSignature = nil
        surfaceDeepLinks = [:]
        KenosSpotlightFoundation.resetForTests()
        KenosUserActivityFoundation.resetForTests()
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
#endif
