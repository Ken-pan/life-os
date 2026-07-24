import SwiftUI
import KenosDesign

#if os(iOS)

/// P4A Quick Capture — Intent Dock 的第一/第二档。
///
/// 三层模型(spec §6):Layer0 Dock → Layer1 Quick Capture → Layer2 Korben Canvas。
/// 系统 sheet detent 承担档位与连续下滑(Canvas→Capture→Dock)。
/// 两档**共用同一套 capture UI**:Canvas 档把多出的高度用于放大书写区并给出
/// 转对话入口 —— 而不是摆一句「以后会有」的空占位(真机 review B4 判定不成立)。
/// P4A 只做本地可靠落草稿:复用 `model.submitCapture()`
/// (CaptureDraft + 离线队列 + idempotencyKey)——不做意图分类/路由(P4B)。
struct KorbenQuickCaptureSheet: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState
    @Binding var detent: PresentationDetent
    @Environment(\.dismiss) private var dismiss
    @FocusState private var textFocused: Bool

    /// 规范原值 0.44,但 Quick Capture 打开即自动聚焦拉起键盘 —— 键盘约占屏高 40%,
    /// fraction detent 不会为键盘让位,0.44 的 sheet 被压到只剩一条边(真机 Gate4-5
    /// 实测),输入区不可用。既然「打开即可打字」是这层的定义,就按**键盘态**定尺寸:
    /// 0.72 在键盘之上仍留 ~290pt,足够「标题+Scope+输入框+识别行+操作」完整可见。
    static let captureDetent = PresentationDetent.fraction(0.72)
    static let canvasDetent = PresentationDetent.fraction(0.95)

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    /// Canvas 档的拆分结果(Capture 档不拆,故只在展开态消费)。
    private var canvasItems: [KorbenCanvasComposition.Item] {
        KorbenCanvasComposition.parse(model.captureText)
    }

    /// 主动作文案随条数变化 —— 按下去会发生什么,按之前就该知道。
    private func createTitle(expanded: Bool) -> String {
        let n = expanded ? canvasItems.count : 1
        guard n > 1 else { return prefersChinese ? "创建" : "Create" }
        return prefersChinese ? "创建 \(n) 条" : "Create \(n)"
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
            // 两档共用同一套 capture UI —— Canvas 档不再是空占位(真机 review B4:
            // 一句说明撑满 95% 屏高完全不成立),多出的高度**真正用于书写**:
            // 输入区行数放大,并在底部给出真 agent 入口。
            captureLayer(expanded: detent == Self.canvasDetent)
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

    // ── Capture UI(两档共用;expanded = Canvas 档,书写区放大)──
    private func captureLayer(expanded: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(
                expanded
                    ? "Korben Canvas"
                    : (prefersChinese ? "记录或交办" : "Capture or delegate")
            )
            .font(.system(size: expanded ? 20 : 17, weight: .semibold))

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
            .lineLimit(expanded ? (10...20) : (3...5))
            .textFieldStyle(.plain)
            .padding(12)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("korben.quickCapture.text")

            // 识别行 — P4B:本地启发式分类的实时预览(候选 ≠ 已写入)。
            Label(
                expanded
                    ? KorbenCanvasComposition.summary(items: canvasItems, chinese: prefersChinese)
                    : KorbenCaptureRouter.summary(
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
                    // Canvas 档按行拆条(P1-3 能力层),Capture 档保持单条。
                    shellState.undoReceipt = model.korbenSubmitCapture(splitLines: expanded)
                    dismiss()
                } label: {
                    Text(createTitle(expanded: expanded))
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

            // Canvas 档的**能力层**(P1-3):把这段脑内倾倒按行拆成多条各自定向的
            // 草稿,并在创建**前**就把结果摊开给你核对 —— 这才是 Canvas 与
            // Quick Capture 的实质区别(此前它只是同一个输入框拉高到 95%)。
            if expanded, canvasItems.count > 1 {
                canvasBreakdown
            }

            // Canvas 档:多出的高度给书写区之后,底部给真 agent 入口。
            // Gate5B「一个主动作」:主动作恒为「创建」(落草稿,可靠且可撤销);
            // 转对话是**另一条去向**,故降为次要样式的文字入口 —— 此前两个同色
            // 蓝胶囊并列,用户分不清「创建」与「展开对话」谁是主(review P1-3)。
            if expanded {
                Divider().overlay(.white.opacity(0.08))
                Button {
                    dismiss()
                    model.open(urlString: "kenos://assistant")
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkle").font(.system(size: 13))
                        Text(
                            prefersChinese
                                ? "或者交给 Korben 继续讨论"
                                : "Or hand it to Korben to discuss"
                        )
                        .font(.system(size: 14, weight: .medium))
                        Image(systemName: "chevron.right").font(.system(size: 11))
                    }
                    .foregroundStyle(Color(red: 0.357, green: 0.549, blue: 1.0))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("korben.canvas.openConversation")
            }
        }
    }

    /// 拆分预览 —— 逐条列出将要创建什么、哪条已识别去向。
    private var canvasBreakdown: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(canvasItems.prefix(6)) { item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "circle.fill")
                        .font(.system(size: 4))
                        .foregroundStyle(.tertiary)
                    Text(item.text)
                        .font(.system(size: 13))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let hint = item.routing.targetHint {
                        Text(KenosLocalizedTitles.navigation(
                            hint.capitalized, chinese: prefersChinese
                        ))
                        .font(.system(size: 10, weight: .medium))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(.white.opacity(0.08), in: Capsule())
                        .foregroundStyle(.secondary)
                    }
                }
            }
            // 超过 6 条只列前 6 —— 但**说清楚**还有几条,不假装列全了。
            if canvasItems.count > 6 {
                Text(
                    prefersChinese
                        ? "…另外 \(canvasItems.count - 6) 条"
                        : "…and \(canvasItems.count - 6) more"
                )
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("korben.canvas.breakdown")
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
