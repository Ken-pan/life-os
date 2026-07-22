import Foundation
import KenosClient

/// aios.shell_state 云同步 — 原生壳的 domain pin / 最近使用 / 续播跨设备汇合。
///
/// 语义镜像 apps/aios/src/lib/kenos/shellStateSync.core.js(per-key LWW + 墓碑,
/// 改契约两处同步)。wire 契约取 web 形态:listKey = `hosted:<spaceId>`;iOS 本地
/// pinned/recent 惯用裸 id(`plan`),推送前翻译成 wire 形态、拉取后再翻译回来。
///
/// 认证:直接用 Keychain 金库里的 Web SSO access token(RLS 按 auth.uid() 隔离)。
/// 原生不消费 refresh token — Supabase 轮换刷新由 Continuity webview 完成并经
/// reportAuthSession 回写金库;token 过期就跳过本轮,等下一次前台/解锁再试。
@MainActor
final class KenosShellStateSync {
    static let shared = KenosShellStateSync()

    static let pinnedKey = "spaces.pinned"
    static let recentKey = "spaces.recent"
    static let resumePrefix = "spaces.resume."

    struct Row {
        var key: String
        var value: [String: Any]?
        var updatedAt: Int64
        var deleted: Bool
    }

    private weak var store: KenosSpaceSwitcherStore?
    private var syncTask: Task<Void, Never>?
    private var syncing = false
    private var pendingResync = false
    private static let lastUserKey = "kenos.shellStateSync.lastUserId"

    func attach(store: KenosSpaceSwitcherStore) {
        self.store = store
        store.onLocalChange = { [weak self] in
            // 与 web 端 PUSH_DEBOUNCE_MS 对齐的本地变更防抖
            self?.scheduleSync(after: 8)
        }
    }

    func scheduleSync(after seconds: Double = 0) {
        syncTask?.cancel()
        syncTask = Task { @MainActor [weak self] in
            if seconds > 0 {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            }
            guard !Task.isCancelled else { return }
            await self?.syncNow()
        }
    }

    func syncNow() async {
        guard let store else { return }
        guard
            let tokens = KenosSharedWebAuth.loadSharedTokens(),
            let userId = tokens.userId, !userId.isEmpty,
            !Self.isJwtExpired(tokens.accessToken)
        else { return }
        if syncing {
            pendingResync = true
            return
        }
        syncing = true
        defer {
            syncing = false
            if pendingResync {
                pendingResync = false
                scheduleSync(after: 2)
            }
        }
        // 换号首轮:只拉不推,云端先赢(个人单账号 app 的保守策略;
        // 正常登出路径 logoutClear 已清本地,这里只兜异常残留)。
        let isNewUser = UserDefaults.standard.string(forKey: Self.lastUserKey) != userId
        do {
            let remote = try await fetchRemoteRows(accessToken: tokens.accessToken)
            let local = isNewUser ? [] : buildLocalRows(store: store)
            let plan = Self.plan(localRows: local, remoteRows: remote)
            if !plan.toApply.isEmpty {
                apply(rows: plan.toApply, to: store)
            }
            if !isNewUser, !plan.toPush.isEmpty {
                try await pushRows(plan.toPush, accessToken: tokens.accessToken)
            }
            UserDefaults.standard.set(userId, forKey: Self.lastUserKey)
            KenosLog.debug("shell state synced", category: .session, metadata: [
                "applied": String(plan.toApply.count),
                "pushed": String(isNewUser ? 0 : plan.toPush.count),
            ])
        } catch {
            KenosLog.notice("shell state sync failed", category: .session, metadata: [
                "error": String(describing: error),
            ])
        }
    }

    // MARK: - LWW plan(镜像 planShellStateSync)

