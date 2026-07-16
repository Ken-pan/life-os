import SwiftUI

/// 上传中 —— 几十张照片,可能跑好几分钟。
///
/// 人会一直盯着这一屏,所以它必须随时回答三件事:传到哪了、还要多久、能不能停。
/// 以前只有一根进度条和一句「上传中…」,剩下两个问题都没答案。
struct UploadView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var confirmCancel = false
    /// 环和里面的数字必须**一起**缩放。
    /// 只放大数字的话,字号调到辅助功能档时它会撑破那个写死 168pt 的环;
    /// 只放大环则等于没做 —— 主信息(百分比)照样是小字。
    @ScaledMetric(relativeTo: .largeTitle) private var ring: CGFloat = 168
    @ScaledMetric(relativeTo: .largeTitle) private var pctSize: CGFloat = 44
    @ScaledMetric(relativeTo: .largeTitle) private var glyph: CGFloat = 34
    @ScaledMetric(relativeTo: .largeTitle) private var stroke: CGFloat = 10

    private var pct: Int { Int((model.uploadProgress * 100).rounded()) }
    /// 进度未知(准备阶段)时用不定态转圈,别拿一根 0% 的空条骗人
    private var determinate: Bool { model.uploadProgress > 0 }

    var body: some View {
        VStack(spacing: HS.Space.loose) {
            Spacer()

            ZStack {
                if determinate {
                    // 环形比横条更适合这里:这一屏只有它一个主角,横条撑不起来
                    Circle()
                        .stroke(.tertiary, lineWidth: stroke)
                    Circle()
                        .trim(from: 0, to: model.uploadProgress)
                        .stroke(
                            HS.accent.gradient,
                            style: StrokeStyle(lineWidth: stroke, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                        // 进度环的推进不是"装饰性动效",是数据在变 —— 开了减弱动效
                        // 也照走,只是不再补间飞行。该关的是**动**,不是**变化**。
                        .hsAnimation(.snappy, value: model.uploadProgress, reduce: reduceMotion)
                    Text("\(pct)")
                        // 这是这一屏的主信息,必须随动态字体走(以前写死 44pt,
                        // 字号调多大它都纹丝不动)。rounded 是有意的:数字用圆体
                        // 更容易一眼读出,和系统的进度/计时器一致。
                        .font(.system(size: pctSize, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .contentTransition(.numericText(value: Double(pct)))
                        .hsAnimation(.snappy, value: pct, reduce: reduceMotion)
                } else if reduceMotion {
                    // 减弱动效下用系统转圈:它自己知道该怎么在这个开关下表现,
                    // 而我那个自转的弧必须停 —— 持续旋转正是该开关要关掉的头号动效。
                    // ⚠️ 不能只是"停下来":静止的弧 + 静止的云图标 = 看着就是卡死了,
                    // 必须换一个仍然在表达「我在忙」的东西。
                    ProgressView().controlSize(.extraLarge)
                } else {
                    Circle().stroke(.tertiary, lineWidth: stroke)
                    Circle()
                        .trim(from: 0, to: 0.12)
                        .stroke(
                            HS.accent.gradient,
                            style: StrokeStyle(lineWidth: stroke, lineCap: .round)
                        )
                        .modifier(SpinIfIndeterminate(active: true))
                    Image(systemName: "icloud.and.arrow.up")
                        .font(.system(size: glyph, weight: .light))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: ring, height: ring)
            .accessibilityElement()
            .accessibilityLabel("上传进度")
            .accessibilityValue(determinate ? "\(pct)%" : "准备中")
            .accessibilityAddTraits(.updatesFrequently)

            VStack(spacing: HS.Space.tight) {
                Text(model.uploadStatus.isEmpty ? "上传中…" : model.uploadStatus)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .contentTransition(.opacity)
                    .animation(.easeOut, value: model.uploadStatus)
                Text("照片三路并发;中断了重新点上传就是续传,已传的不重来")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, HS.Space.loose)

            Spacer()

            // 没有出口的进度条是最招人烦的一种屏:传到一半发现连的是蜂窝数据、
            // 或者干脆想先出门,以前只能杀进程。取消是安全的 —— 已传的留在桶里,
            // 下次续传直接跳过。
            Button("取消上传") { confirmCancel = true }
                // 这一屏是纯背景上的独立页面,没有"背后的内容"可折射 —— 玻璃在这
                // 只是一层白模糊。次要动作用 .bordered 就对了。
                .buttonStyle(.bordered)
                .hsBigHit()
                .confirmationDialog(
                    "取消这次上传?",
                    isPresented: $confirmCancel,
                    titleVisibility: .visible
                ) {
                    Button("取消上传", role: .destructive) { model.cancelUpload() }
                    Button("继续传", role: .cancel) {}
                } message: {
                    Text("扫描不会丢,会回到预览页。已经传上去的部分留在云端,下次点「上传」从断点接着传,不会重来。")
                }
                .padding(.bottom, HS.Space.loose)
        }
        .padding()
        // 照片几十张逐张传,息屏会把 App 挂起打断上传 —— 上传期间保持常亮
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }
}

/// 不定态时让进度弧持续转 —— 纯静止的一小段弧,看着就是卡死了
private struct SpinIfIndeterminate: ViewModifier {
    let active: Bool
    @State private var spin = false

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees(spin ? 360 : 0))
            .animation(
                active ? .linear(duration: 1).repeatForever(autoreverses: false) : .default,
                value: spin
            )
            .onAppear { if active { spin = true } }
            .onChange(of: active) { _, on in spin = on }
    }
}
