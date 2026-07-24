import SwiftUI
import KenosDesign

#if os(iOS)

/// Korben Shell V2 root (behind `KorbenShellV2Feature`, frozen at launch).
///
/// P1 skeleton:
///
///     KorbenShellView
///     ├─ TopChromePlaceholder   (reserved System Strip slot — no data yet)
///     ├─ KorbenSpaceSurfaceHost (SAME persistent Web surfaces as legacy)
///     └─ KorbenBottomChrome     (Space Orb + static Intent Dock)
///
/// Sheets, deep links, Focus/unlock branches all stay on `KenosRootView` —
/// they are common to both shells. This view must never change the structural
/// identity of the surface host based on chrome state (WebView remount = auth /
/// scroll / history loss).
struct KorbenShellView: View {
    @ObservedObject var model: KenosAppModel
    @StateObject private var shellState = KorbenShellState()

    private var projection: KorbenShellProjection {
        KorbenShellProjection.make(from: model)
    }

    var body: some View {
        KenosLaunchVeilHost {
            ZStack {
                // Surface host is structurally unconditional — chrome layers
                // above it come and go without touching its identity.
                KorbenSpaceSurfaceHost(model: model)

                // 顶部 scrim:System Strip 浮在内容上时,状态栏+Strip 区域铺一层
                // 从当前页面画布色渐隐的背景,滚动内容从其后经过不再与系统时间/Strip
                // 叠加成糊(截图 08/09 的顶部撞车)。用页面 polarity 色故亮/暗域都贴合。
                if projection.showsKorbenChrome, KorbenSystemStrip.hasUnits(model: model) {
                    VStack(spacing: 0) {
                        LinearGradient(
                            colors: [
                                model.chromeAppearance.canvasColor.opacity(0.96),
                                model.chromeAppearance.canvasColor.opacity(0.82),
                                model.chromeAppearance.canvasColor.opacity(0),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 104)
                        .ignoresSafeArea(edges: .top)
                        Spacer(minLength: 0)
                    }
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }

                // Gate5B:Capture/Canvas 展开时整条底部 chrome 让位 —— 三层状态机
                // 每一态**只允许一个文本输入源、一个 Draft、一个主动作**。不靠 sheet
                // detent 恰好遮住 Dock 碰运气(下滑 detent 或无键盘时它会露出来)。
                if projection.showsKorbenChrome, !shellState.showsQuickCapture {
                    VStack(spacing: 0) {
                        KorbenSystemStrip(model: model, shellState: shellState)
                        Spacer(minLength: 0)
                        KorbenBottomChrome(model: model, shellState: shellState)
                    }
                    .transition(.opacity)
                }

                // Gate5C-1 Space Peek — Orb Tap 的落点(从 Orb 左下角生长的局部卡)。
                // 用 overlay 而非 sheet:sheet 只能从屏幕底边整幅推上来,拿不到
                // 「从 Orb 原点长出来、当前页仍露在外面」这个语义。
                if shellState.showsSpacePeek {
                    KorbenSpacePeek(model: model, shellState: shellState)
                }

                // P3 Recent Fan — Hold 展开;拖过目标高亮,松手切换。
                if shellState.orbFanVisible {
                    KorbenOrbFanOverlay(shellState: shellState)
                        .allowsHitTesting(false) // 命中由 Orb 手势负责
                        .transition(.opacity)
                }

                // P3 Drag Right 预览(≥72pt;≥132pt 松手进入 Ask)。
                if shellState.assistDragDistance >= KorbenOrbGestureResolver.assistPreviewDistance {
                    KorbenAssistPreviewBubble(
                        committed: shellState.assistDragDistance
                            >= KorbenOrbGestureResolver.assistCommitDistance,
                        orbCenter: shellState.orbCenter
                    )
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }

                // P2 System Tray — 顶部展开的临时 overlay;点外部关闭。
                if shellState.showsSystemTray {
                    Color.black.opacity(0.25)
                        .ignoresSafeArea()
                        .onTapGesture { shellState.showsSystemTray = false }
                        .accessibilityLabel("Close System Tray")
                    VStack {
                        KorbenSystemTray(model: model, shellState: shellState)
                        Spacer(minLength: 0)
                    }
                    // Tray 要落在 **Strip 下方**:它是从 Strip 点开的,盖住锚点会
                    // 让人失去「从哪来」的线索(真机实拍:一点 Strip,Strip 就没了)。
                    .padding(.top, KorbenShellMetrics.topChromeMaxHeight + 14)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: projection.showsKorbenChrome)
            .animation(.easeInOut(duration: 0.2), value: shellState.showsSystemTray)
            .animation(.easeInOut(duration: 0.15), value: shellState.orbFanVisible)
            .animation(.spring(response: 0.34, dampingFraction: 0.86), value: shellState.showsSpacePeek)
            .coordinateSpace(name: "korben.shell")
            // P4A Quick Capture / Canvas 两档 sheet(Intent Dock 的 Layer 1/2)。
            .sheet(isPresented: $shellState.showsQuickCapture) {
                KorbenQuickCaptureSheet(
                    model: model,
                    shellState: shellState,
                    detent: $shellState.quickCaptureDetent
                )
            }
            // P5 Korben Assist Panel(Orb 右拉 ≥132pt / VO action 触达)。
            .sheet(isPresented: $shellState.showsAssist) {
                KorbenAssistPanel(model: model, shellState: shellState)
            }
            // P4B Undo pill — 创建后 10s 可撤(撤销恢复输入,不丢 Draft)。
            .overlay(alignment: .bottom) {
                if let receipt = shellState.undoReceipt {
                    KorbenUndoPill(receipt: receipt, model: model, shellState: shellState)
                        .padding(.bottom, 118)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: shellState.undoReceipt?.id)
        }
        // P1B: legacy Space Shelf chrome doesn't exist anywhere in the Korben
        // tree (Domain shell runs `.externalKorbenShell`) — redirect ALL shelf
        // intents (deep link `kenos://shelf`, legacy code paths) to the Space
        // Switcher directory so nothing dead-ends in either mode.
        .onChange(of: model.showSpaceShelf) { _, open in
            guard open else { return }
            model.dismissSpaceShelf()
            model.openSpaceSwitcher()
        }
        // 切换器「Today/系统」项的退域修复在 SpaceSwitcherSheet 的按钮里
        // (dismissContinuity 同步退域)—— selectedTab 在域内导航时不变,无法在此 hook。
        // P4A:Korben 壳内 capture 意图统一走 Quick Capture 两档 sheet
        // (深链 kenos://compose、旧代码路径)。Focus 分支不挂载本视图,不受影响。
        .onChange(of: model.showCaptureSheet) { _, open in
            guard open else { return }
            model.showCaptureSheet = false
            shellState.quickCaptureDetent = KorbenQuickCaptureSheet.captureDetent
            shellState.showsQuickCapture = true
        }
    }

}

#endif
