import SwiftUI
import KenosDesign

#if os(iOS)

/// Global dock — **Spaces edge tip** (drawer hint) + **four-icon floating capsule**.
/// Icon-only; SSOT for Kenos + Domain modes.
///
/// Honest mapping to Apple:
/// - Capsule ≈ iOS 26 floating Tab Bar (Liquid Glass, equal top-level destinations)
/// - Spaces tip ≠ system Tab Bar — it's a leading drawer affordance (Maps/Gmail pattern)
/// - Prefer system `glassEffect` over custom material + drop shadow
struct KenosGlobalDock: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.locale) private var locale
    /// System tab icons sit ~23–25pt; icon-only can read a touch larger.
    @ScaledMetric(relativeTo: .title3) private var iconSize: CGFloat = 25

    private var prefersChinese: Bool {
        locale.identifier.lowercased().hasPrefix("zh")
    }

    private enum Metrics {
        static let duoGap: CGFloat = 10
        /// Outer glass pad — keep tight so selected block can sit close to the rim.
        static let capsulePad: CGFloat = 3
        static let hitSize: CGFloat = 48
        /// Compact Spaces tip — chevron peek at leading edge.
        static let tipWidth: CGFloat = 20
        static let tipIconSize: CGFloat = 13
        /// Large trailing radius ≈ half tip height → true half-capsule.
        static let tipTrailingRadius: CGFloat = 28
        /// Invisible hit pad (HIG ≥44) — visual tip stays slim.
        static let tipHitWidth: CGFloat = 48
        static let tipHitHeight: CGFloat = 56
        static let tipSwipeMinDistance: CGFloat = 10
        /// Tight margin vs outer capsule — selected pill should read as a large block.
        static let selInsetH: CGFloat = 2
        static let selInsetV: CGFloat = 2
    }

    private var selectionTint: Color { model.dockSelectionAccent }

    private var capsuleItems: [KenosAppModel.DomainDockItem] {
        model.shellMode == .domain ? model.domainDockItems : model.kenosCapsuleDockItems
    }

    private var spacesChipSelected: Bool {
        model.showSpaceShelf
    }

    private var selectionAnimation: Animation {
        KenosMotion.selection(reduceMotion: reduceMotion)
    }

    private var selectionHapticToken: String {
        if model.showSpaceShelf { return "shelf" }
        if model.shellMode == .domain {
            return "d:\(model.domainDockSlot):\(model.showDomainMoreSheet)"
        }
        return "k:\(model.selectedTab.rawValue)"
    }

    private var selectedCapsuleIndex: Int? {
        if spacesChipSelected { return nil }
        if model.shellMode == .domain {
            if model.showDomainMoreSheet,
               let idx = capsuleItems.firstIndex(where: \.opensMore)
            {
                return idx
            }
            return capsuleItems.indices.contains(model.domainDockSlot)
                ? model.domainDockSlot
                : nil
        }
        return capsuleItems.firstIndex(where: { $0.kenosTab == model.selectedTab })
    }

    var body: some View {
        dockRow
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(
                model.shellMode == .domain ? "kenos.domainDock" : "kenos.globalDock"
            )
            .sensoryFeedback(.selection, trigger: selectionHapticToken)
    }

    @ViewBuilder
    private var dockRow: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: Metrics.duoGap) {
                HStack(alignment: .center, spacing: Metrics.duoGap) {
                    spacesEdgeTip
                    destinationCapsule
                }
                .frame(maxWidth: .infinity)
            }
        } else {
            HStack(alignment: .center, spacing: Metrics.duoGap) {
                spacesEdgeTip
                destinationCapsule
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// Compact leading tip — drawer affordance (tap / swipe-right). Not a fifth tab.
    /// Visual stays slim; hit pad expands into the gap (HIG ≥44).
    private var spacesEdgeTip: some View {
        Button {
            withAnimation(selectionAnimation) {
                model.activateSpacesDockButton()
            }
        } label: {
            Image(systemName: spacesChipSelected ? "chevron.left" : "chevron.right")
                .font(.system(size: Metrics.tipIconSize, weight: .semibold))
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(Color.primary.opacity(0.55))
                .frame(width: Metrics.tipWidth, height: Metrics.hitSize)
                .padding(.trailing, 6)
                .padding(.vertical, Metrics.capsulePad)
                .kenosLiquidGlass(in: spacesTipShape, interactive: true, prominent: true)
        }
        .buttonStyle(.plain)
        // Invisible hit expansion into the duo gap (keeps glass visually slim).
        .padding(.trailing, 14)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .simultaneousGesture(spacesTipSwipe)
        .accessibilityIdentifier("kenos.dock.spaces")
        .accessibilityLabel(localizedDockTitle("Spaces"))
        .accessibilityHint("Opens Space Shelf. Swipe right just above the bottom dock to open.")
        .accessibilityAddTraits(spacesChipSelected ? [.isButton, .isSelected] : .isButton)
        .animation(selectionAnimation, value: spacesChipSelected)
    }

    private var spacesTipShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: Metrics.tipTrailingRadius,
            topTrailingRadius: Metrics.tipTrailingRadius,
            style: .continuous
        )
    }

    /// Swipe-right on the tip opens the shelf (same commit math as edge pan).
    private var spacesTipSwipe: some Gesture {
        DragGesture(minimumDistance: Metrics.tipSwipeMinDistance, coordinateSpace: .local)
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                let predicted = value.predictedEndTranslation.width
                let velocity = predicted - dx
                let horizontal = abs(dx) >= abs(dy) * 0.8
                guard horizontal else { return }
                // Tip is a short affordance — slightly lower distance bar than full-edge pan.
                let shouldOpen = dx > 24
                    || KenosShelfGesture.shouldCommitOpen(
                        translationX: dx,
                        velocityX: velocity,
                        predictedTranslationX: predicted
                    )
                guard shouldOpen else { return }
                withAnimation(selectionAnimation) {
                    model.openSpaceShelf()
                }
            }
    }

    /// Four destinations — floating Liquid Glass tab capsule (Apple Tab Bar language).
    private var destinationCapsule: some View {
        let count = max(capsuleItems.count, 1)
        return HStack(spacing: 0) {
            ForEach(Array(capsuleItems.enumerated()), id: \.offset) { index, item in
                capsuleButton(index: index, item: item)
            }
        }
        .background {
            GeometryReader { geo in
                if let index = selectedCapsuleIndex, count > 0 {
                    let itemWidth = geo.size.width / CGFloat(count)
                    // iOS 26 system tab: selected = darker gray capsule (not accent fill).
                    Capsule(style: .continuous)
                        .fill(Color.black.opacity(0.42))
                        .frame(
                            width: max(0, itemWidth - Metrics.selInsetH * 2),
                            height: max(0, geo.size.height - Metrics.selInsetV * 2)
                        )
                        .offset(
                            x: itemWidth * CGFloat(index) + Metrics.selInsetH,
                            y: Metrics.selInsetV
                        )
                        .animation(selectionAnimation, value: index)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(.horizontal, Metrics.capsulePad)
        .padding(.vertical, Metrics.capsulePad)
        .frame(maxWidth: .infinity)
        .frame(height: Metrics.hitSize + Metrics.capsulePad * 2)
        .kenosLiquidGlass(in: Capsule(style: .continuous), interactive: true, prominent: true)
    }

    @ViewBuilder
    private func capsuleButton(index: Int, item: KenosAppModel.DomainDockItem) -> some View {
        let selected = isCapsuleSelected(index: index, item: item)
        let title = localizedDockTitle(item.title)
        Button {
            // HIG peer tabs: content swap is instant. Do NOT wrap in withAnimation —
            // that springs the whole WK/safeArea tree. Pill/icon use .animation(value:).
            if model.shellMode == .domain {
                model.selectDomainDockSlot(index)
            } else if let tab = item.kenosTab {
                model.selectKenosDockTab(tab)
            }
        } label: {
            Image(systemName: item.systemImage)
                .font(.system(size: iconSize, weight: selected ? .semibold : .regular))
                .symbolRenderingMode(.monochrome)
                // Selected = accent tint; idle ≈ near-white (system inactive reads bright on glass).
                .foregroundStyle(
                    selected
                        ? AnyShapeStyle(selectionTint)
                        : AnyShapeStyle(Color.white.opacity(0.92))
                )
                .frame(maxWidth: .infinity)
                .frame(height: Metrics.hitSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        .animation(selectionAnimation, value: selected)
        .accessibilityIdentifier("kenos.dock.capsule.\(index)")
        .accessibilityLabel(title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private func localizedDockTitle(_ title: String) -> String {
        guard prefersChinese else { return title }
        switch title {
        case "Spaces": return "空间"
        case "Tasks": return "任务"
        case "Calendar": return "日历"
        case "Inbox": return "收件箱"
        case "More": return "更多"
        case "Today": return "今天"
        case "Program": return "计划"
        case "Discover": return "发现"
        case "Workout": return "训练"
        case "History": return "历史"
        case "Focus": return "专注"
        case "Assistant": return "助手"
        case "Settings": return "设置"
        case "Home": return "首页"
        case "Search": return "搜索"
        case "Library": return "资料库"
        case "Rooms": return "房间"
        case "Items": return "物品"
        case "Organize": return "整理"
        case "Status": return "状态"
        case "Trends": return "趋势"
        case "Accounts": return "账户"
        default: return title
        }
    }

    private func isCapsuleSelected(index: Int, item: KenosAppModel.DomainDockItem) -> Bool {
        if model.showSpaceShelf { return false }
        if model.shellMode == .domain {
            if item.opensMore { return model.showDomainMoreSheet }
            return model.domainDockSlot == index && !model.showDomainMoreSheet
        }
        return model.selectedTab == item.kenosTab
    }
}

#endif
