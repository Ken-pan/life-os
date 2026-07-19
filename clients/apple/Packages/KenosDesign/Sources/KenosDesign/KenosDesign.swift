import SwiftUI

#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

public enum KenosColorToken {
    public static let foreground = Color.primary
    public static let secondary = Color.secondary
    public static let accent = Color.accentColor
    public static let danger = Color.red
    public static let warning = Color.orange
    public static let success = Color.green
}

public enum KenosSpacing {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 24
    public static let xl: CGFloat = 32
}

public enum KenosTypography {
    public static let title = Font.title2.weight(.semibold)
    public static let headline = Font.headline
    public static let body = Font.body
    public static let caption = Font.caption
}

public struct KenosStatusBanner: View {
    public let title: String
    public let detail: String?
    public let tone: Tone

    public enum Tone {
        case info, warning, danger, success

        var color: Color {
            switch self {
            case .info: return KenosColorToken.accent
            case .warning: return KenosColorToken.warning
            case .danger: return KenosColorToken.danger
            case .success: return KenosColorToken.success
            }
        }
    }

    public init(title: String, detail: String? = nil, tone: Tone = .info) {
        self.title = title
        self.detail = detail
        self.tone = tone
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: KenosSpacing.xs) {
            Text(title)
                .font(KenosTypography.headline)
                .foregroundStyle(tone.color)
                .accessibilityIdentifier("kenos.status.title")
            if let detail {
                Text(detail)
                    .font(KenosTypography.caption)
                    .foregroundStyle(KenosColorToken.secondary)
                    .accessibilityIdentifier("kenos.status.detail")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(KenosSpacing.md)
        .accessibilityElement(children: .combine)
    }
}

public struct KenosEmptyState: View {
    public let title: String
    public let detail: String

    public init(title: String, detail: String) {
        self.title = title
        self.detail = detail
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: KenosSpacing.sm) {
            Text(title).font(KenosTypography.title)
            Text(detail).font(KenosTypography.body).foregroundStyle(KenosColorToken.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(KenosSpacing.lg)
        .accessibilityIdentifier("kenos.empty")
    }
}

public struct KenosRow: View {
    public let title: String
    public let subtitle: String
    public let meta: String?

    public init(title: String, subtitle: String, meta: String? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.meta = meta
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: KenosSpacing.xs) {
            Text(title).font(KenosTypography.headline)
            Text(subtitle).font(KenosTypography.body).foregroundStyle(KenosColorToken.secondary)
            if let meta {
                Text(meta).font(KenosTypography.caption).foregroundStyle(KenosColorToken.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, KenosSpacing.sm)
        .accessibilityElement(children: .combine)
    }
}

public enum KenosA11y {
    @MainActor
    public static var reduceMotionPreferred: Bool {
        #if canImport(UIKit)
        return UIAccessibility.isReduceMotionEnabled
        #elseif canImport(AppKit)
        return NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        #else
        return false
        #endif
    }
}
