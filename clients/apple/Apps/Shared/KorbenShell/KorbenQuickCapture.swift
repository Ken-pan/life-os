import SwiftUI
import KenosDesign

#if os(iOS)

/// P4A Quick Capture — Intent Dock 的第一/第二档。
///
/// 三层模型(spec §6):Layer0 Dock → Layer1 Quick Capture(44% detent)
/// → Layer2 Korben Canvas(82% detent,P5 前为占位)。
/// 系统 sheet detent 承担档位与连续下滑(Canvas→Capture→Dock)。
/// P4A 只做本地可靠落草稿:复用 `model.submitCapture()`
/// (CaptureDraft + 离线队列 + idempotencyKey)——不做意图分类/路由(P4B)。
struct KorbenQuickCaptureSheet: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState
    @Binding var detent: PresentationDetent
    @Environment(\.dismiss) private var dismiss
    @FocusState private var textFocused: Bool

    static let captureDetent = PresentationDetent.fraction(0.44)
    static let canvasDetent = PresentationDetent.fraction(0.82)

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    /// ContextSnapshot 简版:当前 Space(P4B 扩 route/entity)。
    private var scopeLabel: String {
        let projection = KorbenShellProjection.make(from: model)
        if projection.shellMode == .domain {
            return KenosDomainRegistry.shelfDomainDefinitions
                .first(where: { $0.id == projection.currentSpaceId })?.label
                ?? projection.currentSpaceId
        }
        return prefersChinese ? "今日" : "Today"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if detent == Self.canvasDetent {
                canvasPlaceholder
            } else {
                captureLayer
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .presentationDetents(
            [Self.captureDetent, Self.canvasDetent],
            selection: $detent
        )
        .presentationDragIndicator(.visible)
        .presentationBackground(.ultraThinMaterial)
        .onAppear { textFocused = true }
    }

    // ── Layer 1:Quick Capture(44%)──
    private var captureLayer: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(prefersChinese ? "记录或交办" : "Capture or delegate")
                .font(.system(size: 17, weight: .semibold))

            // Scope chip — 捕获携带当前上下文(只显示,P4B 才做定向路由)。
            HStack(spacing: 8) {
                scopeChip(scopeLabel, selected: true)
            }

            TextField(
                prefersChinese ? "想到什么就记下来…" : "Type anything…",
                text: $model.captureText,
                axis: .vertical
            )
            .focused($textFocused)
            .lineLimit(3...5)
            .textFieldStyle(.plain)
            .padding(12)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("korben.quickCapture.text")

            // 识别行 — P4B:本地启发式分类的实时预览(候选 ≠ 已写入)。
            Label(
                KorbenCaptureRouter.summary(
                    for: KorbenCaptureRouter.classify(model.captureText),
                    chinese: prefersChinese
                ),
                systemImage: "tray.and.arrow.down"
            )
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .animation(.easeInOut(duration: 0.15), value: model.captureText.isEmpty)
            .accessibilityIdentifier("korben.quickCapture.recognition")

            HStack {
                Button(prefersChinese ? "取消" : "Cancel") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                Spacer()
                Button {
                    // P4B:回执 + 10s Undo 窗口(失败自动回填文本不丢 Draft)。
                    shellState.undoReceipt = model.korbenSubmitCapture()
                    dismiss()
                } label: {
                    Text(prefersChinese ? "创建" : "Create")
                        .font(.system(size: 15, weight: .semibold))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .background(Color(red: 0.357, green: 0.549, blue: 1.0), in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .disabled(
                    model.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
                .accessibilityIdentifier("korben.quickCapture.create")
            }
        }
    }

    // ── Layer 2:Korben Canvas 占位(82%;P5 接真 Assist/Agent)──
    private var canvasPlaceholder: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Korben Canvas")
                .font(.system(size: 20, weight: .semibold))
            Text(prefersChinese
                ? "多轮协作、批量操作与 Agent 执行将在这里进行(P5)。下滑回到快速记录。"
                : "Multi-turn collaboration, batch actions and agent runs land here (P5). Swipe down for Quick Capture.")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .accessibilityIdentifier("korben.canvas.placeholder")
    }

    private func scopeChip(_ text: String, selected: Bool) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                selected ? Color(red: 0.357, green: 0.549, blue: 1.0).opacity(0.22) : .white.opacity(0.06),
                in: Capsule()
            )
            .overlay(Capsule().strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
    }
}

#endif
