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
    @State private var domainHardUnreachable = false
    @State private var domainSyncPaused = false
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
                    cornerRadius: reduceMotion
                        ? 0
                        : KenosSpaceShelfChrome.clipRadius(progress: shelfProgress)
                ))
                // Soft page depth while Shelf owns the trailing edge shadow.
                .shadow(
                    color: .black.opacity(0.14 * Double(min(1, shelfProgress))),
                    radius: 14,
                    x: -1,
                    y: 6
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
                    guard !reduceMotion else { return }
                    openDragX = translation
                },
                onEnded: { translation, velocity in
                    let shouldOpen = KenosShelfGesture.shouldCommitOpen(
                        translationX: translation,
                        velocityX: velocity
                    )
                    if shouldOpen {
                        // Chrome owns spring via showSpaceShelf onChange.
                        model.openSpaceShelf()
                    } else {
                        withAnimation(KenosMotion.shelfInteractive(reduceMotion: reduceMotion)) {
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
                openDragX: $openDragX,
                dismissDragX: $dismissDragX,
                progress: $shelfProgress
            )
            .zIndex(2)

            // 4) Dock above WKWebView + Shelf (zIndex 5) so Spaces Orb remains the close anchor.
            // Same bottom geometry as Kenos Mode: dock sits above home indicator
            // (+ dockBottomInset). Web canvas alone is edge-to-edge.
            if !hideDomainDock, !model.showSettingsSheet {
                KenosBottomChromeBar(model: model)
                    // Match content: 1:1 while dragging; spring only on settle.
                    .animation(isDraggingShelf ? nil : openAnimation, value: shelfProgress)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .zIndex(shelfProgress > 0.02 ? 5 : 4)
                    .transition(
                        reduceMotion
                            ? .opacity
                            : .move(edge: .bottom).combined(with: .opacity)
                    )
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
                model.dismissSpaceShelf()
                model.showDomainMoreSheet = false
            }
        }
        .sheet(isPresented: $model.showDomainMoreSheet) {
            KenosDomainMoreSheet(model: model)
        }
        .alert(
            KenosOfflineShellPolicy.prefersChinese ? "未保存的更改" : "Unsaved changes",
            isPresented: $model.showDomainLeaveConfirm
        ) {
            Button(
                KenosOfflineShellPolicy.prefersChinese ? "继续编辑" : "Keep editing",
                role: .cancel
            ) {
                model.cancelDomainLeave()
            }
            Button(
                KenosOfflineShellPolicy.prefersChinese ? "丢弃并离开" : "Discard and leave",
                role: .destructive
            ) {
                model.confirmDomainLeaveDiscard()
            }
        } message: {
            Text(domainLeaveAlertMessage)
        }
    }

    private var domainLeaveAlertMessage: String {
        let zh = KenosOfflineShellPolicy.prefersChinese
        if model.domainLeaveSummary.isEmpty {
            return zh
                ? "切换 Space 会丢失当前编辑。"
                : "Switching Spaces will discard your current edits."
        }
        return zh
            ? "「\(model.domainLeaveSummary)」尚未保存。切换 Space 会丢失这些更改。"
            : "\"\(model.domainLeaveSummary)\" is not saved yet. Switching Spaces will discard these changes."
    }

    private var domainProbeContext: KenosOfflineShellPolicy.ProbeContext {
        KenosOfflineShellPolicy.ProbeContext(
            didPaint: domainDidPaint,
            originHost: model.continuityURL?.host,
            isLanDependent: KenosDailyBetaConfig.isLanDependentOrigin,
            useProductionOverride: KenosDailyBetaConfig.useProductionOverride
        )
    }

    private var showsDomainUseProduction: Bool {
        KenosDailyBetaConfig.isConfiguredOriginLanDependent
            && !KenosDailyBetaConfig.useProductionOverride
    }

    /// Full-bleed WKWebView only — chrome (dock/shelf) is a sibling above this layer.
    private var domainWebCanvas: some View {
        ZStack {
            model.chromeAppearance.canvasColor
            if !domainHardUnreachable, let url = model.continuityURL {
                KenosWebSurfaceView(
                    url: url,
                    onTitle: { _ in
                        domainDidPaint = true
                        domainSyncPaused = false
                        domainHardUnreachable = false
                    },
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
                    onLoadFailed: { detail in
                        // Retries exhausted — surface the banner even when the health probe passed.
                        domainProbeError = detail
                        if !domainHardUnreachable { domainSyncPaused = true }
                    },
                    // Keep status top pad while editing; only Focus/Summary go fully immersive.
                    chrome: isWebFocusSurface ? .none : .domainDock,
                    accessoryBottomPadPx: model.liveAccessoryWebBottomExtraPx,
                    isActive: isActive
                )
                .id(domainSurfaceEpoch)
            }

            if domainHardUnreachable {
                ContentUnavailableView {
                    Label(
                        KenosOfflineShellPolicy.unreachableTitle(model.domainDisplayTitle),
                        systemImage: "wifi.exclamationmark"
                    )
                } description: {
                    VStack(spacing: 8) {
                        Text(
                            KenosOfflineShellPolicy.hardGateDomainDetail(
                                isLanDependent: KenosDailyBetaConfig.isLanDependentOrigin
                            )
                        )
                        if let domainProbeError, !domainProbeError.isEmpty {
                            Text(domainProbeError).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } actions: {
                    if showsDomainUseProduction {
                        Button(KenosOfflineShellPolicy.useProductionLabel, action: activateProductionFromDomain)
                            .accessibilityIdentifier("kenos.domain.useProduction")
                    }
                    Button(KenosOfflineShellPolicy.retryLabel, action: retryDomainOrigin)
                    Button(KenosOfflineShellPolicy.backToKenosLabel) {
                        model.dismissContinuity()
                    }
                }
            }

            if domainSyncPaused, !domainHardUnreachable {
                KenosShellSyncStatusBanner(
                    message: KenosOfflineShellPolicy.domainUnreachableDetail(
                        isLanDependent: KenosDailyBetaConfig.isLanDependentOrigin
                    ),
                    errorDetail: domainProbeError,
                    showsUseProduction: showsDomainUseProduction,
                    useProductionIdentifier: "kenos.domain.useProduction",
                    onUseProduction: activateProductionFromDomain,
                    onRetry: retryDomainOrigin
                )
            }

            // Keep load hairline while editing (dock hidden); hide only on true immersive.
            if isActive, !isWebFocusSurface, !domainHardUnreachable {
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
            domainHardUnreachable = false
            domainSyncPaused = false
            domainProbeError = nil
            await probeDomainInBackground()
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosDailyBetaOriginDidChange)) { _ in
            domainDidPaint = false
            domainHardUnreachable = false
            domainSyncPaused = false
            domainProbeError = nil
            domainSurfaceEpoch &+= 1
        }
        .onReceive(NotificationCenter.default.publisher(for: .kenosWebAuthDidClear)) { _ in
            domainDidPaint = false
            domainSurfaceEpoch &+= 1
        }
    }

    private func activateProductionFromDomain() {
        domainDidPaint = false
        domainProbeError = nil
        domainSyncPaused = false
        domainHardUnreachable = false
        if model.rewriteContinuityToProduction(reason: "domain_manual", force: true) {
            domainSurfaceEpoch &+= 1
        } else {
            domainHardUnreachable = true
        }
    }

    private func retryDomainOrigin() {
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
        domainSyncPaused = false
        domainHardUnreachable = false
        domainSurfaceEpoch &+= 1
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
                    domainSyncPaused = false
                    domainHardUnreachable = false
                    domainProbeError = nil
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
                        domainSyncPaused = false
                        domainHardUnreachable = false
                        domainProbeError = nil
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
                domainHardUnreachable = false
                domainSyncPaused = false
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
                    domainHardUnreachable = false
                    domainSyncPaused = false
                    domainProbeError = nil
                    domainSurfaceEpoch &+= 1
                    return
                }
                domainHardUnreachable = true
                domainSyncPaused = false
            }
            return
        }

        let ctx = await MainActor.run { domainProbeContext }
        await MainActor.run {
            if KenosOfflineShellPolicy.shouldUseHardUnavailableGate(ctx) {
                domainHardUnreachable = true
                domainSyncPaused = false
            } else {
                domainSyncPaused = true
                domainHardUnreachable = false
            }
        }
    }

}

