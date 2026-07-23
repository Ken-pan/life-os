import SwiftUI
import KenosDesign

#if os(iOS)

/// P5 Korben Assist Panel — Orb 右拉 / 入口触达的上下文面板(48–62% 高)。
///
/// 诚实边界:此面板是**确定性的上下文投影 + 快捷操作**,文案不冒充
/// AI 判断("我看过你的计划"式话术只允许真 agent 说)。完整对话与
/// Agent 执行 = 「展开对话」→ 现有 web Ask 面(真 agent 已在那里),
/// 借此淘汰原生 AssistantView 的 250ms 假流 stub 路径。
struct KorbenAssistPanel: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState
    @Environment(\.dismiss) private var dismiss

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    private var projection: KorbenShellProjection {
        KorbenShellProjection.make(from: model)
    }

    private var spaceLabel: String {
        if projection.shellMode == .domain {
            return KenosDomainRegistry.shelfDomainDefinitions
                .first(where: { $0.id == projection.currentSpaceId })?.label
                ?? projection.currentSpaceId
        }
        return prefersChinese ? "今日" : "Today"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "sparkle")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Color(red: 0.357, green: 0.549, blue: 1.0))
                Text("Korben")
                    .font(.system(size: 18, weight: .semibold))
            }

            // ── 上下文摘要(本地投影事实,非 AI 生成)──
            VStack(alignment: .leading, spacing: 6) {
                contextRow(
                    icon: "square.grid.2x2",
                    text: prefersChinese ? "当前空间:\(spaceLabel)" : "Space: \(spaceLabel)"
                )
                if let live = model.liveAccessory {
                    contextRow(icon: "waveform.path.ecg", text: live.title)
                }
                if model.pendingApprovalCount > 0 {
                    contextRow(
                        icon: "exclamationmark.circle",
                        text: prefersChinese
                            ? "\(model.pendingApprovalCount) 项待确认"
                            : "\(model.pendingApprovalCount) pending approvals"
                    )
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))

            // ── 2–3 个可执行建议(确定性路由)──
            VStack(spacing: 8) {
                if model.pendingApprovalCount > 0 {
                    actionRow(
                        icon: "checkmark.circle",
                        title: prefersChinese
                            ? "整理 \(model.pendingApprovalCount) 项待确认"
                            : "Review \(model.pendingApprovalCount) approvals"
                    ) {
                        dismiss()
                        model.openApprovals()
                    }
                }
                actionRow(
                    icon: "clock.arrow.circlepath",
                    title: prefersChinese ? "继续刚才的事" : "Continue where you left off"
                ) {
                    dismiss()
                    model.openContinue()
                }
                actionRow(
                    icon: "square.and.pencil",
                    title: prefersChinese ? "记录或交办一件事" : "Capture or delegate something"
                ) {
                    dismiss()
                    shellState.quickCaptureDetent = KorbenQuickCaptureSheet.captureDetent
                    shellState.showsQuickCapture = true
                }
            }

            Spacer(minLength: 0)

            // ── 真 agent 入口(web Ask 面)──
            Button {
                dismiss()
                model.open(urlString: "kenos://assistant")
            } label: {
                Text(prefersChinese ? "展开对话" : "Open conversation")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(red: 0.357, green: 0.549, blue: 1.0), in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("korben.assist.expand")
        }
        .padding(18)
        .presentationDetents([.fraction(0.55)])
        .presentationDragIndicator(.visible)
        .presentationBackground(.ultraThinMaterial)
        .accessibilityIdentifier("korben.assistPanel")
    }

    private func contextRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .frame(width: 16)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(.primary.opacity(0.85))
        }
    }

    private func actionRow(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .frame(width: 20)
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#endif
