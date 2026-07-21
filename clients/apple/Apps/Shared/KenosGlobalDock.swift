import SwiftUI
import KenosDesign

#if os(iOS)

/// Global dock closer to Apple Music Tab Bar:
/// full-width bar · Spaces + destinations · **vertical rounded rect around icon+label**
/// · accent-tinted icon+label from `KenosAppModel.dockSelectionAccent`.
///
/// Critical anti-morph rules:
/// 1. Outer bar = **material only** (no `glassEffect` / interactive glass).
/// 2. Selection fill = plain `RoundedRectangle` — **never** `matchedGeometryEffect`
///    (that morphs back into an icon-only squircle).
/// 3. Plain tap control — no `Button` glass chrome.
struct KenosGlobalDock: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .caption2) private var labelSize: CGFloat = 10
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 22

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
        return "k:\(model.selectedTab.rawValue):\(model.showSettingsSheet)"
    }

    var body: some View {
        HStack(spacing: 0) {
            tabButton(
                systemImage: "square.grid.2x2.fill",
                title: "Spaces",
                selected: spacesChipSelected,
                action: {
                    withAnimation(selectionAnimation) {
                        model.activateSpacesDockButton()
                    }
                }
            )
            .accessibilityIdentifier("kenos.dock.spaces")
            .accessibilityHint("Opens Space Shelf to switch Spaces.")

            ForEach(Array(capsuleItems.enumerated()), id: \.offset) { index, item in
                capsuleButton(index: index, item: item)
            }
        }
        .padding(.horizontal, 6)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity)
        .background {
            tabBarMaterial
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(
            model.shellMode == .domain ? "kenos.domainDock" : "kenos.globalDock"
        )
        .sensoryFeedback(.selection, trigger: selectionHapticToken)
    }

    /// Material-only bar — never `glassEffect` / interactive glass (icon-only morph).
    private var tabBarMaterial: some View {
        Capsule(style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                Capsule(style: .continuous)
                    .stroke(Color.white.opacity(0.14), lineWidth: 0.5)
            }
    }

    @ViewBuilder
    private func capsuleButton(index: Int, item: KenosAppModel.DomainDockItem) -> some View {
        let selected = isCapsuleSelected(index: index, item: item)
        tabButton(
            systemImage: item.systemImage,
            title: item.title,
            selected: selected,
            action: {
                withAnimation(selectionAnimation) {
                    if model.shellMode == .domain {
                        model.selectDomainDockSlot(index)
                    } else if item.opensSettings {
                        model.presentSettings()
                    } else if let tab = item.kenosTab {
                        model.selectKenosDockTab(tab)
                    }
                }
            }
        )
        .accessibilityIdentifier("kenos.dock.capsule.\(index)")
    }

    private func isCapsuleSelected(index: Int, item: KenosAppModel.DomainDockItem) -> Bool {
        if model.showSpaceShelf { return false }
        if model.shellMode == .domain {
            if item.opensMore { return model.showDomainMoreSheet }
            return model.domainDockSlot == index && !model.showDomainMoreSheet
        }
        if item.opensSettings {
            return model.showSettingsSheet
        }
        return model.selectedTab == item.kenosTab
    }

    private func tabButton(
        systemImage: String,
        title: String,
        selected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        DockTabControl(
            systemImage: systemImage,
            title: title,
            selected: selected,
            selectionTint: selectionTint,
            labelSize: labelSize,
            iconSize: iconSize,
            reduceMotion: reduceMotion,
            action: action
        )
    }
}

/// Plain tap control — no `Button` / glass morph / matchedGeometry morph.
private struct DockTabControl: View {
    let systemImage: String
    let title: String
    let selected: Bool
    let selectionTint: Color
    let labelSize: CGFloat
    let iconSize: CGFloat
    let reduceMotion: Bool
    let action: () -> Void

    @GestureState private var isPressed = false

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: systemImage)
                .font(.system(size: iconSize, weight: selected ? .semibold : .regular))
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(selected ? selectionTint : Color.secondary)

            Text(title)
                .font(.system(size: labelSize, weight: selected ? .semibold : .medium))
                .foregroundStyle(selected ? selectionTint : Color.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(.horizontal, 9)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .frame(minHeight: 54)
        .background {
            if selected {
                // Static fill only — do NOT attach matchedGeometryEffect.
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.black.opacity(0.82))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(selectionTint.opacity(0.28), lineWidth: 1)
                    }
            }
        }
        .scaleEffect(KenosMotion.pressScale(reduceMotion: reduceMotion, pressed: isPressed))
        .opacity(KenosMotion.pressOpacity(reduceMotion: reduceMotion, pressed: isPressed))
        .animation(KenosMotion.press(reduceMotion: reduceMotion), value: isPressed)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .updating($isPressed) { _, state, _ in
                    state = true
                }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

#endif
