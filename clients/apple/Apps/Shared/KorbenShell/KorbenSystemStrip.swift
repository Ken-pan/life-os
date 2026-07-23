import SwiftUI
import KenosDesign

#if os(iOS)

/// P2 System Strip — Runtime + Attention 合并为一条 ≤36pt 的顶部胶囊。
/// 无状态时完全隐藏(0 高);最多 3 个单元。Korben 壳内它取代底部
/// LiveAccessory 成为 runtime 的唯一 chrome(单一 chrome 规则)。
struct KorbenSystemStrip: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    /// Strip 是否有内容(host 用它决定 web 顶部 inset)。
    @MainActor
    static func hasUnits(model: KenosAppModel) -> Bool {
        model.liveAccessory != nil || model.pendingApprovalCount > 0
    }

    var body: some View {
        if Self.hasUnits(model: model) {
            HStack(spacing: 0) {
                if let live = model.liveAccessory {
                    runtimeUnit(live)
                    if model.pendingApprovalCount > 0 {
                        Rectangle()
                            .fill(.white.opacity(0.12))
                            .frame(width: 0.5, height: 14)
                            .accessibilityHidden(true)
                    }
                }
                if model.pendingApprovalCount > 0 {
                    attentionUnit(count: model.pendingApprovalCount)
                }
            }
            .frame(height: 34)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
            .padding(.horizontal, KorbenShellMetrics.chromeHorizontalInset)
            .frame(maxHeight: KorbenShellMetrics.topChromeMaxHeight)
            .transition(.opacity.combined(with: .move(edge: .top)))
            .accessibilityIdentifier("korben.systemStrip")
        }
    }

    /// Runtime 单元(Focus 显示实时计时;其余显示 accessory 标题)。
    private func runtimeUnit(_ live: KenosAppModel.LiveAccessory) -> some View {
        Button {
            model.activateLiveAccessory(live)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: runtimeSymbol(live))
                    .font(.system(size: 12, weight: .medium))
                if case .focus = live.kind {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Text("\(live.title) · \(elapsedText(at: context.date))")
                            .font(.system(size: 12, weight: .medium))
                            .monospacedDigit()
                    }
                } else {
                    Text(live.title)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                }
            }
            .foregroundStyle(.primary.opacity(0.88))
            .padding(.horizontal, 12)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(live.title)
        .accessibilityHint(prefersChinese ? "回到进行中的会话" : "Returns to the running session")
        .accessibilityIdentifier("korben.strip.runtime")
    }

    private func attentionUnit(count: Int) -> some View {
        Button {
            shellState.showsSystemTray = true
        } label: {
            HStack(spacing: 5) {
                Text(prefersChinese ? "\(count) 待确认" : "\(count) pending")
                    .font(.system(size: 12, weight: .medium))
                Circle()
                    .fill(Color(red: 0.95, green: 0.72, blue: 0.29))
                    .frame(width: 5, height: 5)
                    .accessibilityHidden(true)
            }
            .foregroundStyle(.primary.opacity(0.88))
            .padding(.horizontal, 12)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(prefersChinese ? "\(count) 项待确认" : "\(count) items pending")
        .accessibilityHint(prefersChinese ? "打开系统托盘" : "Opens the System Tray")
        .accessibilityIdentifier("korben.strip.attention")
    }

    private func runtimeSymbol(_ live: KenosAppModel.LiveAccessory) -> String {
        switch live.kind {
        case .focus: return "circle.circle"
        case .musicNowPlaying: return "music.note"
        case .capture: return "square.and.pencil"
        case .continuity: return "clock.arrow.circlepath"
        case .liveActivity: return "waveform.path.ecg"
        }
    }

    private func elapsedText(at date: Date) -> String {
        let s = model.focusStore.elapsedSeconds(at: date)
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// P2 System Tray — 顶部展开的临时 overlay(非独立页面/非 Inbox 根)。
struct KorbenSystemTray: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let live = model.liveAccessory {
                Text(prefersChinese ? "正在进行" : "Running")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Button {
                    shellState.showsSystemTray = false
                    model.activateLiveAccessory(live)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(live.title).font(.system(size: 15, weight: .medium))
                            if !live.subtitle.isEmpty {
                                Text(live.subtitle).font(.system(size: 12)).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if model.pendingApprovalCount > 0 {
                Text(prefersChinese ? "需要处理" : "Needs attention")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Button {
                    shellState.showsSystemTray = false
                    model.openApprovals()
                } label: {
                    HStack {
                        Text(prefersChinese
                            ? "\(model.pendingApprovalCount) 项待确认"
                            : "\(model.pendingApprovalCount) pending approvals")
                            .font(.system(size: 15, weight: .medium))
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if model.liveAccessory == nil, model.pendingApprovalCount == 0 {
                Text(prefersChinese ? "现在没有进行中的事项。" : "Nothing running right now.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(.white.opacity(0.08), lineWidth: 0.5)
        )
        .padding(.horizontal, KorbenShellMetrics.chromeHorizontalInset)
        .accessibilityIdentifier("korben.systemTray")
    }
}

#endif
