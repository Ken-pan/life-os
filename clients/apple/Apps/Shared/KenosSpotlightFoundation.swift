#if os(iOS)
import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

/// Core Spotlight index for Continuity spaces (Phase D).
///
/// Indexes domain homes + the current surface from Navigation Manifest.
/// Privacy / deep-link rules live in `KenosSystemDiscovery`.
enum KenosSpotlightFoundation {
    /// Own-content Spotlight needs no special entitlement.
    static let isEnabled = true

    static let domainType = "space.kenos.app.domain"
    static let surfaceType = "space.kenos.app.surface"

    static let domainPrefix = "kenos.domain."
    static let surfacePrefix = "kenos.surface."

    nonisolated(unsafe) private(set) static var lastIndexedDomainIds: [String] = []
    nonisolated(unsafe) private(set) static var lastSurfaceId: String?

    static var statusSummary: String {
        isEnabled ? "spotlight_ready" : "spotlight_disabled"
    }

    /// Index Continuity domain homes (idempotent replace).
    @MainActor
    static func indexDomainCatalog() {
        guard isEnabled else { return }
        let domains = KenosDomainRegistry.definitions.filter { def in
            def.strategy == .embeddedWeb || def.id == "kenos"
        }
        let items: [CSSearchableItem] = domains.compactMap { def in
            guard KenosDomainRegistry.continuityURL(for: def.id) != nil || def.id == "kenos"
            else { return nil }
            let attrs = CSSearchableItemAttributeSet(contentType: .content)
            attrs.title = def.label
            attrs.contentDescription = def.subtitle
            attrs.keywords = [def.label, def.id] + def.aliases
            attrs.displayName = def.label
            // Restore via uniqueIdentifier → deepLink(forUniqueIdentifier:) —
            // custom-scheme contentURL is unreliable on Spotlight.
            return CSSearchableItem(
                uniqueIdentifier: domainPrefix + def.id,
                domainIdentifier: domainType,
                attributeSet: attrs
            )
        }
        lastIndexedDomainIds = items.map(\.uniqueIdentifier)
        CSSearchableIndex.default().indexSearchableItems(items) { error in
            if let error {
                KenosLog.warning("spotlight domain index failed", category: .shell, metadata: [
                    "error": error.localizedDescription,
                ])
            } else {
                KenosLog.debug("spotlight domain catalog indexed", category: .shell, metadata: [
                    "count": String(items.count),
                ])
            }
        }
    }

    /// Upsert the active Continuity surface (privacy already applied by discovery).
    @MainActor
    static func upsert(_ surface: KenosSystemDiscovery.Surface) {
        guard isEnabled else { return }
        let attrs = CSSearchableItemAttributeSet(contentType: .content)
        attrs.title = surface.title
        attrs.contentDescription = surface.summary
        attrs.keywords = [surface.title, surface.domainId]
        attrs.displayName = surface.title

        let item = CSSearchableItem(
            uniqueIdentifier: surfacePrefix + surface.domainId,
            domainIdentifier: surfaceType,
            attributeSet: attrs
        )
        lastSurfaceId = item.uniqueIdentifier

        CSSearchableIndex.default().indexSearchableItems([item]) { error in
            if let error {
                KenosLog.warning("spotlight surface index failed", category: .shell, metadata: [
                    "domain": surface.domainId,
                    "error": error.localizedDescription,
                ])
            } else {
                KenosLog.debug("spotlight surface upserted", category: .shell, metadata: [
                    "domain": surface.domainId,
                    "privacy": surface.privacy ? "1" : "0",
                ])
            }
        }
    }

    /// Resolve a Spotlight uniqueIdentifier → `kenos://` deep link.
    static func deepLink(forUniqueIdentifier id: String) -> String? {
        if let cached = KenosSystemDiscovery.cachedSurfaceDeepLink(forUniqueIdentifier: id) {
            return cached
        }
        if id.hasPrefix(domainPrefix) {
            let domainId = String(id.dropFirst(domainPrefix.count))
            if domainId == "kenos" { return "kenos://today" }
            guard KenosDomainRegistry.definition(for: domainId) != nil else { return nil }
            return "kenos://domain/\(domainId)"
        }
        if id.hasPrefix(surfacePrefix) {
            let domainId = String(id.dropFirst(surfacePrefix.count))
            if domainId == "kenos" { return "kenos://today" }
            guard KenosDomainRegistry.definition(for: domainId) != nil else { return nil }
            // Fallback when cache cold (process restart) — home only.
            return "kenos://domain/\(domainId)"
        }
        return nil
    }

    static func resetForTests() {
        lastIndexedDomainIds = []
        lastSurfaceId = nil
    }
}
#endif
