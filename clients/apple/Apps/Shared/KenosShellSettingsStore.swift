import Foundation
import SwiftUI

extension Notification.Name {
    /// Fired when Continuity-wide shell settings (theme / locale) change.
    static let kenosShellSettingsDidChange = Notification.Name("kenosShellSettingsDidChange")
}

/// Process-wide Continuity shell preferences (theme + locale).
///
/// All WKWebView domains share one Kenos process, so `UserDefaults.standard`
/// is enough for cross-app consistency inside iOS Continuity. Domain
/// localStorage remains a cache that is overwritten on pull.
enum KenosShellSettingsStore {
    static let themeKey = "kenos.shell.theme"
    static let localeKey = "kenos.shell.locale"

    struct Snapshot: Equatable, Sendable {
        /// `light` | `dark` | `auto`
        var theme: String
        /// `zh` | `en` | `system`
        var locale: String

        static let `default` = Snapshot(theme: "auto", locale: "system")

        func resolvedLocale(systemLanguage: String = Locale.preferredLanguages.first ?? "") -> String {
            if locale == "zh" || locale == "en" { return locale }
            let lang = systemLanguage.lowercased()
            return lang.hasPrefix("zh") ? "zh" : "en"
        }
    }

    private static var defaults: UserDefaults { .standard }

    static var hasStoredTheme: Bool { defaults.object(forKey: themeKey) != nil }
    static var hasStoredLocale: Bool { defaults.object(forKey: localeKey) != nil }

    /// `nil` = follow system (SwiftUI `.preferredColorScheme(nil)`).
    static func preferredColorScheme(_ snapshot: Snapshot = current) -> ColorScheme? {
        switch snapshot.theme {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    static var current: Snapshot {
        let theme = normalizeTheme(defaults.string(forKey: themeKey))
        let locale = normalizeLocale(defaults.string(forKey: localeKey))
        return Snapshot(theme: theme, locale: locale)
    }

    @discardableResult
    static func update(theme: String? = nil, locale: String? = nil) -> Snapshot {
        var next = current
        var changed = false
        if let theme {
            let normalized = normalizeTheme(theme)
            if next.theme != normalized {
                next.theme = normalized
                defaults.set(normalized, forKey: themeKey)
                changed = true
            }
        }
        if let locale {
            let normalized = normalizeLocale(locale)
            if next.locale != normalized {
                next.locale = normalized
                defaults.set(normalized, forKey: localeKey)
                changed = true
            }
        }
        if changed {
            NotificationCenter.default.post(
                name: .kenosShellSettingsDidChange,
                object: nil,
                userInfo: encode(next)
            )
        }
        return next
    }

    static func encode(_ snapshot: Snapshot = current) -> [String: Any] {
        [
            "theme": snapshot.theme,
            "locale": snapshot.locale,
            "resolvedLocale": snapshot.resolvedLocale(),
            "hasTheme": hasStoredTheme,
            "hasLocale": hasStoredLocale,
        ]
    }

    static func apply(params: [String: Any]) -> Snapshot {
        let theme = params["theme"] as? String
        let locale = params["locale"] as? String
        return update(theme: theme, locale: locale)
    }

    /// Reset keys (unit tests).
    static func resetForTests() {
        defaults.removeObject(forKey: themeKey)
        defaults.removeObject(forKey: localeKey)
    }

    private static func normalizeTheme(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "light": return "light"
        case "dark": return "dark"
        default: return "auto"
        }
    }

    private static func normalizeLocale(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "zh", "zh-cn", "zh-hans": return "zh"
        case "en", "en-us", "en-gb": return "en"
        case "system", "auto", "": return "system"
        default: return "system"
        }
    }
}
