import Foundation
import Supabase

/// 与 Life OS Supabase 的全部往来:登录、home.scans 行、home-scan-photos 桶。
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        // 超时必须自己设:URLSession 默认 60s,而冷启动的 restoreSession() 要发网络
        // 请求刷 token —— 弱网下「正在恢复会话…」就是整整一分钟的纯转圈,不能取消
        // 也不告诉你是网络问题。
        //
        // 两个值分开:
        // - request 15s:登录/列表/刷 token 这类小请求,超过 15s 基本就是网络废了,
        //   早点报错让人能重试,比干等一分钟强。
        // - resource 1h:**照片上传是大文件**,整体时限短了会把正常的慢速上传掐断。
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 15
        cfg.timeoutIntervalForResource = 3600
        cfg.waitsForConnectivity = false // 宁可立刻失败让人看见,也不静默挂起
        client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabasePublishableKey,
            options: .init(global: .init(session: URLSession(configuration: cfg)))
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

    /// 现在的客户端毫秒。`updated_at` 是这张表的 LWW 时钟(见迁移
    /// home_scan_sync.sql:5「时间戳用客户端毫秒,与本地 updatedAt 同源」)——
    /// 任何一次改动都必须把它推进,否则别的设备上那条更"新"的旧行会把你的改动盖掉。
    private static func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    private struct ScanTombstone: Encodable {
        let deleted = true
        let updatedAt: Int64
        enum CodingKeys: String, CodingKey { case deleted, updatedAt = "updated_at" }
    }

    private struct ScanRename: Encodable {
        let label: String
        let updatedAt: Int64
        enum CodingKeys: String, CodingKey { case label, updatedAt = "updated_at" }
    }

    /// 删除一次扫描 = 立**墓碑**,不物理删行。
    ///
    /// 这是两端共用的约定:网页端和这里都按 `deleted = false` 过滤(cloud-scan.js
    /// 的 listScans 同款)。物理删的话,别的设备下次同步不知道它没了,会把它当成
    /// 「本地有云端没有」的行再推上来 —— 删不掉的僵尸。
    ///
    /// 桶里的照片不动:墓碑只是不再列出它,数据留着,真要清空间是另一回事。
    func softDeleteScan(id: UUID) async throws {
        try await client.schema("home")
            .from("scans")
            .update(ScanTombstone(updatedAt: Self.nowMs()))
            .eq("id", value: id)
            .execute()
    }

    /// 改名。`updated_at` 同样要推进 —— 理由见 nowMs()。
    func renameScan(id: UUID, label: String) async throws {
        try await client.schema("home")
            .from("scans")
            .update(ScanRename(label: label, updatedAt: Self.nowMs()))
            .eq("id", value: id)
            .execute()
    }
}
