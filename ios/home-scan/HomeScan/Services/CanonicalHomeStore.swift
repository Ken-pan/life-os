import Foundation
import Supabase

/// 永久户型(最新 server-optimized 优化副本)—— 设备端 Home Frame 重定位与
/// 漏扫检测的基准。启动时拉一次并缓存到 Application Support;断网用缓存;
/// 云端还没有优化副本(第一次建家)则为 nil,扫描照常、只是没有对齐徽标。
struct CanonicalHome: Codable {
    var wallGraph: HomeOSProject.WallGraph
    var zones: [HomeOSProject.Zone]
    /// 户型里的家具(带人性化名字/fixed/attrs)—— 设备端「现实核对」的比对基准
    var placements: [HomeOSProject.Placement] = []
    /// 储藏区(S1-S12)与柜内物品 —— AR 寻物的检索空间(旧缓存没有则为 nil)
    var storageZones: [StorageZone]?

    /// 优化副本 storageZones 的瘦身解码(只取寻物需要的字段,契约加法式)
    struct StorageZone: Codable {
        var id: String
        var code: String
        var nameZh: String
        var locationZh: String?
        var marker: HomeOSProject.Point?
        var placementId: String?
        var items: [Item]?

        struct Item: Codable {
            var name: String
            /// 在柜内哪一层(0 = 最下层;柜内实测同步后才有)
            var level: Int?
        }
    }
}

enum CanonicalHomeCache {
    private static var url: URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("canonical-home.json")
    }

    static func save(_ home: CanonicalHome) {
        guard let data = try? JSONEncoder().encode(home) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func load() -> CanonicalHome? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(CanonicalHome.self, from: data)
    }
}

extension SupabaseService {
    /// 最新优化副本的墙体与分区;拉不到(断网/没登录)退缓存
    func fetchCanonicalHome() async -> CanonicalHome? {
        struct Row: Decodable {
            let payload: Payload
            struct Payload: Decodable {
                let homeos: Homeos
            }
            struct Homeos: Decodable {
                let wallGraph: HomeOSProject.WallGraph?
                let zones: [HomeOSProject.Zone]?
                let placements: [HomeOSProject.Placement]?
                let storageZones: [CanonicalHome.StorageZone]?
            }
        }
        do {
            let rows: [Row] = try await client.schema("home")
                .from("scans")
                .select("payload")
                .eq("device", value: "server-optimized")
                .eq("deleted", value: false)
                .order("updated_at", ascending: false)
                .limit(1)
                .execute()
                .value
            if let h = rows.first?.payload.homeos, let wg = h.wallGraph {
                let home = CanonicalHome(
                    wallGraph: wg,
                    zones: h.zones ?? [],
                    placements: h.placements ?? [],
                    storageZones: h.storageZones
                )
                CanonicalHomeCache.save(home)
                return home
            }
        } catch {
            /* 断网/权限 → 退缓存 */
        }
        return CanonicalHomeCache.load()
    }
}
