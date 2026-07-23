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

                if projection.showsKorbenChrome {
                    VStack(spacing: 0) {
                        KorbenSystemStrip(model: model, shellState: shellState)
                        Spacer(minLength: 0)
                        KorbenBottomChrome(model: model, shellState: shellState)
                    }
                    .transition(.opacity)
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
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: projection.showsKorbenChrome)
            .animation(.easeInOut(duration: 0.2), value: shellState.showsSystemTray)
            .animation(.easeInOut(duration: 0.15), value: shellState.orbFanVisible)
            .coordinateSpace(name: "korben.shell")
            // P4A Quick Capture / Canvas 两档 sheet(Intent Dock 的 Layer 1/2)。
            .sheet(isPresented: $shellState.showsQuickCapture) {
                KorbenQuickCaptureSheet(
                    model: model,
                    shellState: shellState,
                    detent: $shellState.quickCaptureDetent
                )
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
