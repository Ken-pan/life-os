import SwiftUI
import KenosDesign

#if os(iOS)

/// Korben bottom chrome — Space Orb (left) + static Intent Dock pill.
///
/// P1 scope: static look, basic taps only.
/// - Orb Tap → existing Space Switcher directory (`model.openSpaceSwitcher()`).
///   The full Orb gesture grammar (peek / hold / fan / drag-right) is P3.
/// - Intent Dock Tap → existing Quick Capture sheet (`showCaptureSheet`).
///   No classification, no routing, no new write paths.
/// Every control keeps a ≥60pt hit target (spec minimum 44pt).
struct KorbenBottomChrome: View {
    @ObservedObject var model: KenosAppModel
    @ObservedObject var shellState: KorbenShellState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // ── P3 Orb 手势状态机(判定参数见 KorbenOrbGestureResolver)──
    @State private var orbPhase: KorbenOrbGestureResolver.Phase = .idle
    @State private var orbPressStart: Date?
    @State private var orbTranslation: CGSize = .zero
    @State private var holdWork: DispatchWorkItem?

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    private var dockPlaceholder: String {
        prefersChinese ? "记录、查找或交办…" : "Capture, find, or delegate…"
    }

    var body: some View {
        VStack(spacing: 0) {
            // P2: runtime chrome 归 System Strip(顶部)——Korben 壳不再渲染
            // 底部 LiveAccessory,保持单一 chrome 规则。

            // 层级打磨:域胶囊移进 Intent Dock 所在的列(与 Dock 同宽、正上方),
            // Orb 作为最左的全局锚点跨两行底对齐 —— 读作「一个 chrome 列」而非
            // 「两条互相竞争的全宽横栏」。这是 Owner Gate4 Warning「双层 Chrome
            // 视觉权重偏高」的结构性降权,不靠继续调透明度。
            HStack(alignment: .bottom, spacing: KorbenShellMetrics.orbDockGap) {
                spaceOrb
                VStack(spacing: KorbenShellMetrics.chromeStackGap) {
                    // 四条约束(Owner 定):仅当前域显示、不复制 Orb/Capture、
                    // 视觉权重低于 Intent Dock、随滚动收敛。
                    // 收敛:web 下滑(阅读)→ liveAccessoryMinimized → 胶囊淡出让位。
                    if model.shellMode == .domain, !model.domainDockItems.isEmpty,
                       !model.liveAccessoryMinimized {
                        domainDestinationCapsule
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                    intentDock
                }
            }
            .animation(
                KenosMotion.selection(reduceMotion: reduceMotion),
                value: model.liveAccessoryMinimized
            )
            .padding(.horizontal, KorbenShellMetrics.chromeHorizontalInset)
            .padding(.bottom, KorbenShellMetrics.bottomSafeAreaGap)
        }
    }

    // ── Domain destination capsule ──
    // 视觉权重刻意低于 Intent Dock:更窄(居中包裹,非全宽)、更弱的填充(非
    // ultraThinMaterial 的实体玻璃)、更矮 —— 从属于内容与全局 Dock。
    private var domainDestinationCapsule: some View {
        HStack(spacing: 2) {
            ForEach(Array(model.domainDockItems.enumerated()), id: \.element.title) { index, item in
                domainCapsuleButton(index: index, item: item)
            }
        }
        .padding(.horizontal, 3)
        .padding(.vertical, 2)
        // 与 Intent Dock 同列同宽(收窄成 300pt 会让列表行从两侧露出,Gate4-2 实测)。
        // 降权靠「更矮 + 更淡 + 更弱描边 + 更小图标字」:胶囊 ~48pt vs Dock 56pt,
        // 未选中项为 secondary 灰,整体从属于全局 Dock。
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.05), lineWidth: 0.5))
        .frame(maxWidth: .infinity)
        .shadow(color: .black.opacity(0.10), radius: 3, y: 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(prefersChinese ? "主导航" : "Destinations")
        .accessibilityIdentifier("korben.domainCapsule")
    }

    private func domainCapsuleButton(index: Int, item: KenosAppModel.DomainDockItem) -> some View {
        let selected = model.domainDockSlot == index && !model.showDomainMoreSheet
        return Button {
            model.selectDomainDockSlot(index)
        } label: {
            Group {
                // 图标/字比 Intent Dock(15pt 占位文案)更小一档,强化从属关系。
                if selected {
                    HStack(spacing: 5) {
                        Image(systemName: item.systemImage)
                            .font(.system(size: 14, weight: .medium))
                        Text(item.title)
                            .font(.system(size: 10.5, weight: .semibold))
                            .lineLimit(1)
                    }
                } else {
                    Image(systemName: item.systemImage)
                        .font(.system(size: 15, weight: .regular))
                }
            }
            .foregroundStyle(
                selected
                    ? AnyShapeStyle(model.dockSelectionAccent)
                    : AnyShapeStyle(.secondary)
            )
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background {
                if selected {
                    Capsule().fill(model.dockSelectionAccent.opacity(0.14))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("korben.domainCapsule.\(index)")
    }

    // ── Space Orb(P3:Tap / Hold Fan / Hold+Drag / SwipeUp / DragRight)──
    private var spaceOrb: some View {
        ZStack {
            Circle()
                .fill(.ultraThinMaterial)
            Circle()
                .strokeBorder(.white.opacity(0.10), lineWidth: 0.5)
            Image(systemName: "square.grid.2x2.fill")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(.primary.opacity(0.9))
        }
        .frame(
            width: KorbenShellMetrics.orbVisualSize,
            height: KorbenShellMetrics.orbVisualSize
        )
        .scaleEffect(orbPhase == .fan && !reduceMotion ? 1.06 : 1.0)
        .animation(KenosMotion.selection(reduceMotion: reduceMotion), value: orbPhase == .fan)
        .frame(
            minWidth: KorbenShellMetrics.minHitTarget,
            minHeight: KorbenShellMetrics.minHitTarget
        )
        .contentShape(Circle().scale(KorbenShellMetrics.minHitTarget / KorbenShellMetrics.orbVisualSize))
        .background(
            // Fan 绘制与命中共用同一坐标系的 Orb 圆心。
            // 持续上报(非一次性 onAppear):进入/离开 Domain 时域胶囊出现会把
            // Orb 上顶,圆心必须随布局更新,否则扇形/气泡/命中判定整体偏移。
            GeometryReader { geo in
                let f = geo.frame(in: .named("korben.shell"))
                Color.clear
                    .onAppear { shellState.orbCenter = CGPoint(x: f.midX, y: f.midY) }
                    .onChange(of: f) { _, nf in
                        shellState.orbCenter = CGPoint(x: nf.midX, y: nf.midY)
                    }
            }
        )
        .gesture(orbGesture)
        .accessibilityLabel(prefersChinese ? "空间" : "Spaces")
        .accessibilityHint(
            prefersChinese
                ? "打开空间切换器。长按显示最近空间。"
                : "Opens the Space switcher. Hold for recent Spaces."
        )
        .accessibilityIdentifier("korben.orb")
        .accessibilityAddTraits(.isButton)
        // 手势的可点击替代路径(VoiceOver)。
        .accessibilityAction(named: prefersChinese ? "打开空间切换器" : "Open Space switcher") {
            model.openSpaceSwitcher()
        }
        .accessibilityAction(named: prefersChinese ? "最近空间" : "Recent Spaces") {
            model.openContinue()
        }
        .accessibilityAction(named: prefersChinese ? "打开 Korben" : "Open Korben") {
            shellState.showsAssist = true
        }
    }

    private var orbGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named("korben.shell"))
            .onChanged { value in
                orbTranslation = value.translation
                switch orbPhase {
                case .idle:
                    orbPhase = .pressing(start: Date())
                    orbPressStart = Date()
                    scheduleHold()
                case .pressing:
                    // Hold 触发前锁定方向(>18pt,±25°)。
                    if let dir = KorbenOrbGestureResolver.lockedDirection(translation: value.translation) {
                        holdWork?.cancel()
                        orbPhase = dir
                    }
                case .fan:
                    let centers = KorbenOrbGestureResolver.fanCenters(
                        orbCenter: shellState.orbCenter,
                        count: shellState.orbFanTargets.count
                    )
                    let next = KorbenOrbGestureResolver.fanTargetIndex(
                        at: value.location, targets: centers
                    )
                    if next != shellState.orbFanHighlight {
                        shellState.orbFanHighlight = next
                        if next != nil { UISelectionFeedbackGenerator().selectionChanged() }
                    }
                case .dragRight:
                    shellState.assistDragDistance = max(0, value.translation.width)
                case .swipeUp:
                    break
                }
            }
            .onEnded { value in
                holdWork?.cancel()
                defer { resetOrbGesture() }
                switch orbPhase {
                case .pressing, .idle:
                    let dt = orbPressStart.map { Date().timeIntervalSince($0) } ?? 0
                    let moved = hypot(value.translation.width, value.translation.height)
                    // Tap = 位移小「且」时间短(spec:<8pt 且 <250ms)。用 AND —
                    // OR 会把向下/向左的快速轻甩(位移大、耗时短、方向锁不住)误判成点击。
                    if moved < KorbenOrbGestureResolver.tapMaxMovement
                        && dt < KorbenOrbGestureResolver.tapMaxDuration
                    {
                        model.openSpaceSwitcher() // Tap → Peek(P1 起的点击路径)
                    }
                case .fan:
                    if let i = shellState.orbFanHighlight,
                       shellState.orbFanTargets.indices.contains(i)
                    {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        model.open(urlString: "kenos://domain/\(shellState.orbFanTargets[i].id)")
                    } // 无目标 / 拖回 → 自然取消
                case .swipeUp:
                    model.openSpaceSwitcher() // Swipe Up → Space Center(目录全集)
                case .dragRight:
                    if value.translation.width >= KorbenOrbGestureResolver.assistCommitDistance {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        shellState.showsAssist = true // P5 Assist Panel(真 agent 经「展开对话」)
                    }
                }
            }
    }

    private func scheduleHold() {
        let work = DispatchWorkItem { [weak model] in
            guard case .pressing = orbPhase else { return }
            let moved = hypot(orbTranslation.width, orbTranslation.height)
            guard moved < KorbenOrbGestureResolver.directionLockDistance else { return }
            guard let model else { return }
            orbPhase = .fan
            shellState.orbFanTargets = KorbenFanTarget.recents(model: model)
            shellState.orbFanHighlight = nil
            shellState.orbFanVisible = true
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        }
        holdWork = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + KorbenOrbGestureResolver.holdDuration,
            execute: work
        )
    }

    private func resetOrbGesture() {
        orbPhase = .idle
        orbPressStart = nil
        orbTranslation = .zero
        shellState.orbFanVisible = false
        shellState.orbFanHighlight = nil
        shellState.assistDragDistance = 0
    }

    // ── Intent Dock(P4A:tap / 上滑 → Quick Capture 两档 sheet)──
    private var intentDock: some View {
        Button {
            shellState.quickCaptureDetent = KorbenQuickCaptureSheet.captureDetent
            shellState.showsQuickCapture = true
        } label: {
            HStack(spacing: 10) {
                Text(dockPlaceholder)
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "mic")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.secondary)
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            .frame(height: KorbenShellMetrics.intentDockHeight)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
            .contentShape(Capsule())
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        // 上滑第一档 → Quick Capture;深上滑直达 Canvas 档(sheet detent 承担连续性)。
        .simultaneousGesture(
            DragGesture(minimumDistance: 18)
                .onEnded { value in
                    guard value.translation.height < -18 else { return }
                    shellState.quickCaptureDetent = value.translation.height < -120
                        ? KorbenQuickCaptureSheet.canvasDetent
                        : KorbenQuickCaptureSheet.captureDetent
                    shellState.showsQuickCapture = true
                }
        )
        .accessibilityLabel(dockPlaceholder)
        .accessibilityHint(
            prefersChinese ? "打开快速记录;上滑展开" : "Opens Quick Capture; swipe up to expand"
        )
        .accessibilityIdentifier("korben.intentDock")
    }
}

#endif
