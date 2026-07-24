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

    /// 同时在跑的 Runtime 条数 —— 与 `KenosAppModel.liveAccessory` 的 5 个来源同源
    /// (它只单选优先级最高的一个,这里数总数以支撑「次要 Runtime」单元)。
    @MainActor
    static func activeRuntimeCount(model: KenosAppModel) -> Int {
        var n = 0
        if !model.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           !model.showCaptureSheet { n += 1 }
        if model.focusStore.showReturnBanner { n += 1 }
        if let snap = KenosLiveActivityFoundation.lastSnapshot,
           KenosLiveActivityFoundation.activeKinds.contains(snap.kind) { n += 1 }
        if KenosNowPlayingBridge.hasLiveTrack { n += 1 }
        return n
    }

    @MainActor
    static func units(model: KenosAppModel) -> [KorbenStripModel.Unit] {
        // Gate5D 夹具(仅开发构建 + 显式启动参数)——让三态可复现地截图。
        if let mode = KorbenStripFixture.current {
            let f = KorbenStripFixture.stripInputs(for: mode)
            return KorbenStripModel.units(
                attentionCount: f.attentionCount,
                primaryRuntimeTitle: f.primaryRuntimeTitle,
                activeRuntimeCount: f.activeRuntimeCount
            )
        }
        return KorbenStripModel.units(
            attentionCount: model.pendingApprovalCount,
            primaryRuntimeTitle: model.liveAccessory?.title,
            activeRuntimeCount: max(activeRuntimeCount(model: model), model.liveAccessory == nil ? 0 : 1)
        )
    }

    /// Strip 是否有内容(host 用它决定 web 顶部 inset)。
    @MainActor
    static func hasUnits(model: KenosAppModel) -> Bool {
        !units(model: model).isEmpty
    }

    var body: some View {
        let strip = Self.units(model: model)
        if !strip.isEmpty {
            HStack(spacing: 0) {
                ForEach(Array(strip.enumerated()), id: \.offset) { index, unit in
                    if index > 0 {
                        Rectangle()
                            .fill(.white.opacity(0.12))
                            .frame(width: 0.5, height: 14)
                            .accessibilityHidden(true)
                    }
                    unitView(unit)
                }
            }
            .frame(height: 34)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
            .padding(.horizontal, KorbenShellMetrics.chromeHorizontalInset)
            .frame(maxHeight: KorbenShellMetrics.topChromeMaxHeight)
            .transition(.opacity.combined(with: .move(edge: .top)))
            // `.contain` —— 只给容器 identifier 会让 SwiftUI 把子单元合并进容器,
            // 单元既查不到也读不出(VoiceOver 会把整条读成一坨)。声明为容器后
            // 每个状态单元保持独立可寻址 / 可聚焦。
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("korben.systemStrip")
        }
    }

    @ViewBuilder
    private func unitView(_ unit: KorbenStripModel.Unit) -> some View {
        switch unit {
        case .attention(let count):
            attentionUnit(count: count)
        case .runtime(let title):
            // 有真 accessory 就渲染真的(含 Focus 实时计时);夹具态没有 accessory,
            // 退化为「只显示标题、点击开 Tray」的静态单元 —— 夹具不伪造可点的
            // runtime 目标,点了只会打开 Tray,不会跳进一个不存在的会话。
            if let live = model.liveAccessory {
                runtimeUnit(live)
            } else {
                fixtureRuntimeUnit(title: title)
            }
        case .secondaryRuntimes(let count):
            secondaryRuntimesUnit(count: count)
        }
    }

    /// P3 次要 Runtime 数量 —— 只报条数,详情在 Tray 里看。
    private func secondaryRuntimesUnit(count: Int) -> some View {
        Button {
            shellState.showsSystemTray = true
        } label: {
            Text(prefersChinese ? "+\(count) 进行中" : "+\(count) running")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.primary.opacity(0.75))
                .padding(.horizontal, 12)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            prefersChinese ? "另有 \(count) 项进行中" : "\(count) more running"
        )
        .accessibilityHint(prefersChinese ? "打开系统托盘" : "Opens the System Tray")
        .accessibilityIdentifier("korben.strip.secondaryRuntimes")
    }

    /// 夹具态 Runtime 单元 —— 与真单元同样的排版/标识符,便于同一套断言复用。
    private func fixtureRuntimeUnit(title: String) -> some View {
        Button {
            shellState.showsSystemTray = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "waveform.path.ecg")
                    .font(.system(size: 12, weight: .medium))
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
            .foregroundStyle(.primary.opacity(0.88))
            .padding(.horizontal, 10)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityHint(prefersChinese ? "打开系统托盘" : "Opens the System Tray")
        .accessibilityIdentifier("korben.strip.runtime")
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
                        // 三单元同屏时中间的 runtime 最先被挤("Train…",真机实拍)。
                        // 允许小幅缩字优先于省略号 —— 读得出比排得齐重要。
                        .minimumScaleFactor(0.82)
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

    /// Tray 与 Strip 必须读同一份事实 —— 否则夹具态下 Strip 说「2 待确认」、
    /// Tray 展开却说「现在没有进行中的事项」,证据自相矛盾。
    private var fixtureUnits: [KorbenStripModel.Unit]? {
        guard KorbenStripFixture.current != nil else { return nil }
        return KorbenSystemStrip.units(model: model)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let units = fixtureUnits {
                fixtureBody(units)
            } else {
                liveBody
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

    /// 夹具态 Tray:逐条列出 Strip 上的单元,行不可跳转(布景不假装有去处)。
    @ViewBuilder
    private func fixtureBody(_ units: [KorbenStripModel.Unit]) -> some View {
        ForEach(Array(units.enumerated()), id: \.offset) { _, unit in
            switch unit {
            case .attention(let count):
                trayHeading(prefersChinese ? "需要处理" : "Needs attention")
                trayStaticRow(
                    prefersChinese ? "\(count) 项待确认" : "\(count) pending approvals"
                )
            case .runtime(let title):
                trayHeading(prefersChinese ? "正在进行" : "Running")
                trayStaticRow(title)
            case .secondaryRuntimes(let count):
                trayStaticRow(
                    prefersChinese ? "另有 \(count) 项进行中" : "\(count) more running"
                )
            }
        }
    }

    private func trayHeading(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.secondary)
    }

    private func trayStaticRow(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 15, weight: .medium))
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var liveBody: some View {
        Group {
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
    }
}

#endif
