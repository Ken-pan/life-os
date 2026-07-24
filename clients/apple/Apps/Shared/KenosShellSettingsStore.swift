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
    /// 助手人设:`korben` | `leo`。原生存偏好并广播给 web(见 KorbenAssistantPersona)。
    static let personaKey = "kenos.shell.assistantPersona"
    /// 最后一次真实变更的毫秒时间戳 — AIOS web 用它与云端设置做 LWW 对账
    /// (shellSettingsSync.svelte.js);0 = 从未显式改过。
    static let updatedAtKey = "kenos.shell.updatedAt"

    struct Snapshot: Equatable, Sendable {
        /// `light` | `dark` | `auto`
        var theme: String
        /// `zh` | `en` | `system`
        var locale: String
        /// `korben` | `leo` — 助手人设(Leo 模式)。
        var persona: String = "korben"

        static let `default` = Snapshot(theme: "auto", locale: "system", persona: "korben")

        func resolvedLocale(systemLanguage: String = Locale.preferredLanguages.first ?? "") -> String {
            if locale == "zh" || locale == "en" { return locale }
            let lang = systemLanguage.lowercased()
            return lang.hasPrefix("zh") ? "zh" : "en"
        }
    }

    private static var defaults: UserDefaults { .standard }

    static var hasStoredTheme: Bool { defaults.object(forKey: themeKey) != nil }
    static var hasStoredLocale: Bool { defaults.object(forKey: localeKey) != nil }
    static var hasStoredPersona: Bool { defaults.object(forKey: personaKey) != nil }

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
        let persona = normalizePersona(defaults.string(forKey: personaKey))
        return Snapshot(theme: theme, locale: locale, persona: persona)
    }

    @discardableResult
    static func update(theme: String? = nil, locale: String? = nil, persona: String? = nil) -> Snapshot {
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
        if let persona {
            let normalized = normalizePersona(persona)
            if next.persona != normalized {
                next.persona = normalized
                defaults.set(normalized, forKey: personaKey)
                changed = true
            }
        }
        if changed {
            defaults.set(Int64(Date().timeIntervalSince1970 * 1000), forKey: updatedAtKey)
            NotificationCenter.default.post(
                name: .kenosShellSettingsDidChange,
                object: nil,
                userInfo: encode(next)
            )
        }
        return next
    }

    /// 毫秒时间戳;0 = 从未显式变更。
    static var updatedAtMs: Int64 {
        Int64(defaults.object(forKey: updatedAtKey) as? Int64 ?? 0)
    }

    static func encode(_ snapshot: Snapshot = current) -> [String: Any] {
        [
            "theme": snapshot.theme,
            "locale": snapshot.locale,
            "persona": snapshot.persona,
            "resolvedLocale": snapshot.resolvedLocale(),
            "hasTheme": hasStoredTheme,
            "hasLocale": hasStoredLocale,
            "hasPersona": hasStoredPersona,
            "updatedAt": updatedAtMs,
        ]
    }

    static func apply(params: [String: Any]) -> Snapshot {
        let theme = params["theme"] as? String
        let locale = params["locale"] as? String
        let persona = params["persona"] as? String
        return update(theme: theme, locale: locale, persona: persona)
    }

    /// Reset keys (unit tests).
    static func resetForTests() {
        defaults.removeObject(forKey: themeKey)
        defaults.removeObject(forKey: localeKey)
        defaults.removeObject(forKey: personaKey)
        defaults.removeObject(forKey: updatedAtKey)
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

    private static func normalizePersona(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "leo": return "leo"
        default: return "korben"
        }
    }
}