/// Domain dock — superseded by `KenosGlobalDock` (Spaces chip + 4-item capsule).
typealias KenosDomainDock = KenosGlobalDock

/// System-level Space Switcher — Current row + Recent rail + Other Spaces list.
///
/// Quiet navigation drawer (not App Launcher): light selected fill, icon tint,
/// checkmark — no heavy cards / strokes / uppercase section chrome.
struct KenosSpaceShelfView: View {
    @ObservedObject var model: KenosAppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    /// Interactive swipe-to-dismiss — owned by `KenosSpaceShelfChrome` so dimmer tracks.
    @Binding var dismissDragX: CGFloat
    /// Resolved drawer width (matches chrome `preferredPanelWidth`).
    var panelWidth: CGFloat = KenosShelfGesture.panelWidth
    /// In-shelf filter — Space switching stays in Shelf (no Quick Switch hop).
    @State private var shelfQuery = ""

    private var prefersChinese: Bool {
        KenosShellSettingsStore.current.resolvedLocale() == "zh"
    }

    private enum ShelfIconPlate {
        /// Current — light accent plate; glyph stays full brand.
        case current
        /// Recent — neutral plate; accent glyph only.
        case recent
        /// Other Spaces — neutral plate; muted accent glyph.
        case catalog
    }

    /// Section labels — secondary ~68% (readable on light Shelf, not decorative).
    private var sectionLabelColor: Color { Color.primary.opacity(0.68) }
    /// Row / Current subtitles — secondary ~60%.
    private var rowSubtitleColor: Color { Color.primary.opacity(0.60) }
    /// Search placeholder + glyph — secondary, not tertiary.
    private var searchPlaceholderColor: Color { Color.primary.opacity(0.55) }
    /// List hairlines — adaptive ~0.10.
    private var rowDividerColor: Color { Color.primary.opacity(0.10) }

