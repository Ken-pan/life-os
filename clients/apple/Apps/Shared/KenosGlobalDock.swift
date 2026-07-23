import SwiftUI
import KenosDesign

#if os(iOS)

/// Global dock — **Spaces Orb** (identity) + **destination capsule** (location).
///
/// Visual hierarchy (locked):
/// - Orb = Space identity — fully neutral Glass + icon (not a selected tab; no accent)
/// - Selected tab = destination — accent icon + soft selection plate + label (primary weight)
/// - Shelf open: Orb may densify / morph to close; capsule hides
///
/// Honest mapping to Apple:
/// - Capsule ≈ iOS 26 floating Tab Bar (Liquid Glass, equal top-level destinations)
/// - Spaces Orb ≠ system Tab Bar — circular drawer control (Maps / Music language)
struct KenosGlobalDock: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// System tab icons sit ~22–24pt; Dynamic Type scales with title3.
    @ScaledMetric(relativeTo: .title3) private var iconSize: CGFloat = 22
    @ScaledMetric(relativeTo: .title3) private var orbIconSize: CGFloat = 20
    @ScaledMetric(relativeTo: .caption2) private var labelSize: CGFloat = 10

    /// Follow Continuity shell Language (system / zh / en), not only device locale.
    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    /// VoiceOver / larger accessibility sizes — always show destination labels.
    private var showsAllLabels: Bool {
        dynamicTypeSize.isAccessibilitySize
    }

    /// Expand selected label when ≤3 destinations (Kenos + Domain) or Accessibility sizes.
    private var expandsSelectedLabel: Bool {
        showsAllLabels || capsuleItems.count <= 3
    }

    private enum Metrics {
        static let duoGap: CGFloat = KenosGlass.orbCapsuleGap
        static let capsulePad: CGFloat = KenosGlass.capsuleOuterPadding
        static let hitSize: CGFloat = KenosGlass.destinationHitSize
        static let orbSize: CGFloat = KenosGlass.spacesOrbSize
        static let selInsetH: CGFloat = 2
        static let selInsetV: CGFloat = 2
        /// A11y bump on top of per-Space plate opacity.
        static let selectionPlateA11yBump: Double = 0.06
        /// Shelf-open Orb fill — denser so close affordance stays discoverable on Shelf.
        static let orbShelfFillOpacity: Double = 0.20
        static let orbShelfFillOpacityStrong: Double = 0.28
        /// Stroke on open Orb — reads as a discrete close control on the light Shelf plane.
        static let orbShelfStrokeOpacity: Double = 0.22
        static let orbShelfStrokeOpacityStrong: Double = 0.32
        static let tipSwipeMinDistance: CGFloat = 10
    }

    /// On-glass Space accent — selected destination chrome only (Orb stays neutral).
    private var selectionTint: Color { model.dockSelectionAccent }

    private var selectionPlateOpacity: Double {
        let base = KenosDomainRegistry.selectionPlateOpacity(
            for: model.dockSelectionSpaceId,
            scheme: colorScheme
        )
        if reduceTransparency || colorSchemeContrast == .increased {
            return min(0.28, base + Metrics.selectionPlateA11yBump)
        }
        return base
    }

    private var orbShelfFillOpacity: Double {
        if reduceTransparency || colorSchemeContrast == .increased {
            return Metrics.orbShelfFillOpacityStrong
        }
        return Metrics.orbShelfFillOpacity
    }

    private var orbShelfStrokeOpacity: Double {
        if reduceTransparency || colorSchemeContrast == .increased {
            return Metrics.orbShelfStrokeOpacityStrong
        }
        return Metrics.orbShelfStrokeOpacity
    }

    private var capsuleItems: [KenosAppModel.DomainDockItem] {
        model.shellMode == .domain ? model.domainDockItems : model.kenosCapsuleDockItems
    }

    private var spacesShelfOpen: Bool {
        model.showSpaceShelf
    }

    private var selectionAnimation: Animation {
        KenosMotion.selection(reduceMotion: reduceMotion)
    }

    /// Shelf open/close uses chrome soft-impact at distance threshold — not Dock selection.
    /// Dock morph uses open spring both ways (close spring is for the drawer itself).
    private var shelfAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: false)
    }

    private var selectionHapticToken: String {
        // Omit Shelf — chrome owns soft impact on threshold cross / tip settle.
        if model.shellMode == .domain {
            return "d:\(model.domainDockSlot):\(model.showDomainMoreSheet)"
        }
        return "k:\(model.selectedTab.rawValue)"
    }

    private var selectedCapsuleIndex: Int? {
        if spacesShelfOpen { return nil }
        if model.shellMode == .domain {
            return capsuleItems.indices.contains(model.domainDockSlot)
                ? model.domainDockSlot
                : nil
        }
        if model.selectedTab == .settings { return nil }
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
                dockContent
            }
        } else {
            dockContent
        }
    }

    private var dockContent: some View {
        HStack(alignment: .center, spacing: Metrics.duoGap) {
            spacesOrb
            if !spacesShelfOpen {
                destinationCapsule
                    .transition(
                        reduceMotion
                            ? .opacity
                            : .asymmetric(
                                insertion: .opacity.combined(with: .scale(scale: 0.96)),
                                removal: .opacity.combined(with: .scale(scale: 0.96))
                            )
                    )
            }
        }
        .frame(maxWidth: .infinity, alignment: spacesShelfOpen ? .leading : .center)
        .animation(shelfAnimation, value: spacesShelfOpen)
    }

    /// Circular Spaces control — Space **identity**, not a second selected tab.
    /// Closed: clear Glass + neutral icon (same weight as idle capsule). Open: morphs to close.
    private var spacesOrb: some View {
        Button {
            // Chrome owns Shelf spring; Orb morph follows `spacesShelfOpen` + shelfAnimation.
            model.activateSpacesDockButton()
        } label: {
            Image(systemName: spacesShelfOpen ? "chevron.left" : "square.grid.2x2.fill")
                .font(.system(size: orbIconSize, weight: spacesShelfOpen ? .semibold : .medium))
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(
                    spacesShelfOpen
                        ? AnyShapeStyle(Color.primary.opacity(0.94))
                        : AnyShapeStyle(Color.secondary)
                )
                .frame(width: Metrics.orbSize, height: Metrics.orbSize)
                .background {
                    if spacesShelfOpen {
                        // Opaque backplate so the close Orb never dissolves into the Shelf plane.
                        Circle()
                            .fill(colorScheme == .light
                                ? Color.white.opacity(reduceTransparency ? 1 : 0.94)
                                : Color.black.opacity(reduceTransparency ? 0.72 : 0.55))
                            .accessibilityHidden(true)
                        Circle()
                            .fill(Color.primary.opacity(orbShelfFillOpacity * 0.45))
                            .accessibilityHidden(true)
                    }
                }
                // Closed = neutral identity glass; open = Tab-Bar-density close affordance.
                .kenosLiquidGlass(
                    in: Circle(),
                    interactive: true,
                    prominent: spacesShelfOpen
                )
                // Stroke above glass — persistent close affordance on Shelf surface.
                .overlay {
                    if spacesShelfOpen {
                        Circle()
                            .strokeBorder(Color.primary.opacity(orbShelfStrokeOpacity), lineWidth: 1)
                            .accessibilityHidden(true)
                    }
                }
                // Lift just enough to separate from Shelf plane — not a floating FAB.
                .shadow(
                    color: spacesShelfOpen
                        ? Color.black.opacity(colorScheme == .light ? 0.10 : 0.24)
                        : .clear,
                    radius: spacesShelfOpen ? 8 : 0,
                    x: 0,
                    y: spacesShelfOpen ? 1 : 0
                )
        }
        .buttonStyle(
            KenosPressStyle(reduceMotion: reduceMotion, pressedScale: KenosMotion.orbPressScale)
        )
        .frame(width: Metrics.orbSize, height: Metrics.hitSize + Metrics.capsulePad * 2)
        .contentShape(Circle())
        .simultaneousGesture(spacesOrbSwipe)
        .accessibilityIdentifier("kenos.dock.spaces")
        .accessibilityLabel(spacesShelfOpen ? localizedDockTitle("Close Spaces") : localizedDockTitle("Spaces"))
        .accessibilityHint(
            spacesShelfOpen
                ? (prefersChinese ? "关闭空间 Shelf。" : "Closes the Space Shelf.")
                : (prefersChinese ? "打开空间 Shelf。向右滑动也可打开。" : "Opens the Space Shelf. Swipe right to open.")
        )
        .accessibilityAddTraits(spacesShelfOpen ? [.isButton, .isSelected] : .isButton)
        .accessibilitySortPriority(spacesShelfOpen ? 10 : 0)
        .animation(shelfAnimation, value: spacesShelfOpen)
    }

    private var spacesOrbSwipe: some Gesture {
        DragGesture(minimumDistance: Metrics.tipSwipeMinDistance, coordinateSpace: .local)
            .onEnded { value in
                guard !spacesShelfOpen else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                let predicted = value.predictedEndTranslation.width
                let velocity = KenosShelfGesture.dragVelocityX(value)
                let horizontal = abs(dx) >= abs(dy) * 0.8
                guard horizontal else { return }
                let shouldOpen = dx > 24
                    || KenosShelfGesture.shouldCommitOpen(
                        translationX: dx,
                        velocityX: velocity,
                        predictedTranslationX: predicted
                    )
                guard shouldOpen else { return }
                model.openSpaceShelf()
            }
    }

    /// Destination capsule — floating Liquid Glass tab cluster.
    private var destinationCapsule: some View {
        let count = max(capsuleItems.count, 1)
        return HStack(spacing: 0) {
            // Stable identity across Kenos ↔ Domain mode switches — offsets reuse views and glitch selection transitions.
            ForEach(Array(capsuleItems.enumerated()), id: \.element.title) { index, item in
                capsuleButton(index: index, item: item)
            }
        }
        .background {
            GeometryReader { geo in
                if let index = selectedCapsuleIndex, count > 0 {
                    let itemWidth = geo.size.width / CGFloat(count)
                    Capsule(style: .continuous)
                        .fill(selectionTint.opacity(selectionPlateOpacity))
                        .overlay {
                            if colorSchemeContrast == .increased || reduceTransparency {
                                Capsule(style: .continuous)
                                    .strokeBorder(Color.primary.opacity(0.35), lineWidth: 1)
                            }
                        }
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
        .accessibilityElement(children: .contain)
        .accessibilityLabel(prefersChinese ? "主导航" : "Destinations")
    }

    @ViewBuilder
    private func capsuleButton(index: Int, item: KenosAppModel.DomainDockItem) -> some View {
        let selected = isCapsuleSelected(index: index, item: item)
        let title = localizedDockTitle(item.title)
        let showLabel = showsAllLabels || (expandsSelectedLabel && selected)
        let symbol = dockSymbol(item.systemImage, selected: selected)
        Button {
            // HIG peer tabs: content swap is instant. Do NOT wrap in withAnimation.
            if model.shellMode == .domain {
                model.selectDomainDockSlot(index)
            } else if let tab = item.kenosTab {
                model.selectKenosDockTab(tab)
            }
        } label: {
            Group {
                if showLabel {
                    HStack(spacing: 5) {
                        Image(systemName: symbol)
                            .font(.system(size: iconSize * 0.92, weight: .regular))
                        Text(title)
                            .font(.system(size: labelSize, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                } else {
                    Image(systemName: symbol)
                        .font(.system(size: iconSize, weight: .regular))
                }
            }
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(
                selected
                    ? AnyShapeStyle(selectionTint)
                    : AnyShapeStyle(Color.secondary)
            )
            .frame(maxWidth: .infinity)
            .frame(height: Metrics.hitSize)
            .contentShape(Rectangle())
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        .animation(selectionAnimation, value: selected)
        .animation(selectionAnimation, value: showLabel)
        .accessibilityIdentifier("kenos.dock.capsule.\(index)")
        .accessibilityLabel(title)
        // No custom hint — .isSelected + the system's activate hint already say it, localized.
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private func localizedDockTitle(_ title: String) -> String {
        // English SSOT titles → zh (Round 1: full Chinese UI except Kenos / Paper brands).
        guard prefersChinese else {
            // Training hub SSOT title is Resources; show product name Library.
            if title == "Discover" || title == "Explore" || title == "Resources" {
                return "Library"
            }
            return title
        }
        switch title {
        case "Spaces": return "空间"
        case "Close Spaces": return "关闭空间"
        case "Tasks": return "任务"
        case "Calendar": return "日历"
        case "Inbox": return "收件箱"
        case "More": return "更多"
        case "Today": return "今日"
        case "Program": return "计划"
        case "Discover", "Explore", "Resources": return "资料"
        case "Library": return "资料库"
        case "Exercises": return "动作库"
        case "Workout", "Training": return "训练"
        case "History": return "历史"
        case "Focus": return "专注"
        case "Ask", "Assistant": return "问答"
        case "Settings": return "设置"
        case "Home": return "家"
        case "Search": return "搜索"
        case "Rooms": return "房间"
        case "Items": return "物品"
        case "Organize": return "整理"
        case "Status": return "状态"
        case "Trends": return "趋势"
        case "Accounts": return "账户"
        case "Money", "Finance": return "财务"
        case "Music": return "音乐"
        case "Work", "Deep Work": return "工作"
        case "Plan": return "计划"
        case "Current": return "当前"
        case "Recent": return "最近"
        case "Other Spaces", "All Spaces": return "其他空间"
        default: return title
        }
    }

    private func isCapsuleSelected(index: Int, item: KenosAppModel.DomainDockItem) -> Bool {
        if spacesShelfOpen { return false }
        if model.shellMode == .domain {
            return model.domainDockSlot == index && !model.showDomainMoreSheet
        }
        return model.selectedTab == item.kenosTab
    }

    /// Prefer `.fill` when selected — same weight, clearer selection without scale jump.
    private func dockSymbol(_ name: String, selected: Bool) -> String {
        guard selected else { return name }
        if name.hasSuffix(".fill") { return name }
        switch name {
        case "sun.max",
             "tray",
             "checklist",
             "calendar",
             "house",
             "magnifyingglass",
             "heart.text.square",
             "building.columns",
             "archivebox",
             "square.grid.2x2",
             "list.bullet.rectangle",
             "bubble.left.and.bubble.right",
             "music.note.list":
            return "\(name).fill"
        default:
            return name
        }
    }
}

#endif