    static func plan(localRows: [Row], remoteRows: [Row]) -> (toPush: [Row], toApply: [Row]) {
        let remoteByKey = Dictionary(remoteRows.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        let localByKey = Dictionary(localRows.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        var toPush: [Row] = []
        var toApply: [Row] = []
        for row in localRows where row.updatedAt > (remoteByKey[row.key]?.updatedAt ?? 0) {
            toPush.append(row)
        }
        for remote in remoteRows where remote.updatedAt > (localByKey[remote.key]?.updatedAt ?? 0) {
            toApply.append(remote)
        }
        return (toPush, toApply)
    }

    // MARK: - 本地行编码(镜像 buildLocalShellRows)

    private func buildLocalRows(store: KenosSpaceSwitcherStore) -> [Row] {
        var rows: [Row] = []
        let meta = store.syncMeta
        if meta.pinnedAt > 0 {
            rows.append(Row(
                key: Self.pinnedKey,
                value: ["ids": store.pinnedSpaceIds.map(Self.toWireListKey)],
                updatedAt: meta.pinnedAt,
                deleted: false
            ))
        }
        if meta.recentAt > 0 {
            rows.append(Row(
                key: Self.recentKey,
                value: ["ids": store.recentSpaceIds.map(Self.toWireListKey)],
                updatedAt: meta.recentAt,
                deleted: false
            ))
        }
        for (listKey, descriptor) in store.resumeByListKey {
            guard
                let date = KenosSpaceSwitcherStore.parseIsoDate(descriptor.updatedAt),
                let dict = Self.encodeDescriptor(descriptor)
            else { continue }
            rows.append(Row(
                key: Self.resumePrefix + Self.toWireListKey(listKey),
                value: dict,
                updatedAt: Int64(date.timeIntervalSince1970 * 1000),
                deleted: false
            ))
        }
        for (listKey, ts) in meta.tombstones {
            rows.append(Row(
                key: Self.resumePrefix + Self.toWireListKey(listKey),
                value: nil,
                updatedAt: ts,
                deleted: true
            ))
        }
        return rows
    }

    // MARK: - 远端行落地

    private func apply(rows: [Row], to store: KenosSpaceSwitcherStore) {
        var application = KenosSpaceSwitcherStore.RemoteShellApplication()
        for row in rows {
            if row.key == Self.pinnedKey {
                application.pinned = Self.ids(from: row.value).map(Self.fromWireListKey)
                application.pinnedAt = row.updatedAt
            } else if row.key == Self.recentKey {
                application.recent = Self.ids(from: row.value).map(Self.fromWireListKey)
                application.recentAt = row.updatedAt
            } else if row.key.hasPrefix(Self.resumePrefix) {
                let listKey = String(row.key.dropFirst(Self.resumePrefix.count))
                guard !listKey.isEmpty else { continue }
                if row.deleted || row.value == nil {
                    application.resumeDeletes.append(listKey)
                } else if let value = row.value,
                          let descriptor = Self.decodeDescriptor(value, listKey: listKey)
                {
                    application.resumeUpserts[listKey] = descriptor
                }
            }
        }
        store.applyRemoteShellState(application)
    }

    // MARK: - id 命名空间翻译(iOS 裸 id ↔ web hosted:listKey)

    static func toWireListKey(_ id: String) -> String {
        let key = id.trimmingCharacters(in: .whitespacesAndNewlines)
        if key.isEmpty || key.contains(":") { return key }
        return "hosted:" + (KenosDomainRegistry.canonicalize(key) ?? key)
    }

    static func fromWireListKey(_ key: String) -> String {
        KenosDomainRegistry.canonicalize(key) ?? key
    }

    // MARK: - Descriptor 编解码(web camelCase 契约;substate 只保留字符串值)

    static func encodeDescriptor(_ descriptor: KenosSpaceSwitcherStore.ResumeDescriptor) -> [String: Any]? {
        guard
            let data = try? JSONEncoder().encode(descriptor),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return obj
    }

    static func decodeDescriptor(
        _ dict: [String: Any],
        listKey: String
    ) -> KenosSpaceSwitcherStore.ResumeDescriptor? {
        guard let route = dict["route"] as? String, !route.isEmpty else { return nil }
        let substate = (dict["substate"] as? [String: Any])?
            .compactMapValues { $0 as? String }
        let spaceId = (dict["spaceId"] as? String)
            ?? KenosDomainRegistry.canonicalize(listKey)
            ?? listKey
        let title = (dict["displayTitle"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        return KenosSpaceSwitcherStore.ResumeDescriptor(
            version: KenosSpaceSwitcherStore.resumeDescriptorVersion,
            userId: (dict["userId"] as? String) ?? "anonymous",
            spaceId: spaceId,
            route: route,
            entityId: dict["entityId"] as? String,
            substate: (substate?.isEmpty ?? true) ? nil : substate,
            displayTitle: title ?? spaceId,
            displaySubtitle: dict["displaySubtitle"] as? String,
            updatedAt: (dict["updatedAt"] as? String)
                ?? ISO8601DateFormatter().string(from: Date()),
            expiresAt: dict["expiresAt"] as? String
        )
    }

    private static func ids(from value: [String: Any]?) -> [String] {
        ((value?["ids"] as? [Any]) ?? []).compactMap { $0 as? String }
    }

    // MARK: - JWT

    /// 金库 access token 是否已过期(不刷新,过期就等 webview 回写新 token)。
    static func isJwtExpired(_ jwt: String, leeway: TimeInterval = 60) -> Bool {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return true }
        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 { payload += "=" }
        guard
            let data = Data(base64Encoded: payload),
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
            let exp = obj["exp"] as? Double
        else { return true }
        return Date(timeIntervalSince1970: exp - leeway) <= Date()
    }

    // MARK: - Supabase REST(aios schema:Accept-Profile / Content-Profile)

    private func fetchRemoteRows(accessToken: String) async throws -> [Row] {
        guard let url = KenosSupabaseConfig.restURL("shell_state?select=key,value,updated_at,deleted") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue(KenosSupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("aios", forHTTPHeaderField: "Accept-Profile")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        let raw = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
        return raw.compactMap { item in
            guard let key = item["key"] as? String, !key.isEmpty else { return nil }
            let updatedAt = (item["updated_at"] as? NSNumber)?.int64Value
                ?? Int64(item["updated_at"] as? Double ?? 0)
            return Row(
                key: key,
                value: item["value"] as? [String: Any],
                updatedAt: updatedAt,
                deleted: (item["deleted"] as? Bool) ?? false
            )
        }
    }

    private func pushRows(_ rows: [Row], accessToken: String) async throws {
        guard let url = KenosSupabaseConfig.restURL("shell_state?on_conflict=user_id,key") else {
            throw URLError(.badURL)
        }
        let payload: [[String: Any]] = rows.map { row in
            [
                "key": row.key,
                "value": row.value ?? NSNull(),
                "updated_at": row.updatedAt,
                "deleted": row.deleted,
            ]
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(KenosSupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("aios", forHTTPHeaderField: "Content-Profile")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
