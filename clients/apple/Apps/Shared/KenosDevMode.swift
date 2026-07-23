import Foundation

/// 开发模式后门 —— 让开发/测试跳过 Face ID 壳解锁门与 HealthKit 授权 sheet。
///
/// **安全边界(双重防护,缺一不激活):**
/// 1. 必须是**开发构建**:DEBUG,或非 App Store 分发的 dev/adhoc/enterprise 包
///    (这类包内含 `embedded.mobileprovision`;App Store / TestFlight 生产分发包
///    没有 —— 以此把生产构建彻底排除在外)。
/// 2. 必须**显式 opt-in**:传入 launch argument 或环境变量。普通用户点图标启动
///    永远不带任何参数,因此绝无意外激活的可能。
///
/// 生产(App Store / TestFlight)构建下 `isActive` 恒为 false,后门形同不存在。
enum KenosDevMode {
    /// 是否为可承载后门的开发构建。生产分发包为 false。
    static let isDevelopmentBuild: Bool = {
        #if DEBUG
        return true
        #else
        // Release 但非 App Store:dev / adhoc / enterprise 包带 embedded.mobileprovision;
        // App Store / TestFlight 包没有。以此排除一切生产分发。
        return Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision") != nil
        #endif
    }()

    /// 激活令牌 —— 任一 launch argument 命中即可(含旧参数,向后兼容)。
    static let launchArguments: Set<String> = [
        "-kenosDevMode",
        "-kenosSkipShellUnlock", // 旧参数:保留兼容
    ]

    /// 激活环境变量 —— 任一为 "1" 即可(含旧变量)。
    static let environmentKeys: [String] = [
        "KENOS_DEV_MODE",
        "KENOS_SHELL_UNLOCK_SKIP", // 旧变量:保留兼容
    ]

    /// 后门是否激活:开发构建 且 显式 opt-in。
    static var isActive: Bool {
        resolve(
            isDevelopmentBuild: isDevelopmentBuild,
            arguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment
        )
    }

    /// 纯函数解析器 —— 不碰进程状态,可单测。
    /// 生产构建(isDevelopmentBuild=false)无论传什么参数都恒返回 false。
    static func resolve(
        isDevelopmentBuild: Bool,
        arguments: [String],
        environment: [String: String]
    ) -> Bool {
        guard isDevelopmentBuild else { return false }
        if arguments.contains(where: launchArguments.contains) { return true }
        return environmentKeys.contains { environment[$0] == "1" }
    }

    /// 跳过 Face ID 壳解锁门(直接授予,不弹生物识别)。
    static var skipShellUnlock: Bool { isActive }

    /// 跳过 HealthKit 授权 sheet(启动时不自动请求授权)。
    static var skipHealthKitPrompt: Bool { isActive }
}
