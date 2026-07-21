#if canImport(ActivityKit)
import ActivityKit
import Foundation

/// Shared ActivityAttributes for Training / Deep Work / Home Organize Live Activities.
/// Compiled into KenosIOS + KenosWidget (must stay identical in both targets).
public struct KenosDomainActivityAttributes: ActivityAttributes {
    public enum Kind: String, Codable, Hashable, Sendable, CaseIterable {
        case training
        case focus
        case tidy
    }

    public struct ContentState: Codable, Hashable, Sendable {
        public var title: String
        public var subtitle: String
        public var progress: Double?
        public var endsAt: Date?

        public init(
            title: String,
            subtitle: String,
            progress: Double? = nil,
            endsAt: Date? = nil
        ) {
            self.title = title
            self.subtitle = subtitle
            self.progress = progress.map { min(1, max(0, $0)) }
            self.endsAt = endsAt
        }
    }

    /// Static kind — one Live Activity instance per kind.
    public var kind: String

    public init(kind: String) {
        self.kind = kind
    }

    public init(kind: Kind) {
        self.kind = kind.rawValue
    }

    public var resolvedKind: Kind? {
        Kind(rawValue: kind)
    }

    /// Tap target → Kenos Continuity deep link.
    public var deepLinkURL: URL {
        switch resolvedKind {
        case .training:
            return URL(string: "kenos://training/session")!
        case .focus:
            return URL(string: "kenos://work")!
        case .tidy:
            return URL(string: "kenos://domain/home?path=/tidy/go")!
        case .none:
            return URL(string: "kenos://today")!
        }
    }

    public var systemImageName: String {
        switch resolvedKind {
        case .training: return "figure.strengthtraining.traditional"
        case .focus: return "brain.head.profile"
        case .tidy: return "house"
        case .none: return "circle.grid.2x2"
        }
    }

    public var accentRGB: UInt32 {
        switch resolvedKind {
        case .training: return 0xC45C4A
        case .focus: return 0x6A9BE0
        case .tidy: return 0x7AA0C8
        case .none: return 0x5B8CFF
        }
    }
}
#endif
