import Foundation
import Observation

/// App 全局状态机。扫描/上传阶段的细分状态由各自控制器持有,
/// 这里只管「人在哪个屏」。
@Observable
final class AppModel {
    enum Route {
        case loading      // 冷启动恢复会话
        case signedOut
        case home
        case scanning
        case reviewing
        case uploading
    }

    var route: Route = .loading
    var userEmail: String?
    var scans: [SupabaseService.ScanRow] = []
    var lastError: String?

    let supabase = SupabaseService.shared

    @MainActor
    func bootstrap() async {
        let restored = await supabase.restoreSession()
        userEmail = supabase.currentUserEmail
        route = restored ? .home : .signedOut
        if restored { await refreshScans() }
    }

    @MainActor
    func signIn(email: String, password: String) async {
        lastError = nil
        do {
            try await supabase.signIn(email: email, password: password)
            userEmail = supabase.currentUserEmail
            route = .home
            await refreshScans()
        } catch {
            lastError = "登录失败:\(error.localizedDescription)"
        }
    }

    @MainActor
    func signOut() async {
        try? await supabase.signOut()
        userEmail = nil
        scans = []
        route = .signedOut
    }

    @MainActor
    func refreshScans() async {
        do {
            scans = try await supabase.listScans()
        } catch {
            lastError = "拉取扫描列表失败:\(error.localizedDescription)"
        }
    }
}
