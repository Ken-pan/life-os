import Foundation
import Supabase

/// 与 Life OS Supabase 的全部往来:登录、home.scans 行、home-scan-photos 桶。
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabasePublishableKey
        )
    }

    // MARK: - Auth

    var currentUserId: UUID? {
        client.auth.currentSession?.user.id
    }

    var currentUserEmail: String? {
        client.auth.currentSession?.user.email
    }

    func signIn(email: String, password: String) async throws {
        try await client.auth.signIn(email: email, password: password)
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    /// 冷启动恢复会话(supabase-swift 自持久化到 keychain,这里只等它加载完)
    func restoreSession() async -> Bool {
        do {
            _ = try await client.auth.session
            return true
        } catch {
            return false
        }
    }

    // MARK: - home.scans

    struct ScanRow: Codable, Identifiable {
        let id: UUID
        var updatedAt: Int64
        var deleted: Bool
        var device: String?
        var label: String?

        enum CodingKeys: String, CodingKey {
            case id
            case updatedAt = "updated_at"
            case deleted
            case device
            case label
        }
    }

    func listScans() async throws -> [ScanRow] {
        try await client.schema("home")
            .from("scans")
            .select("id, updated_at, deleted, device, label")
            .eq("deleted", value: false)
            .order("updated_at", ascending: false)
            .execute()
            .value
    }
}
