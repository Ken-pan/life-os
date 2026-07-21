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
    @State private var openDragX: CGFloat = 0
    @State private var dismissDragX: CGFloat = 0
    @State private var shelfProgress: CGFloat = 0
    @State private var domainUnreachable = false
    @State private var domainDidPaint = false
    @State private var domainProbeError: String?
    @State private var domainSurfaceEpoch = 0

    /// WK back-forward available — system edge gesture owns the leading edge.
    private var webCanNavigateBack: Bool { webCanGoBack }

    /// Primary dock tab (Tasks / Today / …) — only place Shelf edge-open is offered.
    private var atDomainHome: Bool {
        guard let url = model.continuityURL else { return true }
        return KenosDomainRegistry.isDomainHomePath(url.path, domainId: model.domainSpaceId)
    }

    /// Navigation v2: Back beats Shelf; Shelf only at true domain home with empty back stack.
    private var allowsShelfEdgeOpen: Bool {
        atDomainHome && !webCanNavigateBack && !model.showSpaceShelf && !hideDomainDock
    }

    /// Peer tab / deep path with no WK history — full leading edge pops to domain home.
    private var allowsRouterBackEdge: Bool {
        !atDomainHome && !webCanNavigateBack && !model.showSpaceShelf && !hideDomainDock
    }

    private var openAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: false)
    }

    private var closeAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: true)
    }

    private var isDraggingShelf: Bool {
        (!model.showSpaceShelf && openDragX > 0.5)
            || (model.showSpaceShelf && dismissDragX < -0.5)
    }

    /// Web Focus / Summary / session / Home organize-go — hide Domain dock (immersive).
    /// Covers Fitness `/day/*/focus|summary`, `/session` alias, Kenos `/focus`,
    /// Home `/tidy/go` (organize focus). RoomPlan/AR live in HomeScan companion
    /// (full-screen outside Kenos chrome).
    private var isWebFocusSurface: Bool {
        Self.isImmersiveWebPath(model.continuityURL?.path ?? "")
    }

    /// Plan overlays publish liveState — hide floating dock so sheets/drawers aren't covered.
    /// `editing` = task editor · `drawer` = lists menu · `sheet` = schedule popovers.
    /// Also scan / capture / immersive / compose from Navigation Manifest.
    private var isWebOverlaySurface: Bool {
        switch model.domainWebLiveState.lowercased() {
        case "editing", "drawer", "sheet", "capturing", "scanning", "immersive", "compose":
            return true
        default:
            return false
        }
    }

    private var hideDomainDock: Bool {
        isWebFocusSurface || isWebOverlaySurface
    }

    /// Live Accessory sits above the dock — shift the edge-open band up with it.
    private var edgeOpenLiveAccessoryChrome: CGFloat {
        guard model.liveAccessory != nil else { return 0 }
        return model.liveAccessoryMinimized ? 52 : 80
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
                    KenosSpaceShelfChrome.backdropScale(
                        reduceMotion: reduceMotion,
                        progress: shelfProgress
                    ),
                    anchor: .center
                )
                .offset(
                    x: isDraggingShelf && !model.showSpaceShelf
                        ? KenosShelfGesture.backdropParallax(
                            translationX: openDragX,
                            reduceMotion: reduceMotion
                        )
                        : KenosSpaceShelfChrome.backdropOffset(
                            reduceMotion: reduceMotion,
                            progress: shelfProgress
                        )
                )
                .modifier(DomainShelfClip(
                    cornerRadius: KenosSpaceShelfChrome.clipRadius(progress: shelfProgress)
                ))
                .shadow(
                    color: .black.opacity(0.32 * Double(min(1, shelfProgress))),
                    radius: 24,
                    x: 0,
                    y: 8
                )
                // Drag follows the finger; commit open/close uses interruptible spring.
                .animation(isDraggingShelf ? nil : openAnimation, value: shelfProgress)
                .allowsHitTesting(!model.showSpaceShelf && shelfProgress < 0.02)

            // 2a) Edge pan — Shelf only at domain home (dock-adjacent band).
            // 2b) Else if not home and WK has no history → full-edge router Back to home.
            //     When WK canGoBack, overlays stay off so WebKit owns the edge.
            KenosShelfEdgeOpenOverlay(
                enabled: allowsShelfEdgeOpen,
                additionalBottomChrome: edgeOpenLiveAccessoryChrome,
                onChanged: { translation in
                    openDragX = translation
                },
                onEnded: { translation, velocity in
                    let shouldOpen = KenosShelfGesture.shouldCommitOpen(
                        translationX: translation,
                        velocityX: velocity
                    )
                    if shouldOpen {
                        withAnimation(openAnimation) {
                            model.openSpaceShelf()
                        }
                    } else {
                        withAnimation(closeAnimation) {
                            openDragX = 0
                            shelfProgress = 0
                        }
                    }
                }
            )
            .zIndex(1)

            KenosDomainEdgeBackOverlay(
                enabled: allowsRouterBackEdge,
                onBack: {
                    model.performDomainRouterBack()
                }
            )
            .zIndex(1)

            // 3) Shelf above web — must outrank WKWebView.
            KenosSpaceShelfChrome(
                model: model,
                dimOpacity: KenosMotion.shelfDimOpacity,
                openDragX: $openDragX,
                dismissDragX: $dismissDragX,
                progress: $shelfProgress
            )
            .zIndex(2)

            // 4) Dock above WKWebView (sibling — not inside web ZStack) so Spaces taps work.
            //    When shelf is open, sit under dimmer/shelf so the drawer isn't covered by the bar.
            // Same bottom geometry as Kenos Mode: dock sits above home indicator
            // (+ dockBottomInset). Web canvas alone is edge-to-edge.
            if !hideDomainDock {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    if let live = model.liveAccessory, shelfProgress < 0.02 {
                        KenosLiveAccessoryBar(
                            accessory: live,
                            minimized: model.liveAccessoryMinimized
                        ) {
                            model.activateLiveAccessory(live)
                        }
                        .padding(.horizontal, KenosGlass.dockHorizontalInset)
                        .padding(.bottom, model.liveAccessoryMinimized ? 4 : 8)
                    }
                    KenosGlobalDock(model: model)
                        .padding(.leading, KenosGlass.dockLeadingInset)
                        .padding(.trailing, KenosGlass.dockTrailingInset)
                        .padding(.bottom, KenosGlass.dockBottomInset)
                }
                // Shelf open → dock yields chrome (same as Kenos Mode).
                .opacity(shelfProgress > 0.02 ? 0 : 1)
                // No Live Accessory layout spring — peer dock swaps stay stable (HIG).
                .animation(openAnimation, value: shelfProgress)
                .animation(KenosMotion.page(reduceMotion: reduceMotion), value: hideDomainDock)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .zIndex(shelfProgress > 0.02 ? 1.5 : 4)
                .allowsHitTesting(shelfProgress < 0.02)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(KenosMotion.page(reduceMotion: reduceMotion), value: hideDomainDock)
        .accessibilityIdentifier("kenos.domainMode")
        .onAppear { model.syncLiveAccessoryMinimizeState() }
        .onChange(of: model.liveAccessory?.id) { _, _ in
            model.syncLiveAccessoryMinimizeState()
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosLiveAccessoryMinimize)) { note in
            let minimized = (note.userInfo?["minimized"] as? Bool) ?? false
            model.setLiveAccessoryMinimized(minimized)
        }
        .onChange(of: hideDomainDock) { _, hidden in
            if hidden {
                withAnimation(closeAnimation) {
                    model.dismissSpaceShelf()
                    model.showDomainMoreSheet = false
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
            if domainUnreachable {
                ContentUnavailableView {
                    Label("\(model.domainDisplayTitle) unreachable", systemImage: "wifi.exclamationmark")
                } description: {
                    VStack(spacing: 8) {
                        Text(
                            KenosDailyBetaConfig.isLanDependentOrigin
                                ? "Mac companion offline. Open Production (cellular) or start Daily Beta on the same Wi‑Fi."
                                : "This Space origin did not respond. Check network, then Retry."
                        )
                        if let domainProbeError, !domainProbeError.isEmpty {
                            Text(domainProbeError).font(.caption2)
                        }
                    }
                } actions: {
                    if KenosDailyBetaConfig.isConfiguredOriginLanDependent,
                       !KenosDailyBetaConfig.useProductionOverride
                    {
                        Button("Use Production") {
                            domainDidPaint = false
                            domainProbeError = nil
                            domainUnreachable = false
                            if model.rewriteContinuityToProduction(reason: "domain_manual", force: true) {
                                domainSurfaceEpoch &+= 1
                            } else {
                                domainUnreachable = true
                            }
                        }
                        .accessibilityIdentifier("kenos.domain.useProduction")
                    }
                    Button("Retry") {
                        if KenosDailyBetaConfig.useProductionOverride,
                           KenosDailyBetaConfig.isConfiguredOriginLanDependent
                        {
                            KenosDailyBetaConfig.retryLanOrigin()
                            if let live = model.continuityURL {
                                let id = KenosDomainRegistry.domainId(fromContinuity: live)
                                var path = live.path.isEmpty ? "/" : live.path
                                if let query = live.query, !query.isEmpty { path += "?\(query)" }
                                if let fragment = live.fragment, !fragment.isEmpty { path += "#\(fragment)" }
                                if let lan = KenosDomainRegistry.continuityURL(for: id, path: path) {
                                    model.continuityURL = lan
                                    model.persistDomainContinuityPublic(lan)
                                }
                            }
                        }
                        if let url = model.continuityURL {
                            KenosWebRuntime.domainReachableKeys.remove(
                                KenosWebRuntime.originKey(for: url)
                            )
                        }
                        domainDidPaint = false
                        domainProbeError = nil
                        domainUnreachable = false
                        domainSurfaceEpoch &+= 1
                    }
                    Button("Back to Kenos") {
                        model.dismissContinuity()
                    }
                }
            } else if let url = model.continuityURL {
                KenosWebSurfaceView(
                    url: url,
                    onTitle: { _ in domainDidPaint = true },
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
                    // Keep status top pad while editing; only Focus/Summary go fully immersive.
                    chrome: isWebFocusSurface ? .none : .domainDock,
                    accessoryBottomPadPx: model.liveAccessoryWebBottomExtraPx,
                    isActive: isActive
                )
                .id(domainSurfaceEpoch)
            }

            // Keep load hairline while editing (dock hidden); hide only on true immersive.
            if isActive, !isWebFocusSurface, !domainUnreachable {
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
        .task(id: model.continuityURL?.absoluteString ?? "") {
            domainDidPaint = false
            domainUnreachable = false
            domainProbeError = nil
            await probeDomainInBackground()
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosDailyBetaOriginDidChange)) { _ in
            domainDidPaint = false
            domainUnreachable = false
            domainProbeError = nil
            domainSurfaceEpoch &+= 1
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosWebAuthDidClear)) { _ in
            domainDidPaint = false
            domainSurfaceEpoch &+= 1
        }
    }

    /// Soft health check for Domain Continuity — never steals a canvas that already painted.
    private func probeDomainInBackground() async {
        guard let url = model.continuityURL else { return }
        let key = KenosWebRuntime.originKey(for: url)
        if KenosWebRuntime.domainReachableKeys.contains(key) { return }
        var origin = url
        if var c = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            c.path = ""
            c.query = nil
            c.fragment = nil
            if let o = c.url { origin = o }
        }
        KenosLog.debug("domain health probe", category: .network, metadata: [
            "host": origin.host ?? "",
            "space": model.domainSpaceId,
        ])
        var req = URLRequest(url: origin.appending(path: "/__health"))
        req.timeoutInterval = 3
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            // Some companions lack /__health — treat any HTTP response as reachable.
            let ok = (200..<500).contains(code) || code == 0
            if ok {
                await MainActor.run {
                    KenosWebRuntime.domainReachableKeys.insert(key)
                }
            } else {
                await markDomainUnreachableOrFallback(error: "health status \(code)")
            }
        } catch {
            // Fallback: probe origin root (companions without /__health).
            var rootReq = URLRequest(url: origin)
            rootReq.timeoutInterval = 3
            do {
                let (_, resp) = try await URLSession.shared.data(for: rootReq)
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if (200..<500).contains(code) || code == 0 {
                    await MainActor.run {
                        KenosWebRuntime.domainReachableKeys.insert(key)
                    }
                } else {
                    await markDomainUnreachableOrFallback(error: "root status \(code)")
                }
            } catch {
                KenosLog.warning("domain health probe failed", category: .network, metadata: [
                    "host": origin.host ?? "",
                    "error": error.localizedDescription,
                ])
                await markDomainUnreachableOrFallback(error: error.localizedDescription)
            }
        }
    }

    private func markDomainUnreachableOrFallback(error: String) async {
        try? await Task.sleep(nanoseconds: 900_000_000)
        let painted = await MainActor.run { domainDidPaint }
        guard !painted else { return }

        await MainActor.run { domainProbeError = error }

        // Dead production Continuity → bounce shell + Continuity back to LAN ports.
        let recoverLan = await MainActor.run {
            KenosDailyBetaConfig.useProductionOverride
                && KenosDailyBetaConfig.isConfiguredOriginLanDependent
        }
        if recoverLan {
            await MainActor.run {
                KenosDailyBetaConfig.retryLanOrigin()
                if let live = model.continuityURL {
                    let id = KenosDomainRegistry.domainId(fromContinuity: live)
                    var path = live.path.isEmpty ? "/" : live.path
                    if let query = live.query, !query.isEmpty { path += "?\(query)" }
                    if let fragment = live.fragment, !fragment.isEmpty { path += "#\(fragment)" }
                    if let lan = KenosDomainRegistry.continuityURL(for: id, path: path) {
                        model.continuityURL = lan
                        model.persistDomainContinuityPublic(lan)
                    }
                }
                domainUnreachable = false
                domainProbeError = nil
                domainSurfaceEpoch &+= 1
            }
            return
        }

        // Auto production rewrite only when public shell answers.
        if await MainActor.run(body: { KenosDailyBetaConfig.isLanDependentOrigin }),
           await KenosDailyBetaConfig.activateProductionFallbackIfReachable(reason: "domain_probe_failed")
        {
            await MainActor.run {
                if let live = model.continuityURL,
                   let next = KenosDomainRegistry.rewriteToProduction(live)
                {
                    model.continuityURL = next
                    model.persistDomainContinuityPublic(next)
                    model.syncDomainDockSlot(for: next)
                    domainUnreachable = false
                    domainProbeError = nil
                    domainSurfaceEpoch &+= 1
                    return
                }
                domainUnreachable = true
            }
            return
        }

        await MainActor.run { domainUnreachable = true }
    }

}

