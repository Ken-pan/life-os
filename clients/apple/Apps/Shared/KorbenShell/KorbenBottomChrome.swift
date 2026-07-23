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

            VStack(spacing: 8) {
                // P1B: Domain sub-navigation stays available when Korben owns
                // the chrome — compact capsule reusing the SSOT dock items
                // (removing it with the legacy dock would regress Plan's
                // Tasks / Calendar / Inbox switching).
                if model.shellMode == .domain, !model.domainDockItems.isEmpty {
                    domainDestinationCapsule
                }
                HStack(spacing: KorbenShellMetrics.orbDockGap) {
                    spaceOrb
                    intentDock
                }
            }
            .padding(.horizontal, KorbenShellMetrics.chromeHorizontalInset)
            .padding(.bottom, KorbenShellMetrics.bottomSafeAreaGap)
        }
    }

    // ── Domain destination capsule (P1B, icons + selected label) ──
    private var domainDestinationCapsule: some View {
        HStack(spacing: 0) {
            ForEach(Array(model.domainDockItems.enumerated()), id: \.element.title) { index, item in
                domainCapsuleButton(index: index, item: item)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
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
                if selected {
                    HStack(spacing: 5) {
                        Image(systemName: item.systemImage)
                            .font(.system(size: 15, weight: .medium))
                        Text(item.title)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(1)
                    }
                } else {
                    Image(systemName: item.systemImage)
                        .font(.system(size: 16, weight: .regular))
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
            GeometryReader { geo in
                Color.clear.onAppear {
                    let f = geo.frame(in: .named("korben.shell"))
                    shellState.orbCenter = CGPoint(x: f.midX, y: f.midY)
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
                    if moved < KorbenOrbGestureResolver.tapMaxMovement
                        || dt < KorbenOrbGestureResolver.tapMaxDuration
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
