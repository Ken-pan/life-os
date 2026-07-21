import SwiftUI
import KenosClient
import KenosDesign

#if os(iOS)

/// Avoid clipping when shelf is closed — radius-0 clipShape letterboxes safe areas.
struct DomainShelfClip: ViewModifier {
    let cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        if cornerRadius > 0.5 {
            content.clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        } else {
            content
        }
    }
}

/// Domain Mode — full-bleed web content + floating Liquid Glass chrome.
struct KenosDomainModeShell: View {
    @ObservedObject var model: KenosAppModel
    /// Dual-layer keep-alive: false while Kenos Mode is foreground.
    var isActive: Bool = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var webCanGoBack = false
    @State private var loadProgress: Double = 0
    @State private var dragOffset: CGFloat = 0

    private var atDomainRoot: Bool { !webCanGoBack }
    private var shelfPullProgress: CGFloat {
        min(1, max(0, dragOffset / 220))
    }

    /// Interactive edge-pan preview progress (committed open uses `showSpaceShelf` + transitions).
    private var shelfDragProgress: CGFloat {
        model.showSpaceShelf ? 0 : shelfPullProgress
    }

    private var shelfAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion)
    }

    private var isDraggingShelf: Bool {
        !model.showSpaceShelf && dragOffset > 0.5
    }

    /// Web Focus / Summary / session / Home organize-go — hide Domain dock (immersive).
    /// Covers Fitness `/day/*/focus|summary`, `/session` alias, Kenos `/focus`,
    /// Home `/tidy/go` (organize focus). RoomPlan/AR live in HomeScan companion
    /// (full-screen outside Kenos chrome).
    private var isWebFocusSurface: Bool {
        Self.isImmersiveWebPath(model.continuityURL?.path ?? "")
    }

    private static func isImmersiveWebPath(_ raw: String) -> Bool {
        let path = raw.lowercased()
        if path == "/session" || path == "/focus" { return true }
        if path == "/tidy/go" || path.hasSuffix("/tidy/go") { return true }
        if path.hasSuffix("/focus") || path.hasSuffix("/summary") { return true }
        return false
    }

    var body: some View {
        ZStack(alignment: .leading) {
            // 1) Web only — never host the dock here (WKWebView steals hits).
            domainWebCanvas
                .scaleEffect(
                    KenosMotion.shelfBackdropScale(
                        reduceMotion: reduceMotion,
                        progress: model.showSpaceShelf ? 1 : shelfPullProgress
                    ),
                    anchor: .center
                )
                .offset(
                    x: model.showSpaceShelf
                        ? KenosMotion.shelfBackdropOffset(reduceMotion: reduceMotion, progress: 1)
                        : (reduceMotion ? 0 : dragOffset * 0.12)
                )
                .modifier(DomainShelfClip(
                    cornerRadius: (model.showSpaceShelf || shelfPullProgress > 0.12)
                        ? KenosMotion.shelfCornerRadius
                        : 0
                ))
                .shadow(
                    color: .black.opacity(
                        0.32 * max(shelfPullProgress, model.showSpaceShelf ? 1 : 0)
                    ),
                    radius: 24,
                    x: 0,
                    y: 8
                )
                // Drag follows the finger; commit open/close uses interruptible spring.
                .animation(isDraggingShelf ? nil : shelfAnimation, value: model.showSpaceShelf)
                .allowsHitTesting(!model.showSpaceShelf && shelfPullProgress < 0.02)

            // 2) Edge pan (domain root only).
            if atDomainRoot && !model.showSpaceShelf && !isWebFocusSurface {
                EdgeShelfPanOverlay(
                    onChanged: { translation in
                        dragOffset = max(0, translation)
                    },
                    onEnded: { translation, predicted in
                        let shouldOpen = translation > 110 || predicted > 180
                        withAnimation(shelfAnimation) {
                            if shouldOpen {
                                model.openSpaceShelf()
                            }
                            dragOffset = 0
                        }
                    }
                )
                .frame(width: 16)
                .frame(maxHeight: .infinity, alignment: .leading)
                .allowsHitTesting(true)
                .accessibilityHidden(true)
                .zIndex(1)
            }

            // 3) Shelf above web — must outrank WKWebView.
            // Committed open uses transitions (interruptible dismiss); edge pan is a live preview.
            if model.showSpaceShelf {
                Color.black.opacity(KenosMotion.shelfDimOpacity)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(shelfAnimation) {
                            model.dismissSpaceShelf()
                        }
                    }
                    .transition(.opacity)
                    .zIndex(2)
                KenosSpaceShelfView(model: model)
                    .frame(width: 300)
                    .transition(self.shelfPanelTransition)
                    .accessibilityIdentifier("kenos.spaceShelf")
                    .zIndex(3)
            } else if shelfDragProgress > 0.02 {
                Color.black.opacity(KenosMotion.shelfDimOpacity * Double(shelfDragProgress))
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .zIndex(2)
                KenosSpaceShelfView(model: model)
                    .frame(width: 300)
                    .offset(x: -300 + 300 * shelfDragProgress)
                    .opacity(reduceMotion ? Double(shelfDragProgress) : 1)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .zIndex(3)
            }

            // 4) Dock above WKWebView (sibling — not inside web ZStack) so Spaces taps work.
            //    When shelf is open, sit under dimmer/shelf so the drawer isn't covered by the bar.
            // Same bottom geometry as Kenos Mode: dock sits above home indicator
            // (+ dockBottomInset). Web canvas alone is edge-to-edge.
            if !isWebFocusSurface {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    if let live = model.liveAccessory, !model.showSpaceShelf {
                        KenosLiveAccessoryBar(accessory: live) {
                            model.activateLiveAccessory(live)
                        }
                        .padding(.horizontal, KenosGlass.dockHorizontalInset)
                        .padding(.bottom, 8)
                    }
                    KenosGlobalDock(model: model)
                        .padding(.horizontal, KenosGlass.dockHorizontalInset)
                        .padding(.bottom, KenosGlass.dockBottomInset)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .zIndex(model.showSpaceShelf || shelfPullProgress > 0.02 ? 1.5 : 4)
                .allowsHitTesting(!(model.showSpaceShelf || shelfPullProgress > 0.02))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(shelfAnimation, value: model.showSpaceShelf)
        .accessibilityIdentifier("kenos.domainMode")
        .onChange(of: isWebFocusSurface) { _, immersive in
            if immersive {
                withAnimation(shelfAnimation) {
                    model.dismissSpaceShelf()
                }
            }
        }
        .sheet(isPresented: $model.showDomainMoreSheet) {
            KenosDomainMoreSheet(model: model)
        }
        .alert(
            "未保存的更改",
            isPresented: $model.showDomainLeaveConfirm
        ) {
            Button("继续编辑", role: .cancel) {
                model.cancelDomainLeave()
            }
            Button("丢弃并离开", role: .destructive) {
                model.confirmDomainLeaveDiscard()
            }
        } message: {
            Text(
                model.domainLeaveSummary.isEmpty
                    ? "切换 Space 会丢失当前编辑。"
                    : "「\(model.domainLeaveSummary)」尚未保存。切换 Space 会丢失这些更改。"
            )
        }
    }

    /// Full-bleed WKWebView only — chrome (dock/shelf) is a sibling above this layer.
    private var domainWebCanvas: some View {
        ZStack {
            Color(red: 0.031, green: 0.035, blue: 0.039)
            if let url = model.continuityURL {
                KenosWebSurfaceView(
                    url: url,
                    stayInApp: true,
                    onCanGoBackChange: { webCanGoBack = $0 },
                    onURLChange: { live in
                        if !KenosWebSurfaceView.sameNavigationTarget(model.continuityURL, live) {
                            model.continuityURL = live
                            model.persistDomainContinuityPublic(live)
                        }
                        model.syncDomainDockSlot(for: live)
                        if Self.isImmersiveWebPath(live.path) {
                            model.dismissSpaceShelf()
                        }
                    },
                    onProgress: { loadProgress = $0 },
                    chrome: isWebFocusSurface ? .none : .domainDock,
                    isActive: isActive
                )
            }

            if isActive, !isWebFocusSurface {
                VStack {
                    KenosLoadProgressBar(
                        progress: loadProgress,
                        accent: model.domainAccent
                    )
                    .padding(.top, 1)
                    Spacer(minLength: 0)
                }
                .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }

    /// HIG: shelf slides with hierarchy; Reduce Motion → opacity-only.
    private var shelfPanelTransition: AnyTransition {
        if reduceMotion {
            return .opacity
        }
        return .asymmetric(
            insertion: .move(edge: .leading).combined(with: .opacity),
            removal: .move(edge: .leading).combined(with: .opacity)
        )
    }
}

/// Domain dock — superseded by `KenosGlobalDock` (Kenos chip + 4-item capsule).
typealias KenosDomainDock = KenosGlobalDock

/// Global app/space switcher — Kenos + full Life OS catalog (not recent-only).
///
/// Visual language: Linear / Slack / Things — calm surface, typography-led rows,
/// accent only for identity + selection. Cards are not the unit; rows are.
struct KenosSpaceShelfView: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let panelWidth: CGFloat = 300

    private var kenosCard: KenosAppModel.SpaceShelfCard? {
        model.spaceShelfCards.first(where: \.isKenos)
    }

    private var pinnedDomainCards: [KenosAppModel.SpaceShelfCard] {
        let byId = Dictionary(uniqueKeysWithValues: model.spaceShelfCards.map { ($0.id, $0) })
        return model.pinnedSpaceIds.compactMap { id -> KenosAppModel.SpaceShelfCard? in
            guard let card = byId[id], !card.isKenos else { return nil }
            return card
        }
    }

    private var otherDomainCards: [KenosAppModel.SpaceShelfCard] {
        let pinned = Set(model.pinnedSpaceIds)
        return model.spaceShelfCards.filter { !$0.isKenos && !pinned.contains($0.id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 18)
                .padding(.top, KenosGlass.chromeTopInset)
                .padding(.bottom, 14)

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    if let kenosCard {
                        VStack(alignment: .leading, spacing: 6) {
                            sectionLabel("System")
                            shelfRow(kenosCard)
                        }
                    }

                    if !pinnedDomainCards.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            sectionLabel("Pinned")
                            VStack(spacing: 2) {
                                ForEach(pinnedDomainCards) { card in
                                    shelfRow(card)
                                }
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        sectionLabel(pinnedDomainCards.isEmpty ? "Spaces" : "All Spaces")
                        VStack(spacing: 2) {
                            ForEach(otherDomainCards) { card in
                                shelfRow(card)
                            }
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }

            footer
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .padding(.bottom, 12)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .frame(width: panelWidth)
        .background {
            ZStack(alignment: .trailing) {
                Rectangle()
                    .fill(.ultraThickMaterial)
                // Trailing hairline — Stage Manager / sidebar depth cue.
                Rectangle()
                    .fill(Color.primary.opacity(0.08))
                    .frame(width: 0.5)
            }
            .ignoresSafeArea()
        }
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Spaces")
                    .font(.system(.title2, design: .rounded).weight(.semibold))
                    .foregroundStyle(.primary)
                Text(headerSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Button {
                withAnimation(KenosMotion.shelf(reduceMotion: reduceMotion)) {
                    model.dismissSpaceShelf()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Color.primary.opacity(0.08)))
            }
            .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
            .accessibilityLabel("Close Space Shelf")
        }
    }

    private var headerSubtitle: String {
        if model.shellMode == .domain {
            return "Switch · \(model.domainDisplayTitle)"
        }
        return "System home · domains"
    }

    private var footer: some View {
        VStack(spacing: 8) {
            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(height: 0.5)
                .padding(.horizontal, 6)

            Button {
                withAnimation(KenosMotion.shelf(reduceMotion: reduceMotion)) {
                    model.dismissSpaceShelf()
                }
                model.openQuickSwitch()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text("Quick Switch")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.primary.opacity(0.05))
                )
            }
            .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
            .accessibilityIdentifier("kenos.spaceShelf.quickSwitch")
            .accessibilityHint("Search Spaces and recent objects")
        }
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption2.weight(.semibold))
            .tracking(0.6)
            .foregroundStyle(.tertiary)
            .padding(.horizontal, 10)
            .padding(.bottom, 2)
            .accessibilityAddTraits(.isHeader)
    }

    private func shelfRow(_ card: KenosAppModel.SpaceShelfCard) -> some View {
        let accent = KenosAppModel.accentColor(for: card.id)
        let isPinned = !card.isKenos && model.pinnedSpaceIds.contains(card.id)

        return Button {
            withAnimation(KenosMotion.shelf(reduceMotion: reduceMotion)) {
                model.openShelfCard(card)
            }
        } label: {
            shelfRowLabel(card: card, accent: accent, isPinned: isPinned)
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        .contextMenu {
            if !card.isKenos {
                Button {
                    model.togglePinnedSpace(id: card.id)
                } label: {
                    Label(
                        isPinned ? "Unpin" : "Pin",
                        systemImage: isPinned ? "star.slash" : "star"
                    )
                }
            }
        }
        .accessibilityIdentifier("kenos.spaceShelf.card.\(card.id)")
        .accessibilityLabel(accessibilityLabel(for: card, isPinned: isPinned))
        .accessibilityAddTraits(card.isCurrent ? [.isSelected] : [])
        .accessibilityHint(card.isCurrent ? "Current Space" : "Opens \(card.title)")
    }

    @ViewBuilder
    private func shelfRowLabel(
        card: KenosAppModel.SpaceShelfCard,
        accent: Color,
        isPinned: Bool
    ) -> some View {
        HStack(alignment: .center, spacing: 12) {
            shelfIcon(card: card, accent: accent)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(card.title)
                        .font(.body.weight(card.isCurrent ? .semibold : .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    if isPinned {
                        Image(systemName: "star.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.tertiary)
                            .accessibilityHidden(true)
                    }
                }
                Text(card.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            shelfTrailing(card: card, accent: accent)
        }
        .padding(.leading, 10)
        .padding(.trailing, 12)
        .padding(.vertical, 9)
        .frame(minHeight: 52)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(card.isCurrent ? accent.opacity(0.12) : Color.clear)
        }
        .overlay(alignment: .leading) {
            if card.isCurrent {
                Capsule(style: .continuous)
                    .fill(accent)
                    .frame(width: 3, height: 22)
                    .padding(.leading, 3)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func shelfIcon(card: KenosAppModel.SpaceShelfCard, accent: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(accent.opacity(card.isCurrent ? 0.28 : 0.16))
                .overlay {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .strokeBorder(accent.opacity(card.isCurrent ? 0.35 : 0.12), lineWidth: 1)
                }
            Image(systemName: card.systemImage)
                .font(.system(size: 15, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(accent)
        }
        .frame(width: 38, height: 38)
    }

    @ViewBuilder
    private func shelfTrailing(card: KenosAppModel.SpaceShelfCard, accent: Color) -> some View {
        if let relative = card.relativeTime {
            if card.isCurrent {
                Text(relative)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(accent.opacity(0.9))
                    .lineLimit(1)
            } else {
                Text(relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        } else if card.isCurrent {
            Circle()
                .fill(accent)
                .frame(width: 7, height: 7)
                .accessibilityHidden(true)
        }
    }

    private func accessibilityLabel(
        for card: KenosAppModel.SpaceShelfCard,
        isPinned: Bool
    ) -> String {
        var parts = [card.title, card.subtitle]
        if let relative = card.relativeTime { parts.append(relative) }
        if isPinned { parts.append("Pinned") }
        if card.isCurrent { parts.append("Current") }
        return parts.joined(separator: ", ")
    }
}

/// Narrow left-edge pan that only fires when parent enables it (domain root).
struct EdgeShelfPanOverlay: UIViewRepresentable {
    var onChanged: (CGFloat) -> Void
    var onEnded: (CGFloat, CGFloat) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let pan = UIScreenEdgePanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handle(_:))
        )
        pan.edges = .left
        view.addGestureRecognizer(pan)
        context.coordinator.onChanged = onChanged
        context.coordinator.onEnded = onEnded
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onChanged = onChanged
        context.coordinator.onEnded = onEnded
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject {
        var onChanged: ((CGFloat) -> Void)?
        var onEnded: ((CGFloat, CGFloat) -> Void)?

        @objc func handle(_ gesture: UIScreenEdgePanGestureRecognizer) {
            let t = gesture.translation(in: gesture.view).x
            let v = gesture.velocity(in: gesture.view).x
            switch gesture.state {
            case .changed:
                onChanged?(t)
            case .ended, .cancelled:
                onEnded?(t, v)
            default:
                break
            }
        }
    }
}

#endif