/// Domain dock — superseded by `KenosGlobalDock` (Spaces chip + 4-item capsule).
typealias KenosDomainDock = KenosGlobalDock

/// Global app/space switcher — Kenos + full Life OS catalog (not recent-only).
///
/// Visual language: Linear / Slack / Things — calm surface, typography-led rows,
/// accent only on the current Space. Inactive icons stay muted (no rainbow list).
struct KenosSpaceShelfView: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Interactive swipe-to-dismiss — owned by `KenosSpaceShelfChrome` so dimmer tracks.
    @Binding var dismissDragX: CGFloat

    /// Leave a strip of dimmed content visible — hierarchy cue (Telegram / Slack).
    private var panelWidth: CGFloat { KenosShelfGesture.panelWidth }

    private var cardsById: [String: KenosAppModel.SpaceShelfCard] {
        Dictionary(uniqueKeysWithValues: model.spaceShelfCards.map { ($0.id, $0) })
    }

    private var kenosCard: KenosAppModel.SpaceShelfCard? {
        model.spaceShelfCards.first(where: \.isKenos)
    }

    private var pinnedDomainCards: [KenosAppModel.SpaceShelfCard] {
        model.pinnedSpaceIds.compactMap { id -> KenosAppModel.SpaceShelfCard? in
            guard let card = cardsById[id], !card.isKenos else { return nil }
            return card
        }
    }

    /// Running Continuity (Training / Focus / Music / tidy) — IA Active section.
    private var activeDomainCards: [KenosAppModel.SpaceShelfCard] {
        let active = Set(model.activeShelfSpaceIds.filter { $0 != "kenos" })
        return model.spaceShelfCards.filter { !$0.isKenos && active.contains($0.id) }
    }

    /// Up to 3 recent domains (excludes current + pinned + Active) — Arc / Slack pattern.
    private var recentDomainCards: [KenosAppModel.SpaceShelfCard] {
        let pinned = Set(model.pinnedSpaceIds)
        let active = Set(model.activeShelfSpaceIds)
        var seen = Set<String>()
        var out: [KenosAppModel.SpaceShelfCard] = []
        for id in model.recentSpaceIds {
            guard let card = cardsById[id], !card.isKenos, !card.isCurrent else { continue }
            guard !pinned.contains(card.id), !active.contains(card.id), !seen.contains(card.id) else { continue }
            seen.insert(card.id)
            out.append(card)
            if out.count == 3 { break }
        }
        return out
    }

    private var otherDomainCards: [KenosAppModel.SpaceShelfCard] {
        let pinned = Set(model.pinnedSpaceIds)
        return model.spaceShelfCards.filter { !$0.isKenos && !pinned.contains($0.id) }
    }

    private var openAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: false)
    }

    private var closeAnimation: Animation {
        KenosMotion.shelf(reduceMotion: reduceMotion, closing: true)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 16)
                .padding(.top, KenosGlass.chromeTopInset)
                .padding(.bottom, 10)

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    if let kenosCard {
                        // "System" — avoids colliding with the Home domain.
                        shelfSection("System") {
                            shelfCard(kenosCard, featured: true)
                        }
                    }

                    if !activeDomainCards.isEmpty {
                        shelfSection("Active") {
                            shelfCardGrid(activeDomainCards)
                        }
                    }

                    if !recentDomainCards.isEmpty {
                        shelfSection("Recent") {
                            shelfCardGrid(recentDomainCards)
                        }
                    }

                    if !pinnedDomainCards.isEmpty {
                        shelfSection("Pinned") {
                            shelfCardGrid(pinnedDomainCards)
                        }
                    }

                    shelfSection("All Spaces") {
                        shelfCardGrid(otherDomainCards)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }

            footer
                .padding(.horizontal, 10)
                .padding(.top, 6)
                .padding(.bottom, 10)
                .safeAreaPadding(.bottom, 4)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .frame(width: panelWidth)
        .background {
            ZStack(alignment: .trailing) {
                Rectangle()
                    .fill(.ultraThickMaterial)
                Rectangle()
                    .fill(Color.primary.opacity(0.08))
                    .frame(width: 0.5)
            }
            .ignoresSafeArea()
        }
        // Position is owned by `KenosSpaceShelfChrome` (revealProgress).
        // Simultaneous drag so ScrollView vertical pans still win.
        .simultaneousGesture(dismissDragGesture)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Close") {
            withAnimation(closeAnimation) {
                model.dismissSpaceShelf()
            }
        }
    }

    /// Leftward horizontal drag closes the shelf; vertical scrolls stay with ScrollView.
    private var dismissDragGesture: some Gesture {
        DragGesture(minimumDistance: 18, coordinateSpace: .local)
            .onChanged { value in
                guard !reduceMotion else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                // Slightly prefer horizontal so a deliberate close isn't stolen by scroll.
                guard abs(dx) > abs(dy) * 1.05, dx < 0 else {
                    if dismissDragX != 0 { dismissDragX = 0 }
                    return
                }
                dismissDragX = KenosShelfGesture.cappedDismissOffset(dx)
            }
            .onEnded { value in
                let dx = value.translation.width
                let predicted = value.predictedEndTranslation.width
                let velocity = predicted - dx
                let shouldClose = KenosShelfGesture.shouldCommitClose(
                    translationX: dx,
                    velocityX: velocity,
                    predictedTranslationX: predicted
                )
                if shouldClose {
                    withAnimation(closeAnimation) {
                        model.dismissSpaceShelf()
                    }
                } else {
                    withAnimation(openAnimation) {
                        dismissDragX = 0
                    }
                }
            }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Spaces")
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .foregroundStyle(.primary)
                Text(headerSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Button {
                withAnimation(KenosMotion.shelf(reduceMotion: reduceMotion, closing: true)) {
                    model.dismissSpaceShelf()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 28, minHeight: 28)
                    .background(Circle().fill(Color.primary.opacity(0.08)))
            }
            .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
            .accessibilityLabel("Close Space Shelf")
        }
    }

    private var headerSubtitle: String {
        if model.shellMode == .domain {
            return "Now in \(model.domainDisplayTitle)"
        }
        return "Jump to a domain"
    }

    private var footer: some View {
        VStack(spacing: 8) {
            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(height: 0.5)
                .padding(.horizontal, 6)

            Button {
                withAnimation(KenosMotion.shelf(reduceMotion: reduceMotion, closing: true)) {
                    model.dismissSpaceShelf()
                }
                model.openQuickSwitch()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("Quick Switch")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    Spacer(minLength: 0)
                    Text("Search")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.ultraThinMaterial)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                )
            }
            .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
            .accessibilityIdentifier("kenos.spaceShelf.quickSwitch")
            .accessibilityHint("Search Spaces and recent objects")
        }
    }

    private var cardColumns: [GridItem] {
        [
            GridItem(.flexible(), spacing: 8),
            GridItem(.flexible(), spacing: 8),
        ]
    }

    @ViewBuilder
    private func shelfSection<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(0.7)
                .foregroundStyle(.tertiary)
                .padding(.horizontal, 4)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func shelfCardGrid(_ cards: [KenosAppModel.SpaceShelfCard]) -> some View {
        LazyVGrid(columns: cardColumns, spacing: 8) {
            ForEach(cards) { card in
                shelfCard(card)
            }
        }
    }

    private func shelfCard(
        _ card: KenosAppModel.SpaceShelfCard,
        featured: Bool = false
    ) -> some View {
        let accent = KenosAppModel.accentColor(for: card.id)
        let isPinned = !card.isKenos && model.pinnedSpaceIds.contains(card.id)
        let showDetail = shouldShowSubtitle(card)

        return Button {
            withAnimation(KenosMotion.shelf(reduceMotion: reduceMotion)) {
                model.openShelfCard(card)
            }
        } label: {
            if featured {
                featuredCardLabel(
                    card: card,
                    accent: accent,
                    isPinned: isPinned,
                    showDetail: showDetail
                )
            } else {
                gridCardLabel(
                    card: card,
                    accent: accent,
                    isPinned: isPinned,
                    showDetail: showDetail
                )
            }
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

    /// Resume / current context earns a second line; static catalog blurbs stay out.
    private func shouldShowSubtitle(_ card: KenosAppModel.SpaceShelfCard) -> Bool {
        card.isCurrent || card.relativeTime != nil
    }

    /// Full-width Kenos / System tile — App Library: color on icon; tint only when current.
    @ViewBuilder
    private func featuredCardLabel(
        card: KenosAppModel.SpaceShelfCard,
        accent: Color,
        isPinned: Bool,
        showDetail: Bool
    ) -> some View {
        HStack(alignment: .center, spacing: 12) {
            shelfIcon(card: card, accent: accent, size: 44, cornerRadius: 12)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(card.title)
                        .font(.body.weight(card.isCurrent ? .semibold : .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    if isPinned {
                        Image(systemName: "star.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(accent.opacity(0.7))
                            .accessibilityHidden(true)
                    }
                }
                if showDetail {
                    Text(card.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            shelfTrailing(card: card, accent: accent)
        }
        .padding(.horizontal, card.isCurrent ? 12 : 8)
        .padding(.vertical, card.isCurrent ? 12 : 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if card.isCurrent {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(accent.opacity(0.18))
            }
        }
        .overlay {
            if card.isCurrent {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(accent.opacity(0.32), lineWidth: 1)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// 2-column domain tile — colored icon plate carries identity; idle has no gray card wash.
    @ViewBuilder
    private func gridCardLabel(
        card: KenosAppModel.SpaceShelfCard,
        accent: Color,
        isPinned: Bool,
        showDetail: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 6) {
                shelfIcon(card: card, accent: accent, size: 44, cornerRadius: 12)
                Spacer(minLength: 0)
                if isPinned {
                    Image(systemName: "star.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(accent.opacity(0.7))
                        .accessibilityHidden(true)
                } else if card.isCurrent {
                    Circle()
                        .fill(accent)
                        .frame(width: 7, height: 7)
                        .padding(.top, 4)
                        .accessibilityHidden(true)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(card.title)
                    .font(.subheadline.weight(card.isCurrent ? .semibold : .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                if showDetail, let relative = card.relativeTime {
                    Text(relative)
                        .font(.caption2.weight(card.isCurrent ? .semibold : .regular))
                        .foregroundStyle(card.isCurrent ? accent : .secondary)
                        .lineLimit(1)
                } else if showDetail {
                    Text(card.subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(card.isCurrent ? 10 : 6)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .background {
            if card.isCurrent {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(accent.opacity(0.18))
            }
        }
        .overlay {
            if card.isCurrent {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(accent.opacity(0.32), lineWidth: 1)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// App Library–style icon plate: saturated accent wash + solid glyph (identity, not chrome).
    private func shelfIcon(
        card: KenosAppModel.SpaceShelfCard,
        accent: Color,
        size: CGFloat = 44,
        cornerRadius: CGFloat = 12
    ) -> some View {
        let active = card.isCurrent
        return ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            accent.opacity(active ? 0.38 : 0.28),
                            accent.opacity(active ? 0.26 : 0.18),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Image(systemName: card.systemImage)
                .font(.system(size: size * 0.42, weight: .semibold))
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(accent)
        }
        .frame(width: size, height: size)
        .shadow(color: accent.opacity(active ? 0.22 : 0.12), radius: active ? 6 : 3, y: 1)
    }

    @ViewBuilder
    private func shelfTrailing(card: KenosAppModel.SpaceShelfCard, accent: Color) -> some View {
        if let relative = card.relativeTime {
            Text(relative)
                .font(.caption2.weight(card.isCurrent ? .semibold : .regular))
                .foregroundStyle(card.isCurrent ? accent.opacity(0.95) : Color.secondary.opacity(0.55))
                .lineLimit(1)
        } else if card.isCurrent {
            Circle()
                .fill(accent)
                .frame(width: 6, height: 6)
                .accessibilityHidden(true)
        }
    }

    private func accessibilityLabel(
        for card: KenosAppModel.SpaceShelfCard,
        isPinned: Bool
    ) -> String {
        var parts = [card.title]
        if shouldShowSubtitle(card) { parts.append(card.subtitle) }
        if let relative = card.relativeTime { parts.append(relative) }
        if isPinned { parts.append("Pinned") }
        if card.isCurrent { parts.append("Current") }
        return parts.joined(separator: ", ")
    }
}

/// Kenos + Domain shared host for dock-adjacent Space Shelf edge-open.
/// Full-screen representable; hit-testing claims only the bottom-leading band so
/// mid/upper edge and the Spaces tip stay free (Apple: Back beats custom edge).
struct KenosShelfEdgeOpenOverlay: View {
    var enabled: Bool
    var additionalBottomChrome: CGFloat = 0
    var onChanged: (CGFloat) -> Void
    var onEnded: (CGFloat, CGFloat) -> Void

    var body: some View {
        if enabled {
            EdgeShelfPanOverlay(
                hitPolicy: .dockAdjacent(additionalBottomChrome: additionalBottomChrome),
                onChanged: onChanged,
                onEnded: onEnded
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .allowsHitTesting(true)
            .accessibilityHidden(true)
        }
    }
}

/// Full leading-edge Back when Continuity is off the domain home tab and WK has no history.
struct KenosDomainEdgeBackOverlay: View {
    var enabled: Bool
    var onBack: () -> Void

    var body: some View {
        if enabled {
            EdgeShelfPanOverlay(
                hitPolicy: .fullLeadingStrip,
                onChanged: { _ in },
                onEnded: { translation, velocity in
                    guard KenosShelfGesture.shouldCommitOpen(
                        translationX: translation,
                        velocityX: velocity
                    ) else { return }
                    onBack()
                }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .allowsHitTesting(true)
            .accessibilityHidden(true)
        }
    }
}

/// Leading-edge pan for Space Shelf open / Domain router Back.
/// Combines `UIScreenEdgePan` + a wider strip pan so WKWebView / scroll don't swallow it.
/// Host as full-bleed; `PassthroughEdgeView` claims only the configured hit zone.
struct EdgeShelfPanOverlay: UIViewRepresentable {
    enum HitPolicy: Equatable {
        /// Shelf open — dock-adjacent band only (mid/upper stays free for WK Back).
        case dockAdjacent(additionalBottomChrome: CGFloat)
        /// Router Back to domain home — full-height leading strip.
        case fullLeadingStrip
    }

    /// Hit strip width — wide enough to catch thumbs, narrow enough to avoid scroll steal.
    static var stripWidth: CGFloat { KenosShelfGesture.edgeStripWidth }

    var hitPolicy: HitPolicy = .dockAdjacent(additionalBottomChrome: 0)
    var onChanged: (CGFloat) -> Void
    /// `(translationX, velocityX)` — velocity in points/sec.
    var onEnded: (CGFloat, CGFloat) -> Void

    func makeUIView(context: Context) -> PassthroughEdgeView {
        let view = PassthroughEdgeView()
        view.backgroundColor = .clear
        view.isMultipleTouchEnabled = false
        view.hitPolicy = hitPolicy

        let edge = UIScreenEdgePanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handlePan(_:))
        )
        edge.edges = .left
        edge.delegate = context.coordinator
        edge.cancelsTouchesInView = false
        edge.name = hitPolicy == .fullLeadingStrip ? "kenos.back.edge" : "kenos.shelf.edge"
        view.addGestureRecognizer(edge)

        // Backup strip pan — more reliable when WebKit claims the pure screen-edge recognizer.
        let strip = UIPanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handlePan(_:))
        )
        strip.maximumNumberOfTouches = 1
        strip.delegate = context.coordinator
        strip.cancelsTouchesInView = false
        strip.name = hitPolicy == .fullLeadingStrip ? "kenos.back.strip" : "kenos.shelf.strip"
        view.addGestureRecognizer(strip)

        context.coordinator.onChanged = onChanged
        context.coordinator.onEnded = onEnded
        return view
    }

    func updateUIView(_ uiView: PassthroughEdgeView, context: Context) {
        uiView.hitPolicy = hitPolicy
        context.coordinator.onChanged = onChanged
        context.coordinator.onEnded = onEnded
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// Full-bleed passthrough — hit zone depends on `hitPolicy`.
    final class PassthroughEdgeView: UIView {
        var hitPolicy: HitPolicy = .dockAdjacent(additionalBottomChrome: 0)

        func containsEdgeHit(_ point: CGPoint) -> Bool {
            switch hitPolicy {
            case .dockAdjacent(let additional):
                return KenosShelfGesture.isInEdgeOpenZone(
                    point: point,
                    containerSize: bounds.size,
                    safeAreaBottom: safeAreaInsets.bottom,
                    dockBottomInset: KenosGlass.dockBottomInset,
                    dockRowHeight: KenosGlass.dockRowHeight,
                    additionalBottomChrome: additional
                )
            case .fullLeadingStrip:
                guard bounds.contains(point) else { return false }
                return point.x >= 0 && point.x <= KenosShelfGesture.edgeStripWidth
            }
        }

        override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
            containsEdgeHit(point)
        }

        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
            guard containsEdgeHit(point) else { return nil }
            return self
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onChanged: ((CGFloat) -> Void)?
        var onEnded: ((CGFloat, CGFloat) -> Void)?
        /// Once locked horizontal, ignore vertical competition for this touch.
        private var lockedHorizontal = false

        @objc func handlePan(_ gesture: UIPanGestureRecognizer) {
            let raw = gesture.translation(in: gesture.view).x
            let t = KenosShelfGesture.cappedOpenTranslation(raw)
            let v = gesture.velocity(in: gesture.view).x
            switch gesture.state {
            case .began:
                lockedHorizontal = false
                onChanged?(t)
            case .changed:
                if !lockedHorizontal {
                    let vy = gesture.velocity(in: gesture.view).y
                    if abs(v) > 12, abs(v) >= abs(vy) * 0.9 {
                        lockedHorizontal = true
                    }
                }
                onChanged?(t)
            case .ended, .cancelled, .failed:
                lockedHorizontal = false
                onEnded?(raw, v)
            default:
                break
            }
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let view = gestureRecognizer.view as? PassthroughEdgeView else { return false }
            let loc = gestureRecognizer.location(in: view)
            guard view.containsEdgeHit(loc) else { return false }

            if gestureRecognizer is UIScreenEdgePanGestureRecognizer { return true }
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
            let velocity = pan.velocity(in: view)
            // Prefer horizontal intent; allow slow starts (velocity ~0) inside the strip.
            if abs(velocity.x) + abs(velocity.y) < 10 { return true }
            return abs(velocity.x) >= abs(velocity.y) * 0.7 && velocity.x >= -20
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            // After horizontal lock, stop yielding to vertical scroll pans.
            if lockedHorizontal, !(other is UIScreenEdgePanGestureRecognizer) {
                if other.view is UIScrollView { return false }
                if other is UIPanGestureRecognizer { return false }
            }
            // Compete with WKWebView / UIScrollView early; strip width keeps accidental steals low.
            return true
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            false
        }
    }
}

#endif
