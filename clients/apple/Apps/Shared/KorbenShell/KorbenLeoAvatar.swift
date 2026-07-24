import SwiftUI
import KenosDesign

#if os(iOS)

/// Leo 的原生头像 —— 表情切换用 crossfade(对齐 web LeoAvatar 的 `{#key src}`
/// 交叉淡入,避免硬切闪烁),`live` 时叠一层极缓的呼吸缩放。素材在
/// Assets.xcassets/Leo。资源缺失时优雅退化为字母占位,不崩不空。
struct KorbenLeoAvatar: View {
    var expression: KorbenLeoExpression = .soft
    var size: CGFloat = 40
    /// 是否播放呼吸微动(在场感)。reduceMotion 下自动关闭。
    var live: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathe = false

    private var breathing: Bool { live && !reduceMotion }

    var body: some View {
        ZStack {
            // 底:柔和光环,让头像从任何背景里"浮"出来。
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(red: 0.60, green: 0.72, blue: 1.0).opacity(0.28),
                            .clear,
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: size * 0.62
                    )
                )
                .frame(width: size * 1.18, height: size * 1.18)

            avatarLayer
                .frame(width: size, height: size)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.14), lineWidth: 0.5))
                .scaleEffect(breathing && breathe ? 1.035 : 1.0)
        }
        .frame(width: size * 1.18, height: size * 1.18)
        .accessibilityLabel("Leo")
        .accessibilityIdentifier("korben.leo.avatar")
        .onAppear {
            guard breathing else { return }
            withAnimation(.easeInOut(duration: 2.6).repeatForever(autoreverses: true)) {
                breathe = true
            }
        }
    }

    @ViewBuilder
    private var avatarLayer: some View {
        if let ui = UIImage(named: expression.assetName) {
            // crossfade:同一位置叠两图,靠 .id + transition 在表情变化时并存过渡。
            Image(uiImage: ui)
                .resizable()
                .scaledToFill()
                .id(expression) // 表情变 → 旧图 out / 新图 in
                .transition(.opacity)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: expression)
        } else {
            // 素材缺失兜底:品牌蓝底 + "L",绝不空窗。
            ZStack {
                Circle().fill(Color(red: 0.357, green: 0.549, blue: 1.0).opacity(0.85))
                Text("L")
                    .font(.system(size: size * 0.5, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
    }
}

/// 设置页「Leo 模式」行 —— 一枚开关把助手在 Korben(管家)/ Leo(陪伴)间切换,
/// 左侧同步显示当前人设的头像/徽标。切换即写壳偏好并广播给 web 助手。
struct KenosLeoModeRow: View {
    let prefersChinese: Bool
    @State private var isLeo = KorbenAssistantPersona
        .normalize(KenosShellSettingsStore.current.persona).isLeo

    var body: some View {
        Toggle(isOn: Binding(
            get: { isLeo },
            set: { on in
                isLeo = on
                let snap = KenosShellSettingsStore.update(persona: on ? "leo" : "korben")
                KenosNativeCapabilityBridge.broadcastShellSettings(snap)
            }
        )) {
            HStack(spacing: 12) {
                KorbenPersonaBadge(
                    persona: isLeo ? .leo : .korben,
                    size: 34,
                    leoExpression: .soft,
                    live: false
                )
                VStack(alignment: .leading, spacing: 1) {
                    Text(isLeo ? "Leo" : "Korben")
                        .font(.system(size: 15, weight: .medium))
                    Text(
                        isLeo
                            ? (prefersChinese ? "陪伴模式" : "Companion mode")
                            : (prefersChinese ? "默认管家" : "Default butler")
                    )
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityIdentifier("kenos.settings.leoMode")
    }
}

/// 人设徽标 —— Korben 用 sparkle,Leo 用头像。给 Assist/设置等处统一取用。
struct KorbenPersonaBadge: View {
    let persona: KorbenAssistantPersona
    var size: CGFloat = 40
    var leoExpression: KorbenLeoExpression = .soft
    var live: Bool = false

    var body: some View {
        switch persona {
        case .leo:
            KorbenLeoAvatar(expression: leoExpression, size: size, live: live)
        case .korben:
            ZStack {
                Circle()
                    .fill(Color(red: 0.357, green: 0.549, blue: 1.0).opacity(0.16))
                    .frame(width: size, height: size)
                Image(systemName: "sparkle")
                    .font(.system(size: size * 0.44, weight: .medium))
                    .foregroundStyle(Color(red: 0.357, green: 0.549, blue: 1.0))
            }
            .frame(width: size, height: size)
            .accessibilityLabel("Korben")
        }
    }
}

#endif
