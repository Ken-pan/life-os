import Foundation
import Supabase

/// 永久户型(最新 server-optimized 优化副本)—— 设备端 Home Frame 重定位与
/// 漏扫检测的基准。启动时拉一次并缓存到 Application Support;断网用缓存;
/// 云端还没有优化副本(第一次建家)则为 nil,扫描照常、只是没有对齐徽标。
struct CanonicalHome: Codable {
    var wallGraph: HomeOSProject.WallGraph
    var zones: [HomeOSProject.Zone]
    /// 权威门窗 —— 覆盖差报(这次扫描比权威少几樘门窗)的基准
    /// (旧缓存没有则为 nil,加法式扩展)
    var graphOpenings: [HomeOSProject.GraphOpening]? = nil
    /// 户型里的家具(带人性化名字/fixed/attrs)—— 设备端「现实核对」的比对基准
    var placements: [HomeOSProject.Placement] = []
    /// 户型固定装置(冰箱/浴缸/灶台…)—— 检测陷阱纠正的跨列表参照
    /// (旧缓存没有则为 nil)
    var fixtures: [HomeOSProject.Fixture]? = nil
    /// 储藏区(S1-S12)与柜内物品 —— AR 寻物的检索空间(旧缓存没有则为 nil)
    var storageZones: [StorageZone]?
    /// 权威件身份提示(用户纠正一等数据),键 = 权威件 id(pl-*/fx-*)。
    /// 来源是契约字段 `attrs.scanAliases` / `attrs.identityLocked`
    /// (三端同源约定,网页端同名写入;命名不许自行发挥)——
    /// payload 契约类型 ObjectAttrs 不带它们,拉取时从同一段 JSON 抽出放这里。
    var identityHints: [String: IdentityHint]? = nil

    /// 一件权威家具的「检测陷阱」标注:
    /// - scanAliases:扫描惯把这件误检成哪些 kind(如鸟笼 → ["fridge"])
    /// - identityLocked:kind/label/几何以权威为准,扫描值不许覆盖
    struct IdentityHint: Codable {
        var scanAliases: [String] = []
        var identityLocked: Bool = false
    }

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

    static func clear() {
        try? FileManager.default.removeItem(at: url)
    }
}

/// payload.homeos 的设备端解码视角(fetch 与单测共用)。
/// 契约字段 `attrs.scanAliases` / `attrs.identityLocked` 在这里透传:
/// ObjectAttrs 是 payload 契约类型(设备端只写不带它们的字段),
/// 所以用「同一段 JSON 的第二视角」把身份提示抽进 identityHints。
struct CanonicalHomePayload: Decodable {
    let wallGraph: HomeOSProject.WallGraph?
    let zones: [HomeOSProject.Zone]?
    let graphOpenings: [HomeOSProject.GraphOpening]?
    let placements: [HintedPlacement]?
    let fixtures: [HintedFixture]?
    let storageZones: [CanonicalHome.StorageZone]?

    /// 权威件 + 它的身份提示(没有提示字段则 hint 为 nil)
    struct HintedPlacement: Decodable {
        let base: HomeOSProject.Placement
        let hint: CanonicalHome.IdentityHint?

        init(from decoder: Decoder) throws {
            base = try HomeOSProject.Placement(from: decoder)
            hint = decodeIdentityHint(from: decoder)
        }
    }

    struct HintedFixture: Decodable {
        let base: HomeOSProject.Fixture
        let hint: CanonicalHome.IdentityHint?

        init(from decoder: Decoder) throws {
            base = try HomeOSProject.Fixture(from: decoder)
            hint = decodeIdentityHint(from: decoder)
        }
    }

    func toCanonicalHome() -> CanonicalHome? {
        guard let wg = wallGraph else { return nil }
        var hints: [String: CanonicalHome.IdentityHint] = [:]
        for p in placements ?? [] where p.hint != nil { hints[p.base.id] = p.hint }
        for f in fixtures ?? [] where f.hint != nil { hints[f.base.id] = f.hint }
        return CanonicalHome(
            wallGraph: wg,
            zones: zones ?? [],
            graphOpenings: graphOpenings,
            placements: (placements ?? []).map(\.base),
            fixtures: fixtures.map { $0.map(\.base) },
            storageZones: storageZones,
            identityHints: hints.isEmpty ? nil : hints
        )
    }
}

/// 从权威件 JSON 里抽契约字段 attrs.scanAliases / attrs.identityLocked
/// (字段名三端同源,不许改)。两个都缺 → nil(绝大多数件没有提示)。
private func decodeIdentityHint(from decoder: Decoder) -> CanonicalHome.IdentityHint? {
    struct HintAttrs: Decodable {
        let scanAliases: [String]?
        let identityLocked: Bool?
    }
    struct Box: Decodable {
        let attrs: HintAttrs?
    }
    guard let a = (try? Box(from: decoder))?.attrs,
          a.scanAliases != nil || a.identityLocked != nil else { return nil }
    return CanonicalHome.IdentityHint(
        scanAliases: a.scanAliases ?? [],
        identityLocked: a.identityLocked ?? false
    )
}

extension SupabaseService {
    /// 最新优化副本的墙体与分区;拉不到(断网/没登录)退缓存
    func fetchCanonicalHome() async -> CanonicalHome? {
        struct Row: Decodable {
            let payload: Payload
            struct Payload: Decodable {
                let homeos: CanonicalHomePayload
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
            if let home = rows.first?.payload.homeos.toCanonicalHome() {
                CanonicalHomeCache.save(home)
                return home
            }
        } catch {
            /* 断网/权限 → 退缓存 */
        }
        return CanonicalHomeCache.load()
    }
}