    /// Shared content inset — Search / Current / lists share one leading edge.
    private let shelfContentInset: CGFloat = 16

    private var cardsById: [String: KenosAppModel.SpaceShelfCard] {
        Dictionary(uniqueKeysWithValues: model.spaceShelfCards.map { ($0.id, $0) })
    }

    private var normalizedShelfQuery: String {
        shelfQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func matchesShelfQuery(_ card: KenosAppModel.SpaceShelfCard) -> Bool {
        let q = normalizedShelfQuery
        guard !q.isEmpty else { return true }
        if card.title.lowercased().contains(q) { return true }
        if card.subtitle.lowercased().contains(q) { return true }
        if card.id.lowercased().contains(q) { return true }
        // Localized display strings — zh users search 「计划」not "Plan".
        if localizedShelfCardTitle(card).lowercased().contains(q) { return true }
        if localizedShelfSubtitle(card).lowercased().contains(q) { return true }
        return false
    }

    /// Visual protagonist — wherever the user is leaving from.
    private var currentCard: KenosAppModel.SpaceShelfCard? {
        let card = model.spaceShelfCards.first(where: \.isCurrent)
            ?? model.spaceShelfCards.first(where: \.isKenos)
        guard let card, matchesShelfQuery(card) else { return nil }
        return card
    }

    /// Running Continuity domains (excludes current).
    private var activeDomainCards: [KenosAppModel.SpaceShelfCard] {
        let active = Set(model.activeShelfSpaceIds.filter { $0 != "kenos" })
        return model.spaceShelfCards.filter {
            !$0.isKenos && !$0.isCurrent && active.contains($0.id)
        }
    }

    /// Up to 3 meaningful continuations — Active first, then recent resume.
    private var recentRailCards: [KenosAppModel.SpaceShelfCard] {
        var seen = Set<String>()
        var out: [KenosAppModel.SpaceShelfCard] = []
        func append(_ card: KenosAppModel.SpaceShelfCard) {
            guard !seen.contains(card.id), !card.isCurrent else { return }
            guard matchesShelfQuery(card) else { return }
            seen.insert(card.id)
            out.append(card)
        }
        for card in activeDomainCards { append(card); if out.count == 3 { return out } }
        for id in model.recentSpaceIds {
            guard let card = cardsById[id], !card.isKenos else { continue }
            // Prefer cards with resume meta over bare catalog visits.
            guard card.relativeTime != nil || model.activeShelfSpaceIds.contains(card.id) else {
                continue
            }
            append(card)
            if out.count == 3 { break }
        }
        // Soft fill if empty — still show recent visits so Shelf never feels broken.
        if out.isEmpty {
            for id in model.recentSpaceIds {
                guard let card = cardsById[id], !card.isCurrent else { continue }
                append(card)
                if out.count == 3 { break }
            }
        }
        return out
    }

    private var allListCards: [KenosAppModel.SpaceShelfCard] {
        let hide = Set(recentRailCards.map(\.id))
        return model.spaceShelfCards.filter { card in
            if card.isCurrent { return false }
            if hide.contains(card.id) { return false }
            return matchesShelfQuery(card)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, shelfContentInset)
                .padding(.top, KenosGlass.chromeTopInset)
                .padding(.bottom, 14)

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    if let currentCard {
                        shelfSection(localizedShelfSection("Current")) {
                            currentSpaceCard(currentCard)
                        }
                    }

                    if !recentRailCards.isEmpty {
                        shelfSection(localizedShelfSection("Recent")) {
                            recentSpacesList(recentRailCards)
                        }
                    }

                    if !allListCards.isEmpty {
                        shelfSection(localizedShelfSection("Other Spaces")) {
                            allSpacesList(allListCards)
                        }
                    }
                }
                .padding(.horizontal, shelfContentInset)
                .padding(.bottom, 10)
                // Clearance for Spaces Orb (persistent close anchor) sitting above the Shelf.
                .safeAreaPadding(
                    .bottom,
                    KenosGlass.dockRowHeight + KenosGlass.dockBottomInset + 8
                )
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .trailing) {
                Rectangle()
                    .fill(.ultraThickMaterial)
                // Scheme A: opaque navigation plane (~0.94 light / ~0.90 dark), not float glass.
                Rectangle()
                    .fill(shelfSurfaceVeil)
                // Trailing hairline — light plane separation (shadow owned by chrome).
                Rectangle()
                    .fill(Color.primary.opacity(colorScheme == .light ? 0.08 : 0.14))
                    .frame(width: 0.5)
            }
            .ignoresSafeArea()
        }
        .simultaneousGesture(dismissDragGesture)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Close") {
            // Chrome owns spring via showSpaceShelf onChange.
            model.dismissSpaceShelf()
        }
    }

    /// Extra veil over material so Domain content can't compete with Shelf chrome.
    private var shelfSurfaceVeil: Color {
        if colorScheme == .light {
            return Color.white.opacity(reduceTransparency ? 0.88 : 0.72)
        }
        return Color.black.opacity(reduceTransparency ? 0.46 : 0.30)
    }

    private var dismissDragGesture: some Gesture {
        DragGesture(
            minimumDistance: KenosShelfGesture.dismissDragMinimumDistance,
            coordinateSpace: .local
        )
        .onChanged { value in
            guard !reduceMotion else { return }
            let dx = value.translation.width
            let dy = value.translation.height
            guard abs(dx) > abs(dy) * 1.05, dx < 0 else {
                if dismissDragX != 0 { dismissDragX = 0 }
                return
            }
            dismissDragX = KenosShelfGesture.cappedDismissOffset(dx, panelWidth: panelWidth)
        }
        .onEnded { value in
            let dx = value.translation.width
            let predicted = value.predictedEndTranslation.width
            let velocity = KenosShelfGesture.dragVelocityX(value)
            let shouldClose = KenosShelfGesture.shouldCommitClose(
                translationX: dx,
                velocityX: velocity,
                predictedTranslationX: predicted
            )
            if shouldClose {
                model.dismissSpaceShelf()
            } else {
                withAnimation(KenosMotion.shelfInteractive(reduceMotion: reduceMotion)) {
                    dismissDragX = 0
                }
            }
        }
    }

    // MARK: Header

    /// One search entry only — filters Shelf in place (does not open Quick Switch).
    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(prefersChinese ? "空间" : "Spaces")
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(searchPlaceholderColor)
                TextField(
                    "",
                    text: $shelfQuery,
                    prompt: Text(prefersChinese ? "搜索空间…" : "Search spaces…")
                        .foregroundStyle(searchPlaceholderColor)
                )
                .font(.subheadline.weight(.medium))
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
                .accessibilityLabel(prefersChinese ? "搜索空间" : "Search Spaces")
                .accessibilityIdentifier("kenos.spaceShelf.search")
                .accessibilityHint(prefersChinese ? "在 Shelf 内筛选空间" : "Filter Spaces inside Shelf")
            }
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(Color.primary.opacity(0.05))
            )
        }
    }

    private func localizedShelfSection(_ title: String) -> String {
        guard prefersChinese else { return title }
        switch title {
        case "Current": return "当前"
        case "Recent": return "最近"
        case "Other Spaces", "All Spaces": return "其他空间"
        default: return title
        }
    }

    private func localizedShelfCardTitle(_ card: KenosAppModel.SpaceShelfCard) -> String {
        // Space name only — destination / status belong in the subtitle.
        if card.isKenos { return "Kenos" }
        guard prefersChinese else { return card.title }
        switch card.id {
        case "home": return "家"
        case "plan": return "计划"
        case "training": return "训练"
        case "work": return "工作"
        case "money": return "财务"
        case "music": return "音乐"
        case "library", "knowledge": return "知识库"
        case "health": return "健康"
        case "paper": return "Paper"
        default: return card.title
        }
    }

    /// Catalog / glance subtitles — Chinese when system prefers zh-Hans.
    private func localizedShelfSubtitle(_ card: KenosAppModel.SpaceShelfCard) -> String {
        if card.isKenos {
            return localizedKenosSubtitle(card.subtitle)
        }
        guard prefersChinese else { return card.subtitle }
        // Current rows keep live destination · status; catalog falls back to role line.
        if card.isCurrent { return localizedLiveSubtitle(card.subtitle) }
        switch card.id {
        case "plan": return "任务与日程"
        case "training": return "健身训练"
        case "work": return "项目与决策"
        case "money": return "财务决策"
        case "library", "knowledge": return "知识库"
        case "music": return "曲库与播放"
        case "home": return "房间 · 物品 · 整理"
        case "health": return "状态 · 专注 · 趋势"
        case "paper": return "笔记与采集"
        default:
            return localizedLiveSubtitle(card.subtitle)
        }
    }

    private func localizedKenosSubtitle(_ subtitle: String) -> String {
        guard prefersChinese else { return subtitle }
        if subtitle == "Today · Ask · Inbox" { return "今日 · 问答 · 收件箱" }
        // "Today · N waiting" → "今日 · N 项待处理"
        if subtitle.hasPrefix("Today · "), subtitle.hasSuffix(" waiting") {
            let mid = subtitle
                .dropFirst("Today · ".count)
                .dropLast(" waiting".count)
                .trimmingCharacters(in: .whitespaces)
            if let n = Int(mid), n > 0 {
                return "今日 · \(n) 项待处理"
            }
        }
        return localizedLiveSubtitle(subtitle)
    }

    private func localizedLiveSubtitle(_ subtitle: String) -> String {
        guard prefersChinese else { return subtitle }
        switch subtitle {
        case "Next up": return "下一步"
        case "In progress": return "进行中"
        case "In focus", "Focus": return "专注中"
        case "Paused": return "已暂停"
        case "Organize": return "整理"
        case "Music": return "音乐"
        case "Open Money": return "打开财务"
        case "Focus · high": return "专注 · 高"
        case "Tasks": return "任务"
        case "Today": return "今日"
        case "Library": return "曲库"
        case "Calendar": return "日历"
        case "Overview": return "概览"
        case "Ask": return "问答"
        case "Inbox": return "收件箱"
        case "Projects": return "项目"
        case "Vault": return "知识库"
        case "Rooms": return "房间"
        case "Status": return "状态"
        case "Notebooks": return "笔记"
        case "Workout": return "训练"
        case "Program": return "计划"
        case "History": return "历史"
        case "Accounts": return "账户"
        case "Search": return "搜索"
        case "Triage": return "分拣"
        case "Summary": return "总结"
        default:
            // "Today · Chest" / "Tasks · Next up" — translate known destination heads.
            if let sep = subtitle.range(of: " · ") {
                let head = String(subtitle[..<sep.lowerBound])
                let tail = String(subtitle[sep.upperBound...])
                let localizedHead = localizedLiveSubtitle(head)
                let localizedTail = localizedLiveSubtitle(tail)
                if localizedHead != head || localizedTail != tail {
                    return "\(localizedHead) · \(localizedTail)"
                }
            }
            return subtitle
        }
    }

    // MARK: Sections

    @ViewBuilder
    private func shelfSection<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.medium))
                .foregroundStyle(sectionLabelColor)
                .padding(.horizontal, 2)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    /// Current Space — quiet selected row (icon + light tint + check). Not a dashboard card.
    private func currentSpaceCard(_ card: KenosAppModel.SpaceShelfCard) -> some View {
        let accent = KenosAppModel.accentColor(for: card.id)
        // On-glass pair keeps Plan ochre / Training red readable on light tint.
        let mark = KenosAppModel.accentOnGlass(for: card.id)
        return Button {
            select(card)
        } label: {
            HStack(spacing: 12) {
                shelfIcon(card: card, accent: accent, size: 36, cornerRadius: 10, plate: .current)
                VStack(alignment: .leading, spacing: 2) {
                    Text(localizedShelfCardTitle(card))
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(localizedShelfSubtitle(card))
                        .font(.caption)
                        .foregroundStyle(rowSubtitleColor)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "checkmark")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(mark)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(accent.opacity(0.07))
            )
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        .contextMenu { pinMenu(for: card) }
        .accessibilityIdentifier("kenos.spaceShelf.card.\(card.id)")
        .accessibilityLabel(accessibilityLabel(for: card))
        .accessibilityAddTraits(.isSelected)
        .accessibilityHint(prefersChinese ? "当前空间" : "Current Space")
    }

    /// Recent — same row grammar as All (icon + title + subtitle), not capsules.
    private func recentSpacesList(_ cards: [KenosAppModel.SpaceShelfCard]) -> some View {
        shelfRowList(cards, plate: .recent, showPin: false, showChevron: true)
    }

    private func allSpacesList(_ cards: [KenosAppModel.SpaceShelfCard]) -> some View {
        shelfRowList(cards, plate: .catalog, showPin: true, showChevron: true)
    }

    private func shelfRowList(
        _ cards: [KenosAppModel.SpaceShelfCard],
        plate: ShelfIconPlate,
        showPin: Bool,
        showChevron: Bool
    ) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                shelfSpaceRow(card, plate: plate, showPin: showPin, showChevron: showChevron)
                if index < cards.count - 1 {
                    Rectangle()
                        .fill(rowDividerColor)
                        .frame(height: 0.5)
                        .padding(.leading, 42)
                }
            }
        }
    }

    private func shelfSpaceRow(
        _ card: KenosAppModel.SpaceShelfCard,
        plate: ShelfIconPlate,
        showPin: Bool,
        showChevron: Bool
    ) -> some View {
        let accent = KenosAppModel.accentColor(for: card.id)
        let isPinned = showPin && !card.isKenos && model.pinnedSpaceIds.contains(card.id)
        return Button {
            select(card)
        } label: {
            HStack(spacing: 12) {
                shelfIcon(card: card, accent: accent, size: 30, cornerRadius: 8, plate: plate)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(localizedShelfCardTitle(card))
                            .font(.body.weight(.medium))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if isPinned {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(accent.opacity(0.7))
                                .accessibilityHidden(true)
                        }
                    }
                    Text(localizedShelfSubtitle(card))
                        .font(.caption)
                        .foregroundStyle(rowSubtitleColor)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if showChevron {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.primary.opacity(0.36))
                }
            }
            .padding(.vertical, 12)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(KenosPressStyle(reduceMotion: reduceMotion))
        .contextMenu { pinMenu(for: card) }
        .accessibilityIdentifier("kenos.spaceShelf.card.\(card.id)")
        .accessibilityLabel(accessibilityLabel(for: card, isPinned: isPinned))
        .accessibilityHint(
            prefersChinese
                ? "打开\(localizedShelfCardTitle(card))"
                : "Opens \(localizedShelfCardTitle(card))"
        )
    }

    // MARK: Helpers

    private func select(_ card: KenosAppModel.SpaceShelfCard) {
        // Chrome owns Shelf spring via showSpaceShelf onChange.
        model.openShelfCard(card)
    }

    @ViewBuilder
    private func pinMenu(for card: KenosAppModel.SpaceShelfCard) -> some View {
        if !card.isKenos {
            let isPinned = model.pinnedSpaceIds.contains(card.id)
            Button {
                model.togglePinnedSpace(id: card.id)
            } label: {
                Label(
                    prefersChinese
                        ? (isPinned ? "取消固定" : "固定")
                        : (isPinned ? "Unpin" : "Pin"),
                    systemImage: isPinned ? "star.slash" : "star"
                )
            }
        }
    }

    private func shelfIcon(
        card: KenosAppModel.SpaceShelfCard,
        accent: Color,
        size: CGFloat = 36,
        cornerRadius: CGFloat = 10,
        plate: ShelfIconPlate
    ) -> some View {
        let plateFill: Color = {
            switch plate {
            case .current: return accent.opacity(0.16)
            case .recent, .catalog: return Color.primary.opacity(0.06)
            }
        }()
        let glyph: Color = {
            switch plate {
            case .current: return KenosAppModel.accentOnGlass(for: card.id)
            case .recent: return accent.opacity(0.88)
            case .catalog: return accent.opacity(0.72)
            }
        }()
        return ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(plateFill)
            Image(systemName: card.systemImage)
                .font(.system(size: size * 0.42, weight: .semibold))
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(glyph)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func accessibilityLabel(
        for card: KenosAppModel.SpaceShelfCard,
        isPinned: Bool = false
    ) -> String {
        var parts = [localizedShelfCardTitle(card), localizedShelfSubtitle(card)]
        if let relative = card.relativeTime { parts.append(relative) }
        if isPinned { parts.append(prefersChinese ? "已固定" : "Pinned") }
        if card.isCurrent { parts.append(prefersChinese ? "当前" : "Current") }
        return parts.filter { !$0.isEmpty }.joined(separator: ", ")
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
            let containerWidth = gesture.view?.bounds.width ?? 0
            let panelWidth = KenosShelfGesture.preferredPanelWidth(containerWidth: containerWidth)
            let t = KenosShelfGesture.cappedOpenTranslation(raw, panelWidth: panelWidth)
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
