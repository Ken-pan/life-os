import Foundation

/// Shared Supabase publishable config for Kenos native (bug report + log sync).
enum KenosSupabaseConfig {
    static var url: URL? {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "KENOS_SUPABASE_URL") as? String,
           let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
           !raw.contains("$(")
        {
            return url
        }
        return URL(string: "https://iueozzuctstwvzbcxcyh.supabase.co")
    }

    static var anonKey: String {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "KENOS_SUPABASE_ANON_KEY") as? String {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, !trimmed.contains("$(") { return trimmed }
        }
        return "sb_publishable_V_BnCiRU9vozOl3VLL8AAg_KsUfDEcL"
    }

    static func restURL(_ path: String) -> URL? {
        guard let base = url else { return nil }
        let root = base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return URL(string: "\(root)/rest/v1/\(trimmed)")
    }

    static func rpcURL(_ fn: String) -> URL? {
        guard let base = url else { return nil }
        let root = base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(root)/rest/v1/rpc/\(fn)")
    }
}
