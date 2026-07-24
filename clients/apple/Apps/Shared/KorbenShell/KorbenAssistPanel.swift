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

    /// 当前助手人设(Korben / Leo)。
    private var persona: KorbenAssistantPersona {
        KorbenAssistantPersona.normalize(KenosShellSettingsStore.current.persona)
    }

    /// Leo 在场表情 —— 由壳信号推断(有 runtime=在想 / 待确认=认真 / 否则温柔)。
    private var leoExpression: KorbenLeoExpression {
        KorbenLeoPresence.expression(for: .init(
            hasActiveRuntime: model.liveAccessory != nil,
            hasPendingAttention: model.pendingApprovalCount > 0,
            justActedPositively: false
        ))
    }

    /// Gate5C-2:面板内容由**当前路由**推导,不再只知道 Space。
    private var context: KorbenAssistContext {
        // **只在域内**推导区名。域外(Today)`domainDockItems` 会退回一组兜底项
        // (Home / Browse / Library),路由匹配必然命中 "Home" —— 真机实拍出现过
        // 「当前:今日 · Home」这种不存在的位置。域外只说 Space,不编造区。
        let inDomain = projection.shellMode == .domain
        return KorbenAssistContext.make(
            spaceLabel: spaceLabel,
            path: inDomain ? (model.continuityURL?.path ?? "/") : "/",
            items: inDomain
                ? model.domainDockItems.map {
                    (KenosLocalizedTitles.navigation($0.title, chinese: prefersChinese), $0.path ?? "/")
                }
                : [],
            runtimeTitle: model.liveAccessory?.title,
            pendingApprovals: model.pendingApprovalCount
        )
    }

    /// 同域内的跳转建议只在域内给 —— 域外(Today)没有"另一个区"这回事。
    private var sectionJumps: [KorbenAssistContext.Section] {
        projection.shellMode == .domain ? context.siblingSections : []
    }

    /// 上下文行数(位置恒有 + runtime? + 待确认?)
    private var contextRowCount: Int {
        1 + (model.liveAccessory != nil ? 1 : 0) + (model.pendingApprovalCount > 0 ? 1 : 0)
    }

    /// 操作行数(待确认 + 域内跳转建议各自可变)
    private var actionRowCount: Int {
        2 + (model.pendingApprovalCount > 0 ? 1 : 0) + sectionJumps.count
    }

    /// 按内容推导 sheet 高度 —— 行数会随待确认/runtime 变化,不能写死 fraction。
    private var contentHeight: CGFloat {
        let padding: CGFloat = 18 * 2
        let header: CGFloat = 24 + 16
        let context = CGFloat(contextRowCount) * 21 + 12 * 2 + 16
        let actions = CGFloat(actionRowCount) * 48 + CGFloat(max(0, actionRowCount - 1)) * 8 + 16
        let cta: CGFloat = 44
        return padding + header + context + actions + cta
    }

    private var spaceLabel: String {
        if projection.shellMode == .domain {
            let raw = KenosDomainRegistry.shelfDomainDefinitions
                .first(where: { $0.id == projection.currentSpaceId })?.label
                ?? projection.currentSpaceId
            // 不本地化会出现「当前:Plan · 任务」这种半中半英(真机实拍)。
            return KenosLocalizedTitles.navigation(raw, chinese: prefersChinese)
        }
        return prefersChinese ? "今日" : "Today"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // 人设感知的头部:Korben(sparkle)/ Leo(头像 + 表情)。点头像/名字
            // 一键在两个人设间切换 —— 现代陪伴向 App 把"我是谁在陪你"放在最显眼处。
            HStack(spacing: 10) {
                KorbenPersonaBadge(
                    persona: persona,
                    size: persona.isLeo ? 40 : 30,
                    leoExpression: leoExpression,
                    live: persona.isLeo
                )
                VStack(alignment: .leading, spacing: 1) {
                    Text(persona.displayName)
                        .font(.system(size: 18, weight: .semibold))
                    if persona.isLeo {
                        Text(prefersChinese ? "陪伴模式" : "Companion mode")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                personaSwitch
            }

            // ── 上下文摘要(本地投影事实,非 AI 生成)──
            VStack(alignment: .leading, spacing: 6) {
                contextRow(
                    icon: "square.grid.2x2",
                    text: context.locationLine(chinese: prefersChinese)
                )
                .accessibilityIdentifier("korben.assist.location")
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
                // 域内跳转建议 —— 由当前路由推导出的**同域其它区**。这是面板里
                // 唯一会随页面变化的一组行,也正是「不再通用」的证据。
                ForEach(sectionJumps, id: \.index) { section in
                    actionRow(
                        icon: "arrow.turn.up.right",
                        // 中文动词与宾语之间不加空格(「去 日历」读着像两个词)。
                        title: prefersChinese ? "去\(section.title)" : "Go to \(section.title)"
                    ) {
                        dismiss()
                        model.selectDomainDockSlot(section.index)
                    }
                    .accessibilityIdentifier("korben.assist.jump.\(section.index)")
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
                    // 关本 sheet 后再开 Quick Capture —— 同容器上两个 .sheet 若在
                    // 前者关闭动画途中 present 后者,SwiftUI 会吞掉新 present。
                    shellState.quickCaptureDetent = KorbenQuickCaptureSheet.captureDetent
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                        shellState.showsQuickCapture = true
                    }
                }
            }

            // ── 真 agent 入口(web Ask 面)——紧跟内容,不用 Spacer 顶到底部
            // (真机 review B2:55% 固定高 + Spacer 把按钮吊在底部,中间一大片空白)。
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
        // 内容自适应高度 —— 固定 55% 对当前内容量太空(真机 review B2)。
        .presentationDetents([.height(contentHeight)])
        .presentationDragIndicator(.visible)
        .presentationBackground(.ultraThinMaterial)
        // 与 System Strip 同一个坑:只给容器 identifier 会让 SwiftUI 把子元素
        // 合并进容器 —— 位置行/跳转行既查不到也读不出(VoiceOver 把整块读成一坨)。
        // 声明为容器后子元素才保持独立可寻址。
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("korben.assistPanel")
    }

    /// 人设切换 —— 紧凑双段胶囊(Korben ⇄ Leo)。切换即写壳偏好并广播给 web,
    /// 让 web 助手人设跟着变(与主题/语言同一广播链路)。
    private var personaSwitch: some View {
        HStack(spacing: 2) {
            personaSegment(.korben, symbol: "sparkle")
            personaSegment(.leo, symbol: "heart.fill")
        }
        .padding(2)
        .background(.white.opacity(0.06), in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
        .accessibilityIdentifier("korben.assist.personaSwitch")
    }

    private func personaSegment(_ target: KorbenAssistantPersona, symbol: String) -> some View {
        let selected = persona == target
        return Button {
            guard persona != target else { return }
            let snap = KenosShellSettingsStore.update(persona: target.rawValue)
            KenosNativeCapabilityBridge.broadcastShellSettings(snap)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(
                    selected
                        ? AnyShapeStyle(.white)
                        : AnyShapeStyle(.secondary)
                )
                .frame(width: 30, height: 26)
                .background {
                    if selected {
                        Capsule().fill(Color(red: 0.357, green: 0.549, blue: 1.0))
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(target.displayName)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("korben.assist.persona.\(target.rawValue)")
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
